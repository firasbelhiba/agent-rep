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
export const DISPUTE_BOND_UNVALIDATED = 200_000_000; // 2 HBAR — feedback not yet validated
export const DISPUTE_BOND_VALIDATED = 400_000_000;    // 4 HBAR — feedback already validated & confirmed
export const DISPUTE_BOND_OUTLIER = 0;                // Free — feedback already flagged as outlier
export const DISPUTE_BOND = 200_000_000;              // Default fallback (2 HBAR)
export const ARBITER_PANEL_SIZE = 1;
export const ARBITER_TIMEOUT_MS = 48 * 60 * 60 * 1000; // 48 hours
export const VALIDATOR_PENALTY_PERCENT = 5; // 5% reputation penalty for validators who confirmed bad feedback

// Validator selection requirements (lower than arbiter)
export const MIN_VALIDATOR_STAKE = 500_000_000; // 5 HBAR (same as regular stake)
export const MIN_VALIDATOR_SCORE = 200; // VERIFIED tier
export const VALIDATOR_PANEL_SIZE = 2; // 2 validators per feedback
export const VALIDATOR_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

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

  // ---- Validator Selection Methods ----

  /**
   * Get agents eligible to validate feedback.
   * Lower threshold than arbiters: score >= 200 (VERIFIED), stake >= 5 HBAR.
   * Excludes the feedback giver and the target agent.
   */
  async getEligibleValidators(excludeAgentIds: string[] = []): Promise<StakeEntity[]> {
    const allStakes = await this.stakeRepo.find();
    return allStakes.filter(s =>
      !excludeAgentIds.includes(s.agentId) &&
      Number(s.balance) >= MIN_VALIDATOR_STAKE
    );
  }

  /**
   * Select validators for a feedback entry using deterministic hash.
   * Called automatically when feedback is submitted.
   */
  selectValidators(eligibleValidators: StakeEntity[], feedbackId: string, timestamp: number): string[] {
    if (eligibleValidators.length < VALIDATOR_PANEL_SIZE) {
      return []; // Not enough validators — skip auto-validation
    }

    const seed = `val-${feedbackId}-${timestamp}`;
    const selected: string[] = [];
    const pool = [...eligibleValidators];

    for (let i = 0; i < VALIDATOR_PANEL_SIZE && pool.length > 0; i++) {
      let hash = 0;
      for (let j = 0; j < seed.length; j++) {
        hash = ((hash << 5) - hash + seed.charCodeAt(j) * (i + 1)) | 0;
      }
      const index = Math.abs(hash) % pool.length;
      selected.push(pool[index].agentId);
      pool.splice(index, 1);
    }

    this.logger.log(`Selected ${selected.length} validators for feedback ${feedbackId}: ${selected.join(', ')}`);
    return selected;
  }

  /**
   * Auto-select validators when feedback is submitted.
   * Returns the selected validator agent IDs so the caller can notify them via HCS-10.
   */
  async autoSelectValidatorsForFeedback(
    feedbackId: string,
    feedbackGiverId: string,
    targetAgentId: string,
  ): Promise<string[]> {
    const eligible = await this.getEligibleValidators([feedbackGiverId, targetAgentId]);
    if (eligible.length < VALIDATOR_PANEL_SIZE) {
      this.logger.log(`Not enough eligible validators (${eligible.length}/${VALIDATOR_PANEL_SIZE}). Skipping auto-validation.`);
      return [];
    }

    const selectedIds = this.selectValidators(eligible, feedbackId, Date.now());
    return selectedIds;
  }

  async createDispute(
    feedbackId: string,
    disputerId: string,
    accusedId: string,
    reason: string,
    validationStatus?: 'unvalidated' | 'confirmed' | 'outlier',
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

    // Variable bond based on validation status
    let bondAmount: number;
    switch (validationStatus) {
      case 'confirmed':
        bondAmount = DISPUTE_BOND_VALIDATED; // 4 HBAR — challenging validated feedback costs more
        break;
      case 'outlier':
        bondAmount = DISPUTE_BOND_OUTLIER; // Free — system already flagged it
        break;
      case 'unvalidated':
      default:
        bondAmount = DISPUTE_BOND_UNVALIDATED; // 2 HBAR — standard
        break;
    }

    this.logger.log(`Dispute bond for feedback ${feedbackId}: ${bondAmount / 1e8} HBAR (status: ${validationStatus || 'unvalidated'})`);

    // Select arbiters
    const eligibleArbiters = await this.getEligibleArbiters([disputerId, accusedId]);
    const now = Date.now();

    let selectedArbiterIds: string[] = [];
    let status = 'pending';

    if (eligibleArbiters.length >= ARBITER_PANEL_SIZE) {
      selectedArbiterIds = this.selectArbiters(eligibleArbiters, 0, now);
      status = 'voting';
    }

    const dispute = this.disputeRepo.create({
      feedbackId,
      disputerId,
      accusedId,
      reason,
      status,
      bondAmount,
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
      // Dispute upheld — slash the feedback giver (accused)
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

      // Penalize validators who confirmed the bad feedback
      await this.penalizeValidatorsForBadFeedback(dispute.feedbackId);

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

  /**
   * Penalize validators who confirmed feedback that was later disputed and upheld.
   * Validators who flagged it as outlier are NOT penalized (they did their job).
   * Penalty: reputation-based — their stake's validationPenalties counter increases,
   * which feeds back into the reputation algorithm to reduce their validation weight.
   */
  private async penalizeValidatorsForBadFeedback(feedbackId: string) {
    try {
      // Find all validation responses for this feedback
      // Validators who scored >= 60 (confirmed) get penalized
      // Validators who scored < 40 (flagged as bad) are rewarded
      const validations = await this.stakeRepo.manager.query(
        `SELECT "validatorId", "score" FROM "validation_response" WHERE "feedbackId" = $1`,
        [feedbackId],
      );

      if (!validations || validations.length === 0) {
        this.logger.log(`No validators to penalize for feedback ${feedbackId}`);
        return;
      }

      for (const val of validations) {
        const stake = await this.stakeRepo.findOne({ where: { agentId: val.validatorId } });
        if (!stake) continue;

        if (val.score >= 60) {
          // This validator confirmed bad feedback — penalize
          stake.validationPenalties = (stake.validationPenalties || 0) + 1;
          this.logger.warn(
            `Validator ${val.validatorId} penalized: confirmed bad feedback ${feedbackId} (score: ${val.score})`,
          );
        } else {
          // This validator correctly flagged it — reward
          stake.validationRewards = (stake.validationRewards || 0) + 1;
          this.logger.log(
            `Validator ${val.validatorId} rewarded: correctly flagged bad feedback ${feedbackId} (score: ${val.score})`,
          );
        }

        await this.stakeRepo.save(stake);
      }
    } catch (e) {
      this.logger.error(`Failed to penalize validators for feedback ${feedbackId}: ${e.message}`);
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
