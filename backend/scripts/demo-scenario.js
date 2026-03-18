#!/usr/bin/env node
/**
 * AgentRep Demo Scenario — Interactive Terminal Menu
 *
 * Tests the full protocol flow between two agents:
 *   - Give feedback (positive/negative)
 *   - Request & submit validation
 *   - File disputes & resolve (slash/reject)
 *   - Check reputation scores
 *   - View staking balances
 *
 * Usage:
 *   node scripts/demo-scenario.js
 */

const readline = require('readline');

const API_URL = process.env.API_URL || 'http://localhost:4000';

let agent1 = { key: '', id: '', name: '' };
let agent2 = { key: '', id: '', name: '' };

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

async function api(method, path, body, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-Agent-Key'] = apiKey;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_URL}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data;
}

function printHeader() {
  console.clear();
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║          AgentRep Demo Scenario                     ║');
  console.log('║          On-Chain Reputation Protocol                ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log();
  if (agent1.id) console.log(`  Agent 1: ${agent1.name} (${agent1.id})`);
  if (agent2.id) console.log(`  Agent 2: ${agent2.name} (${agent2.id})`);
  console.log();
}

async function lookupAgent(apiKey) {
  // Find agent by API key — list all agents and match
  const data = await api('GET', '/api/agents');
  const match = data.agents.find((a) => a.agent.apiKey === apiKey);
  if (!match) throw new Error('No agent found with this API key');
  return { key: apiKey, id: match.agent.agentId, name: match.agent.name };
}

async function setupAgents() {
  printHeader();
  console.log('  Setup: Enter API keys for two agents\n');

  const key1 = await ask('  Agent 1 API key (ar_...): ');
  agent1 = await lookupAgent(key1.trim());
  console.log(`  ✓ Agent 1: ${agent1.name} (${agent1.id})\n`);

  const key2 = await ask('  Agent 2 API key (ar_...): ');
  agent2 = await lookupAgent(key2.trim());
  console.log(`  ✓ Agent 2: ${agent2.name} (${agent2.id})\n`);

  await ask('  Press Enter to continue...');
}

async function giveFeedback() {
  printHeader();
  console.log('  ── Give Feedback ──\n');
  console.log('  1. Agent 1 → Agent 2 (positive)');
  console.log('  2. Agent 2 → Agent 1 (positive)');
  console.log('  3. Agent 1 → Agent 2 (negative)');
  console.log('  4. Agent 2 → Agent 1 (negative)');
  console.log('  5. Custom');
  console.log('  0. Back\n');

  const choice = await ask('  Choice: ');

  let from, to, value, tag1, tag2;
  switch (choice.trim()) {
    case '1': from = agent1; to = agent2; value = 90; tag1 = 'accuracy'; tag2 = 'quality'; break;
    case '2': from = agent2; to = agent1; value = 85; tag1 = 'reliability'; tag2 = 'speed'; break;
    case '3': from = agent1; to = agent2; value = 15; tag1 = 'accuracy'; tag2 = 'quality'; break;
    case '4': from = agent2; to = agent1; value = 10; tag1 = 'reliability'; tag2 = 'speed'; break;
    case '5':
      const dir = await ask('  Direction (1=Agent1→2, 2=Agent2→1): ');
      from = dir.trim() === '2' ? agent2 : agent1;
      to = dir.trim() === '2' ? agent1 : agent2;
      value = parseInt(await ask('  Value (-100 to 100): '));
      tag1 = (await ask('  Tag1 (e.g. accuracy): ')) || 'general';
      tag2 = (await ask('  Tag2 (e.g. quality): ')) || 'general';
      break;
    case '0': return;
    default: console.log('  Invalid choice'); await ask('  Press Enter...'); return;
  }

  console.log(`\n  Submitting: ${from.name} → ${to.name} (value: ${value})...`);
  try {
    const result = await api('POST', '/api/feedback', {
      agentId: to.id, value, tag1: tag1.trim(), tag2: tag2.trim(),
    }, from.key);
    console.log(`  ✓ Feedback submitted!`);
    console.log(`    Feedback ID: ${result.feedback.feedbackId}`);
    console.log(`    New score: ${result.reputation.overallScore}/1000 (${result.reputation.trustTier})`);
    console.log(`    HCS seq: ${result.hcsSequenceNumber || 'N/A'}`);
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
  }
  await ask('\n  Press Enter to continue...');
}

async function requestValidation() {
  printHeader();
  console.log('  ── Request Validation ──\n');
  console.log(`  1. ${agent1.name} validates ${agent2.name}`);
  console.log(`  2. ${agent2.name} validates ${agent1.name}`);
  console.log('  0. Back\n');

  const choice = await ask('  Choice: ');
  let validator, target;
  if (choice.trim() === '1') { validator = agent1; target = agent2; }
  else if (choice.trim() === '2') { validator = agent2; target = agent1; }
  else return;

  console.log(`\n  Requesting validation: ${validator.name} → ${target.name}...`);
  try {
    const result = await api('POST', '/api/validation', {
      agentId: target.id,
      requestURI: `https://${target.name.toLowerCase()}.ai/capabilities.json`,
    }, validator.key);
    console.log(`  ✓ Validation requested!`);
    console.log(`    Request hash: ${result.request.requestHash}`);

    const score = parseInt(await ask('  Validation score (0-100): '));
    const tag = (await ask('  Tag (e.g. code-quality): ')) || 'general';

    console.log(`  Submitting validation response...`);
    const vResult = await api('POST', '/api/validation/respond', {
      requestHash: result.request.requestHash,
      response: score,
      tag: tag.trim(),
      responseURI: `https://${validator.name.toLowerCase()}.ai/validations/${target.name.toLowerCase()}.json`,
    }, validator.key);
    console.log(`  ✓ Validation submitted!`);
    console.log(`    Score: ${score}/100`);
    console.log(`    New reputation: ${vResult.reputation.overallScore}/1000 (${vResult.reputation.trustTier})`);
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
  }
  await ask('\n  Press Enter to continue...');
}

async function fileDispute() {
  printHeader();
  console.log('  ── File Dispute ──\n');

  // Show recent feedback
  console.log('  Recent feedback:');
  try {
    const fb1 = await api('GET', `/api/feedback?agentId=${agent1.id}`);
    const fb2 = await api('GET', `/api/feedback?agentId=${agent2.id}`);
    const allFb = [...(fb1.feedback || []), ...(fb2.feedback || [])].slice(-10);
    const getName = (id) => {
      if (id === agent1.id) return agent1.name;
      if (id === agent2.id) return agent2.name;
      return id;
    };
    allFb.forEach((f, i) => {
      console.log(`    [${i}] ${getName(f.fromAgentId)} → ${getName(f.agentId)} | value: ${f.value} | ${f.tag1}/${f.tag2}`);
    });

    if (allFb.length === 0) {
      console.log('    No feedback to dispute.');
      await ask('\n  Press Enter...');
      return;
    }

    const idx = parseInt(await ask('\n  Feedback index to dispute: '));
    const feedback = allFb[idx];
    if (!feedback) { console.log('  Invalid index'); await ask('  Press Enter...'); return; }

    const reason = (await ask('  Reason for dispute: ')) || 'Inaccurate feedback';

    // The target agent disputes
    const targetKey = feedback.agentId === agent1.id ? agent1.key : agent2.key;
    console.log(`\n  Filing dispute on feedback ${feedback.feedbackId.substring(0, 8)}...`);
    const result = await api('POST', '/api/staking/dispute', {
      feedbackId: feedback.feedbackId,
      reason: reason.trim(),
    }, targetKey);
    console.log(`  ✓ Dispute filed!`);
    console.log(`    Dispute ID: ${result.dispute.id}`);
    console.log(`    Status: ${result.dispute.status}`);
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
  }
  await ask('\n  Press Enter to continue...');
}

async function resolveDispute() {
  printHeader();
  console.log('  ── Resolve Dispute (Arbiter) ──\n');

  try {
    const disputes = await api('GET', '/api/staking/disputes/all');
    const pending = (disputes.disputes || []).filter((d) => d.status === 'pending');

    if (pending.length === 0) {
      console.log('  No pending disputes.');
      await ask('\n  Press Enter...');
      return;
    }

    const getName = (id) => {
      if (id === agent1.id) return agent1.name;
      if (id === agent2.id) return agent2.name;
      return id || 'unknown';
    };
    pending.forEach((d, i) => {
      console.log(`    [${i}] Dispute #${d.id} | feedback: ${d.feedbackId.substring(0, 8)}... | filed by: ${getName(d.disputerId)} against ${getName(d.accusedId)} | reason: ${d.reason}`);
    });

    const idx = parseInt(await ask('\n  Dispute index to resolve: '));
    const dispute = pending[idx];
    if (!dispute) { console.log('  Invalid index'); await ask('  Press Enter...'); return; }

    console.log('\n  1. Uphold (slash the feedback giver)');
    console.log('  2. Reject (dismiss the dispute)');
    const decision = await ask('  Decision: ');
    const upheld = decision.trim() === '1';
    const notes = (await ask('  Notes: ')) || (upheld ? 'Feedback was dishonest' : 'Feedback was fair');

    // Use a third-party agent key as arbiter (or one of the two)
    const arbiterKey = agent1.key; // Any agent can be arbiter
    console.log(`\n  Resolving dispute #${dispute.id} (${upheld ? 'UPHOLD — SLASH' : 'REJECT'})...`);
    const result = await api('POST', `/api/staking/dispute/${dispute.id}/resolve`, {
      upheld,
      notes: notes.trim(),
    }, arbiterKey);
    console.log(`  ✓ Dispute resolved!`);
    console.log(`    Status: ${result.dispute.status}`);
    if (result.slashedStake) {
      console.log(`    ⚡ SLASHED: ${Number(result.dispute.slashAmount || result.slashedStake.totalSlashed) / 1e8} HBAR`);
      console.log(`    Remaining stake: ${Number(result.slashedStake.balance) / 1e8} HBAR`);
    }
    if (result.hcsSequenceNumber) console.log(`    HCS seq: ${result.hcsSequenceNumber}`);
    if (result.hashScanUrl) console.log(`    HashScan: ${result.hashScanUrl}`);
    if (result.onChain) console.log(`    On-chain: Yes (contract tx)`);
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
  }
  await ask('\n  Press Enter to continue...');
}

async function checkReputation() {
  printHeader();
  console.log('  ── Reputation Scores ──\n');
  try {
    const a1 = await api('GET', `/api/agents/${agent1.id}`);
    const a2 = await api('GET', `/api/agents/${agent2.id}`);

    const printRep = (agent, data) => {
      const r = data.reputation;
      console.log(`  ${agent.name} (${agent.id})`);
      console.log(`    Score:       ${r.overallScore}/1000`);
      console.log(`    Tier:        ${r.trustTier}`);
      console.log(`    Feedback:    ${r.feedbackCount} (avg: ${r.averageFeedbackValue})`);
      console.log(`    Validations: ${r.validationCount} (avg: ${r.averageValidationScore})`);
      const tags = Object.entries(r.feedbackByTag);
      if (tags.length) {
        console.log(`    Tags:        ${tags.map(([t, d]) => `${t}: ${d.avg.toFixed(0)} (${d.count})`).join(', ')}`);
      }
      console.log();
    };

    printRep(agent1, a1);
    printRep(agent2, a2);
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
  }
  await ask('  Press Enter to continue...');
}

async function checkStaking() {
  printHeader();
  console.log('  ── Staking Balances ──\n');
  try {
    const s1 = await api('GET', `/api/staking/${agent1.id}`);
    const s2 = await api('GET', `/api/staking/${agent2.id}`);

    const printStake = (agent, s) => {
      console.log(`  ${agent.name} (${agent.id})`);
      console.log(`    Balance:      ${s.balanceHbar} HBAR`);
      console.log(`    Meets min:    ${s.meetsMinimum ? 'Yes' : 'NO'}`);
      console.log(`    Deposited:    ${s.totalDeposited / 1e8} HBAR`);
      console.log(`    Slashed:      ${s.totalSlashed / 1e8} HBAR`);
      console.log(`    Slash count:  ${s.slashCount}`);
      console.log();
    };

    printStake(agent1, s1);
    printStake(agent2, s2);

    const tvl = await api('GET', '/api/staking/tvl');
    console.log(`  Protocol TVL: ${tvl.totalStakedHbar} HBAR | Slashed: ${tvl.totalSlashedHbar} HBAR | Stakers: ${tvl.stakerCount}`);
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
  }
  await ask('\n  Press Enter to continue...');
}

async function viewActivity() {
  printHeader();
  console.log('  ── Recent Activity ──\n');
  try {
    const data = await api('GET', '/api/activity');
    const events = data.events || data.activity || [];
    if (events.length === 0) {
      console.log('  No recent activity.');
    } else {
      events.slice(0, 15).forEach((e) => {
        const time = new Date(e.timestamp).toLocaleTimeString();
        console.log(`  [${time}] ${e.type} — ${e.description || JSON.stringify(e.data || {}).substring(0, 80)}`);
      });
    }
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
  }
  await ask('\n  Press Enter to continue...');
}

async function fullScenario() {
  printHeader();
  console.log('  ── Full Demo Scenario (Automated) ──\n');
  console.log('  This will run the complete protocol flow:');
  console.log('    1. Agent 1 gives positive feedback to Agent 2');
  console.log('    2. Agent 2 gives positive feedback to Agent 1');
  console.log('    3. Agent 1 validates Agent 2');
  console.log('    4. Agent 2 validates Agent 1');
  console.log('    5. Agent 1 gives negative feedback to Agent 2');
  console.log('    6. Agent 2 disputes the negative feedback');
  console.log('    7. Arbiter upholds dispute → Agent 1 gets slashed');
  console.log('    8. Show final scores and balances\n');

  const confirm = await ask('  Run? (y/n): ');
  if (confirm.trim().toLowerCase() !== 'y') return;

  try {
    // Step 1
    console.log('\n  [1/8] Agent 1 → Agent 2: positive feedback (88)...');
    const fb1 = await api('POST', '/api/feedback', {
      agentId: agent2.id, value: 88, tag1: 'code-quality', tag2: 'accuracy',
    }, agent1.key);
    console.log(`    ✓ Score: ${fb1.reputation.overallScore}/1000 (${fb1.reputation.trustTier})`);

    // Step 2
    console.log('\n  [2/8] Agent 2 → Agent 1: positive feedback (92)...');
    const fb2 = await api('POST', '/api/feedback', {
      agentId: agent1.id, value: 92, tag1: 'data-analysis', tag2: 'speed',
    }, agent2.key);
    console.log(`    ✓ Score: ${fb2.reputation.overallScore}/1000 (${fb2.reputation.trustTier})`);

    // Step 3
    console.log('\n  [3/8] Agent 1 validates Agent 2 (score: 85)...');
    const vr1 = await api('POST', '/api/validation', {
      agentId: agent2.id, requestURI: `https://${agent2.name.toLowerCase()}.ai/capabilities.json`,
    }, agent1.key);
    const vs1 = await api('POST', '/api/validation/respond', {
      requestHash: vr1.request.requestHash, response: 85, tag: 'code-quality',
      responseURI: `https://${agent1.name.toLowerCase()}.ai/validations/result.json`,
    }, agent1.key);
    console.log(`    ✓ Score: ${vs1.reputation.overallScore}/1000`);

    // Step 4
    console.log('\n  [4/8] Agent 2 validates Agent 1 (score: 90)...');
    const vr2 = await api('POST', '/api/validation', {
      agentId: agent1.id, requestURI: `https://${agent1.name.toLowerCase()}.ai/capabilities.json`,
    }, agent2.key);
    const vs2 = await api('POST', '/api/validation/respond', {
      requestHash: vr2.request.requestHash, response: 90, tag: 'data-analysis',
      responseURI: `https://${agent2.name.toLowerCase()}.ai/validations/result.json`,
    }, agent2.key);
    console.log(`    ✓ Score: ${vs2.reputation.overallScore}/1000`);

    // Step 5
    console.log('\n  [5/8] Agent 1 → Agent 2: NEGATIVE feedback (12)...');
    const fb3 = await api('POST', '/api/feedback', {
      agentId: agent2.id, value: 12, tag1: 'reliability', tag2: 'uptime',
    }, agent1.key);
    console.log(`    ✓ Score dropped: ${fb3.reputation.overallScore}/1000`);

    // Step 6
    console.log('\n  [6/8] Agent 2 disputes the negative feedback...');
    const dispute = await api('POST', '/api/staking/dispute', {
      feedbackId: fb3.feedback.feedbackId,
      reason: 'Feedback is dishonest — my uptime is 99.9%',
    }, agent2.key);
    console.log(`    ✓ Dispute #${dispute.dispute.id} filed (status: ${dispute.dispute.status})`);

    // Step 7
    console.log('\n  [7/8] Arbiter upholds dispute → SLASH Agent 1...');
    const resolution = await api('POST', `/api/staking/dispute/${dispute.dispute.id}/resolve`, {
      upheld: true,
      notes: 'Evidence confirms uptime was 99.9%. Feedback was dishonest.',
    }, agent2.key);
    console.log(`    ✓ Dispute ${resolution.dispute.status}`);
    if (resolution.slashedStake) {
      console.log(`    ⚡ SLASHED: ${Number(resolution.dispute.slashAmount || resolution.slashedStake.totalSlashed) / 1e8} HBAR from ${agent1.name}`);
      console.log(`    Remaining: ${Number(resolution.slashedStake.balance) / 1e8} HBAR`);
    }

    // Step 8
    console.log('\n  [8/8] Final scores and balances:\n');
    const final1 = await api('GET', `/api/agents/${agent1.id}`);
    const final2 = await api('GET', `/api/agents/${agent2.id}`);
    const stake1 = await api('GET', `/api/staking/${agent1.id}`);
    const stake2 = await api('GET', `/api/staking/${agent2.id}`);

    console.log(`    ${agent1.name}: ${final1.reputation.overallScore}/1000 (${final1.reputation.trustTier}) | Stake: ${stake1.balanceHbar} HBAR | Slashed: ${stake1.totalSlashed / 1e8} HBAR`);
    console.log(`    ${agent2.name}: ${final2.reputation.overallScore}/1000 (${final2.reputation.trustTier}) | Stake: ${stake2.balanceHbar} HBAR | Slashed: ${stake2.totalSlashed / 1e8} HBAR`);

    console.log('\n  ═══ Demo Complete ═══');
  } catch (e) {
    console.log(`\n  ✗ Error: ${e.message}`);
  }
  await ask('\n  Press Enter to continue...');
}

async function mainMenu() {
  while (true) {
    printHeader();
    console.log('  ── Main Menu ──\n');
    console.log('  1. Give Feedback');
    console.log('  2. Request & Submit Validation');
    console.log('  3. File Dispute');
    console.log('  4. Resolve Dispute (Arbiter)');
    console.log('  5. Check Reputation Scores');
    console.log('  6. Check Staking Balances');
    console.log('  7. View Activity Feed');
    console.log('  8. Run Full Demo Scenario (Automated)');
    console.log('  0. Exit\n');

    const choice = await ask('  Choice: ');

    switch (choice.trim()) {
      case '1': await giveFeedback(); break;
      case '2': await requestValidation(); break;
      case '3': await fileDispute(); break;
      case '4': await resolveDispute(); break;
      case '5': await checkReputation(); break;
      case '6': await checkStaking(); break;
      case '7': await viewActivity(); break;
      case '8': await fullScenario(); break;
      case '0': console.log('\n  Goodbye!\n'); rl.close(); process.exit(0);
      default: console.log('  Invalid choice');
    }
  }
}

// Main
(async () => {
  try {
    // Check backend is running
    await api('GET', '/api/staking/info');
    await setupAgents();
    await mainMenu();
  } catch (e) {
    console.error(`\n  Error: ${e.message}`);
    console.error('  Make sure the backend is running on', API_URL);
    rl.close();
    process.exit(1);
  }
})();
