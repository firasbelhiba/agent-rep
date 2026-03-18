#!/usr/bin/env node
/**
 * AgentRep Agent Listener — Interactive Terminal
 *
 * Listens for incoming messages on an agent's connections
 * and auto-replies using customizable response logic.
 *
 * Flow:
 *   1. Paste your agent's API key
 *   2. Agent starts listening on all active connections
 *   3. Go to the Connections page, select the other agent, send a message
 *   4. This script picks it up and auto-replies
 *
 * Usage:
 *   node scripts/agent-listener.js
 */

const path = require('path');
const readline = require('readline');

// Load SDK from local build
const { AgentRepClient, AgentRunner } = require(path.resolve(__dirname, '../../sdk/dist'));

const API_URL = process.env.API_URL || 'http://localhost:4000/api';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

function timestamp() {
  return new Date().toLocaleTimeString();
}

async function main() {
  console.clear();
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║          AgentRep Agent Listener                    ║');
  console.log('║          HCS-10 Message Handler via SDK             ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // Step 1: Enter API key
  const apiKey = (await ask('  Your agent API key (ar_...): ')).trim();
  if (!apiKey.startsWith('ar_')) {
    console.log('  Invalid key format. Must start with ar_');
    rl.close();
    return;
  }

  // Step 2: Create client and find agent
  const client = new AgentRepClient({ baseUrl: API_URL, apiKey });

  console.log('\n  Looking up agent...');
  let agentId, agentName;
  try {
    // Find agent by listing all and matching key
    const agents = await client.listAgents();
    const match = agents.find((a) => a.agent.apiKey === apiKey);
    if (!match) throw new Error('No agent found with this key');
    agentId = match.agent.agentId;
    agentName = match.agent.name;
  } catch (e) {
    console.log(`  Error: ${e.message}`);
    rl.close();
    return;
  }

  console.log(`  ✓ Agent: ${agentName} (${agentId})\n`);

  // Step 3: Show connections
  let connections;
  try {
    connections = await client.listConnections(agentId);
    const active = connections.filter((c) => c.status === 'active' && c.connectionTopicId);
    console.log(`  Active connections: ${active.length}`);
    active.forEach((c) => {
      const other = c.fromAgentId === agentId ? c.toAgentId : c.fromAgentId;
      console.log(`    → ${other} (topic: ${c.connectionTopicId})`);
    });
  } catch (e) {
    console.log(`  Error fetching connections: ${e.message}`);
    rl.close();
    return;
  }

  if (connections.filter((c) => c.status === 'active').length === 0) {
    console.log('\n  No active connections. Go to the Connections page and connect with another agent first.');
    rl.close();
    return;
  }

  // Step 4: Choose response mode
  console.log('\n  Response modes:');
  console.log('  1. Smart (keyword-based replies)');
  console.log('  2. Echo (repeat back what they said)');
  console.log('  3. Custom (type your own reply each time)');
  const mode = (await ask('\n  Mode (1/2/3): ')).trim();

  // Step 5: Get agent's reputation for smart replies
  let reputation;
  try {
    reputation = await client.getReputation(agentId);
  } catch { reputation = null; }

  // Step 6: Start the runner
  console.log('\n  ═══════════════════════════════════════════════════');
  console.log(`  ${agentName} is now listening for messages...`);
  console.log('  Send a message from the Connections page to test.');
  console.log('  Press Ctrl+C to stop.\n');

  const messageLog = [];

  const runner = new AgentRunner({
    client,
    agentId,
    pollInterval: 3000,
    onMessage: async (msg) => {
      const text = typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data);
      console.log(`\n  ┌─ [${timestamp()}] New message from ${msg.fromAgentId}`);
      console.log(`  │  Topic: ${msg.connectionTopicId}`);
      console.log(`  │  Seq #${msg.sequenceNumber}`);
      console.log(`  │  Message: "${text}"`);

      messageLog.push({ from: msg.fromAgentId, text, time: timestamp() });

      let reply = null;

      if (mode === '1') {
        // Smart mode — keyword-based
        const lower = text.toLowerCase();

        if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
          reply = `Hello! I'm ${agentName}. How can I help you today?`;
        } else if (lower.includes('reputation') || lower.includes('score') || lower.includes('trust')) {
          if (reputation) {
            reply = `My reputation score is ${reputation.overallScore}/1000 (${reputation.trustTier} tier). I have ${reputation.feedbackCount} feedback entries and ${reputation.validationCount} validations.`;
          } else {
            reply = `I'm a registered agent on AgentRep. You can check my profile for reputation details.`;
          }
        } else if (lower.includes('capabilities') || lower.includes('skills') || lower.includes('what can you do')) {
          reply = `I'm ${agentName}, registered on AgentRep with on-chain reputation tracking. I can receive feedback, undergo validation, and communicate via HCS-10.`;
        } else if (lower.includes('validate') || lower.includes('assessment')) {
          reply = `I'm open to validation! Submit a validation request through the AgentRep API or UI, and I'll be happy to demonstrate my capabilities.`;
        } else if (lower.includes('feedback')) {
          reply = `You can submit feedback about my performance through the AgentRep protocol. Your feedback is weighted by your own reputation score.`;
        } else if (lower.includes('stake') || lower.includes('hbar') || lower.includes('balance')) {
          reply = `All agents on AgentRep stake HBAR as collateral for honest feedback. Dishonest behavior can be disputed and staked HBAR slashed via smart contract.`;
        } else if (lower.includes('bye') || lower.includes('goodbye')) {
          reply = `Goodbye! It was nice chatting. All our messages are recorded on Hedera Consensus Service for transparency.`;
        } else {
          reply = `Thanks for your message! I received: "${text}". Feel free to ask about my reputation, capabilities, or the AgentRep protocol.`;
        }
      } else if (mode === '2') {
        // Echo mode
        reply = `[Echo] ${agentName} received: "${text}"`;
      } else if (mode === '3') {
        // Custom mode — ask user to type reply
        const customReply = await ask(`  │  Your reply: `);
        reply = customReply.trim() || null;
      }

      if (reply) {
        console.log(`  └─ ${agentName} replies: "${reply}"`);
      } else {
        console.log(`  └─ (no reply)`);
      }

      return reply;
    },
    onError: (err) => {
      console.log(`  [Error] ${err.message}`);
    },
  });

  try {
    await runner.start();
    console.log(`  Monitoring ${runner.getConnectionCount()} connection(s)...`);
    console.log(`  Polling every 3 seconds.\n`);

    // Keep alive until Ctrl+C
    await new Promise((resolve) => {
      process.on('SIGINT', () => {
        console.log('\n\n  Shutting down...');
        runner.stop();
        console.log(`  ${agentName} stopped listening.`);
        if (messageLog.length > 0) {
          console.log(`\n  Message log (${messageLog.length} messages):`);
          messageLog.forEach((m) => {
            console.log(`    [${m.time}] ${m.from}: ${m.text}`);
          });
        }
        console.log();
        resolve();
      });
    });
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }

  rl.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
