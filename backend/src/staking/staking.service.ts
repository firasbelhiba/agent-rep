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

  async createDispute(
    feedbackId: string,
    disputerId: string,
    accusedId: string,
    reason: string,
  ): Promise<DisputeEntity> {
    const existing = await this.disputeRepo.findOne({
      where: { feedbackId, status: 'pending' },
    });
    if (existing) {
      throw new Error('A dispute is already pending for this feedback');
    }

    const dispute = this.disputeRepo.create({
      feedbackId,
      disputerId,
      accusedId,
      reason,
      status: 'pending',
      createdAt: Date.now(),
    });
    return this.disputeRepo.save(dispute);
  }

  async resolveDispute(
    disputeId: number,
    resolvedBy: string,
    upheld: boolean,
    notes?: string,
  ): Promise<{ dispute: DisputeEntity; slashedStake?: StakeEntity; txId?: string }> {
    const dispute = await this.disputeRepo.findOne({ where: { id: disputeId } });
    if (!dispute) throw new Error('Dispute not found');
    if (dispute.status !== 'pending') throw new Error('Dispute already resolved');

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
