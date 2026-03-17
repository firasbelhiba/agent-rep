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
            broker = await this.registerWithBroker(params);
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
   * Send a message on a connection topic.
   */
  async sendMessage(connectionTopicId: string, data: string, memo?: string): Promise<boolean> {
    try {
      const client = this.getClient();

      await client.sendMessage(connectionTopicId, data, memo);
      this.logger.log(`Message sent to connection topic ${connectionTopicId}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Message send failed: ${error.message}`);
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
          return {
            data: JSON.parse(decoded),
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
