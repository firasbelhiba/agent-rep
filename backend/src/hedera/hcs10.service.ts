import { Injectable, Logger } from '@nestjs/common';
import {
  HCS10Client,
  AgentBuilder,
  AIAgentCapability,
  AIAgentType,
  InboundTopicType,
  ProfileType,
  RegistryBrokerClient,
} from '@hashgraphonline/standards-sdk';

export interface RegisterAgentParams {
  name: string;
  bio: string;
  capabilities: (string | number)[];
  model?: string;
  creator?: string;
  agentType?: 'autonomous' | 'manual';
  inboundTopicType?: 'PUBLIC' | 'CONTROLLED' | 'FEE_BASED';
  registerOnHol?: boolean;
}

/** Map string capability names to AIAgentCapability enum values */
const CAPABILITY_MAP: Record<string, AIAgentCapability> = {
  'text-generation': AIAgentCapability.TEXT_GENERATION,
  'image-generation': AIAgentCapability.IMAGE_GENERATION,
  'audio-generation': AIAgentCapability.AUDIO_GENERATION,
  'video-generation': AIAgentCapability.VIDEO_GENERATION,
  'code-generation': AIAgentCapability.CODE_GENERATION,
  'language-translation': AIAgentCapability.LANGUAGE_TRANSLATION,
  'summarization-extraction': AIAgentCapability.SUMMARIZATION_EXTRACTION,
  'knowledge-retrieval': AIAgentCapability.KNOWLEDGE_RETRIEVAL,
  'data-integration': AIAgentCapability.DATA_INTEGRATION,
  'market-intelligence': AIAgentCapability.MARKET_INTELLIGENCE,
  'transaction-analytics': AIAgentCapability.TRANSACTION_ANALYTICS,
  'smart-contract-audit': AIAgentCapability.SMART_CONTRACT_AUDIT,
  'governance-facilitation': AIAgentCapability.GOVERNANCE_FACILITATION,
  'security-monitoring': AIAgentCapability.SECURITY_MONITORING,
  'compliance-analysis': AIAgentCapability.COMPLIANCE_ANALYSIS,
  'fraud-detection': AIAgentCapability.FRAUD_DETECTION,
  'multi-agent-coordination': AIAgentCapability.MULTI_AGENT_COORDINATION,
  'api-integration': AIAgentCapability.API_INTEGRATION,
  'workflow-automation': AIAgentCapability.WORKFLOW_AUTOMATION,
};

function resolveCapability(cap: string | number): AIAgentCapability {
  if (typeof cap === 'number') return cap as AIAgentCapability;
  const key = cap.toLowerCase().replace(/_/g, '-');
  return CAPABILITY_MAP[key] ?? AIAgentCapability.TEXT_GENERATION;
}

export interface RegisterAgentResult {
  success: boolean;
  accountId?: string;
  inboundTopicId?: string;
  outboundTopicId?: string;
  profileTopicId?: string;
  transactionId?: string;
  error?: string;
  broker?: {
    uaid?: string;
    registered: boolean;
    error?: string;
  };
}

export interface ConnectionResult {
  success: boolean;
  connectionTopicId?: string;
  connectionRequestId?: number;
  error?: string;
}

const BROKER_URL = 'https://hol.org/registry/api/v1';
const BROKER_REGISTRY = 'hashgraph-online';

@Injectable()
export class HCS10Service {
  private readonly logger = new Logger(HCS10Service.name);
  private client: HCS10Client | null = null;
  private brokerClient: RegistryBrokerClient | null = null;
  private brokerAuthenticated = false;

  isConfigured(): boolean {
    return !!(process.env.HEDERA_ACCOUNT_ID && process.env.HEDERA_PRIVATE_KEY);
  }

  getClient(): HCS10Client {
    if (this.client) return this.client;

    const network = (process.env.HEDERA_NETWORK || 'testnet') as 'testnet' | 'mainnet';
    const operatorId = process.env.HEDERA_ACCOUNT_ID;
    const privateKey = process.env.HEDERA_PRIVATE_KEY;

    if (!operatorId || !privateKey) {
      throw new Error('HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set');
    }

    this.client = new HCS10Client({
      network,
      operatorId,
      operatorPrivateKey: privateKey,
      logLevel: 'info',
    });

    this.logger.log(`HCS-10 client initialized for ${network} with operator ${operatorId}`);
    return this.client;
  }

  /**
   * Register a new AI agent using HCS-10 standard.
   * Creates account, inbound/outbound topics, HCS-11 profile, and registers in HOL registry.
   */
  async registerAgent(params: RegisterAgentParams): Promise<RegisterAgentResult> {
    try {
      const client = this.getClient();

      const resolvedCaps = (params.capabilities || []).map(resolveCapability);
      // Ensure at least one capability
      if (resolvedCaps.length === 0) {
        resolvedCaps.push(AIAgentCapability.TEXT_GENERATION);
      }

      const builder = new AgentBuilder()
        .setName(params.name)
        .setBio(params.bio || params.name)
        .setCapabilities(resolvedCaps)
        .setType(params.agentType || 'autonomous')
        .setModel(params.model || 'unknown')
        .setNetwork((process.env.HEDERA_NETWORK || 'testnet') as any)
        .setInboundTopicType(
          (params.inboundTopicType || 'PUBLIC') as unknown as InboundTopicType,
        );
      if (params.creator) {
        builder.setCreator(params.creator);
      }

      this.logger.log(`Registering agent "${params.name}" via HCS-10...`);

      const result = await client.createAndRegisterAgent(builder, {
        initialBalance: 3, // 3 HBAR — just enough for topic fees
        progressCallback: (progress) => {
          this.logger.log(`[HCS-10 Registration] ${progress.stage}: ${progress.message}`);
        },
      });

      const state = result.state;

      // Extract Hedera account ID from createdResources (e.g. "account:0.0.1234")
      const accountResource = (state as any)?.createdResources?.find(
        (r: string) => r.startsWith('account:'),
      );
      const hederaAccountId = accountResource
        ? accountResource.replace('account:', '')
        : undefined;

      // Treat as success if core resources (account + topics) were created,
      // even if the final registry confirmation timed out
      const hasResources =
        hederaAccountId && state?.inboundTopicId && state?.outboundTopicId;

      if (result.success || hasResources) {
        if (!result.success) {
          this.logger.warn(
            `Registration confirmation failed but resources exist — proceeding. Account=${hederaAccountId}, error=${state?.error}`,
          );
        } else {
          this.logger.log(
            `Agent registered successfully: inbound=${state?.inboundTopicId}, outbound=${state?.outboundTopicId}, profile=${state?.profileTopicId}`,
          );
        }

        // HOL Registry Broker registration is opt-in (requires credits)
        let broker: { uaid?: string; registered: boolean; error?: string } | undefined;
        if (params.registerOnHol) {
          try {
            broker = await this.registerWithBroker({
              ...params,
              capabilities: resolvedCaps as number[],
            });
          } catch (e: any) {
            this.logger.warn(`Broker registration failed: ${e.message}`);
            broker = { registered: false, error: e.message };
          }
        }

        return {
          success: true,
          accountId: hederaAccountId,
          inboundTopicId: state?.inboundTopicId,
          outboundTopicId: state?.outboundTopicId,
          profileTopicId: state?.profileTopicId,
          transactionId: result.transactionId,
          broker,
        };
      }

      return {
        success: false,
        error: state?.error || 'Registration failed',
      };
    } catch (error: any) {
      this.logger.error(`HCS-10 registration failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get or create an authenticated Registry Broker client.
   */
  async getBrokerClient(): Promise<RegistryBrokerClient> {
    if (this.brokerClient && this.brokerAuthenticated) return this.brokerClient;

    this.brokerClient = new RegistryBrokerClient({ baseUrl: BROKER_URL });

    const accountId = process.env.HEDERA_ACCOUNT_ID;
    const privateKey = process.env.HEDERA_PRIVATE_KEY;
    const network = process.env.HEDERA_NETWORK || 'testnet';

    if (!accountId || !privateKey) {
      throw new Error('HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set for broker auth');
    }

    this.logger.log(`Authenticating with HOL Broker: accountId=${accountId}, network=hedera:${network}, keyPresent=${!!privateKey}`);

    try {
      await this.brokerClient.authenticateWithLedgerCredentials({
        accountId,
        network: `hedera:${network}`,
        hederaPrivateKey: privateKey,
        expiresInMinutes: 30,
        label: 'agentrip-registration',
      });
    } catch (authErr: any) {
      const details = authErr.status
        ? `HTTP ${authErr.status} ${authErr.statusText}: ${JSON.stringify(authErr.body)}`
        : authErr.message;
      this.logger.error(`Broker authentication failed: ${details}`);
      throw authErr;
    }

    this.brokerAuthenticated = true;
    this.logger.log('Authenticated with HOL Registry Broker');
    return this.brokerClient;
  }

  /**
   * Register an agent with the HOL Registry Broker for discoverability.
   */
  async registerWithBroker(params: {
    name: string;
    bio: string;
    capabilities: number[];
    model?: string;
    agentType?: 'autonomous' | 'manual';
  }): Promise<{ uaid?: string; registered: boolean; error?: string }> {
    try {
      const broker = await this.getBrokerClient();

      const profile: any = {
        version: '1.0',
        type: ProfileType.AI_AGENT,
        display_name: params.name,
        alias: `agentrep-${Date.now().toString(36)}`,
        bio: params.bio || params.name,
        properties: {
          tags: ['agentrep', 'reputation', 'trust', 'hedera'],
        },
        aiAgent: {
          type: params.agentType === 'manual' ? AIAgentType.MANUAL : AIAgentType.AUTONOMOUS,
          model: params.model || 'unknown',
          capabilities: params.capabilities.map((c) => c as AIAgentCapability),
        },
      };

      const registration = await broker.registerAgent({
        profile,
        communicationProtocol: 'a2a',
        registry: BROKER_REGISTRY,
        metadata: {
          provider: 'agentrep',
          version: '1.0.0',
        },
      });

      const uaid = (registration as any).uaid;
      this.logger.log(`Agent registered with HOL Broker: UAID=${uaid}`);

      // If registration is async, wait for completion
      const attemptId = (registration as any).attemptId;
      if (attemptId) {
        try {
          const progress = await broker.waitForRegistrationCompletion(attemptId, {
            intervalMs: 2000,
            timeoutMs: 60000,
          });
          this.logger.log(`Broker registration completed: ${(progress as any).status}`);
        } catch (e: any) {
          this.logger.warn(`Broker registration polling timed out: ${e.message}`);
        }
      }

      return { uaid, registered: true };
    } catch (error: any) {
      const details = error.status
        ? `HTTP ${error.status} ${error.statusText}: ${JSON.stringify(error.body)}`
        : error.message;
      this.logger.error(`HOL Broker registration failed: ${details}`);
      return { registered: false, error: details };
    }
  }

  /**
   * Search for agents on the HOL Registry Broker.
   */
  async searchBroker(query: string, limit = 10): Promise<any> {
    try {
      const broker = await this.getBrokerClient();
      const results = await broker.search({ q: query, limit });
      return results;
    } catch (error: any) {
      this.logger.error(`Broker search failed: ${error.message}`);
      return { hits: [], total: 0 };
    }
  }

  /**
   * Register an existing agent (already has an account) with the HOL registry.
   */
  async registerExistingAgent(accountId: string): Promise<RegisterAgentResult> {
    try {
      const client = this.getClient();
      const network = process.env.HEDERA_NETWORK || 'testnet';

      this.logger.log(`Registering existing account ${accountId} with HOL registry...`);

      const result = await client.registerAgentWithGuardedRegistry(accountId, network, {
        progressCallback: (progress) => {
          this.logger.log(`[HOL Registry] ${progress.stage}: ${progress.message}`);
        },
      });

      return {
        success: result.success,
        transactionId: result.transactionId,
        error: result.state?.error,
      };
    } catch (error: any) {
      this.logger.error(`HOL registry registration failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Initiate a connection to another agent via HCS-10.
   */
  async initiateConnection(targetInboundTopicId: string): Promise<ConnectionResult> {
    try {
      const client = this.getClient();

      this.logger.log(`Initiating connection to inbound topic ${targetInboundTopicId}...`);

      const result = await (client as any).submitConnectionRequest(
        targetInboundTopicId,
        'AgentRep connection request',
      );

      this.logger.log(`Connection request sent, sequence: ${result}`);

      return {
        success: true,
        connectionRequestId: typeof result === 'number' ? result : undefined,
      };
    } catch (error: any) {
      this.logger.error(`Connection initiation failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle an incoming connection request.
   */
  async acceptConnection(
    inboundTopicId: string,
    requestingAccountId: string,
    connectionRequestId: number,
  ): Promise<ConnectionResult> {
    try {
      const client = this.getClient();

      this.logger.log(
        `Accepting connection request ${connectionRequestId} from ${requestingAccountId}...`,
      );

      const result = await client.handleConnectionRequest(
        inboundTopicId,
        requestingAccountId,
        connectionRequestId,
      );

      return {
        success: true,
        connectionTopicId: result.connectionTopicId,
      };
    } catch (error: any) {
      this.logger.error(`Connection acceptance failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a message on a connection topic using HCS-10 SDK standard format.
   * Message format: { p: "hcs-10", op: "message", operator_id, data, m }
   * The senderRole (e.g. "user" or agentId) is embedded in the memo field
   * so consumers can distinguish who sent the message.
   */
  async sendMessage(connectionTopicId: string, data: string, memo?: string, senderRole?: string): Promise<boolean> {
    try {
      const { TopicMessageSubmitTransaction, Client: HederaClient } = await import('@hashgraph/sdk');
      const hederaClient = process.env.HEDERA_NETWORK === 'mainnet'
        ? HederaClient.forMainnet()
        : HederaClient.forTestnet();
      hederaClient.setOperator(
        process.env.HEDERA_ACCOUNT_ID!,
        process.env.HEDERA_PRIVATE_KEY!,
      );

      // HCS-10 standard message format (same as SDK produces)
      const enrichedMemo = senderRole ? `sender:${senderRole}` : (memo || undefined);
      const payload = JSON.stringify({
        p: 'hcs-10',
        op: 'message',
        operator_id: process.env.HEDERA_ACCOUNT_ID,
        data,
        m: enrichedMemo,
      });

      await new TopicMessageSubmitTransaction()
        .setTopicId(connectionTopicId)
        .setMessage(payload)
        .execute(hederaClient);
      hederaClient.close();
      this.logger.log(`HCS-10 message sent to ${connectionTopicId} (role: ${senderRole || 'operator'})`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send HCS-10 message to ${connectionTopicId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Retrieve messages from a topic via mirror node.
   */
  async getTopicMessages(topicId: string, limit = 50): Promise<any[]> {
    const network = process.env.HEDERA_NETWORK || 'testnet';
    const mirrorUrl =
      network === 'mainnet'
        ? 'https://mainnet.mirrornode.hedera.com'
        : 'https://testnet.mirrornode.hedera.com';

    const url = `${mirrorUrl}/api/v1/topics/${topicId}/messages?limit=${limit}&order=desc`;

    try {
      const response = await fetch(url);
      const json = await response.json();

      if (!json.messages) return [];

      return json.messages.map((msg: { message: string; consensus_timestamp: string; sequence_number: number }) => {
        const decoded = Buffer.from(msg.message, 'base64').toString('utf-8');
        try {
          const parsed = JSON.parse(decoded);
          // Normalize HCS-10 standard format { p: "hcs-10", op: "message", operator_id, data, m }
          // into a consistent shape for consumers
          if (parsed.p === 'hcs-10' && parsed.op === 'message') {
            // Extract sender role from memo (format: "sender:user" or "sender:<agentId>")
            const memoStr = parsed.m || '';
            const sender = memoStr.startsWith('sender:') ? memoStr.slice(7) : parsed.operator_id;
            return {
              data: {
                type: 'message',
                data: parsed.data,
                sender,
                memo: memoStr.startsWith('sender:') ? undefined : parsed.m,
              },
              consensusTimestamp: msg.consensus_timestamp,
              sequenceNumber: msg.sequence_number,
            };
          }
          // Legacy format { type, data, sender, timestamp, memo } — pass through
          return {
            data: parsed,
            consensusTimestamp: msg.consensus_timestamp,
            sequenceNumber: msg.sequence_number,
          };
        } catch {
          return {
            data: decoded,
            consensusTimestamp: msg.consensus_timestamp,
            sequenceNumber: msg.sequence_number,
          };
        }
      });
    } catch (error: any) {
      this.logger.error(`Failed to fetch topic messages: ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch an agent's HCS-11 profile from their account.
   */
  async getAgentProfile(accountId: string): Promise<any> {
    const network = process.env.HEDERA_NETWORK || 'testnet';
    const mirrorUrl =
      network === 'mainnet'
        ? 'https://mainnet.mirrornode.hedera.com'
        : 'https://testnet.mirrornode.hedera.com';

    try {
      const response = await fetch(`${mirrorUrl}/api/v1/accounts/${accountId}`);
      const account = await response.json();

      if (!account.memo) return null;

      // HCS-11: account memo format is "hcs-11:<protocol_reference>"
      // e.g., "hcs-11:hcs://1/0.0.8768762" or "hcs-11:ipfs://Qm..."
      const memo: string = account.memo;
      if (!memo.startsWith('hcs-11:')) return null;

      const protocolRef = memo.slice('hcs-11:'.length);

      // Parse HRL format: "hcs://1/<topicId>" (HCS-1 referenced profile)
      let profileTopicId: string;
      if (protocolRef.startsWith('hcs://1/')) {
        profileTopicId = protocolRef.slice('hcs://1/'.length);
      } else if (protocolRef.match(/^0\.0\.\d+$/)) {
        // Direct topic ID (some implementations may omit the hcs:// prefix)
        profileTopicId = protocolRef;
      } else {
        // Non-HCS protocol (IPFS, HTTPS, etc.) — not supported for now
        this.logger.warn(`Unsupported HCS-11 protocol reference: ${protocolRef}`);
        return null;
      }

      const messages = await this.getTopicMessages(profileTopicId, 1);

      if (messages.length > 0) {
        return messages[0].data;
      }

      return null;
    } catch (error: any) {
      this.logger.error(`Failed to fetch agent profile: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if there are enough HOL broker credits for agent registration.
   * Returns quote with available/required/shortfall credits.
   */
  async checkBrokerCredits(params: {
    name: string;
    bio: string;
    capabilities: number[];
    model?: string;
    agentType?: 'autonomous' | 'manual';
  }): Promise<{
    available: number;
    required: number;
    shortfall: number;
    estimatedHbar: number;
    sufficient: boolean;
  }> {
    try {
      const broker = await this.getBrokerClient();

      const profile: any = {
        version: '1.0',
        type: ProfileType.AI_AGENT,
        display_name: params.name,
        alias: `agentrep-quote-${Date.now().toString(36)}`,
        bio: params.bio || params.name,
        properties: { tags: ['agentrep', 'reputation', 'trust', 'hedera'] },
        aiAgent: {
          type: params.agentType === 'manual' ? AIAgentType.MANUAL : AIAgentType.AUTONOMOUS,
          model: params.model || 'unknown',
          capabilities: params.capabilities.map((c) => c as AIAgentCapability),
        },
      };

      const quote = await broker.getRegistrationQuote({
        profile,
        communicationProtocol: 'a2a',
        registry: BROKER_REGISTRY,
        metadata: { provider: 'agentrep', version: '1.0.0' },
      });

      const available = (quote as any).availableCredits ?? 0;
      const required = (quote as any).requiredCredits ?? 0;
      const shortfall = (quote as any).shortfallCredits ?? 0;
      const estimatedHbar = (quote as any).estimatedHbar ?? 0;

      return {
        available,
        required,
        shortfall,
        estimatedHbar,
        sufficient: shortfall <= 0,
      };
    } catch (error: any) {
      this.logger.error(`Broker credit check failed: ${error.message}`);
      return { available: 0, required: 0, shortfall: 0, estimatedHbar: 0, sufficient: false };
    }
  }

  /**
   * Purchase HOL broker credits with HBAR.
   */
  async purchaseBrokerCredits(hbarAmount: number): Promise<{
    success: boolean;
    credits?: number;
    error?: string;
  }> {
    try {
      const broker = await this.getBrokerClient();

      const result = await broker.purchaseCreditsWithHbar({
        accountId: process.env.HEDERA_ACCOUNT_ID!,
        privateKey: process.env.HEDERA_PRIVATE_KEY!,
        hbarAmount,
        memo: 'AgentRep broker credits',
      });

      this.logger.log(`Purchased HOL credits: ${JSON.stringify(result)}`);
      return { success: true, credits: (result as any).credits };
    } catch (error: any) {
      this.logger.error(`Credit purchase failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Register agent with progress callback support.
   * Returns a stream-friendly generator of progress events.
   */
  async registerAgentWithProgress(
    params: RegisterAgentParams,
    onProgress: (event: { stage: string; message: string; percent: number }) => void,
  ): Promise<RegisterAgentResult> {
    try {
      const client = this.getClient();

      const resolvedCaps = (params.capabilities || []).map(resolveCapability);
      if (resolvedCaps.length === 0) {
        resolvedCaps.push(AIAgentCapability.TEXT_GENERATION);
      }

      const builder = new AgentBuilder()
        .setName(params.name)
        .setBio(params.bio || params.name)
        .setCapabilities(resolvedCaps)
        .setType(params.agentType || 'autonomous')
        .setModel(params.model || 'unknown')
        .setNetwork((process.env.HEDERA_NETWORK || 'testnet') as any)
        .setInboundTopicType(
          (params.inboundTopicType || 'PUBLIC') as unknown as InboundTopicType,
        );
      if (params.creator) {
        builder.setCreator(params.creator);
      }

      onProgress({ stage: 'preparing', message: 'Preparing agent registration...', percent: 5 });

      const result = await client.createAndRegisterAgent(builder, {
        initialBalance: 3,
        progressCallback: (progress) => {
          const stageMap: Record<string, { message: string; percent: number }> = {
            preparing: { message: 'Creating Hedera account...', percent: 15 },
            submitting: { message: 'Creating HCS topics...', percent: 35 },
            confirming: { message: 'Confirming on-chain registration...', percent: 55 },
            verifying: { message: 'Verifying HCS-11 profile...', percent: 65 },
            completed: { message: 'HCS-10 registration complete!', percent: 70 },
            failed: { message: 'Registration failed', percent: 0 },
          };
          const mapped = stageMap[progress.stage] || { message: progress.message, percent: 50 };
          onProgress({ stage: progress.stage, message: mapped.message, percent: mapped.percent });
        },
      });

      const state = result.state;
      const accountResource = (state as any)?.createdResources?.find(
        (r: string) => r.startsWith('account:'),
      );
      const hederaAccountId = accountResource
        ? accountResource.replace('account:', '')
        : undefined;

      const hasResources =
        hederaAccountId && state?.inboundTopicId && state?.outboundTopicId;

      if (result.success || hasResources) {
        // HOL Registry Broker registration (opt-in)
        let broker: { uaid?: string; registered: boolean; error?: string } | undefined;
        if (params.registerOnHol) {
          onProgress({ stage: 'hol_credits', message: 'Checking HOL Registry credits...', percent: 75 });

          const credits = await this.checkBrokerCredits({
            name: params.name,
            bio: params.bio || params.name,
            capabilities: resolvedCaps as number[],
            model: params.model,
            agentType: params.agentType,
          });

          if (credits.sufficient) {
            onProgress({ stage: 'hol_register', message: 'Registering on HOL Registry Broker...', percent: 85 });
            try {
              broker = await this.registerWithBroker({
                name: params.name,
                bio: params.bio || params.name,
                capabilities: resolvedCaps as number[],
                model: params.model,
                agentType: params.agentType,
              });
              onProgress({ stage: 'hol_complete', message: 'HOL Registration complete!', percent: 95 });
            } catch (e: any) {
              broker = { registered: false, error: e.message };
              onProgress({ stage: 'hol_failed', message: `HOL registration failed: ${e.message}`, percent: 95 });
            }
          } else {
            broker = {
              registered: false,
              error: `Insufficient HOL credits. Required: ${credits.required}, Available: ${credits.available}. Purchase credits at hol.org/registry/billing`,
            };
            onProgress({
              stage: 'hol_no_credits',
              message: `Not enough HOL credits (need ${credits.shortfall} more). Visit hol.org/registry/billing`,
              percent: 95,
            });
          }
        }

        onProgress({ stage: 'done', message: 'Registration complete!', percent: 100 });

        return {
          success: true,
          accountId: hederaAccountId,
          inboundTopicId: state?.inboundTopicId,
          outboundTopicId: state?.outboundTopicId,
          profileTopicId: state?.profileTopicId,
          transactionId: result.transactionId,
          broker,
        };
      }

      onProgress({ stage: 'failed', message: state?.error || 'Registration failed', percent: 0 });
      return { success: false, error: state?.error || 'Registration failed' };
    } catch (error: any) {
      onProgress({ stage: 'error', message: error.message, percent: 0 });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the list of AIAgentCapability enum values for reference.
   */
  getCapabilitiesList(): { value: number; label: string }[] {
    return [
      { value: 0, label: 'Text Generation' },
      { value: 1, label: 'Image Generation' },
      { value: 2, label: 'Audio Generation' },
      { value: 3, label: 'Video Generation' },
      { value: 4, label: 'Code Generation' },
      { value: 5, label: 'Language Translation' },
      { value: 6, label: 'Summarization & Extraction' },
      { value: 7, label: 'Knowledge Retrieval' },
      { value: 8, label: 'Data Integration' },
      { value: 9, label: 'Market Intelligence' },
      { value: 10, label: 'Transaction Analytics' },
      { value: 11, label: 'Smart Contract Audit' },
      { value: 12, label: 'Governance Facilitation' },
      { value: 13, label: 'Security Monitoring' },
      { value: 14, label: 'Compliance Analysis' },
      { value: 15, label: 'Fraud Detection' },
      { value: 16, label: 'Multi-Agent Coordination' },
      { value: 17, label: 'API Integration' },
      { value: 18, label: 'Workflow Automation' },
    ];
  }
}
