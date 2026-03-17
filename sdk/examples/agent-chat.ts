/**
 * AgentRep SDK — Agent Chat Demo
 *
 * This example shows two agents communicating over HCS-10:
 *   1. Mariposa listens for messages and auto-replies
 *   2. TalentAI sends a message to Mariposa
 *   3. Mariposa receives it and responds
 *
 * Usage:
 *   npx ts-node examples/agent-chat.ts
 *   # or
 *   node -r ts-node/register examples/agent-chat.ts
 */

import { AgentRepClient, AgentRunner } from '../src';

const API_URL = process.env.API_URL || 'http://localhost:4000/api';

// Mariposa's API key (from registration)
const MARIPOSA_KEY = 'ar_3b43e45f3d238113a51033b08b8f2b953ef2353ed9abb300368515321d04ddb2';
const MARIPOSA_ID = '0.0.8265268';

// TalentAI's API key
const TALENTAI_KEY = 'ar_f5fec4e4db8bb9de554ae39a4c17383524cc69a8e64ec6ddde20c4574682d080';
const TALENTAI_ID = '0.0.8265743';

async function main() {
  // ── Step 1: Create Mariposa's client and start listening ──
  const mariposaClient = new AgentRepClient({
    baseUrl: API_URL,
    apiKey: MARIPOSA_KEY,
  });

  const runner = new AgentRunner({
    client: mariposaClient,
    agentId: MARIPOSA_ID,
    pollInterval: 3000,
    onMessage: async (msg) => {
      console.log(`\n📨 Mariposa received message from ${msg.fromAgentId}:`);
      console.log(`   "${msg.data}"`);
      console.log(`   (seq #${msg.sequenceNumber}, topic ${msg.connectionTopicId})`);

      // Auto-reply based on message content
      const text = String(msg.data).toLowerCase();

      if (text.includes('hello') || text.includes('hi')) {
        return 'Hello! I\'m Mariposa, an agentic AI specializing in trading. How can I help?';
      }
      if (text.includes('reputation') || text.includes('score')) {
        const rep = await mariposaClient.getReputation(MARIPOSA_ID);
        return `My current reputation score is ${rep.overallScore}/1000 (${rep.trustTier} tier). I have ${rep.feedbackCount} feedback entries.`;
      }
      if (text.includes('trade') || text.includes('market')) {
        return 'I can analyze market trends and execute trading strategies. What asset pair are you interested in?';
      }

      return `Thanks for your message! I received: "${msg.data}"`;
    },
  });

  await runner.start();
  console.log(`🟢 Mariposa is listening on ${runner.getConnectionCount()} connections...`);

  // ── Step 2: TalentAI sends a message ──
  const talentClient = new AgentRepClient({
    baseUrl: API_URL,
    apiKey: TALENTAI_KEY,
  });

  // Find the connection topic between TalentAI and Mariposa
  const connections = await talentClient.listConnections(TALENTAI_ID);
  const conn = connections.find(
    (c) => c.status === 'active' && c.connectionTopicId &&
      (c.fromAgentId === MARIPOSA_ID || c.toAgentId === MARIPOSA_ID),
  );

  if (!conn) {
    console.error('No active connection between TalentAI and Mariposa');
    runner.stop();
    return;
  }

  console.log(`\n💬 TalentAI sending message on topic ${conn.connectionTopicId}...`);
  await talentClient.sendMessage(conn.connectionTopicId, 'Hello Mariposa! What is your reputation score?');
  console.log('✅ Message sent!');

  // Wait for Mariposa to pick it up and reply
  console.log('\n⏳ Waiting for Mariposa to process and reply...');
  await new Promise((resolve) => setTimeout(resolve, 8000));

  // Check messages on the topic
  const messages = await talentClient.getMessages(conn.connectionTopicId);
  console.log(`\n📬 Messages on topic ${conn.connectionTopicId}:`);
  for (const msg of messages.slice(-4)) {
    console.log(`   [#${msg.sequenceNumber}] ${JSON.stringify(msg.data)}`);
  }

  runner.stop();
  console.log('\n🔴 Mariposa stopped listening.');
}

main().catch(console.error);
