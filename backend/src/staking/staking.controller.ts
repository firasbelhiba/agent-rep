import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { StakingService, MIN_STAKE_TO_FEEDBACK, SLASH_PERCENT } from './staking.service';
import { AgentsService } from '../agents/agents.service';
import { FeedbackService } from '../feedback/feedback.service';
import { HCSService, HCSMessageType } from '../hedera/hcs.service';
import { HederaConfigService } from '../hedera/hedera-config.service';
import { SystemConfigService } from '../config/system-config.service';

@Controller('staking')
export class StakingController {
  private readonly logger = new Logger(StakingController.name);

  constructor(
    private readonly stakingService: StakingService,
    private readonly agentsService: AgentsService,
    private readonly feedbackService: FeedbackService,
    private readonly hcsService: HCSService,
    private readonly hederaConfig: HederaConfigService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  private async authenticateAgent(apiKey: string | undefined) {
    if (!apiKey) {
      throw new HttpException('Missing X-Agent-Key header', HttpStatus.UNAUTHORIZED);
    }
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const agent = await this.agentsService.findByApiKeyHash(keyHash);
    if (!agent) {
      throw new HttpException('Invalid API key', HttpStatus.UNAUTHORIZED);
    }
    return agent;
  }

  /** Get staking info and constants */
  @Get('info')
  getInfo() {
    return {
      minStakeToFeedback: MIN_STAKE_TO_FEEDBACK,
      minStakeToFeedbackHbar: MIN_STAKE_TO_FEEDBACK / 100_000_000,
      slashPercent: SLASH_PERCENT,
      contractDeployed: this.stakingService.isContractActive(),
      contractId: process.env.STAKING_CONTRACT_ID || null,
      description:
        'Agents must stake HBAR to give feedback. Dishonest feedback can be disputed and staked HBAR slashed via smart contract.',
    };
  }

  /** Get TVL (Total Value Locked) directly from the smart contract */
  @Get('tvl')
  async getTvl() {
    const network = process.env.HEDERA_NETWORK || 'testnet';
    const contractId = process.env.STAKING_CONTRACT_ID || null;

    if (!this.stakingService.isContractActive()) {
      return {
        totalStakedTinybar: 0,
        totalStakedHbar: 0,
        totalSlashedTinybar: 0,
        totalSlashedHbar: 0,
        stakerCount: 0,
        contractId,
        onChain: false,
      };
    }

    try {
      const totals = await this.stakingService.getTotals();
      return {
        totalStakedTinybar: totals.totalStaked,
        totalStakedHbar: totals.totalStaked / 100_000_000,
        totalSlashedTinybar: totals.totalSlashed,
        totalSlashedHbar: totals.totalSlashed / 100_000_000,
        stakerCount: totals.stakerCount,
        contractId,
        onChain: true,
        contractUrl: `https://hashscan.io/${network}/contract/${contractId}`,
      };
    } catch (e) {
      this.logger.warn('Failed to fetch TVL from contract', e);
      return {
        totalStakedTinybar: 0,
        totalStakedHbar: 0,
        totalSlashedTinybar: 0,
        totalSlashedHbar: 0,
        stakerCount: 0,
        contractId,
        onChain: false,
        error: 'Failed to read from contract',
      };
    }
  }

  /** Get an agent's stake balance */
  @Get(':agentId')
  async getStake(@Param('agentId') agentId: string) {
    const stake = await this.stakingService.getStake(agentId);
    return {
      ...stake,
      balanceHbar: Number(stake.balance) / 100_000_000,
      meetsMinimum: Number(stake.balance) >= MIN_STAKE_TO_FEEDBACK,
      onChain: this.stakingService.isContractActive(),
    };
  }

  /** Deposit stake (in tinybars). Executes on-chain via smart contract when deployed. */
  @Post('deposit')
  async deposit(
    @Headers('x-agent-key') apiKey: string | undefined,
    @Body() body: { amount: number; lockDays?: number },
  ) {
    const agent = await this.authenticateAgent(apiKey);

    if (!body.amount || body.amount <= 0) {
      throw new HttpException('amount must be a positive number (in tinybars)', HttpStatus.BAD_REQUEST);
    }

    const lockDays = body.lockDays || 7;
    const { stake, txId } = await this.stakingService.deposit(agent.agentId, body.amount, lockDays);

    // Log to HCS
    let hcsSequenceNumber: string | undefined;
    if (this.hederaConfig.isConfigured()) {
      const topics = await this.systemConfig.getHCSTopics();
      if (topics.feedback) {
        try {
          hcsSequenceNumber = await this.hcsService.logInteraction(
            topics.feedback,
            HCSMessageType.STAKE_DEPOSITED,
            {
              agentId: agent.agentId,
              amount: body.amount,
              amountHbar: body.amount / 100_000_000,
              lockDays,
              newBalance: Number(stake.balance),
              contractTxId: txId,
              onChain: !!txId,
            },
          );
        } catch (e) {
          this.logger.warn('Failed to log stake deposit to HCS', e);
        }
      }
    }

    const network = process.env.HEDERA_NETWORK || 'testnet';

    return {
      stake,
      balanceHbar: Number(stake.balance) / 100_000_000,
      meetsMinimum: Number(stake.balance) >= MIN_STAKE_TO_FEEDBACK,
      hcsSequenceNumber,
      onChain: !!txId,
      contractTxId: txId,
      hashScanUrl: txId
        ? `https://hashscan.io/${network}/transaction/${txId}`
        : undefined,
    };
  }

  /** Dispute a feedback entry */
  @Post('dispute')
  async dispute(
    @Headers('x-agent-key') apiKey: string | undefined,
    @Body() body: { feedbackId: string; reason: string },
  ) {
    const agent = await this.authenticateAgent(apiKey);

    if (!body.feedbackId || !body.reason) {
      throw new HttpException('feedbackId and reason are required', HttpStatus.BAD_REQUEST);
    }

    const feedback = await this.feedbackService.findById(body.feedbackId);
    if (!feedback) {
      throw new HttpException('Feedback not found', HttpStatus.NOT_FOUND);
    }
    if (feedback.agentId !== agent.agentId) {
      throw new HttpException(
        'You can only dispute feedback about your own agent',
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      const dispute = await this.stakingService.createDispute(
        body.feedbackId,
        agent.agentId,
        feedback.fromAgentId,
        body.reason,
      );
      return { dispute };
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.CONFLICT);
    }
  }

  /** Resolve a dispute — slashes via smart contract when deployed */
  @Post('dispute/:id/resolve')
  async resolveDispute(
    @Param('id') id: string,
    @Headers('x-agent-key') apiKey: string | undefined,
    @Body() body: { upheld: boolean; notes?: string },
  ) {
    const arbiter = await this.authenticateAgent(apiKey);

    if (body.upheld === undefined) {
      throw new HttpException('upheld (boolean) is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const { dispute, slashedStake, txId } = await this.stakingService.resolveDispute(
        parseInt(id, 10),
        arbiter.agentId,
        body.upheld,
        body.notes,
      );

      // Log to HCS
      let hcsSequenceNumber: string | undefined;
      if (this.hederaConfig.isConfigured() && body.upheld) {
        const topics = await this.systemConfig.getHCSTopics();
        if (topics.feedback) {
          try {
            hcsSequenceNumber = await this.hcsService.logInteraction(
              topics.feedback,
              HCSMessageType.STAKE_SLASHED,
              {
                disputeId: dispute.id,
                accusedAgentId: dispute.accusedId,
                slashPercent: SLASH_PERCENT,
                resolvedBy: arbiter.agentId,
                feedbackId: dispute.feedbackId,
                contractTxId: txId,
                onChain: !!txId,
              },
            );
            dispute.hcsSequenceNumber = hcsSequenceNumber;
          } catch (e) {
            this.logger.warn('Failed to log slash to HCS', e);
          }
        }
      }

      const network = process.env.HEDERA_NETWORK || 'testnet';

      return {
        dispute,
        slashedStake,
        hcsSequenceNumber,
        onChain: !!txId,
        contractTxId: txId,
        hashScanUrl: txId
          ? `https://hashscan.io/${network}/transaction/${txId}`
          : undefined,
      };
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /** List disputes */
  @Get('disputes/all')
  async getAllDisputes() {
    const disputes = await this.stakingService.getDisputes();
    return { disputes };
  }

  @Get('disputes/:agentId')
  async getAgentDisputes(@Param('agentId') agentId: string) {
    const disputes = await this.stakingService.getDisputes(agentId);
    return { disputes };
  }

  /** Staking leaderboard */
  @Get('leaderboard/all')
  async getLeaderboard() {
    const stakes = await this.stakingService.getLeaderboard();
    return {
      stakes: stakes.map((s) => ({
        ...s,
        balanceHbar: Number(s.balance) / 100_000_000,
      })),
    };
  }
}
