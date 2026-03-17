/**
 * AgentRep SDK — Agent Chat Demo
 * Mariposa listens for messages, TalentAI sends one, Mariposa auto-replies.
 */
const { AgentRepClient, AgentRunner } = require('../dist');

const API_URL = 'http://localhost:4000/api';
const MARIPOSA_KEY = 'ar_3b43e45f3d238113a51033b08b8f2b953ef2353ed9abb300368515321d04ddb2';
const MARIPOSA_ID = '0.0.8265268';
const TALENTAI_KEY = 'ar_f5fec4e4db8bb9de554ae39a4c17383524cc69a8e64ec6ddde20c4574682d080';
const TALENTAI_ID = '0.0.8265743';

async function main() {
  // Step 1: Mariposa starts listening
  const mariposaClient = new AgentRepClient({ baseUrl: API_URL, apiKey: MARIPOSA_KEY });

  const runner = new AgentRunner({
    client: mariposaClient,
    agentId: MARIPOSA_ID,
    pollInterval: 3000,
    onMessage: async (msg) => {
      const text = String(typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data)).toLowerCase();
      console.log('\n📨 Mariposa received:', JSON.stringify(msg.data));

      if (text.includes('hello') || text.includes('hi')) {
        const reply = 'Hello! I am Mariposa, an agentic AI specializing in trading. How can I help you today?';
        console.log('💬 Mariposa replies:', reply);
        return reply;
      }
      if (text.includes('reputation') || text.includes('score')) {
        const rep = await mariposaClient.getReputation(MARIPOSA_ID);
        const reply = `My current reputation score is ${rep.overallScore}/1000 (${rep.trustTier} tier). I have ${rep.feedbackCount} feedback entries and ${rep.validationCount} validations.`;
        console.log('💬 Mariposa replies:', reply);
        return reply;
      }
      const reply = 'Thanks for reaching out! I received your message.';
      console.log('💬 Mariposa replies:', reply);
      return reply;
    },
  });

  await runner.start();
  console.log('🟢 Mariposa is listening on', runner.getConnectionCount(), 'connections');

  // Step 2: TalentAI sends a message
  const talentClient = new AgentRepClient({ baseUrl: API_URL, apiKey: TALENTAI_KEY });
  const connections = await talentClient.listConnections(TALENTAI_ID);
  const conn = connections.find(
    (c) => c.status === 'active' && c.connectionTopicId &&
      (c.fromAgentId === MARIPOSA_ID || c.toAgentId === MARIPOSA_ID),
  );

  if (!conn) {
    console.error('No active connection found between TalentAI and Mariposa');
    runner.stop();
    return;
  }

  console.log('\n💬 TalentAI sends: "Hello Mariposa! What is your reputation score?"');
  await talentClient.sendMessage(conn.connectionTopicId, 'Hello Mariposa! What is your reputation score?');
  console.log('✅ Message sent on topic', conn.connectionTopicId);

  // Wait for Mariposa to pick it up and reply
  console.log('\n⏳ Waiting for Mariposa to process (polling every 3s)...');
  await new Promise((r) => setTimeout(r, 8000));

  // Check final messages on the topic
  const messages = await talentClient.getMessages(conn.connectionTopicId);
  console.log('\n📬 All messages on topic:');
  for (const msg of messages) {
    console.log(`  [#${msg.sequenceNumber}] ${JSON.stringify(msg.data)}`);
  }

  runner.stop();
  console.log('\n🔴 Demo complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
