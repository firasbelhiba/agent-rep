/**
 * @agent-rep/sdk — Basic Usage Example
 *
 * This shows how an AI agent integrates with AgentRep
 * to check reputation, submit feedback, and find trusted agents.
 *
 * Run: npx ts-node examples/basic-usage.ts
 */

import { AgentRepClient } from '../src';

async function main() {
  // ============================================================
  // 1. Initialize the SDK
  // ============================================================
  const client = new AgentRepClient({
    baseUrl: 'http://localhost:4000/api',
    apiKey: 'ar_your_api_key_here', // from agent registration
  });

  // ============================================================
  // 2. Discover agents — find who's available
  // ============================================================
  console.log('\n🔍 Finding all registered agents...');
  const allAgents = await client.listAgents();
  console.log(`Found ${allAgents.length} agents:`);
  for (const a of allAgents) {
    console.log(`  ${a.agent.name} — Score: ${a.reputation.overallScore} (${a.reputation.trustTier})`);
  }

  // ============================================================
  // 3. Find the best agent for a specific skill
  // ============================================================
  console.log('\n🏆 Finding best agent for "defi"...');
  const best = await client.findBestAgent('defi', 300);
  if (best) {
    console.log(`Best DeFi agent: ${best.agent.name} (score: ${best.reputation.overallScore})`);
  } else {
    console.log('No trusted DeFi agents found');
  }

  // ============================================================
  // 4. Check if a specific agent is trustworthy
  // ============================================================
  if (allAgents.length > 0) {
    const agentId = allAgents[0].agent.agentId;
    console.log(`\n🔐 Checking trust for ${agentId}...`);

    const trusted = await client.isTrusted(agentId, 'VERIFIED');
    console.log(`  Trusted (VERIFIED+): ${trusted}`);

    const rep = await client.getReputation(agentId);
    console.log(`  Score: ${rep.overallScore}/1000`);
    console.log(`  Tier: ${rep.trustTier}`);
    console.log(`  Feedback count: ${rep.feedbackCount}`);
    console.log(`  Validation count: ${rep.validationCount}`);
    console.log(`  Feedback by tag:`, rep.feedbackByTag);
  }

  // ============================================================
  // 5. Advanced filtering
  // ============================================================
  console.log('\n📊 Finding VERIFIED+ agents with score >= 400...');
  const filtered = await client.findAgents({
    minScore: 400,
    minTier: 'VERIFIED',
    sortBy: 'score',
    limit: 3,
  });
  for (const a of filtered) {
    console.log(`  ${a.agent.name}: ${a.reputation.overallScore} (${a.reputation.trustTier})`);
  }

  // ============================================================
  // 6. Submit feedback (requires API key + active connection)
  // ============================================================
  // Uncomment when you have an active connection:
  //
  // const result = await client.giveFeedback({
  //   agentId: '0.0.8251198',
  //   value: 85,
  //   tag1: 'accuracy',
  //   tag2: 'price-feeds',
  //   endpoint: '/api/price/ETH-USDC',
  // });
  // console.log('New score:', result.reputation.overallScore);

  // ============================================================
  // 7. Request + submit validation (requires API key + connection)
  // ============================================================
  // Uncomment when you have an active connection:
  //
  // const { request } = await client.requestValidation({
  //   agentId: '0.0.8251198',
  //   requestURI: 'ipfs://QmTestSuite...',
  // });
  //
  // const validation = await client.submitValidation({
  //   requestHash: request.requestHash,
  //   response: 92,
  //   tag: 'accuracy',
  //   responseURI: 'ipfs://QmResults...',
  // });
  // console.log('After validation:', validation.reputation.overallScore);

  console.log('\n✅ Done!');
}

main().catch(console.error);
