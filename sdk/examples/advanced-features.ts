/**
 * @agent-rep/sdk — Advanced Features Example
 *
 * This showcases the enhanced SDK features:
 *   - Middleware (logging, metrics, circuit breaker)
 *   - Events system
 *   - Fluent search builder
 *   - Trust policies
 *   - Reputation watcher
 *   - Batch operations
 *   - Caching
 *   - Agent comparison
 *   - Retry with backoff
 *
 * Run: npx ts-node examples/advanced-features.ts
 */

import {
  AgentRepClient,
  loggingMiddleware,
  metricsMiddleware,
  circuitBreakerMiddleware,
  throttleMiddleware,
  POLICY_STANDARD,
  POLICY_HIGH,
} from '../src';

async function main() {
  // ============================================================
  // 1. Full-featured client initialization
  // ============================================================
  const metrics = metricsMiddleware();
  const breaker = circuitBreakerMiddleware({ failureThreshold: 5, resetTimeout: 30000 });

  const client = new AgentRepClient({
    baseUrl: 'http://localhost:4000/api',
    apiKey: 'ar_your_api_key_here',

    // Automatic retry with exponential backoff
    retry: {
      maxRetries: 3,
      baseDelay: 1000,
      backoffMultiplier: 2,
      maxDelay: 15000,
      retryOn: [408, 429, 500, 502, 503, 504],
    },

    // Cache GET responses for 60 seconds
    cache: {
      ttl: 60_000,
      maxSize: 100,
      getOnly: true,
    },

    // Debug mode — see all requests in console
    debug: true,

    // Middleware stack (executes in order)
    middleware: [
      loggingMiddleware(),
      metrics.middleware,
      breaker.middleware,
      throttleMiddleware(100), // 100ms between requests
    ],

    // Custom headers on every request
    headers: {
      'X-SDK-Version': '0.1.0',
    },
  });

  // ============================================================
  // 2. Event system — react to SDK events
  // ============================================================
  client.on('feedback:given', (data: any) => {
    console.log(`\n📣 Event: Feedback submitted! New score: ${data.reputation.overallScore}`);
  });

  client.on('trust:checked', (data: any) => {
    console.log(`\n🔐 Event: Trust check — ${data.agentId}: ${data.trusted ? '✅' : '❌'}`);
  });

  client.on('retry', (data: any) => {
    console.log(`\n🔄 Event: Retrying ${data.method} ${data.path} (attempt ${data.attempt}, ${data.reason})`);
  });

  client.on('cache:hit', (data: any) => {
    console.log(`\n💾 Event: Cache HIT for ${data.path}`);
  });

  // ============================================================
  // 3. Fluent search builder — chain filters
  // ============================================================
  console.log('\n🔍 Fluent search...');
  const results = await client.search()
    .minScore(300)
    .minTier('VERIFIED')
    .sortBy('score')
    .limit(5)
    .execute();

  console.log(`Found ${results.length} agents via fluent search`);
  for (const a of results) {
    console.log(`  ${a.agent.name}: ${a.reputation.overallScore} (${a.reputation.trustTier})`);
  }

  // Advanced fluent search with custom filters
  console.log('\n🔍 Advanced fluent search with custom filter...');
  const advancedResults = await client.search()
    .minScore(200)
    .minFeedback(1)
    .where((a) => a.agent.description.length > 10) // Custom filter
    .sortBy('score')
    .limit(3)
    .execute();

  console.log(`Found ${advancedResults.length} agents with advanced filters`);

  // ============================================================
  // 4. Trust policies — complex trust evaluation
  // ============================================================
  const allAgents = await client.listAgents();
  if (allAgents.length > 0) {
    const agentId = allAgents[0].agent.agentId;

    console.log(`\n📋 Trust policy evaluation for ${agentId}...`);

    // Use preset policy
    const standardEval = await client.evaluateTrust(agentId, POLICY_STANDARD);
    console.log(`  STANDARD policy: ${standardEval.trusted ? '✅ PASSED' : '❌ FAILED'}`);
    if (!standardEval.trusted) {
      console.log(`    Failures: ${standardEval.failures.join('; ')}`);
    }

    // Use preset HIGH policy
    const highEval = await client.evaluateTrust(agentId, POLICY_HIGH);
    console.log(`  HIGH policy: ${highEval.trusted ? '✅ PASSED' : '❌ FAILED'}`);
    if (!highEval.trusted) {
      console.log(`    Failures: ${highEval.failures.join('; ')}`);
    }

    // Custom policy
    const customEval = await client.evaluateTrust(agentId, {
      minTier: 'VERIFIED',
      minScore: 400,
      minFeedbackCount: 2,
      requiredSkills: ['defi'],
      maxInactivity: 30 * 24 * 60 * 60 * 1000, // 30 days
      custom: (agent) => agent.agent.capabilities.length > 0, // Must have capabilities
    });
    console.log(`  CUSTOM policy: ${customEval.trusted ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`    Checks: tier=${customEval.checks.tier} score=${customEval.checks.score} feedback=${customEval.checks.feedbackCount} skills=${customEval.checks.skills}`);
  }

  // ============================================================
  // 5. Find all agents that pass a trust policy
  // ============================================================
  console.log('\n🛡️ Finding all agents that pass STANDARD trust policy...');
  const trustedAgents = await client.findTrustedAgents(POLICY_STANDARD);
  console.log(`  ${trustedAgents.length} agents passed STANDARD policy`);
  for (const a of trustedAgents) {
    console.log(`    ${a.agent.name}: ${a.reputation.overallScore}`);
  }

  // ============================================================
  // 6. Agent comparison
  // ============================================================
  if (allAgents.length >= 2) {
    const id1 = allAgents[0].agent.agentId;
    const id2 = allAgents[1].agent.agentId;
    console.log(`\n⚔️ Comparing ${allAgents[0].agent.name} vs ${allAgents[1].agent.name}...`);

    const comparison = await client.compare(id1, id2);
    console.log(`  Winner: ${comparison.winner.agent.name}`);
    console.log(`  Score difference: ${comparison.scoreDiff}`);
    console.log(`  Tier comparison: ${comparison.details.tierComparison}`);
    console.log(`  Feedback count diff: ${comparison.details.feedbackCountDiff}`);
  }

  // ============================================================
  // 7. Reputation report
  // ============================================================
  if (allAgents.length > 0) {
    console.log('\n📊 Reputation Report:');
    const report = await client.getReport(allAgents[0].agent.agentId);
    console.log(report);
  }

  // ============================================================
  // 8. Cache demonstration
  // ============================================================
  console.log('\n💾 Cache demo...');
  await client.listAgents(); // First call — cache MISS
  await client.listAgents(); // Second call — cache HIT (instant)

  console.log('  Cache stats:', client.cacheStats());
  client.invalidateCache('/agents*');
  console.log('  After invalidation:', client.cacheStats());

  // ============================================================
  // 9. Metrics report
  // ============================================================
  console.log('\n📈 Request metrics:');
  console.log(`  Total requests: ${metrics.totalRequests()}`);
  console.log(`  Average latency: ${metrics.averageLatency().toFixed(0)}ms`);
  console.log(`  P95 latency: ${metrics.p95Latency()}ms`);
  console.log(`  Error rate: ${(metrics.errorRate() * 100).toFixed(1)}%`);
  console.log(`  Circuit breaker: ${breaker.state()}`);

  // ============================================================
  // 10. Runtime configuration
  // ============================================================
  console.log('\n⚙️ Runtime config demo...');

  // Add middleware at runtime
  client.use({
    onRequest: (ctx) => {
      console.log(`  [Custom MW] ${ctx.method} ${ctx.path}`);
      return ctx;
    },
  });

  // Toggle debug mode
  client.setDebug(false);

  // Change API key (e.g., after registration)
  // client.setApiKey('ar_new_key_here');

  console.log(`  Total SDK requests: ${client.getRequestCount()}`);

  // ============================================================
  // 11. Batch feedback (uncomment with active connections)
  // ============================================================
  // const batch = await client.batchFeedback([
  //   { agentId: '0.0.123', value: 90, tag1: 'accuracy', tag2: 'prices' },
  //   { agentId: '0.0.456', value: 75, tag1: 'speed', tag2: 'api' },
  //   { agentId: '0.0.789', value: 60, tag1: 'reliability', tag2: 'uptime' },
  // ], 2); // concurrency = 2
  // console.log(`Batch: ${batch.summary.succeeded}/${batch.summary.total} succeeded`);

  // ============================================================
  // 12. Reputation watcher (uncomment to test)
  // ============================================================
  // client.on('reputation:changed', (change) => {
  //   console.log(`🔔 ${change.agentId}: score ${change.scoreDelta > 0 ? '+' : ''}${change.scoreDelta}`);
  //   if (change.tierChanged) {
  //     console.log(`   Tier: ${change.previous.trustTier} → ${change.current.trustTier}`);
  //   }
  // });
  //
  // await client.watch('0.0.123', { interval: 10000 }); // Poll every 10s

  // ============================================================
  // Cleanup
  // ============================================================
  client.destroy(); // Stops watchers, clears cache, removes listeners
  console.log('\n✅ All advanced features demonstrated!');
}

main().catch(console.error);
