// AgentRep - Core Type Definitions
// Aligned with ERC-8004 (Identity, Reputation, Validation)

export enum TrustTier {
  UNVERIFIED = "UNVERIFIED",
  VERIFIED = "VERIFIED",
  TRUSTED = "TRUSTED",
  ELITE = "ELITE",
}

// Agent Identity (ERC-8004 Identity Registry + HCS-10/HCS-11)
export interface AgentProfile {
  agentId: string;
  name: string;
  description: string;
  skills: string[];
  // HCS-10 topics
  inboundTopicId: string;
  outboundTopicId: string;
  // HCS-11 profile
  profileTopicId: string;
  // HCS-10 agent metadata
  agentType: string; // 'autonomous' | 'manual'
  model: string;
  capabilities: number[]; // AIAgentCapability enum values
  // Legacy
  topicId: string;
  reputationNftId?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
  hcs10Registered: boolean;
}

// Feedback (ERC-8004 Reputation Registry equivalent)
export interface Feedback {
  feedbackId: string;
  agentId: string; // target agent
  fromAgentId: string; // submitting agent (or display name for community)
  feedbackType: 'agent' | 'community';
  value: number; // -100 to 100
  tag1: string; // category
  tag2: string; // subcategory
  feedbackURI?: string;
  feedbackHash?: string;
  responseURI?: string;
  responseHash?: string;
  isRevoked: boolean;
  timestamp: number;
  hcsSequenceNumber?: string;
}

// Validation (ERC-8004 Validation Registry equivalent)
export interface ValidationRequest {
  requestHash: string;
  agentId: string;
  validatorId: string;
  requestURI: string;
  status: "pending" | "completed";
  timestamp: number;
  hcsSequenceNumber?: string;
}

export interface ValidationResponse {
  requestHash: string;
  validatorId: string;
  agentId: string;
  response: number; // 0-100
  responseURI?: string;
  responseHash?: string;
  tag: string;
  timestamp: number;
  hcsSequenceNumber?: string;
}

// Aggregated reputation (computed off-chain)
export interface AggregatedReputation {
  agentId: string;
  feedbackCount: number;
  averageFeedbackValue: number;
  validationCount: number;
  averageValidationScore: number;
  feedbackByTag: Record<string, { count: number; avg: number }>;
  validationByTag: Record<string, { count: number; avg: number }>;
  trustTier: TrustTier;
  overallScore: number; // 0-1000
  lastActivity: number;
}

// HCS Message Types
export enum HCSMessageType {
  AGENT_REGISTERED = "AGENT_REGISTERED",
  FEEDBACK_SUBMITTED = "FEEDBACK_SUBMITTED",
  FEEDBACK_REVOKED = "FEEDBACK_REVOKED",
  FEEDBACK_RESPONSE = "FEEDBACK_RESPONSE",
  VALIDATION_REQUESTED = "VALIDATION_REQUESTED",
  VALIDATION_RESPONDED = "VALIDATION_RESPONDED",
  STAKE_DEPOSITED = "STAKE_DEPOSITED",
  TIER_UPGRADED = "TIER_UPGRADED",
}

export interface HCSReputationMessage {
  type: HCSMessageType;
  timestamp: number;
  data: Record<string, unknown>;
  signature?: string;
}

export interface ReputationNFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: {
    trust_tier: TrustTier;
    overall_score: number;
    feedback_count: number;
    validation_score: number;
    staked_hbar: number;
  };
}
