// ============================================================
// @agent-rep/sdk — Type Definitions
// ERC-8004 Agent Reputation on Hedera
// ============================================================

// ---- Configuration ----

export interface AgentRepConfig {
  /** AgentRep API base URL (e.g., "http://localhost:4000/api") */
  baseUrl: string;
  /** Agent API key (starts with "ar_") — obtained at registration */
  apiKey?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Enable automatic retry on failure (default: true) */
  retry?: boolean | RetryConfig;
  /** Enable response caching (default: false) */
  cache?: boolean | CacheConfig;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Custom logger (default: console) */
  logger?: Logger;
  /** Middleware stack — intercept every request/response */
  middleware?: Middleware[];
  /** Custom headers added to every request */
  headers?: Record<string, string>;
}

// ---- Retry Configuration ----

export interface RetryConfig {
  /** Max retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in ms before first retry (default: 1000) */
  baseDelay: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
  /** Max delay cap in ms (default: 15000) */
  maxDelay: number;
  /** HTTP status codes to retry on (default: [408, 429, 500, 502, 503, 504]) */
  retryOn: number[];
}

// ---- Cache Configuration ----

export interface CacheConfig {
  /** TTL in milliseconds (default: 60000 = 1 minute) */
  ttl: number;
  /** Max entries in cache (default: 100) */
  maxSize: number;
  /** Cache only GET requests (default: true) */
  getOnly: boolean;
}

// ---- Middleware ----

export interface MiddlewareContext {
  method: string;
  path: string;
  url: string;
  body?: unknown;
  headers: Record<string, string>;
  attempt: number;
  startTime: number;
}

export interface MiddlewareResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
  duration: number;
}

export interface Middleware {
  /** Called before the request is sent — can modify context */
  onRequest?: (ctx: MiddlewareContext) => MiddlewareContext | Promise<MiddlewareContext>;
  /** Called after a successful response */
  onResponse?: (ctx: MiddlewareContext, res: MiddlewareResponse) => void | Promise<void>;
  /** Called on error — return true to suppress the error */
  onError?: (ctx: MiddlewareContext, error: Error) => boolean | void | Promise<boolean | void>;
}

// ---- Logger ----

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// ---- Events ----

export type AgentRepEvent =
  | 'request'
  | 'response'
  | 'error'
  | 'retry'
  | 'cache:hit'
  | 'cache:miss'
  | 'feedback:given'
  | 'feedback:revoked'
  | 'validation:requested'
  | 'validation:submitted'
  | 'agent:registered'
  | 'trust:checked';

export type EventHandler<T = unknown> = (data: T) => void;

export interface RequestEvent {
  method: string;
  path: string;
  body?: unknown;
  timestamp: number;
}

export interface ResponseEvent {
  method: string;
  path: string;
  status: number;
  duration: number;
  timestamp: number;
}

export interface ErrorEvent {
  method: string;
  path: string;
  error: Error;
  attempt: number;
  timestamp: number;
}

export interface RetryEvent {
  method: string;
  path: string;
  attempt: number;
  delay: number;
  reason: string;
  timestamp: number;
}

export interface CacheEvent {
  path: string;
  ttlRemaining?: number;
  timestamp: number;
}

// ---- Batch Operations ----

export interface BatchFeedbackItem {
  agentId: string;
  value: number;
  valueDecimals?: number;
  tag1: string;
  tag2: string;
  endpoint?: string;
}

export interface BatchFeedbackResult {
  results: Array<{ success: boolean; feedback?: Feedback; error?: string }>;
  summary: { total: number; succeeded: number; failed: number };
}

export interface BatchValidationItem {
  agentId: string;
  requestURI: string;
}

// ---- Trust Policy ----

export interface TrustPolicy {
  /** Minimum trust tier required */
  minTier?: TrustTier;
  /** Minimum overall score required */
  minScore?: number;
  /** Minimum number of feedback entries */
  minFeedbackCount?: number;
  /** Minimum number of validations */
  minValidationCount?: number;
  /** Required skills */
  requiredSkills?: string[];
  /** Maximum age of last activity in ms */
  maxInactivity?: number;
  /** Custom validation function */
  custom?: (agent: AgentWithReputation) => boolean | Promise<boolean>;
}

// ---- Reputation Watcher ----

export interface WatchOptions {
  /** Polling interval in ms (default: 30000) */
  interval: number;
  /** Stop watching after this many ms */
  timeout?: number;
}

export interface ReputationChange {
  agentId: string;
  previous: AggregatedReputation;
  current: AggregatedReputation;
  scoreDelta: number;
  tierChanged: boolean;
  timestamp: number;
}

// ---- Identity Registry (ERC-8004) ----

export interface Agent {
  agentId: string;
  name: string;
  description: string;
  skills: string[];
  agentURI: string;
  agentWallet: string | null;
  inboundTopicId: string;
  outboundTopicId: string;
  profileTopicId: string;
  agentType: string;
  model: string;
  capabilities: number[];
  createdAt: number;
  metadata: Record<string, unknown>;
  hcs10Registered: boolean;
}

export interface MetadataEntry {
  key: string;
  value: unknown;
}

export interface RegisterAgentParams {
  name: string;
  description?: string;
  skills?: string[];
  capabilities?: number[];
  model?: string;
  agentType?: 'autonomous' | 'manual';
  agentURI?: string;
  agentWallet?: string;
  metadata?: MetadataEntry[];
  useHcs10?: boolean;
}

export interface RegisterAgentResult {
  agent: Agent;
  reputation: AggregatedReputation;
  apiKey: string;
  hcsSequenceNumber?: string;
  hcs10?: {
    registered: boolean;
    inboundTopicId: string;
    outboundTopicId: string;
    profileTopicId: string;
    transactionId: string;
  };
}

// ---- Reputation Registry (ERC-8004) ----

export interface Feedback {
  feedbackId: string;
  agentId: string;
  fromAgentId: string;
  feedbackType: 'agent' | 'community';
  value: number;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  endpoint?: string;
  feedbackURI?: string;
  feedbackHash?: string;
  responseURI?: string;
  responseHash?: string;
  isRevoked: boolean;
  feedbackIndex: number;
  timestamp: number;
  hcsSequenceNumber?: string;
}

export interface GiveFeedbackParams {
  /** Target agent ID */
  agentId: string;
  /** Feedback score: -100 to +100 */
  value: number;
  /** Fixed-point decimals (0-18, default 0) */
  valueDecimals?: number;
  /** Primary category (e.g., "accuracy", "reliability") */
  tag1: string;
  /** Subcategory (e.g., "price-feeds", "latency") */
  tag2: string;
  /** API endpoint that was evaluated */
  endpoint?: string;
  /** URI to detailed feedback data (IPFS, HTTPS) */
  feedbackURI?: string;
  /** SHA256 hash of feedback data for integrity */
  feedbackHash?: string;
}

export interface FeedbackResult {
  feedback: Feedback;
  reputation: AggregatedReputation;
  hcsSequenceNumber?: string;
}

export interface FeedbackSummary {
  count: number;
  summaryValue: number;
  summaryValueDecimals: number;
}

export interface ReadFeedbackResult {
  value: number;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  isRevoked: boolean;
}

// ---- Validation Registry (ERC-8004) ----

export interface ValidationRequest {
  requestHash: string;
  agentId: string;
  validatorId: string;
  requestURI: string;
  status: string;
  timestamp: number;
  hcsSequenceNumber?: string;
}

export interface ValidationResponse {
  id: number;
  requestHash: string;
  validatorId: string;
  agentId: string;
  response: number;
  responseURI?: string;
  responseHash?: string;
  tag: string;
  timestamp: number;
  hcsSequenceNumber?: string;
}

export interface RequestValidationParams {
  /** Agent to validate */
  agentId: string;
  /** URI to test methodology / data being validated */
  requestURI: string;
  /** Optional: caller-supplied request hash (ERC-8004 pattern) */
  requestHash?: string;
}

export interface SubmitValidationParams {
  /** Request hash from the validation request */
  requestHash: string;
  /** Validation score: 0-100 (0=failed, 100=passed) */
  response: number;
  /** URI to detailed validation results */
  responseURI?: string;
  /** SHA256 hash of results for integrity */
  responseHash?: string;
  /** Category tag (e.g., "security", "accuracy") */
  tag: string;
}

export interface ValidationStatus {
  validatorAddress: string;
  agentId: string;
  response: number;
  responseHash?: string;
  tag: string;
  lastUpdate: number;
}

export interface ValidationSummary {
  count: number;
  averageResponse: number;
}

// ---- Reputation Scoring ----

export type TrustTier = 'UNVERIFIED' | 'VERIFIED' | 'TRUSTED' | 'ELITE';

export interface AggregatedReputation {
  agentId: string;
  feedbackCount: number;
  averageFeedbackValue: number;
  validationCount: number;
  averageValidationScore: number;
  feedbackByTag: Record<string, { count: number; avg: number }>;
  validationByTag: Record<string, { count: number; avg: number }>;
  trustTier: TrustTier;
  overallScore: number;
  lastActivity: number;
}

// ---- Connections (HCS-10) ----

export interface Connection {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  connectionTopicId: string;
  status: 'pending' | 'active' | 'rejected';
  timestamp: number;
}

// ---- Agent Discovery ----

export interface AgentWithReputation {
  agent: Agent;
  reputation: AggregatedReputation;
}

export interface FindAgentsOptions {
  skill?: string;
  minScore?: number;
  minTier?: TrustTier;
  sortBy?: 'score' | 'activity' | 'name';
  limit?: number;
}
