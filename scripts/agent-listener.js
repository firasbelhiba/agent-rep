#!/usr/bin/env node
// ============================================================
// AgentRep — Agent Listener
// Runs an agent that listens for messages and auto-responds.
// Uses the agent-rep-sdk AgentRunner under the hood.
//
// Usage:  node scripts/agent-listener.js
// ============================================================

const readline = require('readline');
const path = require('path');

const API_URL = process.env.API_URL || 'http://localhost:4000/api';

// ── Helpers ──────────────────────────────────────────────────

function rl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(prompt) {
  return new Promise((resolve) => {
    const r = rl();
    r.question(prompt, (answer) => { r.close(); resolve(answer.trim()); });
  });
}

function banner() {
  const M = '\x1b[35m';  // magenta
  const C = '\x1b[36m';  // cyan
  const W = '\x1b[37m';  // white
  const B = '\x1b[1m';   // bold
  const R = '\x1b[0m';   // reset
  console.log();
  console.log(`${B}${M}    ╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`    ║                                                                  ║`);
  console.log(`    ║      █████╗  ██████╗ ███████╗███╗   ██╗████████╗                 ║`);
  console.log(`    ║     ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝                 ║`);
  console.log(`    ║     ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║                    ║`);
  console.log(`    ║     ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║                    ║`);
  console.log(`    ║     ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║                    ║`);
  console.log(`    ║     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝                    ║`);
  console.log(`    ║                                                                  ║`);
  console.log(`    ║     ██████╗ ███████╗██████╗                                      ║`);
  console.log(`    ║     ██╔══██╗██╔════╝██╔══██╗                                     ║`);
  console.log(`    ║     ██████╔╝█████╗  ██████╔╝                                     ║`);
  console.log(`    ║     ██╔══██╗██╔══╝  ██╔═══╝                                      ║`);
  console.log(`    ║     ██║  ██║███████╗██║                                           ║`);
  console.log(`    ║     ╚═╝  ╚═╝╚══════╝╚═╝                                           ║`);
  console.log(`    ║                                                                  ║`);
  console.log(`    ║  ${C}Agent Listener — HCS-10 Autonomous Responder${M}                  ║`);
  console.log(`    ║  ${W}Powered by agent-rep-sdk${M}                                       ║`);
  console.log(`    ║                                                                  ║`);
  console.log(`    ╚══════════════════════════════════════════════════════════════════╝${R}`);
  console.log();
}

function timestamp() {
  return new Date().toLocaleTimeString();
}

// ── Agent Responses ─────────────────────────────────────────
// Simple response logic — in production this would call an LLM

function generateResponse(agentName, agentSkills, messageText) {
  const text = String(messageText).toLowerCase();

  if (text.includes('hello') || text.includes('hi') || text.includes('hey')) {
    return `Hello! I'm ${agentName}, ready to assist. My skills include: ${agentSkills.join(', ')}. How can I help?`;
  }

  if (text.includes('reputation') || text.includes('score') || text.includes('trust')) {
    return `You can check my reputation score on the AgentRep platform. My work is backed by on-chain feedback and validations recorded on Hedera.`;
  }

  if (text.includes('capabilities') || text.includes('what can you do') || text.includes('skills')) {
    return `I specialize in: ${agentSkills.join(', ')}. I can help with tasks related to these areas. All interactions are recorded on Hedera for transparency.`;
  }

  if (text.includes('hire') || text.includes('task') || text.includes('job') || text.includes('work')) {
    return `I'd be happy to take on that task! Before we proceed, you can verify my reputation score and past feedback on AgentRep. Once we complete the work, you can leave feedback that updates my on-chain reputation.`;
  }

  if (text.includes('price') || text.includes('cost') || text.includes('rate') || text.includes('fee')) {
    return `My rates depend on the task complexity. We can negotiate terms here, and the agreement will be verifiable on Hedera. Want to discuss the specifics?`;
  }

  if (text.includes('analyze') || text.includes('analysis') || text.includes('data')) {
    return `I can help with that analysis. Send me the details and I'll get started. The results and our interaction will be logged on HCS for auditability.`;
  }

  if (text.includes('thank') || text.includes('great') || text.includes('awesome')) {
    return `Thank you! If you're satisfied with my work, I'd appreciate a positive feedback entry on AgentRep — it helps build my on-chain reputation!`;
  }

  return `Thanks for your message! I'm ${agentName} and I received: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}". How can I assist you further?`;
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  banner();

  // Fetch agents to show available options
  let agents;
  try {
    const res = await fetch(`${API_URL}/agents`);
    const data = await res.json();
    agents = (data.agents || []).filter(a => a.agent.hcs10Registered);
  } catch (e) {
    console.error('✗ Failed to connect to backend at', API_URL);
    console.error('  Make sure the backend is running: cd backend && npm run start:dev');
    process.exit(1);
  }

  if (agents.length === 0) {
    console.error('✗ No HCS-10 registered agents found.');
    process.exit(1);
  }

  // Show agents
  console.log('Available agents:\n');
  agents.forEach((a, i) => {
    console.log(`  [${i}] ${a.agent.name} (${a.agent.agentId}) — ${a.agent.skills.join(', ')}`);
  });

  // Select agent
  const agentIdx = await ask('\nSelect agent to run as (number): ');
  const idx = parseInt(agentIdx, 10);
  if (isNaN(idx) || idx < 0 || idx >= agents.length) {
    console.error('✗ Invalid selection');
    process.exit(1);
  }

  const agent = agents[idx].agent;
  const apiKey = agent.apiKey;

  console.log(`\n🤖 Starting listener as ${agent.name} (${agent.agentId})`);
  console.log(`   Skills: ${agent.skills.join(', ')}`);
  console.log(`   API URL: ${API_URL}`);

  // Fetch connections for this agent
  let connections;
  try {
    const res = await fetch(`${API_URL}/connections/${agent.agentId}`);
    const data = await res.json();
    connections = (data.connections || []).filter(
      c => c.status === 'active' && c.connectionTopicId && !c.connectionTopicId.startsWith('seed-')
    );
  } catch (e) {
    console.error('✗ Failed to fetch connections');
    process.exit(1);
  }

  if (connections.length === 0) {
    console.error('\n✗ No active connections with real HCS topics found.');
    console.error('  Create a connection first via the Connections page or SDK.');
    process.exit(1);
  }

  console.log(`\n📡 Monitoring ${connections.length} active connection(s):\n`);
  connections.forEach(conn => {
    const otherId = conn.fromAgentId === agent.agentId ? conn.toAgentId : conn.fromAgentId;
    const otherAgent = agents.find(a => a.agent.agentId === otherId);
    const otherName = otherAgent ? otherAgent.agent.name : otherId;
    console.log(`   • ${agent.name} ↔ ${otherName} — topic: ${conn.connectionTopicId}`);
  });

  // Track last seen sequence per topic
  const lastSeen = new Map();

  // Initialize lastSeen by fetching current messages
  for (const conn of connections) {
    try {
      const res = await fetch(`${API_URL}/connections/messages/${conn.connectionTopicId}`);
      const data = await res.json();
      const msgs = data.messages || [];
      const maxSeq = msgs.reduce((max, m) => Math.max(max, m.sequenceNumber), 0);
      lastSeen.set(conn.connectionTopicId, maxSeq);
    } catch {
      lastSeen.set(conn.connectionTopicId, 0);
    }
  }

  console.log('\n✅ Listener started! Polling every 5 seconds...');
  console.log('   Press Ctrl+C to stop.\n');
  console.log('─'.repeat(60));

  // Poll loop
  const pollInterval = setInterval(async () => {
    for (const conn of connections) {
      try {
        const res = await fetch(`${API_URL}/connections/messages/${conn.connectionTopicId}`);
        const data = await res.json();
        const msgs = (data.messages || []).sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        const currentLast = lastSeen.get(conn.connectionTopicId) || 0;

        const newMsgs = msgs.filter(m => m.sequenceNumber > currentLast);

        for (const msg of newMsgs) {
          lastSeen.set(conn.connectionTopicId, msg.sequenceNumber);

          // Parse message content
          let msgText = '';
          let sender = null;
          try {
            const parsed = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
            msgText = parsed.data || parsed.message || JSON.stringify(parsed);
            sender = parsed.sender;
          } catch {
            msgText = String(msg.data);
          }

          // Only respond to messages from "user" — skip agent's own replies
          if (sender !== 'user') {
            continue;
          }

          const otherId = conn.fromAgentId === agent.agentId ? conn.toAgentId : conn.fromAgentId;
          const otherAgent = agents.find(a => a.agent.agentId === otherId);
          const otherName = otherAgent ? otherAgent.agent.name : (sender || otherId);

          console.log(`\n[${timestamp()}] 📨 Message from ${otherName}:`);
          console.log(`   "${msgText}"`);

          // Generate and send reply
          const reply = generateResponse(agent.name, agent.skills, msgText);
          console.log(`[${timestamp()}] 💬 ${agent.name} replies:`);
          console.log(`   "${reply}"`);

          try {
            const sendRes = await fetch(`${API_URL}/connections/message`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                connectionTopicId: conn.connectionTopicId,
                message: reply,
                sender: agent.agentId,
              }),
            });

            if (sendRes.ok) {
              console.log(`[${timestamp()}] ✅ Reply sent on HCS topic ${conn.connectionTopicId}`);
              // Update lastSeen to skip our own reply next poll
              lastSeen.set(conn.connectionTopicId, (lastSeen.get(conn.connectionTopicId) || 0) + 1);
            } else {
              console.log(`[${timestamp()}] ✗ Failed to send reply`);
            }
          } catch (e) {
            console.log(`[${timestamp()}] ✗ Send error: ${e.message}`);
          }

          console.log('─'.repeat(60));
        }
      } catch (e) {
        // Silent — connection might be temporarily unavailable
      }
    }
  }, 5000);

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n\n🔴 Listener stopped.');
    clearInterval(pollInterval);
    process.exit(0);
  });
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
