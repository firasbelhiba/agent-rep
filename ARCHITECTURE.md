# AgentRep - Architecture Document

## 1. What is AgentRep?

AgentRep is the **ERC-8004 equivalent for Hedera** — an on-chain reputation and trust infrastructure for AI agents. It implements the same three registries as ERC-8004 (Identity, Reputation, Validation) but built natively on Hedera using HCS, HTS, and Hedera's sub-cent transaction costs.

**Core thesis:** In the emerging agentic economy, trust cannot be assumed — it must be earned, verified, and anchored on-chain.

---

## 2. ERC-8004 Alignment

| ERC-8004 Registry | AgentRep Equivalent | Hedera Primitive |
|---|---|---|
| **Identity Registry** (ERC-721 based agent IDs) | Agent Registration (HCS-10 + HCS-11) | HCS Topic |
| **Reputation Registry** (feedback + ratings) | Feedback System (-100 to +100, tags, revokable) | HCS Topic |
| **Validation Registry** (work verification) | Validation System (0-100 scores, validators) | HCS Topic |

**Key design principle from ERC-8004:** On-chain = raw data. Off-chain = aggregation/scoring. Trust is context-dependent.

---

## 3. Architecture

```
+===========================================================================+
|                         HEDERA TESTNET (On-Chain)                         |
|                                                                           |
|  HCS Topic: Identity    HCS Topic: Feedback    HCS Topic: Validation     |
|  (agent registrations)  (feedback submissions)  (validation req/resp)     |
|                                                                           |
|  HTS NFT Collection: AREP (dynamic reputation badges)                    |
|                                                                           |
|  All data verifiable on HashScan: hashscan.io/testnet                    |
|                                                                           |
|  HOL Registry Broker (hol.org) — opt-in agent discoverability + UAID     |
+==================================|========================================+
                                   | Mirror Node API (free reads)
                                   v
+===========================================================================+
|                         NEXT.JS APP (Off-Chain)                           |
|                                                                           |
|  +-- API Routes --+  +-- Store (JSON) --+  +-- Scoring Engine --+        |
|  | POST /agents   |  | agents{}         |  | Quality: 0-300     |        |
|  | POST /feedback |->| feedback[]       |->| Reliability: 0-300 |        |
|  | POST /validation| | validationReq[]  |  | Activity: 0-200    |        |
|  | GET /leaderboard| | validationResp[] |  | Consistency: 0-200 |        |
|  +----------------+  +-----------------+  | Total: 0-1000      |        |
|                                            +--------------------+        |
|  +-- Pages --------+  +-- Rate Limiter ----+                             |
|  | / (landing)     |  | 20 writes/hr/IP    |                             |
|  | /agents         |  | Protects server    |                             |
|  | /agents/[id]    |  | wallet from abuse  |                             |
|  | /register       |  +-------------------+                              |
|  | /leaderboard    |                                                     |
|  +-----------------+                                                     |
+===========================================================================+
```

---

## 4. Scoring Model

Reputation is computed **off-chain** from **on-chain data** (following ERC-8004 design):

| Component | Weight | Source | Formula |
|---|---|---|---|
| **Quality** | 0-300 (30%) | Feedback values (-100 to +100) | normalized_avg * 300 * confidence |
| **Reliability** | 0-300 (30%) | Validation scores (0-100) | (avg_score/100) * 300 * confidence |
| **Activity** | 0-200 (20%) | Total feedback + validations | min(200, log(1+total) * 60) |
| **Consistency** | 0-200 (20%) | Variance of feedback scores | (1 - stddev/100) * 200 |

**Trust Tiers:**
- UNVERIFIED: score < 200 or activity < 3
- VERIFIED: score >= 200 AND activity >= 3
- TRUSTED: score >= 500 AND activity >= 10
- ELITE: score >= 800 AND activity >= 20

---

## 5. Transaction Costs (Why Hedera Wins)

| Action | Hedera Cost | Ethereum (ERC-8004) Cost |
|---|---|---|
| Register agent | ~$0.0001 | ~$5-50 (gas) |
| Submit feedback | ~$0.0001 | ~$5-50 (gas) |
| Validation response | ~$0.0001 | ~$5-50 (gas) |
| Mint NFT badge | ~$0.05 | ~$10-100 (gas) |
| Read data | FREE (Mirror Node) | FREE (view functions) |
| **100 operations** | **~$0.01** | **~$500-5000** |

---

## 6. Security & Anti-Spam

### Current (Hackathon/Testnet)
- **Server-side operator wallet** handles all HCS/HTS transactions
- **Rate limiting**: 20 write operations per IP per hour
- **Self-review prevention**: Cannot submit feedback for your own agent
- **Value validation**: Feedback must be -100 to +100, validation must be 0-100
- **Duplicate prevention**: Cannot register same agent ID twice

### Production Roadmap (Post-Hackathon)
- **HashConnect wallet integration**: Users connect HashPack wallet
- **HBAR staking for registration**: Agents stake HBAR as anti-sybil mechanism
  - Minimum stake required to register (e.g., 10 HBAR)
  - Stake gets slashed for malicious behavior (5-30%)
  - Users pay their own transaction fees from their wallet
  - Server wallet no longer subsidizes — eliminates drain risk
- **Reputation-weighted feedback**: Higher-tier agents' feedback counts more
- **Dispute resolution**: Challenge invalid feedback with on-chain arbitration
- **Oracle-based slashing**: Automated detection of malicious agents

### Why Server-Side for Hackathon
- Judges don't need to install HashPack browser extension
- Lower friction for demo — click and it works
- Same on-chain result — every HCS message is verifiable on HashScan
- Testnet HBAR is free (faucet), so no real cost

---

## 7. Data Flow

### Agent Registration
```
User fills form → POST /api/agents → Save to store → Log to HCS Identity Topic
                                                        ↓
                                              Verifiable on HashScan
```

### Feedback Submission (ERC-8004 Reputation Registry)
```
User submits feedback → POST /api/feedback → Validate (value, self-review)
    → Rate limit check → Save to store → Log to HCS Feedback Topic
    → Recompute reputation score → Return updated score
```

### Validation (ERC-8004 Validation Registry)
```
Agent requests validation → POST /api/validation → Save request to store
    → Log to HCS Validation Topic

Validator responds → POST /api/validation/respond → Verify validator matches
    → Save response → Log to HCS Validation Topic → Recompute score
```

---

## 8. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Next.js API Routes (serverless) |
| Blockchain | Hedera (HCS, HTS), @hashgraph/sdk |
| Standards | HCS-10 (agent communication), HCS-11 (agent profiles) |
| Data | JSON file store (hackathon), PostgreSQL (production) |
| Deployment | Vercel |

---

## 9. API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | /api/agents | List all agents with reputation |
| POST | /api/agents | Register new agent |
| GET | /api/agents/[id] | Agent detail + feedback + validations |
| GET | /api/feedback | Get feedback (filter by agentId, tag) |
| POST | /api/feedback | Submit feedback (-100 to +100) |
| DELETE | /api/feedback/[id] | Revoke feedback |
| PATCH | /api/feedback/[id] | Respond to feedback |
| GET | /api/validation | Get validations (by agentId or hash) |
| POST | /api/validation | Request validation |
| POST | /api/validation/respond | Submit validation score (0-100) |
| GET | /api/leaderboard | Ranked agents by score |
| GET | /api/activity | Recent activity feed |
| POST | /api/setup | Create HCS topics + NFT collection |

---

## 10. Pitch Talking Points

1. **"ERC-8004 is still a draft on Ethereum. We built the working equivalent on Hedera."**
2. **"Every feedback and validation is an immutable HCS message — verifiable on HashScan."**
3. **"100 reputation operations cost $0.01 on Hedera vs $5000+ on Ethereum."**
4. **"Scores are computed off-chain from on-chain data — same design as ERC-8004 specifies."**
5. **"In production, agents stake HBAR via HashConnect as anti-sybil. Server-side for testnet demo."**
6. **"Trust tiers (Unverified → Elite) require both high scores AND minimum activity — can't game it."**
7. **"Agents are registered via HCS-10 with optional HOL Registry Broker integration for cross-ecosystem discoverability."**
8. **"We use the HOL Standards SDK (@hashgraphonline/standards-sdk) for HCS-10, HCS-11, and Registry Broker — not a custom implementation."**
