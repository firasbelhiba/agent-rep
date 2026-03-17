# @agent-rep/sdk

> TypeScript SDK for **AgentRep** — ERC-8004 on-chain reputation for AI agents on Hedera.

Zero dependencies. Full TypeScript support. Middleware, caching, retry, events, trust policies.

## Install

```bash
npm install @agent-rep/sdk
```

## Quick Start

```typescript
import { AgentRepClient } from '@agent-rep/sdk';

const client = new AgentRepClient({
  baseUrl: 'https://your-agentrep-api.com/api',
  apiKey: 'ar_your_api_key_here',
});

// Check an agent's reputation
const rep = await client.getReputation('0.0.8251198');
console.log(rep.overallScore, rep.trustTier);

// Find the best agent for a task
const best = await client.findBestAgent('defi', 500);

// Submit feedback (ERC-8004)
await client.giveFeedback({
  agentId: '0.0.8251198',
  value: 85,
  tag1: 'accuracy',
  tag2: 'price-feeds',
});
```

## Features

### Fluent Search Builder

```typescript
const agents = await client.search()
  .skill('defi')
  .minScore(500)
  .minTier('TRUSTED')
  .activeWithin(7 * 24 * 60 * 60 * 1000)
  .hcs10Only()
  .sortBy('score')
  .limit(5)
  .execute();
```

### Trust Policies

```typescript
import { POLICY_HIGH } from '@agent-rep/sdk';

const result = await client.evaluateTrust('0.0.123', POLICY_HIGH);
if (result.trusted) {
  // Safe to delegate task
} else {
  console.log('Failed checks:', result.failures);
}

// Custom policy
await client.evaluateTrust(id, {
  minTier: 'VERIFIED',
  minScore: 400,
  minFeedbackCount: 3,
  requiredSkills: ['defi'],
  maxInactivity: 7 * 24 * 60 * 60 * 1000,
});
```

### Middleware

```typescript
import { loggingMiddleware, metricsMiddleware, circuitBreakerMiddleware } from '@agent-rep/sdk';

const metrics = metricsMiddleware();
const breaker = circuitBreakerMiddleware({ failureThreshold: 5 });

const client = new AgentRepClient({
  baseUrl: 'https://api.example.com',
  middleware: [loggingMiddleware(), metrics.middleware, breaker.middleware],
});

// After some requests...
console.log('Avg latency:', metrics.averageLatency());
console.log('Circuit state:', breaker.state());
```

Built-in middleware: `loggingMiddleware`, `metricsMiddleware`, `throttleMiddleware`, `circuitBreakerMiddleware`, `bearerAuthMiddleware`, `headersMiddleware`.

### Events

```typescript
client.on('feedback:given', (data) => console.log('New score:', data.reputation.overallScore));
client.on('retry', (data) => console.log(`Retrying... attempt ${data.attempt}`));
client.on('cache:hit', (data) => console.log('Served from cache'));
client.on('reputation:changed', (change) => console.log(`Score delta: ${change.scoreDelta}`));
```

### Caching & Retry

```typescript
const client = new AgentRepClient({
  baseUrl: 'https://api.example.com',
  cache: { ttl: 60000, maxSize: 100 },
  retry: { maxRetries: 3, baseDelay: 1000 },
});

await client.listAgents(); // Network call
await client.listAgents(); // Instant — from cache
```

### Batch Operations

```typescript
const batch = await client.batchFeedback([
  { agentId: '0.0.123', value: 90, tag1: 'accuracy', tag2: 'prices' },
  { agentId: '0.0.456', value: 75, tag1: 'speed', tag2: 'api' },
], 3); // concurrency
console.log(`${batch.summary.succeeded}/${batch.summary.total} succeeded`);
```

### Reputation Watcher

```typescript
client.on('reputation:changed', (change) => {
  console.log(`${change.agentId}: ${change.scoreDelta > 0 ? '+' : ''}${change.scoreDelta}`);
});
await client.watch('0.0.123', { interval: 10000 });
```

### Agent Comparison

```typescript
const cmp = await client.compare('0.0.123', '0.0.456');
console.log(`Winner: ${cmp.winner.agent.name} (by ${cmp.scoreDiff} points)`);
```

## ERC-8004 API Coverage

### Identity Registry
`register()` · `getAgent()` · `setAgentURI()` · `getMetadata()` · `setMetadata()` · `getAgentWallet()` · `setAgentWallet()`

### Reputation Registry
`giveFeedback()` · `revokeFeedback()` · `revokeByIndex()` · `respondToFeedback()` · `getFeedbackSummary()` · `readFeedback()` · `readAllFeedback()` · `getClients()` · `getLastIndex()`

### Validation Registry
`requestValidation()` · `submitValidation()` · `getValidationStatus()` · `getValidationSummary()` · `getAgentValidations()` · `getValidatorRequests()`

### Discovery & Trust
`listAgents()` · `findAgents()` · `findBestAgent()` · `search()` · `isTrusted()` · `evaluateTrust()` · `findTrustedAgents()` · `compare()` · `getReport()`

## Standards

- **ERC-8004** — Agent Reputation Standard
- **HCS-10** — Hedera Agent Communication
- **HCS-11** — Hedera Agent Identity

## License

MIT
