import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StakeEntity } from './stake.entity';
import { DisputeEntity } from './dispute.entity';
import { StakingContractService } from '../hedera/staking-contract.service';

// Minimum stake required to give feedback (1 HBAR in tinybars)
export const MIN_STAKE_TO_FEEDBACK = 100_000_000;

// Slash percentage when a dispute is upheld
export const SLASH_PERCENT = 10;

// Amount slashed when a dispute is upheld (0.5 HBAR — used for DB fallback)
export const SLASH_AMOUNT = 50_000_000;

// Arbiter requirements
export const MIN_ARBITER_STAKE = 1_000_000_000; // 10 HBAR
export const MIN_ARBITER_SCORE = 500;
export const MIN_ARBITER_INTERACTIONS = 10;
export const DISPUTE_BOND = 200_000_000; // 2 HBAR
export const ARBITER_PANEL_SIZE = 3;
export const ARBITER_TIMEOUT_MS = 48 * 60 * 60 * 1000; // 48 hours

@Injectable()
export class StakingService {
  private readonly logger = new Logger(StakingService.name);

  constructor(
    @InjectRepository(StakeEntity)
    private readonly stakeRepo: Repository<StakeEntity>,
    @InjectRepository(DisputeEntity)
    private readonly disputeRepo: Repository<DisputeEntity>,
    private readonly stakingContract: StakingContractService,
  ) {}

  async getStake(agentId: string): Promise<StakeEntity> {
    let stake = await this.stakeRepo.findOne({ where: { agentId } });
    if (!stake) {
      stake = this.stakeRepo.create({
        agentId,
        balance: 0,
        totalDeposited: 0,
        totalSlashed: 0,
        slashCount: 0,
      });
      await this.stakeRepo.save(stake);
    }

    // Sync from smart contract if available
    if (this.stakingContract.isConfigured()) {
      try {
        const onChain = await this.stakingContract.getStake(agentId);
        if (onChain.exists) {
          stake.balance = Number(onChain.amount);
          stake.totalSlashed = Number(onChain.totalSlashed);
          await this.stakeRepo.save(stake);
        }
      } catch (e) {
        this.logger.warn(`Failed to sync stake from contract: ${e.message}`);
      }
    }

    return stake;
  }

  async deposit(agentId: string, amount: number, lockDays = 7): Promise<{ stake: StakeEntity; txId?: string }> {
    let txId: string | undefined;

    // Execute on smart contract if available
    if (this.stakingContract.isConfigured()) {
      txId = await this.stakingContract.stake(agentId, amount, lockDays);
      this.logger.log(`On-chain stake tx: ${txId}`);
    }

    // Update DB cache
    const stake = await this.getStake(agentId);
    stake.balance = Number(stake.balance) + amount;
    stake.totalDeposited = Number(stake.totalDeposited) + amount;
    stake.lastDepositAt = Date.now();
    if (txId) stake.contractTxId = txId;
    await this.stakeRepo.save(stake);

    return { stake, txId };
  }

  async hasMinimumStake(agentId: string): Promise<boolean> {
    // Check contract first if available
    if (this.stakingContract.isConfigured()) {
      try {
        const onChain = await this.stakingContract.getStake(agentId);
        return Number(onChain.amount) >= MIN_STAKE_TO_FEEDBACK;
      } catch (e) {
        this.logger.warn(`Contract query failed, falling back to DB: ${e.message}`);
      }
    }

    const stake = await this.getStake(agentId);
    return Number(stake.balance) >= MIN_STAKE_TO_FEEDBACK;
  }

  async slash(agentId: string, reason: string): Promise<{ stake: StakeEntity; txId?: string }> {
    let txId: string | undefined;

    // Execute slash on smart contract
    if (this.stakingContract.isConfigured()) {
      txId = await this.stakingContract.slash(agentId, SLASH_PERCENT, reason);
      this.logger.log(`On-chain slash tx: ${txId}`);
    }

    // Update DB cache
    const stake = await this.getStake(agentId);
    const slashAmount = this.stakingContract.isConfigured()
      ? Math.floor(Number(stake.balance) * SLASH_PERCENT / 100)
      : Math.min(Number(stake.balance), SLASH_AMOUNT);

    stake.balance = Number(stake.balance) - slashAmount;
    stake.totalSlashed = Number(stake.totalSlashed) + slashAmount;
    stake.slashCount += 1;
    stake.lastSlashAt = Date.now();
    if (txId) stake.contractTxId = txId;

    this.logger.warn(`Slashed ${slashAmount} tinybars from agent ${agentId}`);
    await this.stakeRepo.save(stake);

    return { stake, txId };
  }

  // ---- Arbiter Methods ----

  async stakeAsArbiter(agentId: string, amount: number): Promise<StakeEntity> {
    if (amount < MIN_ARBITER_STAKE) {
      throw new Error(`Minimum arbiter stake is ${MIN_ARBITER_STAKE / 100_000_000} HBAR`);
    }
    const stake = await this.getStake(agentId);
    stake.arbiterStake = Number(stake.arbiterStake || 0) + amount;
    await this.stakeRepo.save(stake);
    await this.checkAndUpdateArbiterEligibility(agentId);
    return stake;
  }

  async checkAndUpdateArbiterEligibility(agentId: string, reputationScore?: number, activityCount?: number): Promise<boolean> {
    const stake = await this.getStake(agentId);
    const totalStake = Number(stake.balance) + Number(stake.arbiterStake || 0);
    const score = reputationScore ?? 0;
    const activity = activityCount ?? 0;

    const eligible = totalStake >= MIN_ARBITER_STAKE &&
                     score >= MIN_ARBITER_SCORE &&
                     activity >= MIN_ARBITER_INTERACTIONS;

    stake.arbiterEligible = eligible;
    await this.stakeRepo.save(stake);
    return eligible;
  }

  async getEligibleArbiters(excludeAgentIds: string[] = []): Promise<StakeEntity[]> {
    const allStakes = await this.stakeRepo.find({ where: { arbiterEligible: true } });
    return allStakes.filter(s => !excludeAgentIds.includes(s.agentId));
  }

  selectArbiters(eligibleArbiters: StakeEntity[], disputeId: number, timestamp: number): string[] {
    if (eligibleArbiters.length < ARBITER_PANEL_SIZE) {
      throw new Error(`Not enough eligible arbiters. Need ${ARBITER_PANEL_SIZE}, found ${eligibleArbiters.length}`);
    }

    // Deterministic selection using hash of disputeId + timestamp
    const seed = `${disputeId}-${timestamp}`;
    const selected: string[] = [];
    const pool = [...eligibleArbiters];

    for (let i = 0; i < ARBITER_PANEL_SIZE && pool.length > 0; i++) {
      // Simple deterministic hash: sum char codes * (i+1)
      let hash = 0;
      for (let j = 0; j < seed.length; j++) {
        hash = ((hash << 5) - hash + seed.charCodeAt(j) * (i + 1)) | 0;
      }
      const index = Math.abs(hash) % pool.length;
      selected.push(pool[index].agentId);
      pool.splice(index, 1);
    }

    return selected;
  }

  async createDispute(
    feedbackId: string,
    disputerId: string,
    accusedId: string,
    reason: string,
  ): Promise<DisputeEntity> {
    const existing = await this.disputeRepo.findOne({
      where: [
        { feedbackId, status: 'pending' },
        { feedbackId, status: 'voting' },
      ],
    });
    if (existing) {
      throw new Error('A dispute is already pending for this feedback');
    }

    // Select arbiters
    const eligibleArbiters = await this.getEligibleArbiters([disputerId, accusedId]);
    const now = Date.now();

    let selectedArbiterIds: string[] = [];
    let status = 'pending';

    if (eligibleArbiters.length >= ARBITER_PANEL_SIZE) {
      // We have enough arbiters for a panel
      selectedArbiterIds = this.selectArbiters(eligibleArbiters, 0, now);
      status = 'voting';
    }
    // If not enough arbiters, stay in 'pending' — legacy single-arbiter mode

    const dispute = this.disputeRepo.create({
      feedbackId,
      disputerId,
      accusedId,
      reason,
      status,
      bondAmount: DISPUTE_BOND,
      votingDeadline: now + ARBITER_TIMEOUT_MS,
      createdAt: now,
    });

    if (selectedArbiterIds.length > 0) {
      dispute.setSelectedArbiters(selectedArbiterIds);
    }

    return this.disputeRepo.save(dispute);
  }

  async submitArbiterVote(
    disputeId: number,
    arbiterId: string,
    vote: 'upheld' | 'dismissed',
    reasoning: string,
  ): Promise<{ dispute: DisputeEntity; finalized: boolean; slashedStake?: StakeEntity; txId?: string }> {
    const dispute = await this.disputeRepo.findOne({ where: { id: disputeId } });
    if (!dispute) throw new Error('Dispute not found');
    if (dispute.status !== 'voting') throw new Error('Dispute is not in voting phase');

    const selectedArbiters = dispute.getSelectedArbiters();
    if (!selectedArbiters.includes(arbiterId)) {
      throw new Error('You are not a selected arbiter for this dispute');
    }

    const existingVotes = dispute.getArbiterVotes();
    if (existingVotes[arbiterId]) {
      throw new Error('You have already voted on this dispute');
    }

    // Record vote
    dispute.setArbiterVote(arbiterId, vote, reasoning);

    // Check if we have majority
    const votes = dispute.getArbiterVotes();
    const voteValues = Object.values(votes).map(v => v.vote);
    const upheldCount = voteValues.filter(v => v === 'upheld').length;
    const dismissedCount = voteValues.filter(v => v === 'dismissed').length;
    const majority = Math.ceil(ARBITER_PANEL_SIZE / 2);

    let finalized = false;
    let slashedStake: StakeEntity | undefined;
    let txId: string | undefined;

    if (upheldCount >= majority) {
      // Dispute upheld — slash accused
      dispute.status = 'upheld';
      dispute.resolvedBy = 'arbiter-panel';
      dispute.resolvedAt = Date.now();
      dispute.resolutionNotes = `Upheld by majority vote (${upheldCount}/${voteValues.length})`;

      const result = await this.slash(dispute.accusedId, `Dispute #${disputeId}: upheld by arbiter panel`);
      slashedStake = result.stake;
      txId = result.txId;
      dispute.slashAmount = this.stakingContract.isConfigured()
        ? Math.floor(Number(slashedStake.balance) * SLASH_PERCENT / 100)
        : SLASH_AMOUNT;

      finalized = true;
      await this.updateArbiterStats(selectedArbiters, votes, 'upheld');
    } else if (dismissedCount >= majority) {
      // Dispute dismissed — disputer loses bond
      dispute.status = 'dismissed';
      dispute.resolvedBy = 'arbiter-panel';
      dispute.resolvedAt = Date.now();
      dispute.resolutionNotes = `Dismissed by majority vote (${dismissedCount}/${voteValues.length})`;

      finalized = true;
      await this.updateArbiterStats(selectedArbiters, votes, 'dismissed');
    }

    await this.disputeRepo.save(dispute);
    return { dispute, finalized, slashedStake, txId };
  }

  private async updateArbiterStats(
    selectedArbiters: string[],
    votes: Record<string, { vote: string; reasoning: string; timestamp: number }>,
    outcome: 'upheld' | 'dismissed',
  ) {
    for (const arbiterId of selectedArbiters) {
      const arbiterVote = votes[arbiterId];
      if (!arbiterVote) continue; // Didn't vote (timed out)

      const stake = await this.getStake(arbiterId);
      stake.arbitrationsResolved = (stake.arbitrationsResolved || 0) + 1;

      if (arbiterVote.vote === outcome) {
        stake.majorityVotes = (stake.majorityVotes || 0) + 1;
      } else {
        stake.minorityVotes = (stake.minorityVotes || 0) + 1;
      }

      const totalVotes = (stake.majorityVotes || 0) + (stake.minorityVotes || 0);
      stake.majorityRate = totalVotes > 0 ? ((stake.majorityVotes || 0) / totalVotes) * 100 : 0;

      // If majority rate drops below 60%, flag for review
      if (stake.majorityRate < 60 && totalVotes >= 5) {
        this.logger.warn(`Arbiter ${arbiterId} majority rate is ${stake.majorityRate.toFixed(1)}% — eligibility at risk`);
      }

      await this.stakeRepo.save(stake);
    }
  }

  // Legacy single-arbiter resolve (fallback when not enough arbiters)
  async resolveDispute(
    disputeId: number,
    resolvedBy: string,
    upheld: boolean,
    notes?: string,
  ): Promise<{ dispute: DisputeEntity; slashedStake?: StakeEntity; txId?: string }> {
    const dispute = await this.disputeRepo.findOne({ where: { id: disputeId } });
    if (!dispute) throw new Error('Dispute not found');
    if (dispute.status !== 'pending') throw new Error('Dispute already resolved or in voting');

    dispute.status = upheld ? 'upheld' : 'dismissed';
    dispute.resolvedBy = resolvedBy;
    dispute.resolutionNotes = notes;
    dispute.resolvedAt = Date.now();

    let slashedStake: StakeEntity | undefined;
    let txId: string | undefined;
    if (upheld) {
      const result = await this.slash(dispute.accusedId, `Dispute #${disputeId}: ${notes || 'upheld'}`);
      slashedStake = result.stake;
      txId = result.txId;
      dispute.slashAmount = this.stakingContract.isConfigured()
        ? Math.floor(Number(slashedStake.balance) * SLASH_PERCENT / 100)
        : SLASH_AMOUNT;
    }

    await this.disputeRepo.save(dispute);
    return { dispute, slashedStake, txId };
  }

  async getDisputes(agentId?: string): Promise<DisputeEntity[]> {
    if (agentId) {
      return this.disputeRepo.find({
        where: [{ accusedId: agentId }, { disputerId: agentId }],
        order: { createdAt: 'DESC' },
      });
    }
    return this.disputeRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getLeaderboard(): Promise<StakeEntity[]> {
    return this.stakeRepo.find({
      order: { balance: 'DESC' },
    });
  }

  /**
   * Get TVL totals directly from the smart contract.
   */
  async getTotals(): Promise<{ totalStaked: number; totalSlashed: number; stakerCount: number }> {
    return this.stakingContract.getTotals();
  }

  /**
   * Check if the smart contract is deployed and active.
   */
  isContractActive(): boolean {
    return this.stakingContract.isConfigured();
  }
}
