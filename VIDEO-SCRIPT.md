# AgentRep — Demo Video Script (5 minutes)

---

## INTRO (0:00 – 0:30)

**[Screen: Landing page of agentrep.xyz]**

> "As AI agents become more autonomous — executing trades, managing workflows, handling sensitive data — one critical question emerges: which agents can you trust?"
>
> "Today we're presenting AgentRep — an on-chain reputation protocol for AI agents, built on Hedera."
>
> "AgentRep combines three open standards — HCS-10 for agent communication, HCS-11 for verifiable identity profiles, and ERC-8004, a new standard we designed for decentralized reputation registries."

**[Scroll down to show the formula: HCS-10 + HCS-11 + ERC-8004 = AgentRep Protocol]**

> "Together, they form the AgentRep Protocol."

---

## THE PROBLEM (0:30 – 1:00)

**[Screen: Architecture page or whitepaper section]**

> "Right now, there's no standardized way to evaluate AI agent trustworthiness. You can't tell if an agent is reliable, honest, or has been flagged by others."
>
> "Centralized review systems are easy to manipulate — one bad actor can inflate ratings, and there's no accountability."
>
> "AgentRep solves this with four mechanisms:"
>
> 1. "Reputation-weighted feedback — where your influence depends on your own score"
> 2. "Stake-based accountability — agents put real HBAR on the line"
> 3. "Cross-validation with outlier detection — peers verify each other, and statistical outliers are auto-discounted"
> 4. "Validation of validators — creating a recursive web of trust"

---

## LIVE DEMO — AGENT REGISTRATION (1:00 – 1:45)

**[Screen: Connect wallet on agentrep.xyz]**

> "Let's walk through the full flow. First, I connect my HashPack wallet."

**[Click Connect → HashPack popup → Sign message]**

> "The app verifies my Hedera account through a signed message — no passwords stored."

**[Navigate to Register page]**

> "Now I'll register a new agent. I give it a name, description, select a category, and check 'Register on HOL' to make it discoverable on the Hedera Open Ledger registry."

**[Fill form and submit]**

> "Behind the scenes, this does three things:"
> 1. "Creates HCS-10 inbound and outbound topics for the agent"
> 2. "Submits an AGENT_REGISTERED message to our Identity Topic on HCS"
> 3. "Registers the agent on the HOL broker so other agents can discover it"

**[Show agent appearing on the Agents page]**

> "The agent is now live — visible on our dashboard with a starting reputation score of zero."

---

## STAKING (1:45 – 2:15)

**[Screen: Agent profile page → Stake section]**

> "To prove skin in the game, agents must stake HBAR via our smart contract — AgentRepStaking.sol, deployed at contract 0.0.8264743."

**[Click Stake → Enter 5 HBAR → Confirm in HashPack]**

> "The minimum stake is 5 HBAR for 30 days. This stake can be slashed — 10% per upheld dispute — creating real economic consequences for bad behavior."

**[Show stake balance updated]**

> "The contract handles four operations: stake, slash, unstake, and getStake. All verifiable on HashScan."

---

## FEEDBACK & REPUTATION SCORING (2:15 – 3:00)

**[Screen: Agent profile → Leave Review section]**

> "Now let's submit feedback. As a verified user, I can rate this agent on a scale of 1 to 10."

**[Select category, enter score and comment, submit]**

> "Every piece of feedback is logged immutably on our Feedback HCS Topic. But here's what makes it interesting — not all feedback counts equally."

**[Show reputation score updating]**

> "The weight formula is: weight equals 0.2 plus 0.8 times the giver's score divided by 1000. So a brand new agent with zero reputation has minimal influence, while a trusted agent with a score of 800 has almost full weight."
>
> "The final reputation score is a composite of four components:"
> - "Quality: 30% — weighted feedback average"
> - "Reliability: 30% — validation scores from peers"
> - "Activity: 20% — logarithmic scale of total interactions"
> - "Consistency: 20% — low standard deviation means higher score"
>
> "Scores range from 0 to 1000, placing agents into trust tiers: Unverified, Verified, Trusted, and Elite."

---

## CROSS-VALIDATION & OUTLIER DETECTION (3:00 – 3:20)

**[Screen: Demo script in terminal — or show validation on the UI]**

> "After feedback is submitted, either the giver or receiver can request validation. The system then checks for qualified validators — agents with at least 5 HBAR staked, a VERIFIED reputation, and 3 or more interactions. If validators are found, they're notified via HCS-10 and have 24 hours to respond. If no validators exist yet — which is normal for a new network — the feedback is accepted but marked as unvalidated."
>
> "On top of that, we run z-score outlier detection. If feedback deviates more than 1.5 standard deviations from the mean, it's automatically discounted to 10% weight. And if a dispute later proves the feedback was bad, validators who confirmed it get a reputation penalty."

---

## DECENTRALIZED ARBITRATION (3:20 – 4:00)

**[Screen: Whitepaper arbitration section or architecture diagram]**

> "What happens when feedback is disputed? This is where the arbitration system comes in."
>
> "First, the agent who received unfair feedback files a dispute and deposits a 2 HBAR bond. This bond prevents spam — if your dispute is frivolous, you lose it."
>
> "The system then deterministically selects 3 arbiters from a qualified pool. To become an arbiter, you need a minimum 10 HBAR stake, a Trusted reputation tier — that's a score of at least 500 — and at least 10 completed interactions."
>
> "Arbiters receive the dispute via HCS-10 — the same messaging protocol agents already use for communication. They have 48 hours to vote upheld or dismissed. If they don't respond, they're rotated out and penalized."
>
> "Majority wins: 2 out of 3. If upheld, the accused gets 10% of their stake slashed. If dismissed, the disputer loses their bond — it goes to the accused as compensation."
>
> "And who judges the arbiters? The math does. If an arbiter consistently votes against the majority, their own reputation drops, and they eventually lose arbiter eligibility. Nobody appoints arbiters — the protocol determines eligibility automatically."

---

## AGENT-TO-AGENT COMMUNICATION (4:00 – 4:20)

**[Screen: Connections page]**

> "This is where HCS-10 comes alive. On the Connections page, I can chat directly with any registered agent."

**[Select an agent → Send a message]**

> "When I send a message, it goes through a shared HCS connection topic. The agent picks it up via our SDK's AgentRunner — which polls the topic and auto-responds."

**[Show agent responding in real-time]**

> "We built a TypeScript SDK — agent-rep-sdk, published on npm — that wraps all of this. Developers can integrate reputation checking and HCS-10 messaging into their own agents with just a few lines of code."

**[Show terminal: node scripts/demo-scenario.js]**

> "We also have CLI demo scripts that simulate the full lifecycle — feedback, validation, disputes, and slashing — all from the terminal."

---

## ARCHITECTURE OVERVIEW (4:20 – 4:45)

**[Screen: Architecture page on agentrep.xyz]**

> "Let me show you the full architecture. The frontend is built with Next.js 14, deployed on Vercel. The backend runs NestJS on Render with a Neon PostgreSQL database."
>
> "On-chain, we have three HCS topics — Identity, Feedback, and Validation — plus the AgentRepStaking smart contract in Solidity."
>
> "Everything is live on Hedera Testnet and publicly verifiable on HashScan."

**[Scroll to show the standards cards: ERC-8004, HCS, HCS-10, HCS-11]**

> "We implement ERC-8004's three registries — Identity, Reputation, and Validation — natively using HCS topics rather than EVM storage. This gives us Hedera's speed and low cost while maintaining full immutability."

---

## CLOSING (4:45 – 5:00)

**[Screen: Landing page with stats]**

> "AgentRep is live today at agentrep.xyz. We have 7 registered agents, real feedback on-chain, real stakes locked, and a working SDK for developers."
>
> "As autonomous AI agents become the norm, trust infrastructure isn't optional — it's essential. AgentRep provides that foundation."
>
> "Built by Firas Belhiba and Olfa Selmi for the Hello Future Apex Hackathon. Thank you."

**[Show team section with photos]**

---

## RECORDING TIPS

- **Resolution**: 1920x1080 or higher
- **Browser**: Use Chrome with HashPack extension installed
- **Prep**: Make sure backend is running (`cd backend && npm run start:dev`)
- **Terminal**: Have `node scripts/demo-scenario.js` ready for the CLI demo
- **Pace**: Speak clearly, pause between sections
- **Music**: Optional subtle background track (lo-fi or ambient)
