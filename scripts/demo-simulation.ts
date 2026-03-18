#!/usr/bin/env npx ts-node
// ============================================================
// AgentRep Demo Simulation
// ============================================================
// Demonstrates the full AgentRep on-chain reputation system:
//   - Agent registration
//   - Task interactions (successes & failures)
//   - Peer ratings
//   - Staking
//   - Tier upgrades
//   - Leaderboard evolution
//
// Run:  npx ts-node --esModuleInterop scripts/demo-simulation.ts
//   or: npx tsx scripts/demo-simulation.ts
// ============================================================

import { v4 as uuidv4 } from "uuid";

// ---- ANSI color helpers ----
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  underline: "\x1b[4m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgRed: "\x1b[41m",
  bgCyan: "\x1b[46m",
};

// ---- Types (mirroring src/types) ----

enum TrustTier {
  UNVERIFIED = "UNVERIFIED",
  VERIFIED = "VERIFIED",
  TRUSTED = "TRUSTED",
  ELITE = "ELITE",
}

enum InteractionType {
  TASK_REQUEST = "TASK_REQUEST",
  TASK_COMPLETION = "TASK_COMPLETION",
  DATA_EXCHANGE = "DATA_EXCHANGE",
  COLLABORATION = "COLLABORATION",
}

enum InteractionStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  DISPUTED = "DISPUTED",
}

enum HCSMessageType {
  AGENT_REGISTERED = "AGENT_REGISTERED",
  INTERACTION_STARTED = "INTERACTION_STARTED",
  INTERACTION_COMPLETED = "INTERACTION_COMPLETED",
  INTERACTION_FAILED = "INTERACTION_FAILED",
  RATING_SUBMITTED = "RATING_SUBMITTED",
  STAKE_DEPOSITED = "STAKE_DEPOSITED",
  STAKE_SLASHED = "STAKE_SLASHED",
  TIER_UPGRADED = "TIER_UPGRADED",
}

interface ScoreBreakdown {
  reliabilityScore: number;
  qualityScore: number;
  activityScore: number;
  stakingScore: number;
}

interface AgentProfile {
  agentId: string;
  name: string;
  description: string;
  skills: string[];
  topicId: string;
  profileTopicId: string;
  createdAt: number;
}

interface ReputationScore {
  agentId: string;
  overallScore: number;
  trustTier: TrustTier;
  totalInteractions: number;
  successfulInteractions: number;
  failedInteractions: number;
  averageRating: number;
  totalRatings: number;
  stakedAmount: number;
  slashedAmount: number;
  lastUpdated: number;
  breakdown: ScoreBreakdown;
}

interface Interaction {
  interactionId: string;
  fromAgentId: string;
  toAgentId: string;
  type: InteractionType;
  status: InteractionStatus;
  taskDescription: string;
  startedAt: number;
  completedAt?: number;
  hcsMessageId?: string;
}

interface Rating {
  ratingId: string;
  interactionId: string;
  fromAgentId: string;
  toAgentId: string;
  score: number;
  feedback: string;
  timestamp: number;
  hcsMessageId?: string;
}

// ---- HCS Message Log (simulated) ----

let hcsSequenceNumber = 0;
const hcsLog: Array<{
  seq: number;
  type: HCSMessageType;
  timestamp: number;
  data: Record<string, unknown>;
}> = [];

function logHCS(type: HCSMessageType, data: Record<string, unknown>): string {
  hcsSequenceNumber++;
  const entry = {
    seq: hcsSequenceNumber,
    type,
    timestamp: Date.now(),
    data,
  };
  hcsLog.push(entry);

  const typeColor =
    type.includes("REGISTERED") ? C.cyan :
    type.includes("COMPLETED") ? C.green :
    type.includes("FAILED") ? C.red :
    type.includes("RATING") ? C.yellow :
    type.includes("STAKE") ? C.magenta :
    type.includes("TIER") ? C.bold + C.green :
    C.blue;

  console.log(
    `  ${C.dim}[HCS #${String(entry.seq).padStart(3, "0")}]${C.reset} ${typeColor}${type.padEnd(24)}${C.reset} ${C.dim}${JSON.stringify(data)}${C.reset}`
  );

  return String(entry.seq);
}

// ---- Scoring Engine (mirroring src/lib/reputation/scoring-engine.ts) ----

const MAX_SCORE = 1000;
const TIER_THRESHOLDS: Record<TrustTier, number> = {
  [TrustTier.UNVERIFIED]: 0,
  [TrustTier.VERIFIED]: 200,
  [TrustTier.TRUSTED]: 500,
  [TrustTier.ELITE]: 800,
};

function calculateScore(
  interactions: Interaction[],
  ratings: Rating[],
  stakedAmount: number
): ReputationScore {
  const totalInteractions = interactions.length;
  const successfulInteractions = interactions.filter(
    (i) => i.status === InteractionStatus.COMPLETED
  ).length;
  const failedInteractions = interactions.filter(
    (i) => i.status === InteractionStatus.FAILED
  ).length;

  // Reliability (0-300)
  const successRate = totalInteractions > 0 ? successfulInteractions / totalInteractions : 0;
  const reliabilityConfidence = Math.min(1, totalInteractions / 10);
  const reliabilityScore = Math.round(successRate * 300 * reliabilityConfidence);

  // Quality (0-300)
  const avgRating =
    ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length
      : 0;
  const ratingConfidence = Math.min(1, ratings.length / 5);
  const qualityScore = Math.round(((avgRating - 1) / 4) * 300 * ratingConfidence);

  // Activity (0-200)
  const activityScore = Math.round(
    Math.min(200, Math.log(1 + totalInteractions) * 50)
  );

  // Staking (0-200)
  const normalizedStake = Math.min(stakedAmount, 10000);
  const stakingScore = Math.round(
    (Math.log(1 + normalizedStake) / Math.log(10001)) * 200
  );

  const overallScore = Math.min(
    MAX_SCORE,
    reliabilityScore + qualityScore + activityScore + stakingScore
  );

  const averageRating = Math.round(avgRating * 100) / 100;

  // Determine tier
  let trustTier = TrustTier.UNVERIFIED;
  if (overallScore >= TIER_THRESHOLDS[TrustTier.ELITE] && totalInteractions >= 50) {
    trustTier = TrustTier.ELITE;
  } else if (overallScore >= TIER_THRESHOLDS[TrustTier.TRUSTED] && totalInteractions >= 20) {
    trustTier = TrustTier.TRUSTED;
  } else if (overallScore >= TIER_THRESHOLDS[TrustTier.VERIFIED] && totalInteractions >= 5) {
    trustTier = TrustTier.VERIFIED;
  }

  return {
    agentId: "",
    overallScore: Math.round(overallScore),
    trustTier,
    totalInteractions,
    successfulInteractions,
    failedInteractions,
    averageRating,
    totalRatings: ratings.length,
    stakedAmount,
    slashedAmount: 0,
    lastUpdated: Date.now(),
    breakdown: { reliabilityScore, qualityScore, activityScore, stakingScore },
  };
}

// ---- Demo Reputation Manager (self-contained, no Hedera SDK) ----

const agentStore = new Map<string, AgentProfile>();
const interactionStore = new Map<string, Interaction>();
const ratingStore = new Map<string, Rating[]>();
const reputationStore = new Map<string, ReputationScore>();

function registerAgent(profile: Omit<AgentProfile, "createdAt">): AgentProfile {
  const agent: AgentProfile = { ...profile, createdAt: Date.now() };
  agentStore.set(agent.agentId, agent);
  ratingStore.set(agent.agentId, []);

  const initialScore: ReputationScore = {
    agentId: agent.agentId,
    overallScore: 0,
    trustTier: TrustTier.UNVERIFIED,
    totalInteractions: 0,
    successfulInteractions: 0,
    failedInteractions: 0,
    averageRating: 0,
    totalRatings: 0,
    stakedAmount: 0,
    slashedAmount: 0,
    lastUpdated: Date.now(),
    breakdown: { reliabilityScore: 0, qualityScore: 0, activityScore: 0, stakingScore: 0 },
  };
  reputationStore.set(agent.agentId, initialScore);

  logHCS(HCSMessageType.AGENT_REGISTERED, {
    agentId: agent.agentId,
    name: agent.name,
    skills: agent.skills,
  });

  return agent;
}

function recalculateReputation(agentId: string): ReputationScore {
  const agentInteractions = Array.from(interactionStore.values()).filter(
    (i) => i.toAgentId === agentId || i.fromAgentId === agentId
  );
  const agentRatings = ratingStore.get(agentId) || [];
  const currentRep = reputationStore.get(agentId);
  const stakedAmount = currentRep?.stakedAmount || 0;

  const newScore = calculateScore(agentInteractions, agentRatings, stakedAmount);
  newScore.agentId = agentId;
  newScore.stakedAmount = stakedAmount;

  // Check tier upgrade
  if (currentRep && newScore.trustTier !== currentRep.trustTier) {
    const tierOrder = [TrustTier.UNVERIFIED, TrustTier.VERIFIED, TrustTier.TRUSTED, TrustTier.ELITE];
    if (tierOrder.indexOf(newScore.trustTier) > tierOrder.indexOf(currentRep.trustTier)) {
      logHCS(HCSMessageType.TIER_UPGRADED, {
        agentId,
        previousTier: currentRep.trustTier,
        newTier: newScore.trustTier,
        score: newScore.overallScore,
      });
      const agentName = agentStore.get(agentId)?.name || agentId;
      printTierUpgrade(agentName, currentRep.trustTier, newScore.trustTier, newScore.overallScore);
    }
  }

  reputationStore.set(agentId, newScore);
  return newScore;
}

function startInteraction(
  fromAgentId: string,
  toAgentId: string,
  taskDescription: string,
  type: InteractionType = InteractionType.TASK_REQUEST
): Interaction {
  const interaction: Interaction = {
    interactionId: uuidv4(),
    fromAgentId,
    toAgentId,
    type,
    status: InteractionStatus.IN_PROGRESS,
    taskDescription,
    startedAt: Date.now(),
  };
  interactionStore.set(interaction.interactionId, interaction);

  logHCS(HCSMessageType.INTERACTION_STARTED, {
    interactionId: interaction.interactionId.slice(0, 8),
    from: fromAgentId,
    to: toAgentId,
    type,
    task: taskDescription,
  });

  return interaction;
}

function completeInteraction(interactionId: string, success: boolean): Interaction {
  const interaction = interactionStore.get(interactionId)!;
  interaction.status = success ? InteractionStatus.COMPLETED : InteractionStatus.FAILED;
  interaction.completedAt = Date.now();

  logHCS(
    success ? HCSMessageType.INTERACTION_COMPLETED : HCSMessageType.INTERACTION_FAILED,
    {
      interactionId: interactionId.slice(0, 8),
      from: interaction.fromAgentId,
      to: interaction.toAgentId,
      success,
    }
  );

  recalculateReputation(interaction.toAgentId);
  return interaction;
}

function submitRating(
  interactionId: string,
  fromAgentId: string,
  toAgentId: string,
  score: number,
  feedback: string
): Rating {
  const rating: Rating = {
    ratingId: uuidv4(),
    interactionId,
    fromAgentId,
    toAgentId,
    score,
    feedback,
    timestamp: Date.now(),
  };

  const agentRatings = ratingStore.get(toAgentId) || [];
  agentRatings.push(rating);
  ratingStore.set(toAgentId, agentRatings);

  logHCS(HCSMessageType.RATING_SUBMITTED, {
    from: fromAgentId,
    to: toAgentId,
    score,
    feedback,
  });

  recalculateReputation(toAgentId);
  return rating;
}

function addStake(agentId: string, amount: number): ReputationScore {
  const rep = reputationStore.get(agentId)!;
  rep.stakedAmount += amount;

  logHCS(HCSMessageType.STAKE_DEPOSITED, {
    agentId,
    amount,
    totalStaked: rep.stakedAmount,
  });

  return recalculateReputation(agentId);
}

function getLeaderboard(): ReputationScore[] {
  return Array.from(reputationStore.values()).sort(
    (a, b) => b.overallScore - a.overallScore
  );
}

// ---- Pretty Printing ----

function tierBadge(tier: TrustTier): string {
  switch (tier) {
    case TrustTier.UNVERIFIED:
      return `${C.dim}[ UNVERIFIED ]${C.reset}`;
    case TrustTier.VERIFIED:
      return `${C.bgBlue}${C.white}${C.bold} VERIFIED ${C.reset}`;
    case TrustTier.TRUSTED:
      return `${C.bgMagenta}${C.white}${C.bold} TRUSTED  ${C.reset}`;
    case TrustTier.ELITE:
      return `${C.bgYellow}${C.bold} ★ ELITE ★ ${C.reset}`;
  }
}

function scoreBar(score: number, max: number = 1000, width: number = 30): string {
  const filled = Math.round((score / max) * width);
  const empty = width - filled;

  let color = C.red;
  if (score >= 600) color = C.green;
  else if (score >= 300) color = C.yellow;

  const bar = color + "\u2588".repeat(filled) + C.dim + "\u2591".repeat(empty) + C.reset;
  return bar;
}

function printLeaderboard(step: string) {
  const board = getLeaderboard();
  const divider = C.dim + "\u2500".repeat(96) + C.reset;

  console.log();
  console.log(`${C.bold}${C.cyan}  ╔${"═".repeat(92)}╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ║${C.reset}  ${C.bold}LEADERBOARD${C.reset} ${C.dim}(${step})${C.reset}${" ".repeat(92 - 16 - step.length)}${C.bold}${C.cyan}║${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ╚${"═".repeat(92)}╝${C.reset}`);
  console.log(`  ${C.bold}${"#".padEnd(4)} ${"Agent".padEnd(22)} ${"Score".padEnd(8)} ${"Bar".padEnd(32)} ${"Tier".padEnd(16)} ${"Rate".padEnd(6)} ${"Intx".padEnd(6)} Staked${C.reset}`);
  console.log(`  ${divider}`);

  board.forEach((rep, index) => {
    const agent = agentStore.get(rep.agentId);
    const name = agent?.name || rep.agentId;
    const rank = `${index + 1}.`.padEnd(4);
    const scoreStr = String(rep.overallScore).padEnd(8);
    const bar = scoreBar(rep.overallScore);
    const tier = tierBadge(rep.trustTier);
    const rate = rep.averageRating > 0 ? `${rep.averageRating.toFixed(1)}/5` : " --- ";
    const intx = `${rep.successfulInteractions}/${rep.totalInteractions}`;
    const staked = rep.stakedAmount > 0 ? `${rep.stakedAmount} HBAR` : "  ---";

    console.log(
      `  ${C.bold}${rank}${C.reset} ${C.white}${name.padEnd(22)}${C.reset} ${C.bold}${scoreStr}${C.reset} ${bar} ${tier} ${rate.padEnd(6)} ${intx.padEnd(6)} ${staked}`
    );
  });
  console.log();
}

function printTierUpgrade(agentName: string, oldTier: TrustTier, newTier: TrustTier, score: number) {
  console.log();
  console.log(`  ${C.bold}${C.green}${"*".repeat(60)}${C.reset}`);
  console.log(`  ${C.bold}${C.green}*  TIER UPGRADE!${C.reset}`);
  console.log(`  ${C.bold}${C.green}*  ${C.white}${agentName}${C.green} leveled up!${C.reset}`);
  console.log(`  ${C.bold}${C.green}*  ${tierBadge(oldTier)} ${C.bold}${C.green}-->${C.reset} ${tierBadge(newTier)}  ${C.dim}(Score: ${score})${C.reset}`);
  console.log(`  ${C.bold}${C.green}${"*".repeat(60)}${C.reset}`);
  console.log();
}

function printHeader(title: string) {
  console.log();
  console.log(`${C.bold}${C.bgCyan}${C.white}                                                                                        ${C.reset}`);
  console.log(`${C.bold}${C.bgCyan}${C.white}   ${title}${" ".repeat(Math.max(0, 85 - title.length))}${C.reset}`);
  console.log(`${C.bold}${C.bgCyan}${C.white}                                                                                        ${C.reset}`);
  console.log();
}

function printStep(stepNum: number, title: string) {
  console.log();
  console.log(`  ${C.bold}${C.magenta}━━━ Step ${stepNum}: ${title} ━━━${C.reset}`);
  console.log();
}

function printBreakdown(agentId: string) {
  const rep = reputationStore.get(agentId)!;
  const agent = agentStore.get(agentId)!;
  const b = rep.breakdown;

  console.log(`    ${C.dim}Score breakdown for ${C.white}${agent.name}${C.dim}:${C.reset}`);
  console.log(`      Reliability: ${scoreBar(b.reliabilityScore, 300, 15)} ${b.reliabilityScore}/300`);
  console.log(`      Quality:     ${scoreBar(b.qualityScore, 300, 15)} ${b.qualityScore}/300`);
  console.log(`      Activity:    ${scoreBar(b.activityScore, 200, 15)} ${b.activityScore}/200`);
  console.log(`      Staking:     ${scoreBar(b.stakingScore, 200, 15)} ${b.stakingScore}/200`);
  console.log();
}

// ---- Sleep helper ----

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
//  MAIN DEMO
// ============================================================

async function runDemo() {
  console.clear();
  console.log(`${C.bold}${C.magenta}`);
  console.log(`    ╔══════════════════════════════════════════════════════════════════╗`);
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
  console.log(`    ║  ${C.cyan}On-Chain Reputation for AI Agents${C.magenta}                               ║`);
  console.log(`    ║  ${C.white}Demo Simulation — Hedera Testnet${C.magenta}                                ║`);
  console.log(`    ║                                                                  ║`);
  console.log(`    ╚══════════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log();
  console.log(`  ${C.dim}Simulated HCS Topic: 0.0.5432100${C.reset}`);
  console.log(`  ${C.dim}Network: Hedera Testnet (simulated)${C.reset}`);
  console.log(`  ${C.dim}Timestamp: ${new Date().toISOString()}${C.reset}`);
  console.log();

  // ========== STEP 1: Register Agents ==========
  printStep(1, "Register AI Agents");

  const agents = [
    {
      agentId: "0.0.100001",
      name: "DeFi Optimizer",
      description: "Optimizes DeFi yield strategies across protocols",
      skills: ["DeFi", "Yield Farming", "Risk Analysis"],
      topicId: "0.0.200001",
      profileTopicId: "0.0.300001",
    },
    {
      agentId: "0.0.100002",
      name: "Data Oracle",
      description: "Aggregates and verifies off-chain data feeds",
      skills: ["Data Feeds", "Oracle", "Verification"],
      topicId: "0.0.200002",
      profileTopicId: "0.0.300002",
    },
    {
      agentId: "0.0.100003",
      name: "Trade Sentinel",
      description: "Executes algorithmic trading strategies",
      skills: ["Trading", "Market Analysis", "Arbitrage"],
      topicId: "0.0.200003",
      profileTopicId: "0.0.300003",
    },
    {
      agentId: "0.0.100004",
      name: "NFT Curator",
      description: "Curates, values, and manages NFT portfolios",
      skills: ["NFT", "Valuation", "Portfolio Management"],
      topicId: "0.0.200004",
      profileTopicId: "0.0.300004",
    },
    {
      agentId: "0.0.100005",
      name: "Audit Guardian",
      description: "Audits smart contracts for vulnerabilities",
      skills: ["Security", "Audit", "Smart Contracts"],
      topicId: "0.0.200005",
      profileTopicId: "0.0.300005",
    },
  ];

  for (const agentData of agents) {
    registerAgent(agentData);
    console.log(
      `    ${C.green}+${C.reset} ${C.bold}${agentData.name}${C.reset} ${C.dim}(${agentData.agentId})${C.reset} -- Skills: ${C.cyan}${agentData.skills.join(", ")}${C.reset}`
    );
    await sleep(300);
  }

  printLeaderboard("After Registration");
  await sleep(1000);

  // ========== STEP 2: First wave of interactions ==========
  printStep(2, "First Wave of Interactions (5 tasks)");

  const wave1 = [
    { from: "0.0.100001", to: "0.0.100002", task: "Fetch HBAR/USD price feed for yield calc", success: true, rating: 5, feedback: "Fast and accurate data" },
    { from: "0.0.100003", to: "0.0.100001", task: "Provide liquidity pool analysis for trade", success: true, rating: 4, feedback: "Good analysis, minor delay" },
    { from: "0.0.100004", to: "0.0.100005", task: "Audit NFT marketplace contract", success: true, rating: 5, feedback: "Thorough audit, found 2 issues" },
    { from: "0.0.100002", to: "0.0.100003", task: "Execute data-driven trade on SaucerSwap", success: false, rating: 2, feedback: "Trade failed due to slippage" },
    { from: "0.0.100005", to: "0.0.100004", task: "Verify NFT provenance on-chain", success: true, rating: 4, feedback: "Accurate provenance check" },
  ];

  for (const w of wave1) {
    const fromName = agentStore.get(w.from)?.name;
    const toName = agentStore.get(w.to)?.name;
    console.log(`    ${C.blue}>>>${C.reset} ${C.bold}${fromName}${C.reset} ${C.dim}->${C.reset} ${C.bold}${toName}${C.reset}: ${C.dim}${w.task}${C.reset}`);

    const ix = startInteraction(w.from, w.to, w.task);
    await sleep(200);

    completeInteraction(ix.interactionId, w.success);
    const statusIcon = w.success ? `${C.green}SUCCESS${C.reset}` : `${C.red}FAILED${C.reset}`;
    console.log(`        Result: ${statusIcon}`);

    submitRating(ix.interactionId, w.from, w.to, w.rating, w.feedback);
    console.log(`        Rating: ${"*".repeat(w.rating)}${"_".repeat(5 - w.rating)} (${w.rating}/5) -- "${w.feedback}"`);
    console.log();
    await sleep(400);
  }

  printLeaderboard("After Wave 1 (5 interactions)");
  await sleep(1000);

  // ========== STEP 3: Staking ==========
  printStep(3, "Agents Stake HBAR as Collateral");

  const stakes = [
    { agentId: "0.0.100001", amount: 500 },
    { agentId: "0.0.100002", amount: 1000 },
    { agentId: "0.0.100005", amount: 2000 },
    { agentId: "0.0.100003", amount: 200 },
  ];

  for (const s of stakes) {
    const name = agentStore.get(s.agentId)?.name;
    console.log(`    ${C.magenta}$${C.reset} ${C.bold}${name}${C.reset} stakes ${C.bold}${C.magenta}${s.amount} HBAR${C.reset}`);
    addStake(s.agentId, s.amount);
    await sleep(300);
  }

  printLeaderboard("After Staking");
  await sleep(1000);

  // ========== STEP 4: Heavy interaction wave ==========
  printStep(4, "Heavy Interaction Wave (building reputation fast)");

  // Generate many interactions for some agents to push toward tier upgrades
  const heavyTasks = [
    // DeFi Optimizer does lots of successful work
    { from: "0.0.100002", to: "0.0.100001", task: "Analyze yield on HeliSwap pool", success: true, rating: 5 },
    { from: "0.0.100003", to: "0.0.100001", task: "Provide DEX liquidity metrics", success: true, rating: 5 },
    { from: "0.0.100004", to: "0.0.100001", task: "DeFi risk assessment for NFT collateral", success: true, rating: 4 },
    { from: "0.0.100005", to: "0.0.100001", task: "Review DeFi protocol parameters", success: true, rating: 5 },
    // Data Oracle also performs well
    { from: "0.0.100001", to: "0.0.100002", task: "Real-time HBAR price feed", success: true, rating: 5 },
    { from: "0.0.100003", to: "0.0.100002", task: "Cross-chain data aggregation", success: true, rating: 4 },
    { from: "0.0.100005", to: "0.0.100002", task: "Verify oracle data integrity", success: true, rating: 5 },
    // Audit Guardian does great work
    { from: "0.0.100001", to: "0.0.100005", task: "Audit yield vault contract", success: true, rating: 5 },
    { from: "0.0.100002", to: "0.0.100005", task: "Review oracle contract security", success: true, rating: 5 },
    { from: "0.0.100003", to: "0.0.100005", task: "Audit trading bot contract", success: true, rating: 4 },
    // Trade Sentinel has mixed results
    { from: "0.0.100001", to: "0.0.100003", task: "Execute HBAR-USDC swap", success: true, rating: 3 },
    { from: "0.0.100002", to: "0.0.100003", task: "Execute arbitrage trade", success: false, rating: 2 },
    { from: "0.0.100004", to: "0.0.100003", task: "Liquidate underperforming NFTs", success: true, rating: 3 },
    // NFT Curator steady progress
    { from: "0.0.100001", to: "0.0.100004", task: "Curate DeFi protocol NFT badges", success: true, rating: 4 },
    { from: "0.0.100003", to: "0.0.100004", task: "Value trading achievement NFTs", success: true, rating: 4 },
  ];

  let taskCount = 0;
  for (const t of heavyTasks) {
    taskCount++;
    const fromName = agentStore.get(t.from)?.name;
    const toName = agentStore.get(t.to)?.name;
    const statusIcon = t.success ? `${C.green}\u2713${C.reset}` : `${C.red}\u2717${C.reset}`;
    console.log(
      `    ${C.dim}[${taskCount}/${heavyTasks.length}]${C.reset} ${fromName} ${C.dim}->${C.reset} ${toName}: ${statusIcon} ${C.dim}(${t.rating}/5)${C.reset}`
    );

    const ix = startInteraction(t.from, t.to, t.task);
    completeInteraction(ix.interactionId, t.success);
    submitRating(ix.interactionId, t.from, t.to, t.rating, t.success ? "Solid work" : "Task failed");
    await sleep(250);
  }

  printLeaderboard("After Wave 2 (20 total interactions)");
  await sleep(1000);

  // ========== STEP 5: More staking + more interactions to trigger tier upgrades ==========
  printStep(5, "Additional Staking + Final Interactions (pushing for tier upgrades)");

  // More staking
  console.log(`    ${C.magenta}$${C.reset} ${C.bold}DeFi Optimizer${C.reset} adds ${C.bold}${C.magenta}2000 HBAR${C.reset} stake`);
  addStake("0.0.100001", 2000);
  await sleep(200);

  console.log(`    ${C.magenta}$${C.reset} ${C.bold}Data Oracle${C.reset} adds ${C.bold}${C.magenta}3000 HBAR${C.reset} stake`);
  addStake("0.0.100002", 3000);
  await sleep(200);

  console.log(`    ${C.magenta}$${C.reset} ${C.bold}Audit Guardian${C.reset} adds ${C.bold}${C.magenta}3000 HBAR${C.reset} stake`);
  addStake("0.0.100005", 3000);
  await sleep(500);

  // More interactions to cross thresholds
  const finalTasks = [
    { from: "0.0.100005", to: "0.0.100001", task: "Final security review", success: true, rating: 5 },
    { from: "0.0.100004", to: "0.0.100002", task: "NFT metadata validation", success: true, rating: 5 },
    { from: "0.0.100001", to: "0.0.100005", task: "DeFi protocol audit v2", success: true, rating: 5 },
    { from: "0.0.100003", to: "0.0.100001", task: "Trading fee optimization", success: true, rating: 5 },
    { from: "0.0.100004", to: "0.0.100001", task: "NFT collateral assessment", success: true, rating: 4 },
    { from: "0.0.100001", to: "0.0.100002", task: "DeFi TVL data request", success: true, rating: 5 },
    { from: "0.0.100003", to: "0.0.100005", task: "Trading contract review", success: true, rating: 5 },
    { from: "0.0.100002", to: "0.0.100001", task: "Market data for rebalance", success: true, rating: 5 },
  ];

  for (const t of finalTasks) {
    const fromName = agentStore.get(t.from)?.name;
    const toName = agentStore.get(t.to)?.name;
    console.log(
      `    ${C.green}\u2713${C.reset} ${fromName} ${C.dim}->${C.reset} ${toName}: ${C.dim}${t.task}${C.reset}`
    );
    const ix = startInteraction(t.from, t.to, t.task);
    completeInteraction(ix.interactionId, t.success);
    submitRating(ix.interactionId, t.from, t.to, t.rating, "Excellent execution");
    await sleep(350);
  }

  printLeaderboard("Final Leaderboard");

  // ========== STEP 6: Detailed breakdown ==========
  printStep(6, "Score Breakdown for Top Agents");

  const topAgents = getLeaderboard().slice(0, 3);
  for (const rep of topAgents) {
    printBreakdown(rep.agentId);
  }

  // ========== Summary ==========
  printHeader("Demo Complete -- Summary");

  console.log(`  ${C.bold}Total HCS Messages Logged:${C.reset}  ${C.cyan}${hcsLog.length}${C.reset}`);
  console.log(`  ${C.bold}Agents Registered:${C.reset}          ${C.cyan}${agentStore.size}${C.reset}`);
  console.log(`  ${C.bold}Total Interactions:${C.reset}         ${C.cyan}${interactionStore.size}${C.reset}`);
  console.log(`  ${C.bold}Total Ratings Submitted:${C.reset}    ${C.cyan}${Array.from(ratingStore.values()).reduce((s, r) => s + r.length, 0)}${C.reset}`);
  console.log();

  const finalBoard = getLeaderboard();
  console.log(`  ${C.bold}Final Rankings:${C.reset}`);
  finalBoard.forEach((rep, i) => {
    const name = agentStore.get(rep.agentId)?.name || rep.agentId;
    console.log(
      `    ${C.bold}${i + 1}.${C.reset} ${name.padEnd(20)} ${tierBadge(rep.trustTier)}  Score: ${C.bold}${rep.overallScore}${C.reset}/1000  Avg Rating: ${rep.averageRating.toFixed(1)}/5`
    );
  });

  console.log();
  console.log(`  ${C.dim}HCS Message Types Breakdown:${C.reset}`);
  const typeCounts: Record<string, number> = {};
  for (const entry of hcsLog) {
    typeCounts[entry.type] = (typeCounts[entry.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${C.dim}${type.padEnd(28)}${C.reset} ${count}`);
  }

  console.log();
  console.log(`  ${C.bold}${C.green}All reputation data is immutably logged to Hedera Consensus Service.${C.reset}`);
  console.log(`  ${C.bold}${C.green}Trust is verifiable, composable, and owned by the agents.${C.reset}`);
  console.log();
  console.log(`  ${C.dim}---${C.reset}`);
  console.log(`  ${C.dim}AgentRep - Built for the Hedera AI Agent Hackathon${C.reset}`);
  console.log();
}

// ---- Entry point ----
runDemo().catch((err) => {
  console.error(`${C.red}Demo failed:${C.reset}`, err);
  process.exit(1);
});
