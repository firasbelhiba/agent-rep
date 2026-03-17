/**
 * Seed / Demo script for AgentRep
 *
 * Registers demo agents (legacy path, no HCS-10 to avoid needing Hedera creds),
 * creates connections between them, and submits feedback + validation via API
 * using proper X-Agent-Key authentication.
 *
 * Usage:  npx ts-node -T seed-demo.ts
 */

const API = 'http://localhost:4000/api';

interface AgentResult {
  name: string;
  agentId: string;
  apiKey: string;
}

async function post(path: string, body: any, apiKey?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-agent-key'] = apiKey;

  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${res.status} ${path}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function registerAgent(name: string, description: string, skills: string[]): Promise<AgentResult> {
  const data = await post('/agents', {
    name,
    description,
    skills,
    agentType: 'autonomous',
    model: 'gpt-4',
    useHcs10: false, // legacy path — no Hedera needed for seeding
  });

  console.log(`  Registered "${name}" => ${data.agent.agentId}`);
  return {
    name,
    agentId: data.agent.agentId,
    apiKey: data.apiKey,
  };
}

async function createConnection(fromId: string, toId: string) {
  const data = await post('/connections/seed', {
    fromAgentId: fromId,
    toAgentId: toId,
  });
  console.log(`  Connected ${fromId} <-> ${toId}`);
}

async function submitFeedback(
  fromKey: string,
  toAgentId: string,
  value: number,
  tag1: string,
  tag2: string,
) {
  const data = await post(
    '/feedback',
    { agentId: toAgentId, value, tag1, tag2 },
    fromKey,
  );
  console.log(`  Feedback => ${toAgentId}: ${value} (${tag1}/${tag2})`);
  return data;
}

async function submitValidation(
  validatorKey: string,
  agentId: string,
  requestURI: string,
) {
  const data = await post(
    '/validation',
    { agentId, requestURI },
    validatorKey,
  );
  console.log(`  Validation request => ${agentId}: ${data.request.requestHash}`);
  return data;
}

async function respondValidation(
  validatorKey: string,
  requestHash: string,
  response: number,
  tag: string,
) {
  const data = await post(
    '/validation/respond',
    { requestHash, response, tag, responseURI: 'ipfs://demo-response' },
    validatorKey,
  );
  console.log(`  Validation response: ${response}/100 (${tag})`);
  return data;
}

async function main() {
  console.log('=== AgentRep Demo Seed ===\n');

  // 1. Register agents
  console.log('1. Registering agents...');
  const agents: AgentResult[] = [];

  agents.push(await registerAgent(
    'DeFi Oracle',
    'Real-time DeFi price feeds and market analysis agent',
    ['defi', 'trading', 'data-analysis'],
  ));

  agents.push(await registerAgent(
    'CodeAssist Pro',
    'Full-stack code generation and review agent',
    ['code-generation', 'security-audit', 'smart-contracts'],
  ));

  agents.push(await registerAgent(
    'ResearchBot',
    'Academic and market research synthesis agent',
    ['research', 'nlp', 'data-analysis'],
  ));

  agents.push(await registerAgent(
    'SecureAudit',
    'Smart contract security auditing specialist',
    ['security-audit', 'smart-contracts', 'defi'],
  ));

  agents.push(await registerAgent(
    'ContentForge',
    'Multi-lingual content creation and translation agent',
    ['content-creation', 'translation', 'nlp'],
  ));

  // 2. Create connections (mesh some of them)
  console.log('\n2. Creating connections...');
  const connections = [
    [0, 1], [0, 2], [0, 3],  // DeFi Oracle connects to CodeAssist, Research, SecureAudit
    [1, 2], [1, 3], [1, 4],  // CodeAssist connects to Research, SecureAudit, ContentForge
    [2, 3], [2, 4],          // Research connects to SecureAudit, ContentForge
    [3, 4],                  // SecureAudit connects to ContentForge
  ];

  for (const [i, j] of connections) {
    await createConnection(agents[i].agentId, agents[j].agentId);
  }

  // 3. Submit feedback (agents rating each other)
  console.log('\n3. Submitting feedback...');

  // DeFi Oracle rates CodeAssist
  await submitFeedback(agents[0].apiKey, agents[1].agentId, 85, 'code-generation', 'quality');
  // DeFi Oracle rates ResearchBot
  await submitFeedback(agents[0].apiKey, agents[2].agentId, 72, 'research', 'accuracy');
  // CodeAssist rates DeFi Oracle
  await submitFeedback(agents[1].apiKey, agents[0].agentId, 90, 'defi', 'reliability');
  // CodeAssist rates SecureAudit
  await submitFeedback(agents[1].apiKey, agents[3].agentId, 95, 'security-audit', 'thoroughness');
  // ResearchBot rates DeFi Oracle
  await submitFeedback(agents[2].apiKey, agents[0].agentId, 78, 'data-analysis', 'speed');
  // ResearchBot rates ContentForge
  await submitFeedback(agents[2].apiKey, agents[4].agentId, 88, 'content-creation', 'creativity');
  // SecureAudit rates CodeAssist
  await submitFeedback(agents[3].apiKey, agents[1].agentId, 82, 'smart-contracts', 'security');
  // SecureAudit rates DeFi Oracle
  await submitFeedback(agents[3].apiKey, agents[0].agentId, 70, 'trading', 'accuracy');
  // ContentForge rates ResearchBot
  await submitFeedback(agents[4].apiKey, agents[2].agentId, 91, 'nlp', 'quality');
  // ContentForge rates CodeAssist
  await submitFeedback(agents[4].apiKey, agents[1].agentId, 76, 'code-generation', 'speed');

  // 4. Submit validations
  console.log('\n4. Submitting validations...');

  // CodeAssist validates DeFi Oracle's claims
  const v1 = await submitValidation(agents[1].apiKey, agents[0].agentId, 'ipfs://defi-oracle-audit-v1');
  await respondValidation(agents[1].apiKey, v1.request.requestHash, 88, 'defi');

  // SecureAudit validates CodeAssist's security
  const v2 = await submitValidation(agents[3].apiKey, agents[1].agentId, 'ipfs://codeassist-security-review');
  await respondValidation(agents[3].apiKey, v2.request.requestHash, 92, 'security-audit');

  // ResearchBot validates ContentForge's accuracy
  const v3 = await submitValidation(agents[2].apiKey, agents[4].agentId, 'ipfs://contentforge-accuracy-check');
  await respondValidation(agents[2].apiKey, v3.request.requestHash, 85, 'nlp');

  console.log('\n=== Seed complete! ===');
  console.log('\nAgent API Keys (save these for testing):');
  for (const a of agents) {
    console.log(`  ${a.name}: ${a.apiKey}`);
  }
}

main().catch(console.error);
