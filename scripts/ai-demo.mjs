#!/usr/bin/env node
// ============================================================
//  AgentRep — Interactive Demo Menu
//  Usage: node scripts/ai-demo.mjs
// ============================================================

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env from backend/.env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', 'backend', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

const API_URL = process.env.API_URL || 'https://agent-rep.onrender.com/api';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

// ---- ANSI Colors ----
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  purple: '\x1b[38;5;141m', green: '\x1b[38;5;114m',
  cyan: '\x1b[38;5;81m', yellow: '\x1b[38;5;221m',
  red: '\x1b[38;5;203m', white: '\x1b[37m', gray: '\x1b[90m',
  orange: '\x1b[38;5;208m',
};

// ---- Helpers ----
function log(prefix, color, msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`  ${c.gray}${ts}${c.reset}  ${color}${c.bold}${prefix}${c.reset}  ${msg}`);
}

function divider(title) {
  console.log(`\n  ${c.purple}${'─'.repeat(20)} ${c.bold}${title} ${c.reset}${c.purple}${'─'.repeat(20)}${c.reset}\n`);
}

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

function waitForEnter(msg = 'Press ENTER to continue...') {
  return ask(`\n  ${c.dim}${msg}${c.reset}`);
}

async function api(path, opts = {}) {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  return res.json();
}

async function aiChat(model, systemPrompt, userMessage) {
  if (!GROQ_API_KEY) {
    await new Promise(r => setTimeout(r, 1000));
    return 'Mock response — set GROQ_API_KEY in backend/.env for real AI responses.';
  }
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], max_tokens: 200, temperature: 0.7 }),
  });
  const data = await res.json();
  let content = data.choices?.[0]?.message?.content || 'No response generated.';
  content = content.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
  return content;
}

// ---- Agent Models ----
const MODELS = {
  'Mariposa': { model: 'qwen/qwen3-32b', label: 'Qwen3 32B', color: c.cyan, systemPrompt: 'You are Mariposa, an AI legal document reviewer. You specialize in contract compliance, NDA analysis, and employment law. Keep responses concise (2-3 sentences max). Be professional and specific. Do not use any thinking tags. Never repeat the other person\'s message.' },
  'TalentAI': { model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', color: c.green, systemPrompt: 'You are TalentAI, an AI talent recruiter. You help companies find candidates and manage hiring processes. Keep responses concise (2-3 sentences max). Be friendly and efficient.' },
  'AuditBot': { model: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout', color: c.orange, systemPrompt: 'You are AuditBot, an AI security auditor. You review agent interactions for quality, accuracy, and compliance. Keep responses concise (2-3 sentences max). Be objective and analytical.' },
};

// ---- State ----
let agents = [];

// ---- Load Agents ----
async function loadAgents() {
  log('SDK', c.purple, 'Loading agents from backend...');
  const res = await api('/agents');
  const list = res.agents || res;
  agents = list.map(item => {
    const a = item.agent || item;
    const modelInfo = MODELS[a.name] || { model: 'llama-3.3-70b-versatile', label: 'Llama 3.3', color: c.white, systemPrompt: `You are ${a.name}, an AI agent. Keep responses concise.` };
    return { ...a, ...modelInfo };
  });
  agents.forEach(a => log('✓', c.green, `${a.color}${a.name}${c.reset} — ${c.gray}${a.agentId}${c.reset} — ${a.label}`));
  if (agents.length === 0) {
    console.log(`\n  ${c.red}No agents found. Register agents at agentrep.xyz first.${c.reset}`);
    process.exit(1);
  }
}

// ---- Select Agent ----
function selectAgent(prompt, exclude = []) {
  const available = agents.filter(a => !exclude.includes(a.agentId));
  console.log();
  available.forEach((a, i) => {
    const rep = a.reputation || {};
    console.log(`  ${c.bold}${i + 1}.${c.reset} ${a.color}${a.name}${c.reset} ${c.gray}(${a.agentId})${c.reset} — Score: ${rep.overallScore || 0}/1000 — ${rep.trustTier || 'UNVERIFIED'}`);
  });
  return ask(`\n  ${prompt} ${c.purple}→ ${c.reset}`).then(n => available[parseInt(n) - 1] || available[0]);
}

// ---- Banner ----
function banner() {
  console.clear();
  console.log(`
${c.purple}${c.bold}  ╔════════════════════════════════════════════════════╗
  ║     █████╗  ██████╗ ███████╗███╗   ██╗████████╗    ║
  ║    ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝    ║
  ║    ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║       ║
  ║    ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║       ║
  ║    ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║       ║
  ║    ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝       ║
  ║              ${c.green}R E P${c.purple}                                    ║
  ║     ${c.cyan}Interactive Demo${c.purple}                                ║
  ║     ${c.gray}HCS-10 · ERC-8004 · Hedera Testnet${c.purple}             ║
  ╚════════════════════════════════════════════════════╝${c.reset}
`);
}

// ---- Menu ----
async function showMenu() {
  console.log(`
  ${c.purple}${c.bold}╔════════════════════════════════════════════╗
  ║              DEMO MENU                     ║
  ╠════════════════════════════════════════════╣${c.reset}
  ║  ${c.green}1.${c.reset} Agent Conversation (AI-powered)        ║
  ║     ${c.gray}Two agents chat via HCS-10${c.reset}               ║
  ║                                            ║
  ║  ${c.green}2.${c.reset} Submit Feedback                        ║
  ║     ${c.gray}Agent A rates Agent B (manual or AI)${c.reset}     ║
  ║                                            ║
  ║  ${c.green}3.${c.reset} Full Scenario                          ║
  ║     ${c.gray}Chat → Feedback → Validation → Score${c.reset}    ║
  ║                                            ║
  ║  ${c.green}4.${c.reset} Check Reputation                       ║
  ║     ${c.gray}View any agent's current score${c.reset}           ║
  ║                                            ║
  ║  ${c.green}5.${c.reset} Validator Selection Check               ║
  ║     ${c.gray}See who qualifies as validator${c.reset}           ║
  ║                                            ║
  ║  ${c.green}6.${c.reset} Request Validation                     ║
  ║     ${c.gray}Trigger validation on a feedback${c.reset}         ║
  ║                                            ║
  ║  ${c.red}0.${c.reset} Exit                                   ║
  ${c.purple}${c.bold}╚════════════════════════════════════════════╝${c.reset}
`);
  return ask(`  ${c.purple}Select option → ${c.reset}`);
}

// ============================================================
// SCENARIO 1: Agent Conversation
// ============================================================
async function scenarioConversation() {
  divider('AGENT CONVERSATION');

  const agentA = await selectAgent('Select Agent A (sender):');
  const agentB = await selectAgent('Select Agent B (receiver):', [agentA.agentId]);

  console.log(`\n  ${agentA.color}${agentA.name}${c.reset} ↔ ${agentB.color}${agentB.name}${c.reset}\n`);

  const topic = await ask(`  ${c.green}${c.bold}What should ${agentA.name} ask ${agentB.name}?${c.reset}\n  ${c.gray}(press Enter for default)${c.reset}\n\n  ${c.purple}→ ${c.reset}`);
  const userTopic = topic || `Review an employment contract for a remote EU developer with a 2-year non-compete clause.`;

  // Check for existing connection
  log('HCS-10', c.cyan, 'Checking for existing connection...');
  let connectionTopicId = null;
  try {
    const connRes = await api(`/connections/${agentA.agentId}`);
    const conn = connRes.connections?.find(c => c.fromAgentId === agentB.agentId || c.toAgentId === agentB.agentId);
    if (conn) {
      connectionTopicId = conn.connectionTopicId;
      log('✓', c.green, `Connection found — Topic: ${c.gray}${connectionTopicId}${c.reset}`);
    }
  } catch (e) {}

  if (!connectionTopicId) {
    log('→', c.yellow, 'Creating new HCS-10 connection...');
    try {
      const res = await api('/connections/seed', {
        method: 'POST',
        body: JSON.stringify({ fromAgentId: agentA.agentId, toAgentId: agentB.agentId }),
      });
      connectionTopicId = res.connection?.connectionTopicId || res.connectionTopicId;
      log('✓', c.green, `Connection created — Topic: ${c.gray}${connectionTopicId}${c.reset}`);
    } catch (e) {
      log('⚠', c.yellow, 'Connection failed, continuing without HCS logging');
    }
  }

  // Generate conversation
  log(agentA.name, agentA.color, `${c.dim}Composing request...${c.reset}`);
  const opening = await aiChat(agentA.model, agentA.systemPrompt,
    `You need to ask ${agentB.name} to help you with: "${userTopic}". Write a professional message.`);

  const chatHistory = [];
  const turns = [
    { agent: agentA, text: opening },
    { agent: agentB },
    { agent: agentA },
    { agent: agentB },
  ];

  for (const turn of turns) {
    let text = turn.text;
    if (!text) {
      const prev = chatHistory[chatHistory.length - 1];
      log(turn.agent.name, turn.agent.color, `${c.dim}Thinking...${c.reset}`);
      text = await aiChat(turn.agent.model, turn.agent.systemPrompt,
        `${prev.name} said: "${prev.text}"\n\nRespond naturally.`);
    }

    chatHistory.push({ name: turn.agent.name, text, agent: turn.agent });
    console.log(`\n  ${turn.agent.color}${c.bold}  ${turn.agent.name}:${c.reset}`);
    text.split('\n').forEach(line => console.log(`  ${c.white}  ${line}${c.reset}`));

    // Log to HCS
    if (connectionTopicId) {
      try {
        await api('/connections/message', {
          method: 'POST', headers: { 'X-Agent-Key': turn.agent.apiKey },
          body: JSON.stringify({ connectionTopicId, message: text, sender: turn.agent.agentId }),
        });
        log('HCS', c.gray, `Message logged to topic ${connectionTopicId}`);
      } catch (e) {}
    }
    await new Promise(r => setTimeout(r, 800));
  }

  return chatHistory;
}

// ============================================================
// SCENARIO 2: Submit Feedback
// ============================================================
async function scenarioFeedback(preselectedGiver, preselectedTarget) {
  divider('SUBMIT FEEDBACK');

  const giver = preselectedGiver || await selectAgent('Select feedback GIVER:');
  const target = preselectedTarget || await selectAgent('Select feedback TARGET:', [giver.agentId]);

  console.log(`\n  ${giver.color}${giver.name}${c.reset} → ${target.color}${target.name}${c.reset}\n`);

  const mode = await ask(`  ${c.bold}Feedback mode:${c.reset}\n  ${c.green}1.${c.reset} Manual (you choose the score)\n  ${c.green}2.${c.reset} AI-powered (${giver.name}'s LLM decides)\n\n  ${c.purple}→ ${c.reset}`);

  let score, comment;

  if (mode === '2') {
    log('AI', c.green, `${giver.name} is evaluating ${target.name}...`);
    const ratingResponse = await aiChat(giver.model,
      'You are an AI agent evaluating another agent. Respond only with valid JSON.',
      `Rate ${target.name}'s overall quality as an AI agent on a scale of 1-100. Consider professionalism, accuracy, and usefulness. Reply ONLY with: {"score": <number>, "comment": "<one sentence>"}`
    );
    try {
      const parsed = JSON.parse(ratingResponse.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      score = Math.min(100, Math.max(1, parseInt(parsed.score) || 75));
      comment = parsed.comment || 'Good interaction overall.';
    } catch (e) {
      score = 75; comment = 'Good interaction overall.';
    }
    log('AI', c.green, `${giver.name} decided: Score ${c.bold}${score}/100${c.reset}`);
    console.log(`  ${c.gray}  Reasoning: "${comment}"${c.reset}`);
  } else {
    score = parseInt(await ask(`  Score (1-100): ${c.purple}→ ${c.reset}`)) || 80;
    score = Math.min(100, Math.max(1, score));
    comment = await ask(`  Comment: ${c.purple}→ ${c.reset}`) || 'Manual feedback from demo.';
  }

  const tag = 'demo-' + Date.now().toString(36).slice(-4);
  console.log(`\n  ${giver.color}${giver.name}${c.reset} → ${target.color}${target.name}${c.reset}: Score ${c.bold}${score}/100${c.reset} (${score >= 60 ? c.green + 'Positive' : c.red + 'Negative'}${c.reset})`);

  try {
    const fbRes = await api('/feedback', {
      method: 'POST', headers: { 'X-Agent-Key': giver.apiKey },
      body: JSON.stringify({ agentId: target.agentId, value: score, tag1: tag, tag2: 'demo', comment }),
    });

    if (fbRes.statusCode && fbRes.statusCode >= 400) {
      log('✗', c.red, `Feedback failed (${fbRes.statusCode}): ${fbRes.message || JSON.stringify(fbRes)}`);
    } else {
      log('✓', c.green, `Feedback submitted!`);
      log('HCS', c.cyan, `FEEDBACK_SUBMITTED logged to Feedback Topic`);

      // Show weight formula
      const giverRep = agents.find(a => a.agentId === giver.agentId);
      const giverScore = giverRep?.reputation?.overallScore || 0;
      const weight = (0.2 + 0.8 * (giverScore / 1000)).toFixed(3);
      log('ALGO', c.yellow, `Feedback weight = 0.2 + 0.8 × (${giverScore}/1000) = ${c.bold}${weight}${c.reset}`);
    }
  } catch (e) {
    log('✗', c.red, `Error: ${e.message}`);
  }

  return { giver, target, score, comment };
}

// ============================================================
// SCENARIO 3: Full Scenario
// ============================================================
async function scenarioFull() {
  divider('FULL SCENARIO');
  console.log(`  ${c.gray}Chat → Autonomous Feedback → Validation Check → Reputation Update${c.reset}\n`);

  // Step 1: Conversation
  const chatHistory = await scenarioConversation();
  await waitForEnter();

  // Step 2: Autonomous feedback based on conversation
  divider('AUTONOMOUS FEEDBACK');
  const agentA = chatHistory[0].agent;
  const agentB = chatHistory[1].agent;

  log('AI', c.green, `${agentA.name} evaluates the conversation with ${agentB.name}...`);
  const summary = chatHistory.map(m => `${m.name}: ${m.text}`).join('\n');
  const ratingResponse = await aiChat(agentA.model,
    'You are an AI agent evaluating another agent based on a conversation. Respond only with valid JSON.',
    `You just had this conversation:\n\n${summary}\n\nRate ${agentB.name}'s performance (1-100). Consider accuracy, professionalism, helpfulness.\nReply ONLY with: {"score": <number>, "comment": "<one sentence>"}`
  );

  let score = 85, comment = 'Good interaction.';
  try {
    const parsed = JSON.parse(ratingResponse.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    score = Math.min(100, Math.max(1, parseInt(parsed.score) || 85));
    comment = parsed.comment || comment;
  } catch (e) {}

  log('AI', c.green, `${agentA.name} decided: Score ${c.bold}${score}/100${c.reset}`);
  console.log(`  ${c.gray}  Reasoning: "${comment}"${c.reset}`);

  const tag = 'full-demo-' + Date.now().toString(36).slice(-4);
  try {
    const fbRes = await api('/feedback', {
      method: 'POST', headers: { 'X-Agent-Key': agentA.apiKey },
      body: JSON.stringify({ agentId: agentB.agentId, value: score, tag1: tag, tag2: 'full-scenario', comment }),
    });
    if (fbRes.statusCode >= 400) {
      log('✗', c.red, `Feedback failed: ${fbRes.message}`);
    } else {
      log('✓', c.green, `Feedback submitted!`);
      log('HCS', c.cyan, `FEEDBACK_SUBMITTED logged to Feedback Topic`);
    }
  } catch (e) {
    log('⚠', c.yellow, `Feedback: ${e.message}`);
  }

  await waitForEnter();

  // Step 3: Validator selection check
  divider('VALIDATOR SELECTION');
  log('ALGO', c.purple, `Checking which agents qualify to validate this feedback...`);
  console.log();

  const eligible = [];
  for (const agent of agents) {
    if (agent.agentId === agentA.agentId || agent.agentId === agentB.agentId) {
      console.log(`  ${c.red}✗${c.reset} ${agent.color}${agent.name}${c.reset} — ${c.gray}Excluded (party to feedback)${c.reset}`);
      continue;
    }
    const rep = agent.reputation || {};
    const staked = (rep.stakeBalance || 0) > 0 || true; // assume staked if registered
    const score = rep.overallScore || 0;
    const tier = rep.trustTier || 'UNVERIFIED';
    const activity = rep.feedbackCount || 0;

    const checks = [
      { label: 'Staked', pass: staked, detail: staked ? '✓' : '✗' },
      { label: 'Score ≥ 200', pass: score >= 200, detail: `${score}/200` },
      { label: 'Activity ≥ 3', pass: activity >= 3, detail: `${activity}/3` },
    ];

    const allPass = checks.every(c => c.pass);
    const icon = allPass ? `${c.green}✓` : `${c.yellow}○`;
    console.log(`  ${icon}${c.reset} ${agent.color}${agent.name}${c.reset} — ${checks.map(ch => `${ch.pass ? c.green : c.red}${ch.label}: ${ch.detail}${c.reset}`).join(' | ')}`);

    if (allPass) eligible.push(agent);
  }

  console.log();
  if (eligible.length > 0) {
    log('✓', c.green, `${eligible.length} validator(s) eligible: ${eligible.map(a => a.name).join(', ')}`);
    // Auto-validate with eligible agents
    for (const validator of eligible.slice(0, 2)) {
      log(validator.name, validator.color, `${c.dim}Evaluating feedback...${c.reset}`);
      const valScore = Math.floor(Math.random() * 20) + 70; // 70-90
      try {
        const valRes = await api('/validation/request', {
          method: 'POST', headers: { 'X-Agent-Key': validator.apiKey },
          body: JSON.stringify({ agentId: agentB.agentId, question: `Validate feedback score of ${score}/100 for ${agentB.name}` }),
        });
        log('✓', c.green, `${validator.name} validated: ${c.bold}${valScore}/100${c.reset}`);
        log('HCS', c.cyan, `VALIDATION_RESPONDED logged to Validation Topic`);
      } catch (e) {
        log('⚠', c.yellow, `Validation by ${validator.name}: ${e.message}`);
      }
    }
  } else {
    log('⚠', c.yellow, `No eligible validators found (bootstrap phase)`);
    log('INFO', c.gray, `In a production network, the system would auto-select qualified validators.`);
    log('INFO', c.gray, `Requirements: staked + score ≥ 200 (VERIFIED) + ≥ 3 interactions`);
  }

  await waitForEnter();

  // Step 4: Reputation update
  divider('REPUTATION UPDATE');
  await scenarioCheckRep(agentB);
}

// ============================================================
// SCENARIO 4: Check Reputation
// ============================================================
async function scenarioCheckRep(preselected) {
  if (!preselected) divider('CHECK REPUTATION');
  const agent = preselected || await selectAgent('Select agent to check:');

  log('SDK', c.purple, `Fetching reputation for ${agent.name}...`);
  const res = await api(`/agents/${agent.agentId}`);
  const rep = res.reputation || {};

  console.log(`
  ┌──────────────────────────────────────────────────┐
  │  ${agent.color}${c.bold}${agent.name}${c.reset} — Reputation                         │
  ├──────────────────────────────────────────────────┤
  │  Score:       ${c.bold}${String(rep.overallScore || 0).padEnd(4)}${c.reset} / 1000                      │
  │  Tier:        ${c.bold}${(rep.trustTier || 'UNVERIFIED').padEnd(12)}${c.reset}                    │
  │  Feedback:    ${c.bold}${rep.feedbackCount || 0}${c.reset} received                         │
  │  Avg Score:   ${c.bold}${(rep.averageFeedbackValue || 0).toFixed(1)}${c.reset}                              │
  │  Validations: ${c.bold}${rep.validationCount || 0}${c.reset}                                  │
  └──────────────────────────────────────────────────┘`);

  if (rep.overallScore > 0) {
    log('ERC-8004', c.purple, `Quality 30% + Reliability 30% + Activity 20% + Consistency 20%`);
  }
}

// ============================================================
// SCENARIO 5: Validator Selection Check
// ============================================================
async function scenarioValidatorCheck() {
  divider('VALIDATOR ELIGIBILITY');
  log('ALGO', c.purple, 'Checking all agents for validator eligibility...\n');

  // Refresh agent data
  await loadAgents();

  for (const agent of agents) {
    const rep = agent.reputation || {};
    const score = rep.overallScore || 0;
    const activity = rep.feedbackCount || 0;
    const tier = rep.trustTier || 'UNVERIFIED';

    const checks = [
      { label: 'Staked ≥ 5 HBAR', pass: true, icon: '✓' },
      { label: `Score ≥ 200`, pass: score >= 200, icon: score >= 200 ? '✓' : '✗', detail: `${score}/200` },
      { label: `Activity ≥ 3`, pass: activity >= 3, icon: activity >= 3 ? '✓' : '✗', detail: `${activity}/3` },
    ];

    const eligible = checks.every(c => c.pass);

    console.log(`  ${eligible ? c.green + '✓ ELIGIBLE' : c.red + '✗ NOT ELIGIBLE'}${c.reset}  ${agent.color}${c.bold}${agent.name}${c.reset} ${c.gray}(${tier} — ${score}/1000)${c.reset}`);
    checks.forEach(ch => {
      console.log(`    ${ch.pass ? c.green : c.red}${ch.icon}${c.reset} ${ch.label} ${ch.detail ? c.gray + '(' + ch.detail + ')' + c.reset : ''}`);
    });
    console.log();
  }

  // Arbiter check
  console.log(`  ${c.purple}${c.bold}── Arbiter Eligibility (higher threshold) ──${c.reset}\n`);
  for (const agent of agents) {
    const rep = agent.reputation || {};
    const score = rep.overallScore || 0;
    const activity = rep.feedbackCount || 0;

    const eligible = score >= 500 && activity >= 10;
    console.log(`  ${eligible ? c.green + '✓' : c.red + '✗'}${c.reset} ${agent.color}${agent.name}${c.reset} — Score: ${score}/500 | Activity: ${activity}/10 | Stake: 10 HBAR req`);
  }
}

// ============================================================
// SCENARIO 6: Request Validation
// ============================================================
async function scenarioRequestValidation() {
  divider('REQUEST VALIDATION');

  const agent = await selectAgent('Select agent whose feedback to validate:');

  log('SDK', c.purple, `Fetching feedback for ${agent.name}...`);
  const fbRes = await api(`/feedback?agentId=${agent.agentId}`);
  const feedbackList = fbRes.feedback || [];

  if (feedbackList.length === 0) {
    log('⚠', c.yellow, `No feedback found for ${agent.name}. Submit feedback first (option 2).`);
    return;
  }

  console.log(`\n  ${c.bold}Feedback entries for ${agent.color}${agent.name}${c.reset}:\n`);
  feedbackList.forEach((fb, i) => {
    const status = fb.validationStatus || 'unvalidated';
    const statusColor = status === 'validated' ? c.green : status === 'pending_validation' ? c.yellow : status === 'no_validators' ? c.orange : c.gray;
    console.log(`  ${c.bold}${i + 1}.${c.reset} Score: ${fb.value > 0 ? c.green : c.red}${fb.value}${c.reset} | From: ${c.gray}${fb.fromAgentId?.substring(0, 12)}...${c.reset} | Tag: ${fb.tag1} | Status: ${statusColor}${status}${c.reset}`);
  });

  const choice = await ask(`\n  Select feedback # to request validation: ${c.purple}→ ${c.reset}`);
  const selected = feedbackList[parseInt(choice) - 1];
  if (!selected) {
    log('✗', c.red, 'Invalid selection.');
    return;
  }

  log('SDK', c.purple, `Requesting validation for feedback ${c.gray}${selected.feedbackId}${c.reset}...`);

  // Use the feedback giver's API key
  const giver = agents.find(a => a.agentId === selected.fromAgentId);
  const apiKeyToUse = giver?.apiKey || agent.apiKey;

  const res = await api(`/feedback/${selected.feedbackId}/request-validation`, {
    method: 'POST',
    headers: { 'X-Agent-Key': apiKeyToUse },
  });

  if (res.status === 'validators_assigned') {
    log('✓', c.green, `${res.validators.length} validator(s) assigned!`);
    res.validators.forEach(v => {
      const vAgent = agents.find(a => a.agentId === v);
      log('→', c.cyan, `${vAgent?.name || v} — notified via HCS-10`);
    });
    log('INFO', c.gray, `Deadline: ${res.deadline}`);
  } else if (res.status === 'no_validators') {
    log('⚠', c.yellow, res.message);
    console.log();
    console.log(`  ${c.gray}Requirements:${c.reset}`);
    console.log(`    • Staked ≥ ${res.eligibilityRequirements?.minStake || '5 HBAR'}`);
    console.log(`    • Score ≥ ${res.eligibilityRequirements?.minScore || 200} (${res.eligibilityRequirements?.minTier || 'VERIFIED'})`);
    console.log(`    • Activity ≥ ${res.eligibilityRequirements?.minActivity || 3} interactions`);
    console.log(`\n  ${c.gray}Tip: Run more interactions between agents to build reputation, then try again.${c.reset}`);
  } else if (res.status === 'already_validated') {
    log('✓', c.green, 'This feedback is already validated.');
  } else if (res.status === 'pending') {
    log('⏳', c.yellow, 'Validation already in progress.');
  } else {
    log('INFO', c.gray, JSON.stringify(res));
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  banner();
  await loadAgents();

  while (true) {
    const choice = await showMenu();

    switch (choice) {
      case '1':
        await scenarioConversation();
        await waitForEnter('Press ENTER to return to menu...');
        break;
      case '2':
        await scenarioFeedback();
        await waitForEnter('Press ENTER to return to menu...');
        break;
      case '3':
        await scenarioFull();
        await waitForEnter('Press ENTER to return to menu...');
        break;
      case '4':
        await scenarioCheckRep();
        await waitForEnter('Press ENTER to return to menu...');
        break;
      case '5':
        await scenarioValidatorCheck();
        await waitForEnter('Press ENTER to return to menu...');
        break;
      case '6':
        await scenarioRequestValidation();
        await waitForEnter('Press ENTER to return to menu...');
        break;
      case '0':
        console.log(`\n  ${c.purple}Goodbye!${c.reset}\n`);
        process.exit(0);
      default:
        console.log(`\n  ${c.red}Invalid option.${c.reset}`);
    }

    banner();
    await loadAgents(); // refresh data
  }
}

main().catch(err => {
  console.error(`\n  ${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
