import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Query,
  Body,
  Headers,
  Res,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import * as crypto from 'crypto';
import { AgentsService } from './agents.service';
import { ReputationService } from '../reputation/reputation.service';
import { FeedbackService } from '../feedback/feedback.service';
import { ValidationService } from '../validation/validation.service';
import { HCSService, HCSMessageType } from '../hedera/hcs.service';
import { HederaConfigService } from '../hedera/hedera-config.service';
import { HCS10Service } from '../hedera/hcs10.service';
import { SystemConfigService } from '../config/system-config.service';
import { StakingService } from '../staking/staking.service';
import { CommunityAuthService } from '../community-auth/community-auth.service';

/** Mandatory initial stake for every new agent (5 HBAR in tinybars) */
const REGISTRATION_STAKE_TINYBARS = 500_000_000; // 5 HBAR
const REGISTRATION_STAKE_LOCK_DAYS = 30;

/** Minimum acceptable payment (allow small rounding) */
const REGISTRATION_MIN_PAYMENT_TINYBARS = 800_000_000; // 8 HBAR minimum

@Controller('agents')
export class AgentsController {
  private readonly logger = new Logger(AgentsController.name);

  constructor(
    private readonly agentsService: AgentsService,
    private readonly reputationService: ReputationService,
    private readonly feedbackService: FeedbackService,
    private readonly validationService: ValidationService,
    private readonly hcsService: HCSService,
    private readonly hederaConfig: HederaConfigService,
    private readonly hcs10Service: HCS10Service,
    private readonly systemConfig: SystemConfigService,
    private readonly stakingService: StakingService,
    private readonly communityAuth: CommunityAuthService,
  ) {}

  /**
   * Verify a payment transaction on the mirror node.
   * Checks that the transaction exists, was successful, and transferred
   * sufficient HBAR to the operator account.
   */
  private async verifyPaymentTransaction(
    txId: string,
    payerAccountId: string,
    minTinybars: number = REGISTRATION_MIN_PAYMENT_TINYBARS,
  ): Promise<{ verified: boolean; amountTinybars: number }> {
    try {
      const network = process.env.HEDERA_NETWORK || 'testnet';
      const mirrorUrl =
        network === 'mainnet'
          ? 'https://mainnet.mirrornode.hedera.com'
          : 'https://testnet.mirrornode.hedera.com';
      const operatorId = process.env.HEDERA_ACCOUNT_ID;

      // Convert transaction ID format: 0.0.XXXX@SECONDS.NANOS -> 0.0.XXXX-SECONDS-NANOS
      const parts = txId.split('@');
      if (parts.length !== 2) {
        this.logger.warn(`Invalid transaction ID format: ${txId}`);
        return { verified: false, amountTinybars: 0 };
      }
      const [account, timestamp] = parts;
      const formattedTxId = `${account}-${timestamp.replace('.', '-')}`;

      this.logger.log(`Verifying payment tx: ${formattedTxId}`);

      const res = await fetch(
        `${mirrorUrl}/api/v1/transactions/${formattedTxId}`,
      );
      if (!res.ok) {
        this.logger.warn(`Mirror node returned ${res.status} for tx ${formattedTxId}`);
        return { verified: false, amountTinybars: 0 };
      }

      const data = await res.json();
      const transactions = data.transactions || [];
      if (transactions.length === 0) {
        this.logger.warn('No transactions found');
        return { verified: false, amountTinybars: 0 };
      }

      const tx = transactions[0];

      // Check transaction was successful
      if (tx.result !== 'SUCCESS') {
        this.logger.warn(`Transaction result: ${tx.result}`);
        return { verified: false, amountTinybars: 0 };
      }

      // Check that the operator received sufficient HBAR
      const transfers = tx.transfers || [];
      const operatorTransfer = transfers.find(
        (t: any) => t.account === operatorId && t.amount > 0,
      );

      if (!operatorTransfer) {
        this.logger.warn('No transfer to operator found');
        return { verified: false, amountTinybars: 0 };
      }

      if (operatorTransfer.amount < minTinybars) {
        this.logger.warn(
          `Insufficient payment: ${operatorTransfer.amount} tinybars (need ${minTinybars})`,
        );
        return { verified: false, amountTinybars: 0 };
      }

      // Verify payer
      const payerTransfer = transfers.find(
        (t: any) => t.account === payerAccountId && t.amount < 0,
      );
      if (!payerTransfer) {
        this.logger.warn('Payer account not found in transfers');
        return { verified: false, amountTinybars: 0 };
      }

      this.logger.log(
        `Payment verified: ${operatorTransfer.amount} tinybars from ${payerAccountId}`,
      );
      return { verified: true, amountTinybars: operatorTransfer.amount };
    } catch (e: any) {
      this.logger.error(`Payment verification error: ${e.message}`);
      return { verified: false, amountTinybars: 0 };
    }
  }

  private async authenticateAgent(apiKey: string | undefined) {
    if (!apiKey) {
      throw new HttpException(
        'Missing X-Agent-Key header.',
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
  async findAll(@Query('skill') skill?: string) {
    const agents = await this.agentsService.findAll(skill);
    const agentsWithRep = await Promise.all(
      agents.map(async (agent) => ({
        agent,
        reputation: await this.reputationService.computeReputation(agent.agentId),
      })),
    );
    return {
      agents: agentsWithRep,
      hederaEnabled: this.hederaConfig.isConfigured(),
    };
  }

  @Get('capabilities')
  getCapabilities() {
    return { capabilities: this.hcs10Service.getCapabilitiesList() };
  }

  @Get('hol-search')
  async brokerSearch(@Query('q') query: string, @Query('limit') limit?: string) {
    if (!query) {
      throw new HttpException('q query parameter is required', HttpStatus.BAD_REQUEST);
    }
    return this.hcs10Service.searchBroker(query, limit ? parseInt(limit, 10) : 10);
  }

  @Get('balances')
  async getAgentBalances(
    @Headers('authorization') authHeader: string | undefined,
  ) {
    let agents: import('./agent.entity').AgentEntity[];

    // If authenticated, show only the user's agents
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      try {
        const payload = await this.communityAuth.verifyToken(token);
        agents = await this.agentsService.findByOwner(payload.walletAddress);
      } catch {
        agents = [];
      }
    } else {
      // No auth — return empty (require login)
      agents = [];
    }
    const network = process.env.HEDERA_NETWORK || 'testnet';
    const mirrorUrl =
      network === 'mainnet'
        ? 'https://mainnet.mirrornode.hedera.com'
        : 'https://testnet.mirrornode.hedera.com';

    const results = await Promise.all(
      agents.map(async (agent) => {
        const accountId =
          agent.agentWallet ||
          (agent.metadata as any)?.hederaAccountId ||
          null;
        let balanceHbar = 0;
        let balanceTinybar = 0;
        if (accountId) {
          try {
            const res = await fetch(
              `${mirrorUrl}/api/v1/balances?account.id=${accountId}`,
            );
            const data = await res.json();
            balanceTinybar = data?.balances?.[0]?.balance || 0;
            balanceHbar = balanceTinybar / 100_000_000;
          } catch {
            /* mirror node error — skip */
          }
        }
        // Fetch stake info (regular + arbiter) from contract
        let stakeHbar = 0;
        let arbiterStakeHbar = 0;
        let arbiterEligible = false;
        try {
          const stake = await this.stakingService.getStake(agent.agentId);
          stakeHbar = Number(stake.balance) / 100_000_000;

          // Get arbiter stake from smart contract (source of truth)
          const arbiterStakeTinybar = await this.stakingService.getArbiterStakeFromContract(agent.agentId);
          if (arbiterStakeTinybar > 0) {
            arbiterStakeHbar = arbiterStakeTinybar / 100_000_000;
            // Sync DB
            stake.arbiterStake = arbiterStakeTinybar;
            await this.stakingService.saveStake(stake);
          } else {
            arbiterStakeHbar = Number(stake.arbiterStake || 0) / 100_000_000;
          }
          arbiterEligible = stake.arbiterEligible || (arbiterStakeHbar >= 10);
        } catch {
          /* skip */
        }

        return {
          agentId: agent.agentId,
          name: agent.name,
          accountId,
          balanceTinybar,
          balanceHbar,
          stakeHbar: stakeHbar + arbiterStakeHbar,
          arbiterStakeHbar,
          operatingBalanceTinybar: balanceTinybar || Number(agent.operatingBalance) || 0,
          operatingBalanceHbar: balanceTinybar ? balanceTinybar / 100_000_000 : (Number(agent.operatingBalance) || 0) / 100_000_000,
          apiKey: agent.apiKey || null,
          hashScanUrl: accountId
            ? `https://hashscan.io/${network}/account/${accountId}`
            : null,
          reputationScore: 0,
          feedbackCount: 0,
          arbiterEligible,
        };
      }),
    );
    return { agents: results };
  }

  @Post('topup')
  async topUpAgent(
    @Body() body: { agentId: string; paymentTxId: string; payerAccountId: string },
  ) {
    const { agentId, paymentTxId, payerAccountId } = body;
    if (!agentId || !paymentTxId || !payerAccountId) {
      throw new HttpException(
        'agentId, paymentTxId, and payerAccountId are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const agent = await this.agentsService.findOne(agentId);
    if (!agent) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }

    // Verify the user's payment on mirror node (min 0.01 HBAR = 1_000_000 tinybars)
    let result = { verified: false, amountTinybars: 0 };
    for (let attempt = 0; attempt < 5; attempt++) {
      result = await this.verifyPaymentTransaction(paymentTxId, payerAccountId, 1_000_000);
      if (result.verified) break;
      this.logger.log(`Top-up payment not found yet, retrying in 3s (attempt ${attempt + 1}/5)...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!result.verified) {
      throw new HttpException(
        'Payment verification failed. Transaction not found or insufficient.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // Credit the verified amount to the agent's operating balance
    const amountHbar = result.amountTinybars / 100_000_000;
    await this.agentsService.addBalance(agentId, result.amountTinybars);
    const network = process.env.HEDERA_NETWORK || 'testnet';

    this.logger.log(`Top-up verified: ${amountHbar} HBAR for agent ${agentId}`);

    return {
      success: true,
      agentId,
      amountHbar,
      paymentTxId,
      hashScanUrl: `https://hashscan.io/${network}/transaction/${paymentTxId}`,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const agent = await this.agentsService.findOne(id);
    if (!agent) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }

    const [reputation, feedback, validations] = await Promise.all([
      this.reputationService.computeReputation(id),
      this.feedbackService.findByAgent(id),
      this.validationService.findByAgent(id),
    ]);

    return { agent, reputation, feedback, validations };
  }

  // ---- ERC-8004 Identity Registry: getMetadata(agentId, key) ----
  @Get(':id/metadata/:key')
  async getMetadata(@Param('id') id: string, @Param('key') key: string) {
    const agent = await this.agentsService.findOne(id);
    if (!agent) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }
    const value = await this.agentsService.getMetadataByKey(id, key);
    return { agentId: id, key, value };
  }

  // ---- ERC-8004 Identity Registry: getAgentWallet(agentId) ----
  @Get(':id/wallet')
  async getAgentWallet(@Param('id') id: string) {
    const agent = await this.agentsService.findOne(id);
    if (!agent) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }
    return { agentId: id, wallet: agent.agentWallet || null };
  }

  /**
   * Check HOL broker credits for agent registration.
   */
  @Post('broker-quote')
  async getBrokerQuote(@Body() body: any) {
    if (!this.hcs10Service.isConfigured()) {
      throw new HttpException('HCS-10 not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const { name, description, capabilities, model, agentType } = body;
    const quote = await this.hcs10Service.checkBrokerCredits({
      name: name || 'unnamed',
      bio: description || name || 'unnamed',
      capabilities: capabilities || [],
      model,
      agentType,
    });
    return quote;
  }

  /**
   * SSE endpoint for agent registration with live progress.
   */
  @Post('register-with-progress')
  @Throttle({ default: { ttl: 3600000, limit: 20 } })
  async registerWithProgress(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: any,
    @Res() res: Response,
  ) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const {
        name, description, skills, capabilities, model, agentType,
        agentId: providedAgentId, registerOnHol,
        paymentTxId, payerAccountId,
        agentURI, agentWallet, metadata: metadataEntries,
      } = body;

      if (!name) {
        sendEvent('error', { message: 'name is required' });
        res.end();
        return;
      }

      // Verify payment
      if (!paymentTxId || !payerAccountId) {
        sendEvent('error', { message: 'Payment required. Send 8.5 HBAR to the operator wallet before registering.' });
        res.end();
        return;
      }

      sendEvent('progress', { stage: 'payment_verify', message: 'Verifying payment...', percent: 2 });

      let paymentResult = { verified: false, amountTinybars: 0 };
      for (let attempt = 0; attempt < 5; attempt++) {
        paymentResult = await this.verifyPaymentTransaction(paymentTxId, payerAccountId);
        if (paymentResult.verified) break;
        sendEvent('progress', { stage: 'payment_verify', message: `Waiting for payment confirmation (${attempt + 1}/5)...`, percent: 3 });
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!paymentResult.verified) {
        sendEvent('error', { message: 'Payment verification failed. Transaction not found or amount insufficient.' });
        res.end();
        return;
      }

      sendEvent('progress', { stage: 'payment_verified', message: 'Payment verified!', percent: 5 });

      // Extract creator wallet
      let createdByWallet: string | undefined;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const payload = await this.communityAuth.verifyToken(authHeader.replace('Bearer ', ''));
          createdByWallet = payload.walletAddress;
        } catch { /* continue */ }
      }

      // Build metadata
      const metadataObj: Record<string, unknown> = {};
      if (Array.isArray(metadataEntries)) {
        for (const entry of metadataEntries) {
          if (entry.key) metadataObj[entry.key] = entry.value;
        }
      }

      // HCS-10 Registration with progress
      if (this.hcs10Service.isConfigured()) {
        const hcs10Result = await this.hcs10Service.registerAgentWithProgress(
          {
            name,
            bio: description || name,
            capabilities: capabilities || [],
            model: model || '',
            agentType: agentType || 'autonomous',
            registerOnHol: registerOnHol || false,
          },
          (event) => sendEvent('progress', event),
        );

        if (!hcs10Result.success) {
          sendEvent('error', { message: `Registration failed: ${hcs10Result.error}` });
          res.end();
          return;
        }

        const agentId = hcs10Result.accountId || providedAgentId || `agent-${Date.now()}`;

        // Save agent to DB
        const existing = await this.agentsService.findOne(agentId);
        if (existing) {
          sendEvent('error', { message: `Agent ${agentId} already exists` });
          res.end();
          return;
        }

        const apiKey = `ar_${crypto.randomBytes(32).toString('hex')}`;
        const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

        const agent = await this.agentsService.create({
          agentId,
          name: name.trim(),
          description: (description || '').trim(),
          skills: skills || [],
          model: (model || '').trim(),
          agentType: agentType || 'autonomous',
          agentURI: agentURI || '',
          agentWallet: agentWallet || hcs10Result.accountId || undefined,
          inboundTopicId: hcs10Result.inboundTopicId || '',
          outboundTopicId: hcs10Result.outboundTopicId || '',
          profileTopicId: hcs10Result.profileTopicId || '',
          capabilities: capabilities || [],
          topicId: hcs10Result.inboundTopicId || '',
          createdAt: Date.now(),
          metadata: {
            ...metadataObj,
            hcs10TransactionId: hcs10Result.transactionId,
            hederaAccountId: hcs10Result.accountId,
          },
          hcs10Registered: true,
          brokerUaid: hcs10Result.broker?.uaid || undefined,
          apiKeyHash,
          apiKey,
          createdByWallet,
          operatingBalance: 300_000_000,
          paymentTxId: paymentTxId || undefined,
        } as any);

        // Record HCS identity event
        let hcsSequenceNumber: string | undefined;
        const topics = await this.systemConfig.getHCSTopics();
        if (topics.identity) {
          try {
            hcsSequenceNumber = await this.hcsService.logInteraction(
              topics.identity,
              HCSMessageType.AGENT_REGISTERED,
              {
                agentId,
                agentURI: agent.agentURI || '',
                owner: agentId,
                name: name.trim(),
                hcs10: true,
              },
            );
          } catch { /* non-blocking */ }
        }

        // Initial reputation + stake
        let stakeResult: { txId?: string; balanceHbar?: number } = {};
        try {
          const { stake, txId } = await this.stakingService.deposit(
            agentId,
            REGISTRATION_STAKE_TINYBARS,
            REGISTRATION_STAKE_LOCK_DAYS,
          );
          stakeResult = {
            txId,
            balanceHbar: Number(stake.balance) / 100_000_000,
          };
        } catch { /* non-blocking */ }

        const reputation = await this.reputationService.computeReputation(agentId);

        const network = process.env.HEDERA_NETWORK || 'testnet';

        // Build response
        const responseData: any = {
          agent,
          reputation,
          apiKey,
          hcsSequenceNumber,
          hcs10: {
            registered: true,
            inboundTopicId: hcs10Result.inboundTopicId,
            outboundTopicId: hcs10Result.outboundTopicId,
            profileTopicId: hcs10Result.profileTopicId,
            transactionId: hcs10Result.transactionId,
          },
          broker: hcs10Result.broker,
          stake: {
            amount: REGISTRATION_STAKE_TINYBARS / 100_000_000,
            lockDays: REGISTRATION_STAKE_LOCK_DAYS,
            balanceHbar: stakeResult.balanceHbar || 0,
            contractTxId: stakeResult.txId,
            hashScanUrl: stakeResult.txId
              ? `https://hashscan.io/${network}/transaction/${stakeResult.txId}`
              : undefined,
            onChain: !!stakeResult.txId,
          },
        };

        sendEvent('complete', responseData);
      } else {
        sendEvent('error', { message: 'HCS-10 not configured on server' });
      }
    } catch (error: any) {
      this.logger.error(`SSE registration error: ${error.message}`);
      sendEvent('error', { message: error.message });
    }

    res.end();
  }

  /**
   * ERC-8004 Identity Registry: register(agentURI, metadata[])
   * Also supports HCS-10 on-chain registration.
   */
  @Post()
  @Throttle({ default: { ttl: 3600000, limit: 20 } })
  async create(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: any,
  ) {
    const {
      name,
      description,
      skills,
      capabilities,
      model,
      agentType,
      agentId: providedAgentId,
      useHcs10,
      registerOnHol,
      // Payment fields
      paymentTxId,
      payerAccountId,
      // ERC-8004 fields
      agentURI,
      agentWallet,
      metadata: metadataEntries, // Array of { key, value } pairs
    } = body;

    if (!name) {
      throw new HttpException('name is required', HttpStatus.BAD_REQUEST);
    }

    // ---- Verify payment transaction ----
    if (!paymentTxId || !payerAccountId) {
      throw new HttpException(
        'Payment required. Send 8.5 HBAR to the operator wallet before registering.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // Verify the payment on mirror node (with retries for propagation delay)
    let result = { verified: false, amountTinybars: 0 };
    for (let attempt = 0; attempt < 5; attempt++) {
      result = await this.verifyPaymentTransaction(paymentTxId, payerAccountId);
      if (result.verified) break;
      this.logger.log(`Payment not found yet, retrying in 3s (attempt ${attempt + 1}/5)...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!result.verified) {
      throw new HttpException(
        'Payment verification failed. Transaction not found or amount insufficient.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    this.logger.log(`Payment verified: ${paymentTxId} from ${payerAccountId}`);

    // Extract creator's wallet from community auth token (optional)
    let createdByWallet: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const payload = await this.communityAuth.verifyToken(authHeader.replace('Bearer ', ''));
        createdByWallet = payload.walletAddress;
      } catch {
        // Not authenticated — continue without owner tracking
      }
    }

    // Build metadata from entries array (ERC-8004 MetadataEntry[])
    const metadataObj: Record<string, unknown> = {};
    if (Array.isArray(metadataEntries)) {
      for (const entry of metadataEntries) {
        if (entry.key) {
          metadataObj[entry.key] = entry.value;
        }
      }
    }

    // ---- HCS-10 Registration Path ----
    if (useHcs10 !== false && this.hcs10Service.isConfigured()) {
      const hcs10Result = await this.hcs10Service.registerAgent({
        name,
        bio: description || name,
        capabilities: capabilities || [],
        model: model || '',
        agentType: agentType || 'autonomous',
        registerOnHol: registerOnHol || false,
      });

      if (!hcs10Result.success) {
        this.logger.warn(`HCS-10 registration failed, falling back to legacy path: ${hcs10Result.error}`);
        // Fall through to legacy registration so the user's payment is not wasted
      } else {

      const agentId = hcs10Result.accountId || providedAgentId || `agent-${Date.now()}`;

      const existing = await this.agentsService.findOne(agentId);
      if (existing) {
        throw new HttpException('Agent with this ID already exists', HttpStatus.CONFLICT);
      }

      // Generate API key for agent authentication
      const rawApiKey = `ar_${crypto.randomBytes(32).toString('hex')}`;
      const apiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

      const agent = await this.agentsService.create({
        agentId,
        name,
        description: description || '',
        skills: skills || [],
        agentURI: agentURI || '',
        agentWallet: agentWallet || hcs10Result.accountId || undefined,
        inboundTopicId: hcs10Result.inboundTopicId || '',
        outboundTopicId: hcs10Result.outboundTopicId || '',
        profileTopicId: hcs10Result.profileTopicId || '',
        agentType: agentType || 'autonomous',
        model: model || '',
        capabilities: capabilities || [],
        topicId: hcs10Result.inboundTopicId || '',
        createdAt: Date.now(),
        metadata: {
          ...metadataObj,
          hcs10TransactionId: hcs10Result.transactionId,
          hederaAccountId: hcs10Result.accountId,
        },
        hcs10Registered: true,
        brokerUaid: hcs10Result.broker?.uaid || undefined,
        apiKeyHash,
        apiKey: rawApiKey,
        createdByWallet,
        operatingBalance: 300_000_000, // 3 HBAR in tinybars
        paymentTxId: paymentTxId || undefined,
      });

      // Log to HCS — ERC-8004 Registered event
      let hcsSequenceNumber: string | undefined;
      const topics = await this.systemConfig.getHCSTopics();
      if (topics.identity) {
        try {
          hcsSequenceNumber = await this.hcsService.logInteraction(
            topics.identity,
            HCSMessageType.AGENT_REGISTERED,
            {
              agentId,
              agentURI: agent.agentURI,
              owner: agentWallet || agentId,
              name,
              skills: agent.skills,
              capabilities: agent.capabilities,
              metadata: metadataObj,
              inboundTopicId: agent.inboundTopicId,
              outboundTopicId: agent.outboundTopicId,
              profileTopicId: agent.profileTopicId,
              hcs10: true,
            },
          );
        } catch (e) {
          this.logger.warn('Failed to log agent registration to HCS', e);
        }
      }

      // ---- Mandatory Initial Stake (5 HBAR) ----
      let stakeResult: { txId?: string; balanceHbar?: number } = {};
      try {
        const { stake, txId } = await this.stakingService.deposit(
          agentId,
          REGISTRATION_STAKE_TINYBARS,
          REGISTRATION_STAKE_LOCK_DAYS,
        );
        stakeResult = {
          txId,
          balanceHbar: Number(stake.balance) / 100_000_000,
        };
        this.logger.log(
          `Auto-staked ${REGISTRATION_STAKE_TINYBARS / 100_000_000} HBAR for agent ${agentId}, tx: ${txId}`,
        );

        // Log stake to HCS
        if (topics.feedback) {
          try {
            await this.hcsService.logInteraction(
              topics.feedback,
              HCSMessageType.STAKE_DEPOSITED,
              {
                agentId,
                amount: REGISTRATION_STAKE_TINYBARS,
                amountHbar: REGISTRATION_STAKE_TINYBARS / 100_000_000,
                lockDays: REGISTRATION_STAKE_LOCK_DAYS,
                type: 'registration_stake',
                contractTxId: txId,
                onChain: !!txId,
              },
            );
          } catch (e) {
            this.logger.warn('Failed to log registration stake to HCS', e);
          }
        }
      } catch (e) {
        this.logger.warn(`Failed to auto-stake for agent ${agentId}: ${e.message}`);
        stakeResult = { balanceHbar: 0 };
      }

      const reputation = await this.reputationService.computeReputation(agentId);

      const network = process.env.HEDERA_NETWORK || 'testnet';

      return {
        agent,
        reputation,
        apiKey: rawApiKey, // Show once — cannot be retrieved again
        hcsSequenceNumber,
        hcs10: {
          registered: true,
          inboundTopicId: hcs10Result.inboundTopicId,
          outboundTopicId: hcs10Result.outboundTopicId,
          profileTopicId: hcs10Result.profileTopicId,
          transactionId: hcs10Result.transactionId,
        },
        broker: hcs10Result.broker,
        stake: {
          amount: REGISTRATION_STAKE_TINYBARS / 100_000_000,
          lockDays: REGISTRATION_STAKE_LOCK_DAYS,
          balanceHbar: stakeResult.balanceHbar,
          contractTxId: stakeResult.txId,
          hashScanUrl: stakeResult.txId
            ? `https://hashscan.io/${network}/transaction/${stakeResult.txId}`
            : undefined,
          onChain: !!stakeResult.txId,
        },
      };
      } // close else (HCS-10 success path)
    } // close if (useHcs10 && isConfigured)

    // ---- Legacy Registration Path (no HCS-10, or HCS-10 fallback) ----
    const agentId = providedAgentId || `agent-${Date.now()}`;

    if (!agentId) {
      throw new HttpException('agentId is required when HCS-10 is not available', HttpStatus.BAD_REQUEST);
    }

    const existing = await this.agentsService.findOne(agentId);
    if (existing) {
      throw new HttpException('Agent with this ID already exists', HttpStatus.CONFLICT);
    }

    // Generate API key for agent authentication
    const rawApiKey = `ar_${crypto.randomBytes(32).toString('hex')}`;
    const apiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

    const agent = await this.agentsService.create({
      agentId,
      name,
      description: description || '',
      skills: skills || [],
      agentURI: agentURI || '',
      agentWallet: agentWallet || undefined,
      capabilities: capabilities || [],
      model: model || '',
      agentType: agentType || 'autonomous',
      topicId: '',
      profileTopicId: '',
      createdAt: Date.now(),
      metadata: metadataObj,
      hcs10Registered: false,
      apiKeyHash,
      apiKey: rawApiKey,
      createdByWallet,
      operatingBalance: 300_000_000, // 3 HBAR in tinybars
      paymentTxId: paymentTxId || undefined,
    });

    // Auto-stake 5 HBAR for agents registered via payment
    let stakeResult: { txId?: string; balanceHbar?: number } = {};
    if (paymentTxId) {
      try {
        const { stake, txId } = await this.stakingService.deposit(
          agentId,
          REGISTRATION_STAKE_TINYBARS,
          REGISTRATION_STAKE_LOCK_DAYS,
        );
        stakeResult = { txId, balanceHbar: Number(stake.balance) / 100_000_000 };
        this.logger.log(`Auto-staked ${REGISTRATION_STAKE_TINYBARS / 100_000_000} HBAR for agent ${agentId} (legacy path)`);
      } catch (e) {
        this.logger.warn(`Failed to auto-stake for agent ${agentId}: ${e.message}`);
      }
    }

    const reputation = await this.reputationService.computeReputation(agentId);

    let hcsSequenceNumber: string | undefined;
    if (this.hederaConfig.isConfigured()) {
      const topics = await this.systemConfig.getHCSTopics();
      if (topics.identity) {
        try {
          hcsSequenceNumber = await this.hcsService.logInteraction(
            topics.identity,
            HCSMessageType.AGENT_REGISTERED,
            {
              agentId,
              agentURI: agent.agentURI,
              owner: agentWallet || agentId,
              name,
              skills: agent.skills,
              metadata: metadataObj,
            },
          );
        } catch (e) {
          this.logger.warn('Failed to log agent registration to HCS', e);
        }
      }
    }

    return {
      agent,
      reputation,
      apiKey: rawApiKey,
      hcsSequenceNumber,
      hcs10: { registered: false },
      warning: useHcs10 !== false ? 'HCS-10 registration was unavailable. Agent registered without on-chain Hedera account. Topics can be assigned later.' : undefined,
    };
  }

  // ---- ERC-8004 Identity Registry: setAgentURI(agentId, newURI) ----
  @Patch(':id/uri')
  async setAgentURI(
    @Param('id') id: string,
    @Headers('x-agent-key') apiKey: string | undefined,
    @Body() body: { newURI: string },
  ) {
    const caller = await this.authenticateAgent(apiKey);
    if (caller.agentId !== id) {
      throw new HttpException('Can only update your own agent URI', HttpStatus.FORBIDDEN);
    }

    if (!body.newURI) {
      throw new HttpException('newURI is required', HttpStatus.BAD_REQUEST);
    }

    const updated = await this.agentsService.updateAgentURI(id, body.newURI);
    if (!updated) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }

    // Log ERC-8004 URIUpdated event to HCS
    if (this.hederaConfig.isConfigured()) {
      const topics = await this.systemConfig.getHCSTopics();
      if (topics.identity) {
        try {
          await this.hcsService.logInteraction(topics.identity, HCSMessageType.URI_UPDATED, {
            agentId: id,
            newURI: body.newURI,
            updatedBy: id,
          });
        } catch (e) {
          this.logger.warn('Failed to log URI update to HCS', e);
        }
      }
    }

    return { agent: updated };
  }

  // ---- ERC-8004 Identity Registry: setMetadata(agentId, key, value) ----
  @Put(':id/metadata/:key')
  async setMetadata(
    @Param('id') id: string,
    @Param('key') key: string,
    @Headers('x-agent-key') apiKey: string | undefined,
    @Body() body: { value: unknown },
  ) {
    const caller = await this.authenticateAgent(apiKey);
    if (caller.agentId !== id) {
      throw new HttpException('Can only update your own metadata', HttpStatus.FORBIDDEN);
    }

    const updated = await this.agentsService.setMetadataByKey(id, key, body.value);
    if (!updated) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }

    // Log ERC-8004 MetadataSet event to HCS
    if (this.hederaConfig.isConfigured()) {
      const topics = await this.systemConfig.getHCSTopics();
      if (topics.identity) {
        try {
          await this.hcsService.logInteraction(topics.identity, HCSMessageType.METADATA_SET, {
            agentId: id,
            metadataKey: key,
            metadataValue: body.value,
          });
        } catch (e) {
          this.logger.warn('Failed to log metadata set to HCS', e);
        }
      }
    }

    return { agentId: id, key, value: body.value };
  }

  // ---- ERC-8004 Identity Registry: setAgentWallet(agentId, wallet) ----
  @Put(':id/wallet')
  async setAgentWallet(
    @Param('id') id: string,
    @Headers('x-agent-key') apiKey: string | undefined,
    @Body() body: { wallet: string },
  ) {
    const caller = await this.authenticateAgent(apiKey);
    if (caller.agentId !== id) {
      throw new HttpException('Can only update your own wallet', HttpStatus.FORBIDDEN);
    }

    if (!body.wallet) {
      throw new HttpException('wallet is required', HttpStatus.BAD_REQUEST);
    }

    const updated = await this.agentsService.setAgentWallet(id, body.wallet);
    if (!updated) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }

    // Log ERC-8004 wallet set event to HCS
    if (this.hederaConfig.isConfigured()) {
      const topics = await this.systemConfig.getHCSTopics();
      if (topics.identity) {
        try {
          await this.hcsService.logInteraction(topics.identity, HCSMessageType.WALLET_SET, {
            agentId: id,
            wallet: body.wallet,
          });
        } catch (e) {
          this.logger.warn('Failed to log wallet set to HCS', e);
        }
      }
    }

    return { agentId: id, wallet: body.wallet };
  }
}
