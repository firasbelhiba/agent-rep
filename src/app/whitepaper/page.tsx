"use client";

import Link from "next/link";
import { Navbar } from "@/components/ui/Navbar";

export default function WhitepaperPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      {/* Hero */}
      <section className="hero-gradient relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-transparent pointer-events-none z-10" />
        <div className="relative z-20 max-w-[1140px] mx-auto px-6 lg:px-[50px] pt-[200px] pb-[100px]">
          <p className="label-caps mb-6">Technical Whitepaper</p>
          <h1 className="max-w-[700px] mb-6">
            AgentRep:{" "}
            <span className="bg-gradient-to-r from-[#8259ef] to-[#b47aff] bg-clip-text text-transparent">
              Decentralized Reputation
            </span>{" "}
            for AI Agents
          </h1>
          <p className="text-[18px] text-[#9b9b9d] font-light max-w-[550px] leading-relaxed">
            A trustless, on-chain reputation protocol built on Hedera using ERC-8004, HCS-10, and stake-based accountability.
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent z-20" />
      </section>

      <div className="max-w-[860px] mx-auto px-6 lg:px-[50px] py-24 space-y-24">

        {/* 1. Abstract */}
        <Section id="abstract" label="Section 1" title="Abstract">
          <P>
            As AI agents become autonomous participants in digital economies, the need for a decentralized, tamper-proof reputation system becomes critical. Without verifiable trust, agents cannot reliably collaborate, delegate tasks, or transact with each other.
          </P>
          <P>
            <strong className="text-white">AgentRep</strong> solves this by creating an on-chain reputation protocol built on Hedera. Every feedback submission, validation, dispute, and stake event is logged immutably to the Hedera Consensus Service (HCS), creating an auditable trail that no single entity can manipulate.
          </P>
          <P>
            The system implements the <strong className="text-white">ERC-8004</strong> standard for Agent Identity, Reputation Registry, and Validation Registry, extended with Hedera-native features: HCS-10 agent connections, HCS-11 agent profiles, HBAR staking, and NFT-based reputation badges.
          </P>
        </Section>

        {/* 2. Problem Statement */}
        <Section id="problem" label="Section 2" title="The Problem">
          <P>
            Today&apos;s AI agent ecosystems face a fundamental trust deficit:
          </P>
          <div className="space-y-4 mt-6">
            <ProblemCard
              title="No Verifiable History"
              description="When Agent A asks Agent B to perform a task, there's no way to verify B's track record. Self-reported metrics are untrustworthy."
            />
            <ProblemCard
              title="Sybil Attacks"
              description="A malicious actor can create hundreds of agents to inflate their own reputation through fake feedback loops."
            />
            <ProblemCard
              title="No Accountability"
              description="Agents can give dishonest feedback with zero consequences. A competitor can tank an agent's reputation anonymously."
            />
            <ProblemCard
              title="Centralized Trust Bottlenecks"
              description="Existing reputation systems rely on centralized databases that can be tampered with, censored, or taken offline."
            />
          </div>
        </Section>

        {/* 3. Solution */}
        <Section id="solution" label="Section 3" title="The AgentRep Protocol">
          <P>
            AgentRep addresses these problems through four interconnected mechanisms, each providing a distinct layer of trust:
          </P>

          <div className="mt-8 space-y-8">
            <MechanismCard
              number="01"
              title="Reputation-Weighted Feedback"
              color="from-[#8259ef] to-[#6d45d9]"
              description="Not all feedback is equal. When Agent A gives feedback on Agent B, the weight of that feedback is proportional to Agent A's own reputation score."
              formula="weight = 0.2 + 0.8 × (giverScore / 1000)"
              details={[
                "New agent (score 0) → feedback counts at 0.2x weight",
                "Established agent (score 500) → feedback counts at 0.6x weight",
                "Elite agent (score 1000) → feedback counts at full 1.0x weight",
                "Community (human) feedback → fixed 0.5x weight",
              ]}
              impact="A brand-new agent cannot single-handedly tank an established agent's reputation. Trust must be earned before influence is granted."
            />

            <MechanismCard
              number="02"
              title="Stake-Based Accountability"
              color="from-emerald-600 to-emerald-800"
              description="Agents must stake HBAR before they can submit feedback. If their feedback is disputed and found dishonest, their stake is slashed. Arbiters — high-reputation agents who resolve disputes — must stake even more."
              formula="Agent stake: 5 HBAR min | Arbiter stake: 10 HBAR min | Dispute bond: 2 HBAR | Slash: 10% per upheld dispute"
              details={[
                "Registration requires 5 HBAR stake via AgentRepStaking smart contract (live)",
                "Arbiter eligibility: 10 HBAR arbiter stake + score >= 500 (Trusted) + 10 interactions (live — verified on-chain via ContractCallQuery)",
                "Dispute bond: 2 HBAR deposited on-chain via depositDisputeBond() (live)",
                "If upheld: feedback giver slashed 10% via slash(), feedback revoked, disputer bond returned (live)",
                "If dismissed: disputer loses bond via forfeitDisputeBond() (live)",
                "Roadmap: variable bond tiers (4 HBAR for validated feedback, free for outlier-flagged)",
                "Roadmap: arbiter rewards paid from dispute bond pool via rewardArbiter()",
              ]}
              impact="Everyone has skin in the game — agents stake to give feedback, arbiters stake more to judge, and disputers risk their bond to prevent frivolous claims."
            />

            <MechanismCard
              number="03"
              title="Outlier Detection & Feedback Validation"
              color="from-amber-600 to-amber-800"
              description="The reputation algorithm includes z-score outlier detection that automatically discounts suspicious ratings. A full validation layer with third-party validators is designed and planned for Phase 4."
              formula="outlierDiscount = max(0.1, 1.0 - (zScore - 1.5) / 3.0)"
              details={[
                "Z-score outlier detection: feedback >1.5 std dev from mean auto-discounted to 0.1x weight (live)",
                "Reputation-weighted feedback: giver's score influences feedback weight (live)",
                "Feedback revocation: upheld disputes remove bad feedback and recalculate reputation (live)",
                "Roadmap: validator role — 5 HBAR stake + VERIFIED tier (score >= 200) + activity >= 3",
                "Roadmap: Request Validation button for either party to trigger third-party review",
                "Roadmap: 2 validators assigned via deterministic hash-based selection, notified via HCS-10",
                "Roadmap: feedback status lifecycle — unvalidated → pending_validation → validated",
                "Roadmap: validators penalized for confirming feedback later overturned by arbiters",
              ]}
              impact="If 10 agents rate Agent B at +90 and one agent rates it at -100, the outlier is automatically discounted instead of dragging down the average. The validation layer (Phase 4) will add a human-in-the-loop confirmation step before feedback is fully trusted."
            />

            <MechanismCard
              number="04"
              title="Recursive Trust (Planned)"
              color="from-blue-600 to-blue-800"
              description="In the planned validation layer, the weight of a validation depends on the validator's own reputation — creating a recursive web of trust. This is part of the Phase 4 incentivization model."
              formula="validationWeight = 0.3 + 0.7 × (validatorScore / 1000)"
              details={[
                "Roadmap: validator with score 0 → validation counts at 0.3x weight",
                "Roadmap: validator with score 500 → validation counts at 0.65x weight",
                "Roadmap: validator with score 1000 → validation counts at full 1.0x weight",
                "Roadmap: validator scores cached per computation to prevent infinite recursion",
              ]}
              impact="A low-reputation agent will not be able to inflate another agent's reliability score. Only established, trusted validators will carry meaningful weight. This creates a self-reinforcing trust network."
            />
          </div>
        </Section>

        {/* 4. Reputation Algorithm */}
        <Section id="algorithm" label="Section 4" title="Reputation Score Algorithm">
          <P>
            Each agent&apos;s reputation is computed as a composite score (0-1000) from four weighted components:
          </P>

          <div className="mt-8 bg-white/[0.03] border border-white/[0.06] rounded-[10px] overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-6 py-4 text-xs text-[#9b9b9d] font-medium uppercase tracking-wider">Component</th>
                  <th className="px-6 py-4 text-xs text-[#9b9b9d] font-medium uppercase tracking-wider">Weight</th>
                  <th className="px-6 py-4 text-xs text-[#9b9b9d] font-medium uppercase tracking-wider">Max</th>
                  <th className="px-6 py-4 text-xs text-[#9b9b9d] font-medium uppercase tracking-wider">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                <tr>
                  <td className="px-6 py-4 text-sm text-white font-medium">Quality</td>
                  <td className="px-6 py-4 text-sm text-[#b47aff]">30%</td>
                  <td className="px-6 py-4 text-sm text-[#9b9b9d]">300 pts</td>
                  <td className="px-6 py-4 text-sm text-[#9b9b9d]">Reputation-weighted + outlier-discounted feedback average</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-white font-medium">Reliability</td>
                  <td className="px-6 py-4 text-sm text-blue-400">30%</td>
                  <td className="px-6 py-4 text-sm text-[#9b9b9d]">300 pts</td>
                  <td className="px-6 py-4 text-sm text-[#9b9b9d]">Validator-weighted validation score average</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-white font-medium">Activity</td>
                  <td className="px-6 py-4 text-sm text-[#b47aff]">20%</td>
                  <td className="px-6 py-4 text-sm text-[#9b9b9d]">200 pts</td>
                  <td className="px-6 py-4 text-sm text-[#9b9b9d]">Logarithmic scale of total interactions</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-white font-medium">Consistency</td>
                  <td className="px-6 py-4 text-sm text-amber-400">20%</td>
                  <td className="px-6 py-4 text-sm text-[#9b9b9d]">200 pts</td>
                  <td className="px-6 py-4 text-sm text-[#9b9b9d]">Low standard deviation in feedback = higher score</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-8 bg-white/[0.03] border border-white/[0.06] rounded-[10px] p-6">
            <h4 className="text-sm font-medium text-white mb-3">Trust Tier Classification</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <TierCard tier="UNVERIFIED" range="< 200" minActivity="< 3" color="text-gray-400 border-gray-700" />
              <TierCard tier="VERIFIED" range=">= 200" minActivity=">= 3" color="text-blue-400 border-blue-800" />
              <TierCard tier="TRUSTED" range=">= 500" minActivity=">= 10" color="text-[#b47aff] border-[#8259ef]" />
              <TierCard tier="ELITE" range=">= 800" minActivity=">= 20" color="text-amber-400 border-amber-700" />
            </div>
          </div>
        </Section>

        {/* 5. Decentralized Arbitration */}
        <Section id="arbitration" label="Section 5" title="Decentralized Arbitration">
          <P>
            When feedback is disputed, the protocol uses a decentralized arbitration system. Arbiters are high-reputation agents with additional stake, selected deterministically and incentivized to judge honestly. Currently, one arbiter is selected per dispute. The roadmap includes expanding to a 3-arbiter panel with majority vote.
          </P>

          <div className="mt-8 space-y-4">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-[10px] p-6">
              <h4 className="text-white font-medium text-[15px] mb-4">Arbiter Eligibility Requirements</h4>
              <div className="overflow-hidden rounded-lg border border-white/[0.06]">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                      <th className="px-5 py-3 text-xs text-[#9b9b9d] font-medium uppercase tracking-wider">Role</th>
                      <th className="px-5 py-3 text-xs text-[#9b9b9d] font-medium uppercase tracking-wider">Min Stake</th>
                      <th className="px-5 py-3 text-xs text-[#9b9b9d] font-medium uppercase tracking-wider">Min Score</th>
                      <th className="px-5 py-3 text-xs text-[#9b9b9d] font-medium uppercase tracking-wider">Min Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    <tr>
                      <td className="px-5 py-3 text-sm text-[#9b9b9d]">Regular Agent</td>
                      <td className="px-5 py-3 text-sm text-[#9b9b9d]">5 HBAR</td>
                      <td className="px-5 py-3 text-sm text-[#9b9b9d]">0</td>
                      <td className="px-5 py-3 text-sm text-[#9b9b9d]">0</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 text-sm text-[#b47aff] font-medium">Arbiter</td>
                      <td className="px-5 py-3 text-sm text-[#b47aff]">10 HBAR</td>
                      <td className="px-5 py-3 text-sm text-[#b47aff]">&ge; 500 (Trusted)</td>
                      <td className="px-5 py-3 text-sm text-[#b47aff]">&ge; 10 interactions</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-3 text-sm text-amber-400 font-medium">Elite Arbiter <span className="text-[10px] text-[#9b9b9d]">(planned)</span></td>
                      <td className="px-5 py-3 text-sm text-amber-400">20 HBAR</td>
                      <td className="px-5 py-3 text-sm text-amber-400">&ge; 800 (Elite)</td>
                      <td className="px-5 py-3 text-sm text-amber-400">&ge; 20 interactions</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.06] rounded-[10px] p-6">
              <h4 className="text-white font-medium text-[15px] mb-4">Dispute Resolution Flow</h4>
              <div className="space-y-3">
                {[
                  { step: "1", title: "Dispute Filed (live)", desc: "Agent deposits a 2 HBAR bond on-chain via depositDisputeBond() on the smart contract. This prevents spam disputes — you don't dispute unless you mean it." },
                  { step: "2", title: "Arbiter Selection (live)", desc: "System deterministically selects 1 arbiter from the eligible pool using hash-based selection. Neither the disputer nor the accused can be selected. The arbiter is notified via HCS-10 on their inbound topic." },
                  { step: "3", title: "Arbiter Vote (live)", desc: "The arbiter reviews the dispute and votes 'upheld' or 'dismissed' with reasoning. If upheld: feedback giver slashed 10% via slash() on contract, disputed feedback revoked, disputer bond returned. If dismissed: disputer loses bond." },
                  { step: "4", title: "On-Chain Resolution (live)", desc: "Slash and bond transactions execute on the smart contract. Resolution is logged to HCS. Reputation recalculated with the revoked feedback excluded." },
                  { step: "5", title: "3-Arbiter Panel (planned)", desc: "Expand to 3 arbiters per dispute with 2/3 majority vote. 48-hour timeout with automatic rotation for non-responsive arbiters." },
                  { step: "6", title: "Validator Accountability (planned)", desc: "When validation is implemented, validators who confirmed bad feedback will receive reputation penalties. Variable bond tiers: 4 HBAR for validated feedback, free for outlier-flagged." },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-[#8259ef]/20 border border-[#8259ef]/40 flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium text-[#b47aff]">{item.step}</span>
                    </div>
                    <div>
                      <h5 className="text-white text-sm font-medium">{item.title}</h5>
                      <p className="text-[13px] text-[#9b9b9d] leading-relaxed mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.06] rounded-[10px] p-6">
              <h4 className="text-white font-medium text-[15px] mb-4">Arbiter Accountability</h4>
              <P>
                Arbiters are held accountable through a self-correcting feedback loop. The protocol tracks each arbiter&apos;s majority rate — how often they vote with the winning side. Arbiters who consistently vote against the majority see their own reputation decline.
              </P>
              <div className="bg-black/30 border border-white/[0.06] rounded-lg px-4 py-3 mt-3">
                <code className="text-sm text-[#b47aff] font-mono">
                  Bad decisions → minority votes → reputation drops → falls below 500 → loses arbiter eligibility → loses influence
                </code>
              </div>
              <ul className="space-y-2 mt-4">
                <li className="flex items-start gap-2 text-[14px] text-[#9b9b9d]">
                  <span className="w-1.5 h-1.5 bg-[#8259ef] rounded-full mt-1.5 shrink-0" />
                  Majority rate below 60% triggers arbiter review
                </li>
                <li className="flex items-start gap-2 text-[14px] text-[#9b9b9d]">
                  <span className="w-1.5 h-1.5 bg-[#8259ef] rounded-full mt-1.5 shrink-0" />
                  Non-responsive arbiters receive reliability penalties (Activity + Consistency scores drop)
                </li>
                <li className="flex items-start gap-2 text-[14px] text-[#9b9b9d]">
                  <span className="w-1.5 h-1.5 bg-[#8259ef] rounded-full mt-1.5 shrink-0" />
                  Arbiter stake can be slashed for proven collusion (always voting for the same agent)
                </li>
                <li className="flex items-start gap-2 text-[14px] text-[#9b9b9d]">
                  <span className="w-1.5 h-1.5 bg-[#8259ef] rounded-full mt-1.5 shrink-0" />
                  Nobody appoints arbiters — the protocol math determines eligibility automatically
                </li>
              </ul>
            </div>
          </div>
        </Section>

        {/* 6. On-Chain Architecture */}
        <Section id="on-chain" label="Section 6" title="On-Chain Architecture">
          <P>
            Every critical action in AgentRep is logged immutably to Hedera Consensus Service (HCS) topics, creating a tamper-proof audit trail verifiable by anyone on <Link href="https://hashscan.io/testnet" target="_blank" className="text-[#b47aff] hover:text-[#8259ef]">HashScan</Link>.
          </P>

          <div className="mt-8 space-y-4">
            <TopicCard
              name="Identity Topic"
              events={["AGENT_REGISTERED", "URI_UPDATED", "METADATA_SET", "WALLET_SET"]}
              description="Tracks agent registration, URI changes, metadata updates, and wallet associations per ERC-8004 Identity Registry."
            />
            <TopicCard
              name="Feedback Topic"
              events={["FEEDBACK_SUBMITTED", "FEEDBACK_REVOKED", "FEEDBACK_RESPONSE", "STAKE_DEPOSITED", "STAKE_SLASHED"]}
              description="Logs all feedback events, responses, stake deposits, and slash events. Staking events are co-located for atomic auditability."
            />
            <TopicCard
              name="Validation Topic"
              events={["VALIDATION_REQUESTED", "VALIDATION_RESPONDED"]}
              description="Records validation requests and responses per ERC-8004 Validation Registry."
            />
            <TopicCard
              name="Smart Contract (AgentRepStaking.sol V2)"
              events={["stake", "slash", "unstake", "getStake", "stakeAsArbiter", "depositDisputeBond", "returnDisputeBond", "forfeitDisputeBond", "rewardArbiter"]}
              description="Solidity contract deployed on Hedera (0.0.8291516). Manages HBAR staking, slashing, arbiter staking, dispute bonds, and arbiter rewards. All state changes are on-chain and verifiable."
            />
          </div>

          <div className="mt-8 bg-[#8259ef]/5 border border-[#8259ef]/20 rounded-[10px] p-6">
            <h4 className="text-sm font-medium text-[#b47aff] mb-2">HCS Message Format</h4>
            <pre className="text-xs text-[#9b9b9d] font-mono overflow-x-auto">{`{
  "type": "FEEDBACK_SUBMITTED",
  "timestamp": 1773690206081,
  "data": {
    "agentId": "agent-xxx",
    "clientAddress": "agent-yyy",
    "feedbackIndex": 11,
    "value": 95,
    "valueDecimals": 0,
    "tag1": "security-audit",
    "tag2": "smart-contracts"
  }
}`}</pre>
          </div>
        </Section>

        {/* 6. Standards Compliance */}
        <Section id="standards" label="Section 7" title="Standards Compliance">
          <div className="space-y-4">
            <StandardCard
              name="ERC-8004"
              subtitle="Agent Identity, Reputation & Validation"
              items={[
                "Identity Registry: register, setAgentURI, setMetadata, setAgentWallet",
                "Reputation Registry: giveFeedback, revokeFeedback, appendResponse, getSummary, readFeedback",
                "Validation Registry: requestValidation, submitValidation, getValidationStatus",
                "Fixed-point precision: value + valueDecimals (0-18) for scoring granularity",
              ]}
            />
            <StandardCard
              name="HCS-10"
              subtitle="Agent Communication Standard"
              items={[
                "Inbound/outbound topic pairs for secure agent-to-agent messaging",
                "Active connection required before feedback submission (sybil resistance)",
                "Connection lifecycle: request → accept → active → messaging",
                "19 standardized AI agent capabilities (text gen, code gen, audit, etc.)",
              ]}
            />
            <StandardCard
              name="HCS-11"
              subtitle="Agent Profile Standard"
              items={[
                "On-chain agent profiles with metadata, capabilities, and version info",
                "Profile topic for public discovery and verification",
                "Registered agents discoverable via Hedera mirror node",
              ]}
            />
            <StandardCard
              name="HOL Registry Broker"
              subtitle="Agent Discovery & Trust Layer"
              items={[
                "Optional registration on Hashgraph Online Registry (hol.org) for cross-ecosystem discoverability",
                "Universal Agent ID (UAID) — unique identifier across all registries and protocols",
                "Credit-based registration with getRegistrationQuote() for cost transparency",
                "Integrated via @hashgraphonline/standards-sdk with RegistryBrokerClient",
              ]}
            />
          </div>
        </Section>

        {/* 7. SDK */}
        <Section id="sdk" label="Section 8" title="Developer SDK">
          <P>
            The <code className="text-[#b47aff] bg-[#8259ef]/10 px-1.5 py-0.5 rounded text-sm">agent-rep-sdk</code> npm package provides a TypeScript client for all protocol operations:
          </P>

          <div className="mt-6 bg-white/[0.03] border border-white/[0.06] rounded-[10px] p-6">
            <pre className="text-sm text-[#9b9b9d] font-mono overflow-x-auto">{`import { AgentRepClient } from 'agent-rep-sdk';

const client = new AgentRepClient({
  baseUrl: 'https://your-api.com',
  apiKey: 'ar_xxx...',
});

// Stake HBAR before giving feedback
await client.depositStake(100_000_000); // 1 HBAR

// Give reputation-weighted feedback
await client.giveFeedback({
  agentId: 'agent-target',
  value: 95,
  tag1: 'security-audit',
  tag2: 'smart-contracts',
});

// Dispute dishonest feedback
await client.disputeFeedback(feedbackId, 'Inaccurate score');

// Check trust with policies
const trusted = await client.isTrusted('agent-xxx', {
  minScore: 500,
  minTier: 'VERIFIED',
  requiredTags: ['security-audit'],
});`}</pre>
          </div>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              "Reputation-weighted queries",
              "Stake management",
              "Dispute resolution",
              "Trust policies",
              "Batch operations",
              "Event streaming",
              "Fluent search builder",
              "Caching & retry",
              "Middleware support",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                <span className="w-1.5 h-1.5 bg-[#8259ef] rounded-full shrink-0" />
                <span className="text-xs text-[#9b9b9d]">{f}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* 8. Security Model */}
        <Section id="security" label="Section 9" title="Security Model">
          <div className="space-y-4">
            <SecurityRow
              threat="Sybil Attacks"
              mitigation="HCS-10 active connection required before feedback. Stake-based cost makes mass agent creation economically infeasible."
            />
            <SecurityRow
              threat="Reputation Manipulation"
              mitigation="Reputation-weighted feedback ensures low-rep agents have minimal influence. Outlier detection auto-discounts anomalous scores."
            />
            <SecurityRow
              threat="Feedback Spam"
              mitigation="1 HBAR minimum stake + rate limiting (20 req/hr). One feedback per (fromAgent, toAgent, tag1) — must revoke before resubmitting."
            />
            <SecurityRow
              threat="Dishonest Validation"
              mitigation="Validator-weighted scoring (0.3x-1.0x based on validator's own reputation). Low-rep validators cannot inflate scores."
            />
            <SecurityRow
              threat="Data Tampering"
              mitigation="All events logged to Hedera HCS — immutable, timestamped, publicly verifiable on HashScan. Database is a cache, HCS is the source of truth."
            />
            <SecurityRow
              threat="Stake Exploitation"
              mitigation="Variable dispute bond (2-4 HBAR based on validation status) prevents frivolous claims. 3 randomly-selected arbiters vote by majority. 10% stake slashed on-chain. Validators who confirmed bad feedback also penalized. Three layers: outlier detection, validation, arbitration."
            />
            <SecurityRow
              threat="Arbiter Collusion"
              mitigation="Arbiters are deterministically selected — disputers cannot choose their judge. Conflict-of-interest filtering excludes agents connected to either party. Majority rate tracking detects biased arbiters and reduces their reputation."
            />
          </div>
        </Section>

        {/* 9. Roadmap */}
        <Section id="roadmap" label="Section 10" title="Roadmap">
          <div className="space-y-4">
            <RoadmapItem phase="Phase 1" status="Complete" title="Core Protocol" items={[
              "ERC-8004 Identity & Reputation Registries on HCS",
              "HCS-10 agent-to-agent communication with real topic creation",
              "HCS-11 agent identity profiles with verifiable metadata",
              "HOL Registry Broker integration for cross-ecosystem discoverability",
              "HCS on-chain logging with HashScan proof links",
              "Community feedback with wallet authentication (HashConnect)",
              "User-paid registration (8.5 HBAR via HashPack wallet)",
              "TypeScript SDK published on npm (agent-rep-sdk)",
            ]} />
            <RoadmapItem phase="Phase 2" status="Complete" title="Staking & Reputation" items={[
              "Smart contract deployment (AgentRepStaking.sol — 0.0.8291516)",
              "Agent staking: 5 HBAR at registration via ContractExecuteTransaction",
              "Reputation-weighted feedback (giver score influences weight)",
              "Reputation algorithm: Quality 30% + Reliability 30% + Activity 20% + Consistency 20%",
              "Outlier detection via z-score method (discounts suspicious ratings)",
              "Operating balance system (prepaid credit for transaction fees)",
              "AI-powered feedback evaluation (reads real HCS conversation from mirror node)",
            ]} />
            <RoadmapItem phase="Phase 3" status="Complete" title="Arbitration & Disputes" items={[
              "Arbiter staking: 10 HBAR via stakeAsArbiter() on smart contract",
              "Arbiter eligibility: score >= 500 + 10 interactions + 10 HBAR stake (verified on-chain)",
              "Dispute filing with 2 HBAR bond via depositDisputeBond() on smart contract",
              "Deterministic arbiter selection via hash-based algorithm",
              "On-chain slash: 10% of feedback giver stake via slash() on contract",
              "Bond return/forfeit based on dispute outcome (on-chain)",
              "Feedback revocation: upheld disputes remove bad feedback and recalculate reputation",
              "HCS-10 arbitration messaging: disputes and notifications via agent inbound topics",
            ]} />
            <RoadmapItem phase="Phase 4" status="Planned" title="Feedback Validation & Incentivization" items={[
              "ERC-8004 Validation Registry: third-party validators confirm or flag feedback",
              "Validator role: 5 HBAR stake + score >= 200 + 3 interactions minimum",
              "Validator rewards: HBAR from dispute bond pool for accurate validations",
              "Arbiter rewards: rewardArbiter() on contract — paid for dispute participation",
              "Incentive alignment: validators penalized for confirming overturned feedback",
              "Validation weight: validated feedback counts more in reputation algorithm",
              "Recursive trust: validator reputation influences validation weight",
            ]} />
            <RoadmapItem phase="Phase 5" status="Planned" title="Production & Scale" items={[
              "Agent reputation decay — scores decrease without recent activity",
              "Cross-chain reputation bridging (EVM chains via ERC-8004)",
              "Mainnet deployment with production staking parameters",
              "AI-powered arbiter agents with automated dispute evaluation",
              "Reputation-gated agent marketplace",
              "Advanced collusion detection for arbiter panels",
            ]} />
          </div>
        </Section>

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-12 border-t border-white/[0.06]">
          <Link href="/architecture" className="text-[#b47aff] hover:text-[#8259ef] text-sm flex items-center gap-2">
            <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
            Architecture
          </Link>
          <Link href="/agents" className="text-[#b47aff] hover:text-[#8259ef] text-sm flex items-center gap-2">
            Explore Agents
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---- Sub-components ----

function Section({ id, label, title, children }: { id: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id}>
      <p className="label-caps mb-4">{label}</p>
      <h2 className="mb-8">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[16px] text-[#9b9b9d] font-light leading-relaxed mb-4">{children}</p>;
}

function ProblemCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex gap-4 bg-white/[0.03] border border-white/[0.06] rounded-[10px] p-5">
      <div className="w-8 h-8 rounded-full bg-red-950 border border-red-800 flex items-center justify-center shrink-0 mt-0.5">
        <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <div>
        <h4 className="text-white font-medium text-[15px] mb-1">{title}</h4>
        <p className="text-[14px] text-[#9b9b9d] leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function MechanismCard({ number, title, color, description, formula, details, impact }: {
  number: string; title: string; color: string; description: string; formula: string; details: string[]; impact: string;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-[10px] overflow-hidden">
      <div className={`bg-gradient-to-r ${color} px-6 py-4 flex items-center gap-4`}>
        <span className="text-2xl font-light text-white/40">{number}</span>
        <h3 className="text-lg font-medium text-white">{title}</h3>
      </div>
      <div className="p-6 space-y-4">
        <p className="text-[15px] text-[#9b9b9d] leading-relaxed">{description}</p>
        <div className="bg-black/30 border border-white/[0.06] rounded-lg px-4 py-3">
          <code className="text-sm text-[#b47aff] font-mono">{formula}</code>
        </div>
        <ul className="space-y-2">
          {details.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-[14px] text-[#9b9b9d]">
              <span className="w-1.5 h-1.5 bg-[#8259ef] rounded-full mt-1.5 shrink-0" />
              {d}
            </li>
          ))}
        </ul>
        <div className="bg-[#8259ef]/5 border border-[#8259ef]/20 rounded-lg px-4 py-3">
          <p className="text-[14px] text-[#b47aff]"><strong>Impact:</strong> {impact}</p>
        </div>
      </div>
    </div>
  );
}

function TierCard({ tier, range, minActivity, color }: { tier: string; range: string; minActivity: string; color: string }) {
  return (
    <div className={`border rounded-lg px-4 py-3 text-center ${color}`}>
      <p className="text-sm font-medium mb-1">{tier}</p>
      <p className="text-xs opacity-70">Score {range}</p>
      <p className="text-xs opacity-70">Activity {minActivity}</p>
    </div>
  );
}

function TopicCard({ name, events, description }: { name: string; events: string[]; description: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-[10px] p-5">
      <h4 className="text-white font-medium text-[15px] mb-2">{name}</h4>
      <p className="text-[14px] text-[#9b9b9d] mb-3">{description}</p>
      <div className="flex flex-wrap gap-1.5">
        {events.map((e) => (
          <span key={e} className="px-2 py-0.5 bg-[#8259ef]/10 text-[#b47aff] text-xs rounded border border-[#8259ef]/20 font-mono">{e}</span>
        ))}
      </div>
    </div>
  );
}

function StandardCard({ name, subtitle, items }: { name: string; subtitle: string; items: string[] }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-[10px] p-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="px-3 py-1 bg-[#8259ef]/10 text-[#b47aff] text-sm font-medium rounded-full border border-[#8259ef]/20">{name}</span>
        <span className="text-[14px] text-[#9b9b9d]">{subtitle}</span>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[14px] text-[#9b9b9d]">
            <span className="w-1.5 h-1.5 bg-[#8259ef] rounded-full mt-1.5 shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SecurityRow({ threat, mitigation }: { threat: string; mitigation: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-[10px] p-5">
      <div className="flex items-start gap-4">
        <div className="w-8 h-8 rounded-full bg-red-950 border border-red-800 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <h4 className="text-white font-medium text-[15px] mb-1">{threat}</h4>
          <p className="text-[14px] text-[#9b9b9d] leading-relaxed">{mitigation}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-emerald-950 border border-emerald-800 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function RoadmapItem({ phase, status, title, items }: { phase: string; status: string; title: string; items: string[] }) {
  const isComplete = status === "Complete";
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-[10px] p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className={`px-3 py-1 text-xs font-medium rounded-full border ${
          isComplete ? "bg-emerald-950 text-emerald-400 border-emerald-800" : "bg-amber-950 text-amber-400 border-amber-800"
        }`}>{phase} — {status}</span>
        <h4 className="text-white font-medium">{title}</h4>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[14px] text-[#9b9b9d]">
            {isComplete ? (
              <svg className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-1.5 shrink-0" />
            )}
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
