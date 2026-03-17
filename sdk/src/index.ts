// ============================================================
// @agent-rep/sdk
// ERC-8004 Agent Reputation on Hedera — TypeScript SDK
//
// Usage:
//   import { AgentRepClient } from '@agent-rep/sdk';
//
//   const client = new AgentRepClient({
//     baseUrl: 'http://localhost:4000/api',
//     apiKey: 'ar_your_api_key_here',
//   });
//
//   // Check an agent's reputation
//   const rep = await client.getReputation('0.0.8251198');
//   console.log(rep.overallScore, rep.trustTier);
//
//   // Submit feedback
//   await client.giveFeedback({
//     agentId: '0.0.8251198',
//     value: 85,
//     tag1: 'accuracy',
//     tag2: 'price-feeds',
//   });
//
//   // Fluent search
//   const agents = await client.search()
//     .skill('defi')
//     .minScore(500)
//     .minTier('TRUSTED')
//     .execute();
//
//   // Trust policy
//   const result = await client.evaluateTrust('0.0.123', POLICY_HIGH);
//
//   // Events
//   client.on('feedback:given', (data) => console.log('New score:', data.reputation.overallScore));
//
//   // Middleware
//   client.use(loggingMiddleware());
//
// ============================================================

// ---- Core ----
export { AgentRepClient, AgentRepError } from './client';

// ---- Events ----
export { EventEmitter } from './events';

// ---- Cache ----
export { ResponseCache } from './cache';

// ---- Builder ----
export { AgentSearchBuilder } from './builder';

// ---- Trust Policies ----
export {
  evaluatePolicy,
  POLICY_BASIC,
  POLICY_STANDARD,
  POLICY_HIGH,
  POLICY_MAXIMUM,
} from './trust';
export type { TrustEvaluation } from './trust';

// ---- Reputation Watcher ----
export { ReputationWatcher } from './watcher';

// ---- Pre-built Middleware ----
export {
  loggingMiddleware,
  metricsMiddleware,
  bearerAuthMiddleware,
  headersMiddleware,
  throttleMiddleware,
  circuitBreakerMiddleware,
} from './middleware';

// ---- Types ----
export type {
  // Config
  AgentRepConfig,
  RetryConfig,
  CacheConfig,
  Logger,

  // Middleware
  Middleware,
  MiddlewareContext,
  MiddlewareResponse,

  // Events
  AgentRepEvent,
  EventHandler,
  RequestEvent,
  ResponseEvent,
  ErrorEvent,
  RetryEvent,
  CacheEvent,

  // Identity Registry (ERC-8004)
  Agent,
  MetadataEntry,
  RegisterAgentParams,
  RegisterAgentResult,

  // Reputation Registry (ERC-8004)
  Feedback,
  GiveFeedbackParams,
  FeedbackResult,
  FeedbackSummary,
  ReadFeedbackResult,

  // Validation Registry (ERC-8004)
  ValidationRequest,
  ValidationResponse,
  RequestValidationParams,
  SubmitValidationParams,
  ValidationStatus,
  ValidationSummary,

  // Scoring
  TrustTier,
  AggregatedReputation,

  // Connections
  Connection,

  // Discovery
  AgentWithReputation,
  FindAgentsOptions,

  // Batch Operations
  BatchFeedbackItem,
  BatchFeedbackResult,

  // Trust Policy
  TrustPolicy,

  // Watcher
  WatchOptions,
  ReputationChange,
} from './types';
