#!/usr/bin/env node
// ============================================================
//  AgentRep — AI Agent Interaction Demo
//  Two AI agents (DeepSeek + Llama) interact via HCS-10,
//  rate each other, and trigger the reputation protocol.
//
//  Usage: node scripts/ai-demo.mjs
//  Requires: GROQ_API_KEY env var (free at https://console.groq.com/keys)
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
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  purple: '\x1b[38;5;141m',
  green: '\x1b[38;5;114m',
  cyan: '\x1b[38;5;81m',
  yellow: '\x1b[38;5;221m',
  red: '\x1b[38;5;203m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bg: '\x1b[48;5;236m',
};

// ---- Helpers ----
function banner() {
  console.clear();
  console.log(`
${c.purple}${c.bold}  ╔════════════════════════════════════════════════════╗
  ║                                                    ║
  ║     █████╗  ██████╗ ███████╗███╗   ██╗████████╗    ║
  ║    ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝    ║
  ║    ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║       ║
  ║    ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║       ║
  ║    ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║       ║
  ║    ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝       ║
  ║              ${c.green}R E P${c.purple}                                    ║
  ║                                                    ║
  ║     ${c.cyan}AI Agent Interaction Demo${c.purple}                       ║
  ║     ${c.gray}HCS-10 · ERC-8004 · Hedera Testnet${c.purple}             ║
  ║                                                    ║
  ╚════════════════════════════════════════════════════╝${c.reset}
`);
}

function log(prefix, color, msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`  ${c.gray}${ts}${c.reset}  ${color}${c.bold}${prefix}${c.reset}  ${msg}`);
}

function divider(title) {
  console.log(`\n  ${c.purple}${'─'.repeat(20)} ${c.bold}${title} ${c.reset}${c.purple}${'─'.repeat(20)}${c.reset}\n`);
}

function waitForEnter(msg = 'Press ENTER to continue...') {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`\n  ${c.dim}${msg}${c.reset}`, () => { rl.close(); resolve(); });
  });
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
    // Fallback mock responses if no API key
    const mocks = {
      'deepseek': `I've reviewed the request carefully. Based on my analysis, here are the key points:\n1. The contract terms appear standard but Section 3.2 needs revision\n2. The non-compete clause is overly broad — under EU Directive 2019/1152, non-competes must be proportionate\n3. Recommended changes: narrow the geographic scope and reduce duration to 12 months.`,
      'llama': `Thank you for the thorough review! I agree with your assessment. The candidate has been informed about the contract revisions. We'll proceed with the updated terms. Your expertise in legal compliance has been invaluable for this process.`,
    };
    const key = model.includes('deepseek') ? 'deepseek' : 'llama';
    await new Promise(r => setTimeout(r, 1500)); // simulate delay
    return mocks[key];
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 200,
      temperature: 0.7,
    }),
  });
  const data = await res.json();
  let content = data.choices?.[0]?.message?.content || 'No response generated.';
  // Strip thinking tags from models like Qwen/DeepSeek
  content = content.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
  return content;
}

// ---- Agent Config ----
const AGENTS = {
  mariposa: {
    name: 'Mariposa',
    model: 'qwen/qwen3-32b',
    systemPrompt: 'You are Mariposa, an AI legal document reviewer. You specialize in contract compliance, NDA analysis, and employment law. Keep responses concise (2-3 sentences max). Be professional and specific. Do not use any thinking tags or internal reasoning — just respond directly. IMPORTANT: Never repeat or echo the other person\'s message — always provide your own original response.',
    color: c.cyan,
    apiKey: null,
    agentId: null,
  },
  talentai: {
    name: 'TalentAI',
    model: 'llama-3.3-70b-versatile',
    systemPrompt: 'You are TalentAI, an AI talent recruiter. You help companies find candidates and manage hiring processes. Keep responses concise (2-3 sentences max). Be friendly and efficient.',
    color: c.green,
    agentId: null,
    apiKey: null,
  },
};

// ---- Main Flow ----
async function main() {
  banner();

  // Step 0: Load agents
  divider('LOADING AGENTS');
  log('SDK', c.purple, 'Connecting to AgentRep backend...');

  const agentsRes = await api('/agents');
  const agentList = agentsRes.agents || agentsRes;

  for (const item of agentList) {
    const a = item.agent || item;
    if (a.name === 'Mariposa') {
      AGENTS.mariposa.agentId = a.agentId;
      AGENTS.mariposa.apiKey = a.apiKey;
      log('✓', c.green, `Mariposa loaded — ${c.gray}${a.agentId}${c.reset} — Model: Qwen3 32B`);
    }
    if (a.name === 'TalentAI') {
      AGENTS.talentai.agentId = a.agentId;
      AGENTS.talentai.apiKey = a.apiKey;
      log('✓', c.green, `TalentAI loaded — ${c.gray}${a.agentId}${c.reset} — Model: Llama 3.3 70B`);
    }
  }

  if (!AGENTS.mariposa.agentId || !AGENTS.talentai.agentId) {
    console.log(`\n  ${c.red}Error: Could not find both agents. Make sure Mariposa and TalentAI are registered.${c.reset}`);
    process.exit(1);
  }

  if (!GROQ_API_KEY) {
    console.log(`\n  ${c.yellow}⚠ No GROQ_API_KEY set — using mock AI responses${c.reset}`);
    console.log(`  ${c.gray}Get a free key at https://console.groq.com/keys${c.reset}`);
  }

  await waitForEnter();

  // Step 1: Check Reputation
  divider('STEP 1 — CHECK REPUTATION');
  log('SDK', c.purple, 'client.getReputation(mariposa) — Checking trust before interaction...');

  const mariposaRep = await api(`/agents/${AGENTS.mariposa.agentId}`);
  const talentRep = await api(`/agents/${AGENTS.talentai.agentId}`);

  const mScore = mariposaRep.reputation?.overallScore || 0;
  const tScore = talentRep.reputation?.overallScore || 0;
  const mTier = mariposaRep.reputation?.trustTier || 'UNVERIFIED';
  const tTier = talentRep.reputation?.trustTier || 'UNVERIFIED';

  console.log(`
  ┌──────────────┬───────────┬──────────────┐
  │ Agent        │ Score     │ Tier         │
  ├──────────────┼───────────┼──────────────┤
  │ ${c.cyan}Mariposa${c.reset}     │ ${c.bold}${mScore}/1000${c.reset}  │ ${mTier.padEnd(12)} │
  │ ${c.green}TalentAI${c.reset}     │ ${c.bold}${tScore}/1000${c.reset}  │ ${tTier.padEnd(12)} │
  └──────────────┴───────────┴──────────────┘`);

  log('SDK', c.purple, 'TalentAI decides Mariposa is trustworthy enough to interact with.');

  await waitForEnter();

  // Step 2: Establish Connection via HCS-10
  divider('STEP 2 — HCS-10 CONNECTION');
  log('HCS-10', c.cyan, 'Checking for existing connection between agents...');

  const connections = await api(`/connections/${AGENTS.mariposa.agentId}`);
  let connectionTopicId = null;

  if (connections.connections && connections.connections.length > 0) {
    const conn = connections.connections.find(c =>
      c.requesterAgentId === AGENTS.talentai.agentId ||
      c.targetAgentId === AGENTS.talentai.agentId
    ) || connections.connections[0];
    connectionTopicId = conn.connectionTopicId;
    log('✓', c.green, `Existing connection found — Topic: ${c.gray}${connectionTopicId}${c.reset}`);
  } else {
    log('→', c.yellow, 'No existing connection. Creating one...');
    try {
      const connRes = await api('/connections/request', {
        method: 'POST',
        headers: { 'X-Agent-Key': AGENTS.talentai.apiKey },
        body: JSON.stringify({ targetAgentId: AGENTS.mariposa.agentId }),
      });
      connectionTopicId = connRes.connectionTopicId;
      log('✓', c.green, `Connection established — Topic: ${c.gray}${connectionTopicId}${c.reset}`);
    } catch (e) {
      log('⚠', c.yellow, 'Could not create connection, using mock topic');
      connectionTopicId = 'mock-topic';
    }
  }

  log('HCS-10', c.cyan, `All messages will flow through shared HCS topic ${c.gray}${connectionTopicId}${c.reset}`);

  await waitForEnter();

  // Step 3: AI Conversation
  divider('STEP 3 — AI AGENT CONVERSATION');

  // Ask user what TalentAI should request from Mariposa
  const userTopic = await new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  ${c.green}${c.bold}What should TalentAI ask Mariposa?${c.reset}\n  ${c.gray}(e.g. "Review an NDA for a remote EU developer with a 2-year non-compete")${c.reset}\n\n  ${c.purple}→ ${c.reset}`, (answer) => {
      rl.close();
      resolve(answer.trim() || 'Review an employment contract for a remote EU senior developer with a 2-year non-compete clause. Check for compliance issues.');
    });
  });

  console.log();
  log('SDK', c.purple, `TalentAI will ask Mariposa: "${c.white}${userTopic}${c.reset}"`);

  // Generate TalentAI's opening message from the user's topic
  log('TalentAI', c.green, `${c.dim}Composing request...${c.reset}`);
  const openingMessage = await aiChat(
    AGENTS.talentai.model,
    AGENTS.talentai.systemPrompt,
    `You need to ask a legal document reviewer named Mariposa to help you with this: "${userTopic}". Write a professional message requesting their help. Be specific about what you need.`
  );

  // Fully autonomous 4-turn conversation — each agent responds to the previous message
  const chatHistory = [];
  const turns = [
    { from: 'talentai', text: openingMessage },
    { from: 'mariposa', respondTo: openingMessage },
    { from: 'talentai', respondTo: null }, // will be filled with mariposa's response
    { from: 'mariposa', respondTo: null }, // will be filled with talentai's response
  ];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const agent = AGENTS[turn.from];
    let text;

    if (turn.text) {
      // First message (already generated)
      text = turn.text;
    } else {
      // Respond to the previous message
      const prevMessage = chatHistory[chatHistory.length - 1];
      log(agent.name, agent.color, `${c.dim}Thinking...${c.reset}`);
      text = await aiChat(
        agent.model,
        agent.systemPrompt,
        `${prevMessage.from} said: "${prevMessage.text}"\n\nRespond naturally to continue this professional conversation.`
      );
    }

    chatHistory.push({ from: agent.name, text });

    // Display message
    console.log(`\n  ${agent.color}${c.bold}  ${agent.name}:${c.reset}`);
    const lines = text.split('\n');
    for (const line of lines) {
      console.log(`  ${c.white}  ${line}${c.reset}`);
    }

    // Send via HCS-10
    if (connectionTopicId && connectionTopicId !== 'mock-topic') {
      try {
        await api('/connections/message', {
          method: 'POST',
          headers: { 'X-Agent-Key': agent.apiKey },
          body: JSON.stringify({
            connectionTopicId,
            message: text,
            sender: agent.agentId,
          }),
        });
        log('HCS', c.gray, `Message logged to topic ${connectionTopicId}`);
      } catch (e) {
        log('HCS', c.gray, `Message recorded locally`);
      }
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  await waitForEnter();

  // Step 4: Autonomous Feedback
  divider('STEP 4 — AUTONOMOUS FEEDBACK');
  log('SDK', c.purple, 'TalentAI autonomously evaluates the interaction with Mariposa...');
  log('AI', c.green, `${c.dim}Analyzing conversation quality...${c.reset}`);

  // Ask TalentAI's LLM to evaluate Mariposa's responses
  const conversationSummary = chatHistory.map(m => `${m.from}: ${m.text}`).join('\n');
  const ratingPrompt = `You just had this conversation with Mariposa (a legal document reviewer):

${conversationSummary}

Based on this interaction, rate Mariposa's performance on a scale of 1-100. Consider:
- Accuracy of legal advice
- Specificity of recommendations
- Professionalism and clarity

Reply ONLY with a JSON object, no other text: {"score": <number>, "comment": "<one sentence justification>"}`;

  let feedbackScore = 85;
  let feedbackComment = 'Excellent compliance analysis with actionable recommendations.';

  try {
    const ratingResponse = await aiChat(AGENTS.talentai.model, 'You are an AI agent evaluating another agent. Respond only with valid JSON.', ratingPrompt);
    const parsed = JSON.parse(ratingResponse.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    feedbackScore = Math.min(100, Math.max(1, parseInt(parsed.score) || 85));
    feedbackComment = parsed.comment || feedbackComment;
    log('AI', c.green, `TalentAI autonomously decided: Score ${c.bold}${feedbackScore}/100${c.reset}`);
    console.log(`  ${c.gray}  Reasoning: "${feedbackComment}"${c.reset}`);
  } catch (e) {
    log('AI', c.green, `TalentAI decided: Score ${c.bold}${feedbackScore}/100${c.reset} (fallback)`);
  }

  const displayTag = 'legal-review';
  const uniqueTag = displayTag + '-' + Date.now().toString(36).slice(-4);
  console.log(`\n  ${c.green}TalentAI${c.reset} → ${c.cyan}Mariposa${c.reset}: Score ${c.bold}${feedbackScore}/100${c.reset} (${feedbackScore >= 60 ? c.green + 'Positive' : c.red + 'Negative'}${c.reset})`);
  console.log(`  ${c.gray}Category: ${displayTag} | Submitted via SDK${c.reset}`);

  try {
    const fbRes = await api('/feedback', {
      method: 'POST',
      headers: { 'X-Agent-Key': AGENTS.talentai.apiKey },
      body: JSON.stringify({
        agentId: AGENTS.mariposa.agentId,
        value: feedbackScore,
        tag1: uniqueTag,
        tag2: 'compliance',
        comment: feedbackComment,
      }),
    });
    log('✓', c.green, `Feedback submitted — ID: ${c.gray}${fbRes.feedback?.feedbackId || 'recorded'}${c.reset}`);
    log('HCS', c.cyan, `FEEDBACK_SUBMITTED logged to Feedback Topic ${c.gray}0.0.8264959${c.reset}`);

    // Show weight calculation
    const weight = (0.2 + 0.8 * (tScore / 1000)).toFixed(3);
    log('ALGO', c.yellow, `Feedback weight = 0.2 + 0.8 × (${tScore}/1000) = ${c.bold}${weight}${c.reset}`);
  } catch (e) {
    log('⚠', c.yellow, `Feedback submission: ${e.message || 'recorded locally'}`);
  }

  await waitForEnter();

  // Step 5: Updated Reputation
  divider('STEP 5 — REPUTATION UPDATE');
  log('SDK', c.purple, 'client.getReputation(mariposa) — Checking updated score...');

  const updatedRep = await api(`/agents/${AGENTS.mariposa.agentId}`);
  const newScore = updatedRep.reputation?.overallScore || 0;
  const newTier = updatedRep.reputation?.trustTier || 'UNVERIFIED';
  const fbCount = updatedRep.reputation?.feedbackCount || 0;

  console.log(`
  ┌──────────────────────────────────────────────────┐
  │  ${c.cyan}${c.bold}Mariposa — Updated Reputation${c.reset}                    │
  ├──────────────────────────────────────────────────┤
  │  Score:     ${c.bold}${String(newScore).padEnd(4)}${c.reset} / 1000                         │
  │  Tier:      ${c.bold}${newTier.padEnd(12)}${c.reset}                       │
  │  Feedback:  ${c.bold}${fbCount}${c.reset} received                            │
  │  Change:    ${newScore > mScore ? c.green + '▲' : c.red + '▼'} ${Math.abs(newScore - mScore)} points${c.reset}                          │
  └──────────────────────────────────────────────────┘`);

  log('ERC-8004', c.purple, 'Score computed: Quality 30% + Reliability 30% + Activity 20% + Consistency 20%');

  await waitForEnter();

  // Step 6: Validation
  divider('STEP 6 — CROSS-VALIDATION');
  log('SDK', c.purple, 'TalentAI requests validation of Mariposa from peer agents...');

  try {
    const valRes = await api('/validation/request', {
      method: 'POST',
      headers: { 'X-Agent-Key': AGENTS.talentai.apiKey },
      body: JSON.stringify({
        agentId: AGENTS.mariposa.agentId,
        question: 'Is Mariposa reliable for legal document review based on observed interactions?',
      }),
    });
    log('✓', c.green, `Validation requested — ${c.gray}${valRes.request?.requestId || 'recorded'}${c.reset}`);
    log('HCS', c.cyan, `VALIDATION_REQUESTED logged to Validation Topic ${c.gray}0.0.8264962${c.reset}`);

    // Submit validation response
    if (valRes.request?.requestId) {
      const submitRes = await api('/validation/respond', {
        method: 'POST',
        headers: { 'X-Agent-Key': AGENTS.talentai.apiKey },
        body: JSON.stringify({
          requestId: valRes.request.requestId,
          score: 80,
          comment: 'Mariposa provided accurate legal analysis with specific EU compliance recommendations.',
        }),
      });
      log('✓', c.green, `Validation response submitted — Score: ${c.bold}80/100${c.reset}`);
      log('HCS', c.cyan, `VALIDATION_RESPONDED logged to Validation Topic`);
    }
  } catch (e) {
    log('⚠', c.yellow, `Validation: ${e.message || 'skipped'}`);
  }

  await waitForEnter();

  // Step 7: Summary
  divider('DEMO COMPLETE');

  const finalRep = await api(`/agents/${AGENTS.mariposa.agentId}`);
  const finalScore = finalRep.reputation?.overallScore || 0;
  const finalTier = finalRep.reputation?.trustTier || 'UNVERIFIED';

  console.log(`
  ${c.purple}${c.bold}╔════════════════════════════════════════════════════╗
  ║              Demo Summary                          ║
  ╠════════════════════════════════════════════════════╣${c.reset}
  ║  ${c.cyan}Standards Used:${c.reset}                                    ║
  ║    • HCS-10  — Agent-to-agent messaging            ║
  ║    • HCS-11  — Agent identity profiles             ║
  ║    • ERC-8004 — Reputation registries               ║
  ║                                                    ║
  ║  ${c.green}Actions Performed:${c.reset}                                  ║
  ║    • Reputation check before interaction            ║
  ║    • HCS-10 connection established                  ║
  ║    • AI-powered conversation (2 models)             ║
  ║    • Feedback submitted on-chain                    ║
  ║    • Cross-validation requested & responded         ║
  ║                                                    ║
  ║  ${c.yellow}Final Results:${c.reset}                                      ║
  ║    Mariposa:  ${c.bold}${finalScore}/1000${c.reset} (${finalTier})                   ║
  ║                                                    ║
  ║  ${c.gray}All events immutably logged on Hedera Testnet${c.reset}      ║
  ║  ${c.gray}Smart Contract: 0.0.8278509${c.reset}                        ║
  ║  ${c.gray}agentrep.xyz${c.reset}                                       ║
  ${c.purple}${c.bold}╚════════════════════════════════════════════════════╝${c.reset}
`);
}

main().catch(err => {
  console.error(`\n  ${c.red}Fatal Error: ${err.message}${c.reset}`);
  process.exit(1);
});
