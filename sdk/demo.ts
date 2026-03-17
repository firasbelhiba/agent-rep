// ============================================================
//  AgentRep SDK Demo — Mariposa x TalentAI
//  ERC-8004 Agent Reputation on Hedera
//
//  Two real registered agents connect, rate each other,
//  validate skills, and build on-chain reputation.
//
//  Run:  cd sdk && npx ts-node demo.ts
// ============================================================

const { AgentRepClient } = require('./dist/index');

const BASE_URL = 'http://localhost:4000/api';

// Your two agents
const MARIPOSA_KEY = 'ar_3b43e45f3d238113a51033b08b8f2b953ef2353ed9abb300368515321d04ddb2';
const TALENTAI_KEY = 'ar_f5fec4e4db8bb9de554ae39a4c17383524cc69a8e64ec6ddde20c4574682d080';

const MARIPOSA_ID = '0.0.8265268';
const TALENTAI_ID = '0.0.8265743';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function divider(title: string) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

async function main() {
  console.log(`
   ___                    _   ____
  / _ \\                  | | |  _ \\
 / /_\\ \\ __ _  ___ _ __ | |_| |_) | ___ _ __
 |  _  |/ _\` |/ _ \\ '_ \\| __|  _ < / _ \\ '_ \\
 | | | | (_| |  __/ | | | |_| |_) |  __/ |_) |
 \\_| |_/\\__, |\\___|_| |_|\\__|____/ \\___| .__/
         __/ |                          | |
        |___/                           |_|

  SDK Demo — Mariposa x TalentAI
  `);

  // ── Step 1: Initialize SDK clients ──
  divider('STEP 1: Initialize SDK Clients');

  const mariposa = new AgentRepClient({
    baseUrl: BASE_URL,
    apiKey: MARIPOSA_KEY,
    debug: true,
  });

  const talentai = new AgentRepClient({
    baseUrl: BASE_URL,
    apiKey: TALENTAI_KEY,
    debug: true,
  });

  console.log('Mariposa client initialized');
  console.log('TalentAI client initialized');

  // ── Step 2: Discover each other ──
  divider('STEP 2: Agent Discovery');

  const mariposaInfo = await mariposa.getAgent(MARIPOSA_ID);
  const talentaiInfo = await talentai.getAgent(TALENTAI_ID);

  console.log(`\nMariposa:`);
  console.log(`  Name:   ${mariposaInfo.agent.name}`);
  console.log(`  Skills: ${(mariposaInfo.agent.skills || []).join(', ')}`);
  console.log(`  Score:  ${mariposaInfo.reputation.overallScore}`);
  console.log(`  Tier:   ${mariposaInfo.reputation.trustTier}`);

  console.log(`\nTalentAI:`);
  console.log(`  Name:   ${talentaiInfo.agent.name}`);
  console.log(`  Skills: ${(talentaiInfo.agent.skills || []).join(', ')}`);
  console.log(`  Score:  ${talentaiInfo.reputation.overallScore}`);
  console.log(`  Tier:   ${talentaiInfo.reputation.trustTier}`);

  // ── Step 3: Create connection between agents ──
  divider('STEP 3: HCS-10 Connection');

  const connResp = await fetch(`${BASE_URL}/connections/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromAgentId: MARIPOSA_ID,
      toAgentId: TALENTAI_ID,
    }),
  });
  const conn1: any = await connResp.json();
  console.log(`Connection created: Mariposa -> TalentAI`, conn1.status || '');

  const connResp2 = await fetch(`${BASE_URL}/connections/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromAgentId: TALENTAI_ID,
      toAgentId: MARIPOSA_ID,
    }),
  });
  const conn2: any = await connResp2.json();
  console.log(`Connection created: TalentAI -> Mariposa`, conn2.status || '');
  console.log('Both agents are now connected via HCS-10!');

  await sleep(500);

  // ── Step 4: Agents rate each other ──
  divider('STEP 4: Feedback Exchange');

  // Scenario: TalentAI asked Mariposa for creative content generation
  console.log('\n--- TalentAI rates Mariposa ---');
  console.log('Scenario: TalentAI needed creative content for talent profiles');
  console.log('Result: Mariposa generated excellent, personalized content\n');

  const fb1 = await talentai.giveFeedback({
    agentId: MARIPOSA_ID,
    value: 92,
    valueDecimals: 0,
    tag1: 'content-creation',
    tag2: 'creativity',
    comment: 'Outstanding creative content for talent profiles. Natural language, engaging tone, perfectly tailored.',
    endpoint: '/api/content/talent-profiles',
  });
  console.log(`Feedback submitted! Score: 92/100`);
  console.log(`  Tag: content-creation / creativity`);
  console.log(`  New overall score: ${fb1.reputation.overallScore}`);

  await sleep(300);

  // Second feedback
  const fb2 = await talentai.giveFeedback({
    agentId: MARIPOSA_ID,
    value: 88,
    valueDecimals: 0,
    tag1: 'responsiveness',
    tag2: 'turnaround',
    comment: 'Quick turnaround on content requests. Consistent quality across batches.',
  });
  console.log(`\nSecond feedback submitted! Score: 88/100`);
  console.log(`  Tag: responsiveness / turnaround`);
  console.log(`  New overall score: ${fb2.reputation.overallScore}`);

  await sleep(300);

  // Mariposa rates TalentAI
  console.log('\n--- Mariposa rates TalentAI ---');
  console.log('Scenario: Mariposa needed talent matching for a project');
  console.log('Result: TalentAI found excellent matches with high accuracy\n');

  const fb3 = await mariposa.giveFeedback({
    agentId: TALENTAI_ID,
    value: 95,
    valueDecimals: 0,
    tag1: 'data-analysis',
    tag2: 'talent-matching',
    comment: 'Exceptional talent matching. Found 5 perfect candidates with 98% skill overlap. Saved hours of manual screening.',
    endpoint: '/api/match/project-alpha',
  });
  console.log(`Feedback submitted! Score: 95/100`);
  console.log(`  Tag: data-analysis / talent-matching`);
  console.log(`  New overall score: ${fb3.reputation.overallScore}`);

  await sleep(300);

  const fb4 = await mariposa.giveFeedback({
    agentId: TALENTAI_ID,
    value: 90,
    valueDecimals: 0,
    tag1: 'reliability',
    tag2: 'accuracy',
    comment: 'Reliable results every time. Data quality is consistently high across different talent pools.',
  });
  console.log(`\nSecond feedback submitted! Score: 90/100`);
  console.log(`  Tag: reliability / accuracy`);
  console.log(`  New overall score: ${fb4.reputation.overallScore}`);

  // ── Step 5: Respond to feedback ──
  divider('STEP 5: Feedback Responses');

  await mariposa.respondToFeedback(fb1.feedback.feedbackId, 'https://mariposa.ai/portfolio/talent-content.pdf');
  console.log('Mariposa responded to feedback with portfolio link');

  await talentai.respondToFeedback(fb3.feedback.feedbackId, 'https://talentai.io/results/project-alpha-matches.json');
  console.log('TalentAI responded to feedback with match results link');

  // ── Step 6: Validation ──
  divider('STEP 6: Skill Validation');

  // TalentAI validates Mariposa's content-creation capability
  console.log('\nTalentAI validates Mariposa\'s content creation skills...');

  const valHash1 = `val-mariposa-${Date.now()}`;
  const valReq = await talentai.requestValidation({
    agentId: MARIPOSA_ID,
    requestURI: 'https://mariposa.ai/capabilities/content-creation.json',
    requestHash: valHash1,
  });
  console.log(`Validation requested (hash: ${valReq.request.requestHash})`);

  await sleep(300);

  const valResp = await talentai.submitValidation({
    requestHash: valHash1,
    response: 91,
    tag: 'content-creation',
    responseURI: 'https://talentai.io/validations/mariposa-content.json',
  });
  console.log(`Validation submitted! Score: 91/100`);
  console.log(`  Mariposa new score: ${valResp.reputation.overallScore}`);

  await sleep(300);

  // Mariposa validates TalentAI's data-analysis capability
  console.log('\nMariposa validates TalentAI\'s data analysis skills...');

  const valHash2 = `val-talentai-${Date.now()}`;
  const valReq2 = await mariposa.requestValidation({
    agentId: TALENTAI_ID,
    requestURI: 'https://talentai.io/capabilities/talent-matching.json',
    requestHash: valHash2,
  });
  console.log(`Validation requested (hash: ${valReq2.request.requestHash})`);

  await sleep(300);

  const valResp2 = await mariposa.submitValidation({
    requestHash: valHash2,
    response: 93,
    tag: 'data-analysis',
    responseURI: 'https://mariposa.ai/validations/talentai-matching.json',
  });
  console.log(`Validation submitted! Score: 93/100`);
  console.log(`  TalentAI new score: ${valResp2.reputation.overallScore}`);

  // ── Step 7: Trust checks ──
  divider('STEP 7: Trust Evaluation');

  const mariposaTrusted = await mariposa.isTrusted(MARIPOSA_ID, 'VERIFIED');
  const talentaiTrusted = await talentai.isTrusted(TALENTAI_ID, 'VERIFIED');

  const mariposaTier = await mariposa.getTrustTier(MARIPOSA_ID);
  const talentaiTier = await talentai.getTrustTier(TALENTAI_ID);

  console.log(`\nMariposa:  Tier = ${mariposaTier}, Trusted (VERIFIED+): ${mariposaTrusted}`);
  console.log(`TalentAI:  Tier = ${talentaiTier}, Trusted (VERIFIED+): ${talentaiTrusted}`);

  // ── Step 8: Compare agents ──
  divider('STEP 8: Agent Comparison');

  const comparison = await mariposa.compare(MARIPOSA_ID, TALENTAI_ID);
  console.log(`\n${comparison.agents[0].agent.name} vs ${comparison.agents[1].agent.name}`);
  console.log(`  Score: ${comparison.agents[0].reputation.overallScore} vs ${comparison.agents[1].reputation.overallScore}`);
  console.log(`  Difference: ${comparison.scoreDiff} points`);
  console.log(`  Winner: ${comparison.winner.agent.name}`);
  console.log(`  Tiers: ${comparison.details.tierComparison}`);

  // ── Step 9: Full reputation reports ──
  divider('STEP 9: Reputation Reports');

  const report1 = await mariposa.getReport(MARIPOSA_ID);
  console.log('\n' + report1);

  const report2 = await talentai.getReport(TALENTAI_ID);
  console.log('\n' + report2);

  // ── Done ──
  divider('DEMO COMPLETE');

  console.log(`
  Mariposa and TalentAI have successfully:

    1. Discovered each other on the network
    2. Established HCS-10 connections
    3. Exchanged feedback (ERC-8004 giveFeedback)
    4. Responded to feedback (ERC-8004 appendResponse)
    5. Validated each other's skills (ERC-8004 validation)
    6. Built on-chain reputation scores
    7. Compared trust levels

  All interactions are logged to Hedera Consensus Service (HCS)
  and follow the ERC-8004 standard on Hedera!
  `);

  mariposa.destroy();
  talentai.destroy();
}

main().catch(console.error);
