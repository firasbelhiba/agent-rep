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
  const { headers: optHeaders, ...restOpts } = opts;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...optHeaders },
    ...restOpts,
  });
  return res.json();
}

async function aiChat(model, systemPrompt, userMessage) {
  if (!GROQ_API_KEY) {
    console.log(`\n  ${c.red}${c.bold}ERROR: GROQ_API_KEY not set in backend/.env${c.reset}`);
    console.log(`  ${c.gray}Get a free key at https://console.groq.com${c.reset}\n`);
    throw new Error('GROQ_API_KEY is required for AI-powered features. Set it in backend/.env');
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
    const rep = item.reputation || {};
    const modelInfo = MODELS[a.name] || { model: 'llama-3.3-70b-versatile', label: 'Llama 3.3', color: c.white, systemPrompt: `You are ${a.name}, an AI agent. Keep responses concise.` };
    return { ...a, reputation: rep, ...modelInfo };
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
  ║     ${c.gray}Chat → Feedback → Score Update${c.reset}          ║
  ║                                            ║
  ║  ${c.green}4.${c.reset} Check Reputation                       ║
  ║     ${c.gray}View any agent's current score${c.reset}           ║
  ║                                            ║
  ║  ${c.green}5.${c.reset} Arbiter Eligibility                    ║
  ║     ${c.gray}See who qualifies as arbiter${c.reset}             ║
  ║                                            ║
  ║  ${c.green}6.${c.reset} File Dispute                           ║
  ║     ${c.gray}Dispute a feedback + deposit bond${c.reset}        ║
  ║                                            ║
  ║  ${c.green}7.${c.reset} Resolve Dispute (Arbiter)              ║
  ║     ${c.gray}Arbiter votes on a dispute${c.reset}               ║
  ║                                            ║
  ║  ${c.green}8.${c.reset} Talk to an Agent                       ║
  ║     ${c.gray}Chat with an AI agent via HCS-10${c.reset}         ║
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

  if (!connectionTopicId || connectionTopicId.startsWith('seed-')) {
    log('→', c.yellow, 'Creating real HCS-10 connection topic...');
    try {
      const res = await api('/connections/seed', {
        method: 'POST',
        body: JSON.stringify({ fromAgentId: agentA.agentId, toAgentId: agentB.agentId }),
      });
      connectionTopicId = res.connection?.connectionTopicId || res.connectionTopicId;
      if (connectionTopicId && !connectionTopicId.startsWith('seed-') && !connectionTopicId.startsWith('local-')) {
        log('✓', c.green, `Real HCS topic created — ${c.gray}${connectionTopicId}${c.reset}`);
      } else {
        log('⚠', c.yellow, `Connection created but topic may not be on-chain: ${connectionTopicId}`);
        connectionTopicId = null;
      }
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

  // Show verification link
  if (connectionTopicId) {
    console.log(`\n  ${c.purple}${c.bold}Verify on HashScan:${c.reset}`);
    console.log(`  ${c.cyan}https://hashscan.io/testnet/topic/${connectionTopicId}${c.reset}\n`);
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

    // Fetch real conversation directly from Hedera mirror node (NOT database)
    let conversationContext = '';
    log('SDK', c.purple, `Looking for HCS conversation between ${giver.name} and ${target.name}...`);
    try {
      // Find the connection topic ID
      let connectionTopicId = null;
      for (const agentId of [giver.agentId, target.agentId]) {
        const connRes = await api(`/connections/${agentId}`);
        const found = (connRes.connections || []).find(cn => {
          const other = cn.fromAgentId === agentId ? cn.toAgentId : cn.fromAgentId;
          return other === (agentId === giver.agentId ? target.agentId : giver.agentId);
        });
        if (found?.connectionTopicId && !found.connectionTopicId.startsWith('seed-')) {
          connectionTopicId = found.connectionTopicId;
          break;
        }
      }

      if (connectionTopicId) {
        log('HCS', c.cyan, `Fetching messages from Hedera mirror node — topic ${c.gray}${connectionTopicId}${c.reset}...`);
        const mirrorRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/topics/${connectionTopicId}/messages?limit=10&order=desc`);
        const mirrorData = await mirrorRes.json();
        const messages = (mirrorData.messages || []).reverse().map(m => {
          try {
            const decoded = JSON.parse(Buffer.from(m.message, 'base64').toString());
            return { sender: decoded.m || decoded.sender || 'Agent', data: decoded.data || decoded.message || '' };
          } catch { return null; }
        }).filter(Boolean);

        if (messages.length > 0) {
          conversationContext = messages.slice(-6).map(m => {
            const senderName = agents.find(a => a.agentId === (m.sender || m.m))?.name || m.sender || 'Agent';
            return `${senderName}: ${m.data || m.message || ''}`;
          }).join('\n');
          log('✓', c.green, `Found ${messages.length} messages on-chain — evaluating real interaction`);
          console.log(`  ${c.purple}${c.bold}Verify:${c.reset} ${c.cyan}https://hashscan.io/testnet/topic/${connectionTopicId}${c.reset}`);
        } else {
          log('⚠', c.yellow, `No messages found on topic ${connectionTopicId} (may need a few seconds to propagate)`);
        }
      } else {
        log('⚠', c.yellow, `No HCS connection found — using generic evaluation`);
      }
    } catch (e) {
      log('⚠', c.yellow, `Mirror node fetch failed: ${e.message}`);
    }

    const evalPrompt = conversationContext
      ? `You just reviewed this real conversation between agents (fetched from Hedera HCS):\n\n${conversationContext}\n\nBased on ${target.name}'s actual responses, rate their performance (1-100). Were they helpful, accurate, and professional?\nReply ONLY with: {"score": <number>, "comment": "<one sentence about their actual responses>"}`
      : `Rate ${target.name}'s overall quality as an AI agent on a scale of 1-100. Consider professionalism, accuracy, and usefulness. Reply ONLY with: {"score": <number>, "comment": "<one sentence>"}`;

    const ratingResponse = await aiChat(giver.model,
      'You are an AI agent evaluating another agent based on real interaction data. Be honest and specific. Respond only with valid JSON.',
      evalPrompt
    );
    try {
      const parsed = JSON.parse(ratingResponse.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      score = Math.min(100, Math.max(1, parseInt(parsed.score)));
      if (isNaN(score)) throw new Error('No valid score in AI response');
      comment = parsed.comment || 'AI evaluation complete.';
    } catch (e) {
      log('⚠', c.yellow, `AI response could not be parsed: ${e.message}`);
      log('⚠', c.yellow, `Raw response: "${ratingResponse.substring(0, 100)}"`);
      score = parseInt(await ask(`  AI failed to parse. Enter score manually (1-100): ${c.purple}→ ${c.reset}`)) || 50;
      score = Math.min(100, Math.max(1, score));
      comment = await ask(`  Comment: ${c.purple}→ ${c.reset}`) || 'Manual fallback after AI parse failure.';
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
      console.log(`\n  ${c.purple}${c.bold}Verify on HashScan:${c.reset}`);
      console.log(`  ${c.cyan}https://hashscan.io/testnet/topic/0.0.8264959${c.reset}`);

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
  console.log(`  ${c.gray}Chat → Autonomous Feedback → Reputation Update${c.reset}\n`);

  // Step 1: Conversation
  const chatHistory = await scenarioConversation();
  await waitForEnter();

  // Step 2: Autonomous feedback based on conversation
  divider('AUTONOMOUS FEEDBACK');
  const agentA = chatHistory[0].agent;
  const agentB = chatHistory[1].agent;

  log('AI', c.green, `${agentA.name} evaluates the conversation with ${agentB.name}...`);

  // Use in-memory chat history AND fetch from HCS for verification
  const summary = chatHistory.map(m => `${m.name}: ${m.text}`).join('\n');

  // Also fetch from HCS to show the real on-chain data
  let hcsTopicId = null;
  try {
    const connRes = await api(`/connections/${agentA.agentId}`);
    const conn = (connRes.connections || []).find(cn => cn.toAgentId === agentB.agentId || cn.fromAgentId === agentB.agentId);
    if (conn?.connectionTopicId && !conn.connectionTopicId.startsWith('seed-')) {
      hcsTopicId = conn.connectionTopicId;
      log('SDK', c.purple, `Verifying conversation on HCS topic ${c.gray}${hcsTopicId}${c.reset}...`);
      const mirrorRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/topics/${hcsTopicId}/messages?limit=5&order=desc`);
      const mirrorData = await mirrorRes.json();
      const hcsCount = mirrorData.messages?.length || 0;
      log('✓', c.green, `${hcsCount} messages verified on Hedera mirror node`);
      console.log(`  ${c.purple}${c.bold}Verify:${c.reset} ${c.cyan}https://hashscan.io/testnet/topic/${hcsTopicId}${c.reset}`);
    }
  } catch (e) {}

  const ratingResponse = await aiChat(agentA.model,
    'You are an AI agent evaluating another agent based on a real conversation. Be honest — if the agent failed to answer the question or was unhelpful, give a LOW score. Respond only with valid JSON.',
    `You just had this conversation:\n\n${summary}\n\nRate ${agentB.name}'s performance (1-100). Did they actually answer the question? Were they helpful, accurate, and professional? Be critical.\nReply ONLY with: {"score": <number>, "comment": "<one sentence about their actual performance>"}`
  );

  let score, comment;
  try {
    const parsed = JSON.parse(ratingResponse.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    score = Math.min(100, Math.max(1, parseInt(parsed.score)));
    if (isNaN(score)) throw new Error('No valid score');
    comment = parsed.comment || 'AI evaluation complete.';
  } catch (e) {
    log('⚠', c.yellow, `AI parse failed: ${e.message}. Raw: "${ratingResponse.substring(0, 80)}"`);
    score = parseInt(await ask(`  Enter score manually (1-100): ${c.purple}→ ${c.reset}`)) || 50;
    score = Math.min(100, Math.max(1, score));
    comment = 'Manual fallback after AI parse failure.';
  }

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
      console.log(`\n  ${c.purple}${c.bold}Verify on HashScan:${c.reset}`);
      console.log(`  ${c.cyan}https://hashscan.io/testnet/topic/0.0.8264959${c.reset}`);
      if (hcsTopicId) {
        console.log(`  ${c.cyan}Conversation: https://hashscan.io/testnet/topic/${hcsTopicId}${c.reset}`);
      }
    }
  } catch (e) {
    log('⚠', c.yellow, `Feedback: ${e.message}`);
  }

  await waitForEnter();

  // Step 3: Reputation update
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

  console.log(`\n  ${c.purple}${c.bold}Verify on HashScan:${c.reset}`);
  console.log(`  ${c.cyan}Agent: https://hashscan.io/testnet/account/${agent.agentId}${c.reset}`);
  console.log(`  ${c.cyan}Contract: https://hashscan.io/testnet/contract/0.0.8291516${c.reset}`);
  console.log(`  ${c.cyan}Feedback Topic: https://hashscan.io/testnet/topic/0.0.8264959${c.reset}`);
}

// ============================================================
// SCENARIO 5: Validator Selection Check
// ============================================================
async function scenarioArbiterCheck() {
  divider('ARBITER ELIGIBILITY');
  log('ALGO', c.purple, 'Checking all agents for arbiter eligibility...\n');

  // Refresh agent data
  await loadAgents();

  for (const agent of agents) {
    const rep = agent.reputation || {};
    const score = rep.overallScore || 0;
    const activity = rep.feedbackCount || 0;
    const tier = rep.trustTier || 'UNVERIFIED';

    // Query real arbiter stake from backend (which reads from smart contract)
    let arbiterStakeHbar = 0;
    try {
      const stakeRes = await api(`/staking/${agent.agentId}`);
      arbiterStakeHbar = Number(stakeRes.arbiterStake || 0) / 1e8;
    } catch (e) {}

    const hasArbiterStake = arbiterStakeHbar >= 10;
    const checks = [
      { label: 'Staked ≥ 10 HBAR', pass: hasArbiterStake, icon: hasArbiterStake ? '✓' : '✗', detail: `${arbiterStakeHbar.toFixed(0)} HBAR` },
      { label: `Score ≥ 500 (Trusted)`, pass: score >= 500, icon: score >= 500 ? '✓' : '✗', detail: `${score}/500` },
      { label: `Activity ≥ 10`, pass: activity >= 10, icon: activity >= 10 ? '✓' : '✗', detail: `${activity}/10` },
    ];

    const eligible = checks.every(ch => ch.pass);

    console.log(`  ${eligible ? c.green + '✓ ELIGIBLE' : c.red + '✗ NOT ELIGIBLE'}${c.reset}  ${agent.color}${c.bold}${agent.name}${c.reset} ${c.gray}(${tier} — ${score}/1000)${c.reset}`);
    checks.forEach(ch => {
      console.log(`    ${ch.pass ? c.green : c.red}${ch.icon}${c.reset} ${ch.label} ${ch.detail ? c.gray + '(' + ch.detail + ')' + c.reset : ''}`);
    });
    console.log();
  }

  console.log(`  ${c.gray}Arbiters resolve disputes between agents.${c.reset}`);
  console.log(`  ${c.gray}They receive disputes via HCS-10 and vote to uphold or dismiss.${c.reset}`);
  console.log(`  ${c.gray}Bad arbiters lose reputation and eligibility.${c.reset}`);
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
// SCENARIO 6: File Dispute
// ============================================================
async function scenarioFileDispute() {
  divider('FILE DISPUTE');

  console.log(`  ${c.gray}The agent who RECEIVED the feedback disputes it.${c.reset}\n`);

  const disputer = await selectAgent('Select agent filing the dispute (feedback receiver):');

  // Fetch feedback for this agent
  log('SDK', c.purple, `Fetching feedback received by ${disputer.name}...`);
  const fbRes = await api(`/feedback?agentId=${disputer.agentId}`);
  const feedbackList = fbRes.feedback || [];

  if (feedbackList.length === 0) {
    log('⚠', c.yellow, `No feedback found for ${disputer.name}. Submit feedback first (option 2).`);
    return;
  }

  console.log(`\n  ${c.bold}Feedback received by ${disputer.color}${disputer.name}${c.reset}:\n`);
  feedbackList.forEach((fb, i) => {
    const giverAgent = agents.find(a => a.agentId === fb.fromAgentId);
    const giverName = giverAgent?.name || fb.fromAgentId;
    console.log(`  ${c.bold}${i + 1}.${c.reset} Score: ${fb.value >= 60 ? c.green : c.red}${fb.value}/100${c.reset} | From: ${c.cyan}${giverName}${c.reset} | Tag: ${fb.tag1 || 'none'} | ${c.gray}${fb.feedbackId?.substring(0, 8)}...${c.reset}`);
  });

  const choice = await ask(`\n  Select feedback # to dispute: ${c.purple}→ ${c.reset}`);
  const selectedFb = feedbackList[parseInt(choice) - 1];
  if (!selectedFb) {
    log('✗', c.red, 'Invalid selection.');
    return;
  }

  const reason = await ask(`  Reason for dispute: ${c.purple}→ ${c.reset}`) || 'Unfair rating — does not reflect actual interaction quality.';

  console.log(`\n  ${c.yellow}${c.bold}Filing dispute...${c.reset}`);
  console.log(`  ${c.gray}Bond: 2 HBAR (deposited to smart contract)${c.reset}`);
  console.log(`  ${c.gray}Reason: "${reason}"${c.reset}\n`);

  try {
    const res = await api('/staking/dispute', {
      method: 'POST',
      headers: { 'X-Agent-Key': disputer.apiKey },
      body: JSON.stringify({ feedbackId: selectedFb.feedbackId, reason }),
    });

    if (res.statusCode && res.statusCode >= 400) {
      log('✗', c.red, `Dispute failed: ${res.message}`);
      return;
    }

    const dispute = res.dispute;
    log('✓', c.green, `Dispute filed! ID: ${c.bold}#${dispute?.id}${c.reset}`);

    if (res.hcsSequenceNumber) {
      log('HCS', c.cyan, `DISPUTE_FILED logged to HCS — Sequence: ${c.bold}${res.hcsSequenceNumber}${c.reset}`);
    }

    if (dispute?.status === 'voting') {
      const arbiters = JSON.parse(dispute.selectedArbiters || '[]');
      const arbiterAgent = agents.find(a => a.agentId === arbiters[0]);
      log('ALGO', c.yellow, `Arbiter selected: ${c.bold}${arbiterAgent?.name || arbiters[0]}${c.reset}`);
      log('HCS-10', c.cyan, `ARBITRATION_REQUEST sent to arbiter's inbound topic`);
      console.log(`\n  ${c.purple}${c.bold}Verify on HashScan:${c.reset}`);
      console.log(`  ${c.cyan}Dispute: https://hashscan.io/testnet/topic/0.0.8264959${c.reset}`);
      if (arbiterAgent?.inboundTopicId) {
        console.log(`  ${c.cyan}Arbiter topic: https://hashscan.io/testnet/topic/${arbiterAgent.inboundTopicId}${c.reset}`);
      }
      console.log(`\n  ${c.gray}The arbiter has 48 hours to vote. Use option 7 to respond as arbiter.${c.reset}`);
    } else {
      log('⚠', c.yellow, `No eligible arbiters found. Dispute is pending.`);
      console.log(`  ${c.gray}Requirements: Score ≥ 500, Activity ≥ 10, Arbiter stake ≥ 10 HBAR${c.reset}`);
    }
  } catch (e) {
    log('✗', c.red, `Error: ${e.message}`);
  }
}

// ============================================================
// SCENARIO 7: Resolve Dispute (Arbiter)
// ============================================================
async function scenarioResolveDispute() {
  divider('RESOLVE DISPUTE (ARBITER)');

  console.log(`  ${c.gray}The selected arbiter reviews the dispute and votes.${c.reset}\n`);

  const arbiter = await selectAgent('Select arbiter agent:');

  // Fetch pending disputes
  log('SDK', c.purple, 'Fetching pending disputes...');
  const disputesRes = await api('/staking/disputes/all');
  const disputes = (disputesRes.disputes || disputesRes || []).filter(d => d.status === 'voting');

  if (disputes.length === 0) {
    log('⚠', c.yellow, 'No disputes awaiting arbitration. File a dispute first (option 6).');
    return;
  }

  console.log(`\n  ${c.bold}Disputes awaiting arbitration:${c.reset}\n`);
  disputes.forEach((d, i) => {
    const disputerAgent = agents.find(a => a.agentId === d.disputerId);
    const accusedAgent = agents.find(a => a.agentId === d.accusedId);
    const arbiterIds = JSON.parse(d.selectedArbiters || '[]');
    const isAssigned = arbiterIds.includes(arbiter.agentId);
    console.log(`  ${c.bold}${i + 1}.${c.reset} Dispute #${d.id} | ${c.cyan}${disputerAgent?.name || d.disputerId}${c.reset} vs ${c.red}${accusedAgent?.name || d.accusedId}${c.reset} | ${isAssigned ? c.green + 'YOU ARE ARBITER' : c.gray + 'Not assigned'}${c.reset}`);
    console.log(`     ${c.gray}Reason: "${d.reason}"${c.reset}`);
  });

  const choice = await ask(`\n  Select dispute # to resolve: ${c.purple}→ ${c.reset}`);
  const selectedDispute = disputes[parseInt(choice) - 1];
  if (!selectedDispute) {
    log('✗', c.red, 'Invalid selection.');
    return;
  }

  // Arbiter decides
  const mode = await ask(`\n  ${c.bold}How should ${arbiter.name} decide?${c.reset}\n  ${c.green}1.${c.reset} Manual (you decide)\n  ${c.green}2.${c.reset} AI-powered (${arbiter.name}'s LLM evaluates)\n\n  ${c.purple}→ ${c.reset}`);

  let upheld, notes;

  if (mode === '2') {
    log('AI', c.green, `${arbiter.name} is evaluating the dispute...`);
    const disputerAgent = agents.find(a => a.agentId === selectedDispute.disputerId);
    const accusedAgent = agents.find(a => a.agentId === selectedDispute.accusedId);

    const aiResponse = await aiChat(arbiter.model,
      'You are an impartial arbiter evaluating a dispute between two AI agents. You must decide if the feedback was fair or unfair. Respond ONLY with valid JSON.',
      `Dispute details:
- ${disputerAgent?.name || 'Agent'} received feedback and is disputing it
- ${accusedAgent?.name || 'Agent'} gave the feedback
- Reason for dispute: "${selectedDispute.reason}"
- Original feedback score: unknown

Should this dispute be upheld (feedback was unfair) or dismissed (feedback was fair)?
Reply ONLY with: {"upheld": true/false, "reasoning": "<one sentence>"}`
    );

    try {
      const parsed = JSON.parse(aiResponse.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      upheld = !!parsed.upheld;
      notes = parsed.reasoning || 'AI evaluation complete.';
    } catch (e) {
      log('⚠', c.yellow, `AI parse failed. Raw: "${aiResponse.substring(0, 80)}"`);
      const manualVote = await ask(`  AI failed to parse. Uphold dispute? (y/n): ${c.purple}→ ${c.reset}`);
      upheld = manualVote.toLowerCase() === 'y' || manualVote.toLowerCase() === 'yes';
      notes = 'Manual decision after AI parse failure.';
    }

    log('AI', c.green, `${arbiter.name} decided: ${upheld ? c.green + 'UPHELD' : c.red + 'DISMISSED'}${c.reset}`);
    console.log(`  ${c.gray}  Reasoning: "${notes}"${c.reset}`);
  } else {
    const vote = await ask(`  Uphold dispute? (y/n): ${c.purple}→ ${c.reset}`);
    upheld = vote.toLowerCase() === 'y' || vote.toLowerCase() === 'yes';
    notes = await ask(`  Notes: ${c.purple}→ ${c.reset}`) || (upheld ? 'Dispute upheld by arbiter.' : 'Dispute dismissed by arbiter.');
  }

  console.log(`\n  ${c.yellow}${c.bold}Submitting arbiter vote...${c.reset}`);

  try {
    const res = await api(`/staking/dispute/${selectedDispute.id}/resolve`, {
      method: 'POST',
      headers: { 'X-Agent-Key': arbiter.apiKey },
      body: JSON.stringify({ upheld, notes }),
    });

    if (res.statusCode && res.statusCode >= 400) {
      log('✗', c.red, `Resolution failed: ${res.message}`);
      return;
    }

    const dispute = res.dispute;
    log('✓', c.green, `Dispute resolved: ${c.bold}${upheld ? 'UPHELD' : 'DISMISSED'}${c.reset}`);

    if (res.hcsSequenceNumber) {
      log('HCS', c.cyan, `${upheld ? 'DISPUTE_UPHELD' : 'DISPUTE_DISMISSED'} logged to HCS — Sequence: ${c.bold}${res.hcsSequenceNumber}${c.reset}`);
    }

    if (upheld) {
      log('SLASH', c.red, `Feedback giver's stake slashed by 10%`);
      if (res.txId) {
        log('CONTRACT', c.purple, `Slash executed on smart contract — TX: ${c.gray}${res.txId}${c.reset}`);
      }
      console.log(`\n  ${c.green}Disputer's 2 HBAR bond returned.${c.reset}`);
    } else {
      console.log(`\n  ${c.red}Disputer loses their 2 HBAR bond. Goes to the accused as compensation.${c.reset}`);
    }

    console.log(`\n  ${c.purple}${c.bold}Verify on HashScan:${c.reset}`);
    console.log(`  ${c.cyan}Dispute result: https://hashscan.io/testnet/topic/0.0.8264959${c.reset}`);
    console.log(`  ${c.cyan}Contract: https://hashscan.io/testnet/contract/0.0.8291516${c.reset}`);
  } catch (e) {
    log('✗', c.red, `Error: ${e.message}`);
  }
}

// ============================================================
// SCENARIO 8: Talk to an Agent (interactive chat)
// ============================================================
async function scenarioTalkToAgent() {
  divider('TALK TO AN AGENT');
  console.log(`  ${c.gray}Chat with an AI agent via HCS-10. Type your messages and the agent responds.${c.reset}`);
  console.log(`  ${c.gray}Type "exit" or "quit" to end the conversation.${c.reset}\n`);

  const agent = await selectAgent('Select agent to talk to:');

  // Set up connection topic
  log('HCS-10', c.cyan, `Setting up connection with ${agent.name}...`);
  let connectionTopicId = null;

  // Use operator account as the "user" identity
  const userId = process.env.HEDERA_OPERATOR_ID || '0.0.5989261';

  try {
    const connRes = await api(`/connections/${agent.agentId}`);
    const conn = connRes.connections?.find(c => c.fromAgentId === userId || c.toAgentId === userId);
    if (conn && conn.connectionTopicId && !conn.connectionTopicId.startsWith('seed-')) {
      connectionTopicId = conn.connectionTopicId;
      log('✓', c.green, `Existing connection found — Topic: ${c.gray}${connectionTopicId}${c.reset}`);
    }
  } catch (e) {}

  if (!connectionTopicId) {
    try {
      const res = await api('/connections/seed', {
        method: 'POST',
        body: JSON.stringify({ fromAgentId: userId, toAgentId: agent.agentId }),
      });
      connectionTopicId = res.connection?.connectionTopicId || res.connectionTopicId;
      if (connectionTopicId && !connectionTopicId.startsWith('seed-') && !connectionTopicId.startsWith('local-')) {
        log('✓', c.green, `HCS-10 connection created — Topic: ${c.gray}${connectionTopicId}${c.reset}`);
      }
    } catch (e) {
      log('⚠', c.yellow, 'Could not create connection topic');
    }
  }

  console.log(`\n  ${c.purple}${c.bold}Connected to ${agent.name}${c.reset} ${c.gray}(${agent.model})${c.reset}`);
  console.log(`  ${c.gray}─────────────────────────────────────────${c.reset}\n`);

  const chatHistory = [];

  while (true) {
    const userMessage = await ask(`  ${c.green}${c.bold}You:${c.reset} `);

    if (!userMessage.trim() || userMessage.toLowerCase() === 'exit' || userMessage.toLowerCase() === 'quit') {
      console.log(`\n  ${c.gray}Chat ended.${c.reset}`);
      break;
    }

    // Log user message to HCS
    if (connectionTopicId) {
      try {
        await api('/connections/message', {
          method: 'POST',
          body: JSON.stringify({ connectionTopicId, message: userMessage, sender: userId }),
        });
        log('HCS', c.gray, `Your message logged to topic ${connectionTopicId}`);
      } catch (e) {}
    }

    // Build context for the agent
    chatHistory.push({ role: 'user', content: userMessage });

    const contextMessages = chatHistory.slice(-10).map(m =>
      `${m.role === 'user' ? 'User' : agent.name}: ${m.content}`
    ).join('\n');

    log(agent.name, agent.color, `${c.dim}Thinking...${c.reset}`);
    const response = await aiChat(agent.model, agent.systemPrompt,
      `You are ${agent.name}. A user is talking to you. Here is the conversation so far:\n\n${contextMessages}\n\nRespond naturally and helpfully. Keep responses concise.`);

    chatHistory.push({ role: 'assistant', content: response });

    console.log(`\n  ${agent.color}${c.bold}  ${agent.name}:${c.reset}`);
    response.split('\n').forEach(line => console.log(`  ${c.white}  ${line}${c.reset}`));
    console.log();

    // Log agent response to HCS
    if (connectionTopicId) {
      try {
        await api('/connections/message', {
          method: 'POST', headers: { 'X-Agent-Key': agent.apiKey },
          body: JSON.stringify({ connectionTopicId, message: response, sender: agent.agentId }),
        });
        log('HCS', c.gray, `${agent.name}'s response logged to topic ${connectionTopicId}`);
      } catch (e) {}
    }
  }

  // Show verification link
  if (connectionTopicId) {
    console.log(`\n  ${c.purple}${c.bold}Verify conversation on HashScan:${c.reset}`);
    console.log(`  ${c.cyan}https://hashscan.io/testnet/topic/${connectionTopicId}${c.reset}\n`);
  }

  console.log(`  ${c.gray}Messages exchanged: ${chatHistory.length}${c.reset}`);
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
        await scenarioArbiterCheck();
        await waitForEnter('Press ENTER to return to menu...');
        break;
      case '6':
        await scenarioFileDispute();
        await waitForEnter('Press ENTER to return to menu...');
        break;
      case '7':
        await scenarioResolveDispute();
        await waitForEnter('Press ENTER to return to menu...');
        break;
      case '8':
        await scenarioTalkToAgent();
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
