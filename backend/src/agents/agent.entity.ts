import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('agents')
export class AgentEntity {
  @PrimaryColumn({ name: 'agent_id' })
  agentId: string;

  @Column()
  name: string;

  @Column({ default: '' })
  description: string;

  @Column('simple-json', { default: '[]' })
  skills: string[];

  // ERC-8004 Identity Registry: agentURI — off-chain metadata pointer (IPFS, HTTPS, etc.)
  @Column({ name: 'agent_uri', default: '' })
  agentURI: string;

  // ERC-8004 Identity Registry: agentWallet — bound wallet address for payments/identity
  @Column({ name: 'agent_wallet', nullable: true })
  agentWallet?: string;

  // HCS-10 topics
  @Column({ name: 'inbound_topic_id', default: '' })
  inboundTopicId: string;

  @Column({ name: 'outbound_topic_id', default: '' })
  outboundTopicId: string;

  // HCS-11 profile
  @Column({ name: 'profile_topic_id', default: '' })
  profileTopicId: string;

  // HCS-10 agent type: 'autonomous' | 'manual'
  @Column({ name: 'agent_type', default: 'autonomous' })
  agentType: string;

  // AI model used
  @Column({ default: '' })
  model: string;

  // HCS-10 capabilities (AIAgentCapability enum values)
  @Column('simple-json', { name: 'capabilities', default: '[]' })
  capabilities: number[];

  // Legacy field for backward compat
  @Column({ name: 'topic_id', default: '' })
  topicId: string;

  @Column({ name: 'reputation_nft_id', nullable: true })
  reputationNftId?: string;

  @Column({ name: 'created_at', type: 'bigint' })
  createdAt: number;

  // ERC-8004 Identity Registry: metadata as key-value store
  // Maps to getMetadata(agentId, key) / setMetadata(agentId, key, value)
  @Column('simple-json', { default: '{}' })
  metadata: Record<string, unknown>;

  // Whether agent was registered via HCS-10 standard
  @Column({ name: 'hcs10_registered', default: false })
  hcs10Registered: boolean;

  // HOL Registry Broker UAID (Universal Agent ID)
  @Column({ name: 'broker_uaid', nullable: true })
  brokerUaid?: string;

  // API key hash for agent authentication (agents use this to call feedback/validation APIs)
  @Column({ name: 'api_key_hash', nullable: true })
  apiKeyHash?: string;

  // Raw API key (stored for admin retrieval)
  @Column({ name: 'api_key', nullable: true })
  apiKey?: string;

  // Wallet address of the user who registered this agent
  @Column({ name: 'created_by_wallet', nullable: true })
  createdByWallet?: string;

  // Prepaid operating balance in tinybars (deducted per feedback transaction)
  @Column({ name: 'operating_balance', type: 'bigint', default: 0 })
  operatingBalance: number;

  // Payment transaction ID from registration
  @Column({ name: 'payment_tx_id', nullable: true })
  paymentTxId?: string;
}
