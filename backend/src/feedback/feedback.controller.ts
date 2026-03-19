import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { FeedbackService } from './feedback.service';
import { AgentsService } from '../agents/agents.service';
import { ReputationService } from '../reputation/reputation.service';
import { HCSService, HCSMessageType } from '../hedera/hcs.service';
import { HederaConfigService } from '../hedera/hedera-config.service';
import { SystemConfigService } from '../config/system-config.service';
import { CommunityAuthService } from '../community-auth/community-auth.service';
import { ConnectionEntity } from '../hedera/connection.entity';
import { StakingService, MIN_STAKE_TO_FEEDBACK } from '../staking/staking.service';

// Fee per feedback transaction in tinybars (~0.01 HBAR covers HCS message + gas)
const FEEDBACK_FEE_TINYBARS = 1_000_000; // 0.01 HBAR

@Controller('feedback')
export class FeedbackController {
  private readonly logger = new Logger(FeedbackController.name);

  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly agentsService: AgentsService,
    private readonly reputationService: ReputationService,
    private readonly hcsService: HCSService,
    private readonly hederaConfig: HederaConfigService,
    private readonly systemConfig: SystemConfigService,
    private readonly communityAuth: CommunityAuthService,
    @InjectRepository(ConnectionEntity)
    private readonly connectionRepo: Repository<ConnectionEntity>,
    private readonly stakingService: StakingService,
  ) {}

  private async authenticateAgent(apiKey: string | undefined) {
    if (!apiKey) {
      throw new HttpException(
        'Missing X-Agent-Key header. Agents must authenticate with their API key.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const agent = await this.agentsService.findByApiKeyHash(keyHash);
    if (!agent) {
      throw new HttpException('Invalid API key', HttpStatus.UNAUTHORIZED);
    }
    return agent;
  }

  @Get()
  async findAll(
    @Query('agentId') agentId?: string,
    @Query('tag1') tag1?: string,
  ) {
    const feedback = await this.feedbackService.findAll(agentId, tag1);
    return { feedback };
  }

  // ---- ERC-8004 Reputation Registry: getSummary(agentId, clientAddresses[], tag1, tag2) ----
  @Get(':agentId/summary')
  async getSummary(
    @Param('agentId') agentId: string,
    @Query('clientAddresses') clientAddressesStr?: string,
    @Query('tag1') tag1?: string,
    @Query('tag2') tag2?: string,
  ) {
    const agent = await this.agentsService.findOne(agentId);
    if (!agent) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }

    const clientAddresses = clientAddressesStr ? clientAddressesStr.split(',').map((s) => s.trim()) : undefined;
    const summary = await this.feedbackService.getSummary(agentId, clientAddresses, tag1, tag2);
    return summary;
  }

  // ---- ERC-8004 Reputation Registry: readFeedback / readAllFeedback ----
  @Get(':agentId/read')
  async readFeedback(
    @Param('agentId') agentId: string,
    @Query('clientAddress') clientAddress?: string,
    @Query('feedbackIndex') feedbackIndexStr?: string,
    @Query('tag1') tag1?: string,
    @Query('tag2') tag2?: string,
    @Query('includeRevoked') includeRevokedStr?: string,
  ) {
    const agent = await this.agentsService.findOne(agentId);
    if (!agent) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }

    // If both clientAddress and feedbackIndex, return single feedback
    if (clientAddress && feedbackIndexStr !== undefined) {
      const feedbackIndex = parseInt(feedbackIndexStr, 10);
      const fb = await this.feedbackService.findByIndex(agentId, clientAddress, feedbackIndex);
      if (!fb) {
        throw new HttpException('Feedback not found', HttpStatus.NOT_FOUND);
      }
      return {
        value: fb.value,
        valueDecimals: fb.valueDecimals,
        tag1: fb.tag1,
        tag2: fb.tag2,
        isRevoked: fb.isRevoked,
      };
    }

    // Otherwise, return all feedback matching filters
    const clientAddresses = clientAddress ? [clientAddress] : undefined;
    const includeRevoked = includeRevokedStr === 'true';
    const feedback = await this.feedbackService.readAllFeedback(
      agentId,
      clientAddresses,
      tag1,
      tag2,
      includeRevoked,
    );

    return {
      feedback: feedback.map((fb) => ({
        clientAddress: fb.fromAgentId,
        feedbackIndex: fb.feedbackIndex,
        value: fb.value,
        valueDecimals: fb.valueDecimals,
        tag1: fb.tag1,
        tag2: fb.tag2,
        isRevoked: fb.isRevoked,
      })),
    };
  }

  // ---- ERC-8004 Reputation Registry: getClients(agentId) ----
  @Get(':agentId/clients')
  async getClients(@Param('agentId') agentId: string) {
    const agent = await this.agentsService.findOne(agentId);
    if (!agent) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }
    const clients = await this.feedbackService.getClients(agentId);
    return { clients };
  }

  // ---- ERC-8004 Reputation Registry: getLastIndex(agentId, clientAddress) ----
  @Get(':agentId/lastIndex')
  async getLastIndex(
    @Param('agentId') agentId: string,
    @Query('clientAddress') clientAddress: string,
  ) {
    if (!clientAddress) {
      throw new HttpException('clientAddress query param is required', HttpStatus.BAD_REQUEST);
    }
    const lastIndex = await this.feedbackService.getLastIndex(agentId, clientAddress);
    return { lastIndex };
  }

  /**
   * ERC-8004 Reputation Registry: giveFeedback
   * giveFeedback(agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash)
   */
  @Post()
  @Throttle({ default: { ttl: 3600000, limit: 20 } })
  async create(
    @Headers('x-agent-key') apiKey: string | undefined,
    @Body() body: any,
  ) {
    const fromAgent = await this.authenticateAgent(apiKey);
    const fromAgentId = fromAgent.agentId;

    const {
      agentId,
      value,
      valueDecimals,  // ERC-8004: uint8 (0-18)
      tag1,
      tag2,
      endpoint,       // ERC-8004: evaluated endpoint
      feedbackURI,
      feedbackHash,
    } = body;

    if (!agentId || value === undefined || !tag1 || !tag2) {
      throw new HttpException(
        'agentId, value, tag1, and tag2 are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (value < -100 || value > 100) {
      throw new HttpException('value must be between -100 and 100', HttpStatus.BAD_REQUEST);
    }

    const decimals = valueDecimals !== undefined ? Number(valueDecimals) : 0;
    if (decimals < 0 || decimals > 18) {
      throw new HttpException('valueDecimals must be between 0 and 18', HttpStatus.BAD_REQUEST);
    }

    if (fromAgentId === agentId) {
      throw new HttpException('Cannot submit feedback for yourself', HttpStatus.BAD_REQUEST);
    }

    const agent = await this.agentsService.findOne(agentId);
    if (!agent) {
      throw new HttpException('Target agent not found', HttpStatus.NOT_FOUND);
    }

    // Verify active HCS-10 connection
    const activeConnection = await this.connectionRepo.findOne({
      where: [
        { fromAgentId, toAgentId: agentId, status: 'active' },
        { fromAgentId: agentId, toAgentId: fromAgentId, status: 'active' },
      ],
    });
    if (!activeConnection) {
      throw new HttpException(
        'No active HCS-10 connection between your agent and the target agent.',
        HttpStatus.FORBIDDEN,
      );
    }

    // Stake-based accountability: require minimum stake to give feedback
    const hasStake = await this.stakingService.hasMinimumStake(fromAgentId);
    if (!hasStake) {
      const stake = await this.stakingService.getStake(fromAgentId);
      throw new HttpException(
        `Insufficient stake. You have ${Number(stake.balance) / 100_000_000} HBAR staked, but ${MIN_STAKE_TO_FEEDBACK / 100_000_000} HBAR minimum is required. POST /api/staking/deposit to stake HBAR first.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // Check operating balance before proceeding
    const hasBalance = await this.agentsService.hasBalance(fromAgentId, FEEDBACK_FEE_TINYBARS);
    if (!hasBalance) {
      const callerAgent = await this.agentsService.findOne(fromAgentId);
      const balanceHbar = (Number(callerAgent?.operatingBalance) || 0) / 100_000_000;
      throw new HttpException(
        `Insufficient operating balance. You have ${balanceHbar.toFixed(4)} HBAR but need ${(FEEDBACK_FEE_TINYBARS / 100_000_000).toFixed(4)} HBAR per feedback. Top up your agent balance to continue.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // Prevent duplicate feedback per agent-pair per category
    const existing = await this.feedbackService.findExisting(fromAgentId, agentId, tag1);
    if (existing) {
      throw new HttpException(
        'Feedback already submitted for this agent in this category. Revoke existing feedback first.',
        HttpStatus.CONFLICT,
      );
    }

    // ERC-8004: assign sequential feedbackIndex
    const feedbackIndex = await this.feedbackService.getNextFeedbackIndex(agentId);

    const saved = await this.feedbackService.create({
      feedbackId: uuidv4(),
      agentId,
      fromAgentId,
      feedbackType: 'agent',
      value: Number(value),
      valueDecimals: decimals,
      tag1,
      tag2,
      endpoint: endpoint || undefined,
      feedbackURI,
      feedbackHash,
      feedbackIndex,
      isRevoked: false,
      timestamp: Date.now(),
    });

    // Log ERC-8004 NewFeedback event to HCS
    let hcsSequenceNumber: string | undefined;
    if (this.hederaConfig.isConfigured()) {
      const topics = await this.systemConfig.getHCSTopics();
      if (topics.feedback) {
        try {
          hcsSequenceNumber = await this.hcsService.logInteraction(
            topics.feedback,
            HCSMessageType.FEEDBACK_SUBMITTED,
            {
              agentId,
              clientAddress: fromAgentId,
              feedbackIndex,
              value: Number(value),
              valueDecimals: decimals,
              tag1,
              tag2,
              endpoint: endpoint || '',
              feedbackURI: feedbackURI || '',
              feedbackHash: feedbackHash || '',
            },
          );
          saved.hcsSequenceNumber = hcsSequenceNumber;
          await this.feedbackService.create(saved);
        } catch (e) {
          this.logger.warn('Failed to log feedback to HCS', e);
        }
      }
    }

    // Deduct operating balance for the feedback transaction
    await this.agentsService.deductBalance(fromAgentId, FEEDBACK_FEE_TINYBARS);
    this.logger.log(
      `Deducted ${FEEDBACK_FEE_TINYBARS / 100_000_000} HBAR from agent ${fromAgentId} operating balance`,
    );

    const reputation = await this.reputationService.computeReputation(agentId);

    return { feedback: saved, reputation, hcsSequenceNumber, validationStatus: 'unvalidated' };
  }

  /**
   * Community feedback — submitted by authenticated human users.
   * ERC-8004 compatible: includes valueDecimals, endpoint fields.
   */
  @Post('community')
  @Throttle({ default: { ttl: 3600000, limit: 5 } })
  async createCommunityFeedback(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: any,
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException(
        'Authentication required. Please log in with your Hedera wallet to submit reviews.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const userPayload = await this.communityAuth.verifyToken(token);
    const user = await this.communityAuth.getUser(userPayload.walletAddress);
    if (!user) {
      throw new HttpException('User account not found', HttpStatus.UNAUTHORIZED);
    }

    const { agentId, value, valueDecimals, tag1, tag2, endpoint, comment } = body;

    if (!agentId || value === undefined || !tag1) {
      throw new HttpException(
        'agentId, value, and tag1 are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (value < -100 || value > 100) {
      throw new HttpException('value must be between -100 and 100', HttpStatus.BAD_REQUEST);
    }

    const decimals = valueDecimals !== undefined ? Number(valueDecimals) : 0;

    const agent = await this.agentsService.findOne(agentId);
    if (!agent) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }

    const existing = await this.feedbackService.findExisting(
      user.walletAddress,
      agentId,
      tag1,
    );
    if (existing) {
      throw new HttpException(
        'You have already submitted feedback for this agent in this category.',
        HttpStatus.CONFLICT,
      );
    }

    const feedbackIndex = await this.feedbackService.getNextFeedbackIndex(agentId);

    const saved = await this.feedbackService.create({
      feedbackId: uuidv4(),
      agentId,
      fromAgentId: user.walletAddress,
      feedbackType: 'community',
      value: Number(value),
      valueDecimals: decimals,
      tag1,
      tag2: tag2 || 'general',
      endpoint: endpoint || undefined,
      feedbackURI: comment || undefined,
      feedbackIndex,
      isRevoked: false,
      timestamp: Date.now(),
    });

    await this.communityAuth.incrementFeedbackCount(user.walletAddress);

    let hcsSequenceNumber: string | undefined;
    if (this.hederaConfig.isConfigured()) {
      const topics = await this.systemConfig.getHCSTopics();
      if (topics.feedback) {
        try {
          hcsSequenceNumber = await this.hcsService.logInteraction(
            topics.feedback,
            HCSMessageType.FEEDBACK_SUBMITTED,
            {
              agentId,
              clientAddress: user.walletAddress,
              feedbackIndex,
              feedbackType: 'community',
              value: Number(value),
              valueDecimals: decimals,
              tag1,
              tag2: tag2 || 'general',
              endpoint: endpoint || '',
            },
          );
          saved.hcsSequenceNumber = hcsSequenceNumber;
          await this.feedbackService.create(saved);
        } catch (e) {
          this.logger.warn('Failed to log community feedback to HCS', e);
        }
      }
    }

    const reputation = await this.reputationService.computeReputation(agentId);
    return { feedback: saved, reputation, hcsSequenceNumber };
  }

  /**
   * ERC-8004 Reputation Registry: revokeFeedback
   * Supports both UUID path and agentId/feedbackIndex path
   */
  @Delete(':id')
  async revoke(
    @Param('id') id: string,
    @Headers('x-agent-key') apiKey: string | undefined,
  ) {
    const fromAgent = await this.authenticateAgent(apiKey);

    const success = await this.feedbackService.revoke(id, fromAgent.agentId);
    if (!success) {
      throw new HttpException(
        'Feedback not found or not owned by your agent',
        HttpStatus.NOT_FOUND,
      );
    }

    // Log ERC-8004 FeedbackRevoked event to HCS
    if (this.hederaConfig.isConfigured()) {
      const topics = await this.systemConfig.getHCSTopics();
      if (topics.feedback) {
        try {
          await this.hcsService.logInteraction(topics.feedback, HCSMessageType.FEEDBACK_REVOKED, {
            feedbackId: id,
            clientAddress: fromAgent.agentId,
          });
        } catch (e) {
          this.logger.warn('Failed to log feedback revoke to HCS', e);
        }
      }
    }

    return { success: true };
  }

  /**
   * ERC-8004 Reputation Registry: revokeFeedback by agentId + feedbackIndex
   */
  @Delete(':agentId/index/:feedbackIndex')
  async revokeByIndex(
    @Param('agentId') agentId: string,
    @Param('feedbackIndex') feedbackIndexStr: string,
    @Headers('x-agent-key') apiKey: string | undefined,
  ) {
    const fromAgent = await this.authenticateAgent(apiKey);
    const feedbackIndex = parseInt(feedbackIndexStr, 10);

    const success = await this.feedbackService.revokeByIndex(agentId, feedbackIndex, fromAgent.agentId);
    if (!success) {
      throw new HttpException(
        'Feedback not found at this index or not owned by your agent',
        HttpStatus.NOT_FOUND,
      );
    }

    // Log ERC-8004 FeedbackRevoked event to HCS
    if (this.hederaConfig.isConfigured()) {
      const topics = await this.systemConfig.getHCSTopics();
      if (topics.feedback) {
        try {
          await this.hcsService.logInteraction(topics.feedback, HCSMessageType.FEEDBACK_REVOKED, {
            agentId,
            clientAddress: fromAgent.agentId,
            feedbackIndex,
          });
        } catch (e) {
          this.logger.warn('Failed to log feedback revoke to HCS', e);
        }
      }
    }

    return { success: true };
  }

  /**
   * Request validation for a specific feedback.
   * Agent-triggered — the system checks for eligible validators.
   * Returns validator list or "no validators available" message.
   */
  @Post(':id/request-validation')
  async requestValidation(
    @Param('id') feedbackId: string,
    @Headers('x-agent-key') apiKey: string | undefined,
  ) {
    const requester = await this.authenticateAgent(apiKey);

    const feedback = await this.feedbackService.findById(feedbackId);
    if (!feedback) {
      throw new HttpException('Feedback not found', HttpStatus.NOT_FOUND);
    }

    // Only the feedback giver or receiver can request validation
    if (feedback.fromAgentId !== requester.agentId && feedback.agentId !== requester.agentId) {
      throw new HttpException(
        'Only the feedback giver or receiver can request validation',
        HttpStatus.FORBIDDEN,
      );
    }

    // Check if already validated or pending
    if (feedback.validationStatus === 'validated') {
      return { status: 'already_validated', message: 'This feedback has already been validated.' };
    }
    if (feedback.validationStatus === 'pending_validation') {
      return { status: 'pending', message: 'Validation is already in progress. Validators have 24 hours to respond.' };
    }

    // Select validators
    let selectedValidators: string[] = [];
    try {
      selectedValidators = await this.stakingService.autoSelectValidatorsForFeedback(
        feedbackId,
        feedback.fromAgentId,
        feedback.agentId,
      );
    } catch (e: any) {
      this.logger.warn(`Validator selection failed: ${e.message}`);
    }

    if (selectedValidators.length === 0) {
      // Update status
      feedback.validationStatus = 'no_validators';
      await this.feedbackService.create(feedback);

      return {
        status: 'no_validators',
        message: 'No qualified validators available yet. Requirements: staked ≥ 5 HBAR, score ≥ 200 (VERIFIED tier), activity ≥ 3 interactions. Try again as the network grows.',
        eligibilityRequirements: {
          minStake: '5 HBAR',
          minScore: 200,
          minTier: 'VERIFIED',
          minActivity: 3,
        },
      };
    }

    // Update feedback with validators
    feedback.validationStatus = 'pending_validation';
    feedback.assignedValidators = JSON.stringify(selectedValidators);
    feedback.validationRequestedAt = Date.now();
    await this.feedbackService.create(feedback);

    this.logger.log(`Validation requested for feedback ${feedbackId}: ${selectedValidators.length} validators selected`);

    // Log to HCS
    if (this.hederaConfig.isConfigured()) {
      const topics = await this.systemConfig.getHCSTopics();
      if (topics.validation) {
        try {
          await this.hcsService.logInteraction(
            topics.validation,
            HCSMessageType.VALIDATION_REQUESTED,
            {
              feedbackId,
              targetAgentId: feedback.agentId,
              feedbackGiverId: feedback.fromAgentId,
              selectedValidators,
              deadline: Date.now() + 24 * 60 * 60 * 1000,
            },
          );
        } catch (e) {
          this.logger.warn('Failed to log validation request to HCS', e);
        }
      }
    }

    return {
      status: 'validators_assigned',
      message: `${selectedValidators.length} validator(s) selected. They have 24 hours to respond via HCS-10.`,
      validators: selectedValidators,
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  /**
   * ERC-8004 Reputation Registry: appendResponse
   * Agent can respond to feedback about them.
   */
  @Patch(':id')
  async respond(
    @Param('id') id: string,
    @Headers('x-agent-key') apiKey: string | undefined,
    @Body() body: any,
  ) {
    const agent = await this.authenticateAgent(apiKey);
    const { responseURI, responseHash } = body;
    if (!responseURI) {
      throw new HttpException('responseURI is required', HttpStatus.BAD_REQUEST);
    }

    const success = await this.feedbackService.appendResponse(id, agent.agentId, responseURI, responseHash);
    if (!success) {
      throw new HttpException(
        'Feedback not found or does not belong to your agent',
        HttpStatus.NOT_FOUND,
      );
    }

    // Log ERC-8004 ResponseAppended event to HCS
    if (this.hederaConfig.isConfigured()) {
      const topics = await this.systemConfig.getHCSTopics();
      if (topics.feedback) {
        try {
          const fb = await this.feedbackService.findById(id);
          await this.hcsService.logInteraction(topics.feedback, HCSMessageType.FEEDBACK_RESPONSE, {
            agentId: agent.agentId,
            clientAddress: fb?.fromAgentId,
            feedbackIndex: fb?.feedbackIndex,
            responder: agent.agentId,
            responseURI,
            responseHash: responseHash || '',
          });
        } catch (e) {
          this.logger.warn('Failed to log response append to HCS', e);
        }
      }
    }

    return { success: true };
  }
}
