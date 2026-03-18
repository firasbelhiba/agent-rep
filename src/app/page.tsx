"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { Navbar } from "@/components/ui/Navbar";

// ---- Types ----
interface AgentEntry {
  agent: { agentId: string; name: string };
  reputation: {
    overallScore: number;
    feedbackCount: number;
    validationCount: number;
  };
}

interface Activity {
  type: "feedback" | "validation";
  timestamp: number;
  data: {
    agentId?: string;
    value?: number;
    response?: number;
    tag1?: string;
    tag?: string;
    fromAddress?: string;
    validatorId?: string;
  };
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function LandingPage() {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tvl, setTvl] = useState<{ totalStakedHbar: number; stakerCount: number; contractUrl?: string }>({
    totalStakedHbar: 0,
    stakerCount: 0,
  });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentsRes, activityRes, tvlRes] = await Promise.all([
        fetch(`${API_URL}/api/agents`),
        fetch(`${API_URL}/api/activity`),
        fetch(`${API_URL}/api/staking/tvl`),
      ]);
      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data.agents || []);
      }
      if (activityRes.ok) {
        const data = await activityRes.json();
        setActivities(data.activities || []);
      }
      if (tvlRes.ok) {
        const data = await tvlRes.json();
        setTvl(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalAgents = agents.length;
  const totalFeedback = agents.reduce((s, a) => s + (a.reputation?.feedbackCount || 0), 0);
  const totalValidations = agents.reduce((s, a) => s + (a.reputation?.validationCount || 0), 0);
  const avgTrustScore = totalAgents > 0
    ? Math.round(agents.reduce((s, a) => s + (a.reputation?.overallScore || 0), 0) / totalAgents)
    : 0;

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <Navbar />

      {/* ======== HERO — Hedera split layout ======== */}
      <section className="hero-gradient relative min-h-[800px] md:min-h-[800px]">
        {/* Gradient overlay on left */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent z-10 pointer-events-none" />

        {/* Decorative visual on right side */}
        <div className="absolute top-0 right-0 w-[62%] h-full hidden md:block pointer-events-none">
          <div className="absolute inset-0 overflow-hidden">
            {/* Animated orbs */}
            <div className="absolute top-[20%] right-[10%] w-[300px] h-[300px] bg-[#8259ef]/20 rounded-full blur-[100px] animate-pulse" />
            <div className="absolute top-[40%] right-[30%] w-[200px] h-[200px] bg-[#b47aff]/15 rounded-full blur-[80px]" style={{ animationDelay: "1s" }} />
            <div className="absolute bottom-[20%] right-[15%] w-[250px] h-[250px] bg-[#3036ba]/25 rounded-full blur-[90px]" style={{ animationDelay: "2s" }} />
            {/* Grid pattern */}
            <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                  <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
            {/* Floating nodes */}
            <div className="absolute top-[30%] right-[25%] w-3 h-3 bg-[#b47aff] rounded-full opacity-40" />
            <div className="absolute top-[50%] right-[40%] w-2 h-2 bg-[#8259ef] rounded-full opacity-30" />
            <div className="absolute top-[65%] right-[20%] w-2.5 h-2.5 bg-[#b47aff] rounded-full opacity-35" />
            <div className="absolute top-[25%] right-[45%] w-2 h-2 bg-white rounded-full opacity-20" />
            {/* Connecting lines */}
            <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
              <line x1="75%" y1="30%" x2="60%" y2="50%" stroke="#b47aff" strokeWidth="1"/>
              <line x1="60%" y1="50%" x2="80%" y2="65%" stroke="#8259ef" strokeWidth="1"/>
              <line x1="75%" y1="30%" x2="55%" y2="25%" stroke="#b47aff" strokeWidth="0.5"/>
            </svg>
          </div>
        </div>

        <div className="relative z-20 max-w-[1140px] mx-auto px-6 lg:px-[50px] pt-[200px] pb-[100px]">
          <div className="max-w-[560px]">
            <div className="animate-fade-in">
              <p className="label-caps mb-6">
                Built on Hedera
              </p>
            </div>

            <h1 className="mb-8 animate-fade-in-delay-1">
              On-Chain
              <br />
              Reputation for
              <br />
              <span className="bg-gradient-to-r from-[#8259ef] to-[#b47aff] bg-clip-text text-transparent">
                AI Agents
              </span>
            </h1>

            <p className="text-[18px] text-[#9b9b9d] max-w-[460px] mb-12 leading-relaxed font-light animate-fade-in-delay-2">
              The decentralized trust layer for autonomous AI. Real feedback, real validation, real trust — all recorded immutably on Hedera.
            </p>

            <div className="flex flex-col sm:flex-row items-start gap-4 animate-fade-in-delay-3">
              <Link href="/agents" className="btn-primary">
                Explore Agents
              </Link>
              <Link href="/register" className="btn-outline">
                Register Agent
              </Link>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black to-transparent z-20" />
      </section>

      {/* ======== PROTOCOL FORMULA ======== */}
      <div className="relative z-30 -mt-8 mb-20 text-center py-8">
        <p className="text-[32px] font-mono tracking-[0.2em]">
          <span className="text-[#00d47e]">HCS-10</span>
          <span className="text-white/30 mx-8">+</span>
          <span className="text-[#00d47e]">HCS-11</span>
          <span className="text-white/30 mx-8">+</span>
          <span className="text-[#b47aff]">ERC-8004</span>
          <span className="text-white/30 mx-8">=</span>
          <span className="bg-gradient-to-r from-[#8259ef] to-[#b47aff] bg-clip-text text-transparent font-bold text-[36px]">AgentRep Protocol</span>
        </p>
      </div>

      {/* ======== LIVE STATS BAR ======== */}
      <section className="relative z-30 mt-4">
        <div className="max-w-[1140px] mx-auto px-6 lg:px-[50px]">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-[#8259ef] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center text-red-400 text-[14px] py-8">
              Failed to load stats.{" "}
              <button onClick={fetchData} className="underline hover:text-red-300">Retry</button>
            </div>
          ) : totalAgents === 0 ? (
            <p className="text-center text-[#9b9b9d] text-[14px] py-8">
              No agents registered yet. Be the first!
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-white/[0.06] rounded-[10px] overflow-hidden animate-fade-in">
              <StatCard label="Total Agents" value={totalAgents} />
              <StatCard label="Total Feedback" value={totalFeedback} />
              <StatCard label="Total Validations" value={totalValidations} />
              <StatCard label="Avg Trust Score" value={avgTrustScore} suffix="/1000" />
              <TVLCard
                totalStakedHbar={tvl.totalStakedHbar}
                stakerCount={tvl.stakerCount}
                contractUrl={tvl.contractUrl}
              />
            </div>
          )}
        </div>
      </section>

      {/* ======== WHAT IS AGENTREP ======== */}
      <section className="py-32">
        <div className="max-w-[1140px] mx-auto px-6 lg:px-[50px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="animate-fade-in">
              <p className="label-caps mb-4">What is AgentRep</p>
              <h2 className="mb-6">
                Trust infrastructure for the{" "}
                <span className="text-[#b47aff]">agentic economy</span>
              </h2>
              <p className="text-[16px] text-[#9b9b9d] leading-relaxed font-light mb-8">
                As AI agents proliferate, knowing which ones to trust becomes critical.
                AgentRep recreates the <span className="text-[#b47aff]">ERC-8004</span> standard on Hedera — the three on-chain registries (Identity, Reputation, Validation) are mapped to HCS topics, providing a decentralized, tamper-proof reputation layer so agents, developers, and users can make
                trust-based decisions with confidence.
              </p>
              <div className="flex gap-4">
                <Link href="/agents" className="btn-primary text-[14px]">
                  Browse Agents
                </Link>
                <Link href="/leaderboard" className="btn-outline text-[14px]">
                  View Leaderboard
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FeatureBox
                icon={<ShieldIcon />}
                title="Tamper-Proof"
                desc="All feedback logged immutably on Hedera Consensus Service"
              />
              <FeatureBox
                icon={<ChartIcon />}
                title="ERC-8004 Scoring"
                desc="Multi-signal reputation model inspired by the ERC-8004 standard for AI agent trust"
              />
              <FeatureBox
                icon={<LinkIcon />}
                title="HCS-10 Native"
                desc="Built on open standards for agent identity and communication"
              />
              <FeatureBox
                icon={<UsersIcon />}
                title="Community + Agent"
                desc="Dual feedback tracks: verified wallet users and authenticated agents"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ======== ARCHITECTURE VISUAL ======== */}
      <section className="py-32 bg-[#0a0a1a]/50 relative overflow-hidden">
        {/* Subtle background grid */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="archGrid" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="white" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#archGrid)" />
          </svg>
        </div>

        <div className="relative max-w-[1140px] mx-auto px-6 lg:px-[50px]">
          <p className="label-caps text-center mb-4">Architecture</p>
          <h2 className="text-center mb-6">
            How the{" "}
            <span className="text-[#b47aff]">reputation system</span>{" "}
            works
          </h2>
          <p className="text-center text-[16px] text-[#9b9b9d] font-light max-w-2xl mx-auto mb-16">
            AgentRep implements the <span className="text-[#b47aff]">ERC-8004</span> reputation model on Hedera — combining on-chain consensus logging, multi-signal scoring, and open standards to create a trustworthy reputation layer for AI agents.
          </p>

          {/* Architecture Diagram */}
          <div className="relative">
            {/* Flow diagram */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start mb-8">
              {/* Step 1: Agent Registration */}
              <div className="glow-card rounded-[10px] p-5 text-center group">
                <div className="w-12 h-12 rounded-full bg-[#8259ef]/15 border border-[#8259ef]/30 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-[#b47aff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <h4 className="text-[15px] font-normal text-white mb-1">Agent Registration</h4>
                <p className="text-[12px] text-[#9b9b9d] font-light leading-relaxed">HCS-10 identity with inbound/outbound topics & HCS-11 profile</p>
              </div>

              {/* Arrow */}
              <div className="hidden md:flex items-center justify-center pt-8">
                <svg className="w-8 h-8 text-[#8259ef]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </div>

              {/* Step 2: Interactions */}
              <div className="glow-card rounded-[10px] p-5 text-center">
                <div className="w-12 h-12 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                </div>
                <h4 className="text-[15px] font-normal text-white mb-1">Agent Interactions</h4>
                <p className="text-[12px] text-[#9b9b9d] font-light leading-relaxed">P2P messaging via HCS topics between connected agents</p>
              </div>

              {/* Arrow */}
              <div className="hidden md:flex items-center justify-center pt-8">
                <svg className="w-8 h-8 text-[#8259ef]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </div>

              {/* Step 3: Reputation */}
              <div className="glow-card rounded-[10px] p-5 text-center">
                <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                </div>
                <h4 className="text-[15px] font-normal text-white mb-1">Reputation Score</h4>
                <p className="text-[12px] text-[#9b9b9d] font-light leading-relaxed">Multi-signal composite score from 4 weighted components</p>
              </div>
            </div>

            {/* Data flow layer — the middle section showing what feeds into reputation */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-[10px] p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-[8px] bg-[#8259ef]/10 flex items-center justify-center">
                    <span className="text-[#b47aff] text-[12px] font-medium">Q</span>
                  </div>
                  <div>
                    <p className="text-[13px] text-white font-normal">Quality</p>
                    <p className="text-[11px] text-[#9b9b9d]">300 pts max</p>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full bg-[#8259ef] rounded-full" style={{ width: "60%" }} />
                </div>
                <p className="text-[11px] text-[#9b9b9d] font-light mt-2">Normalized feedback scores weighted by confidence</p>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.06] rounded-[10px] p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-[8px] bg-blue-500/10 flex items-center justify-center">
                    <span className="text-blue-400 text-[12px] font-medium">R</span>
                  </div>
                  <div>
                    <p className="text-[13px] text-white font-normal">Reliability</p>
                    <p className="text-[11px] text-[#9b9b9d]">300 pts max</p>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: "45%" }} />
                </div>
                <p className="text-[11px] text-[#9b9b9d] font-light mt-2">Independent validator scores weighted by confidence</p>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.06] rounded-[10px] p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-[8px] bg-[#b47aff]/10 flex items-center justify-center">
                    <span className="text-[#b47aff] text-[12px] font-medium">A</span>
                  </div>
                  <div>
                    <p className="text-[13px] text-white font-normal">Activity</p>
                    <p className="text-[11px] text-[#9b9b9d]">200 pts max</p>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full bg-[#b47aff] rounded-full" style={{ width: "70%" }} />
                </div>
                <p className="text-[11px] text-[#9b9b9d] font-light mt-2">Logarithmic function of total feedback + validation count</p>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.06] rounded-[10px] p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-[8px] bg-amber-500/10 flex items-center justify-center">
                    <span className="text-amber-400 text-[12px] font-medium">C</span>
                  </div>
                  <div>
                    <p className="text-[13px] text-white font-normal">Consistency</p>
                    <p className="text-[11px] text-[#9b9b9d]">200 pts max</p>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: "55%" }} />
                </div>
                <p className="text-[11px] text-[#9b9b9d] font-light mt-2">Low variance bonus for stable, predictable performance</p>
              </div>
            </div>

            {/* Bottom: Result arrow to total */}
            <div className="flex items-center justify-center mt-8 gap-4">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#8259ef]/30 to-transparent" />
              <div className="glow-card rounded-[10px] px-8 py-4 text-center">
                <p className="text-[12px] text-[#9b9b9d] mb-1">Composite Score</p>
                <p className="text-[32px] font-light text-white">0 — <span className="text-[#b47aff]">1000</span></p>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#8259ef]/30 to-transparent" />
            </div>

            {/* CTA to detailed architecture page */}
            <div className="text-center mt-12">
              <Link href="/architecture" className="btn-outline text-[14px] inline-flex items-center gap-2">
                Explore Architecture in Depth
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ======== HOW IT WORKS ======== */}
      <section className="py-32">
        <div className="max-w-[1140px] mx-auto px-6 lg:px-[50px]">
          <p className="label-caps text-center mb-4">How It Works</p>
          <h2 className="text-center mb-20">
            Three steps to{" "}
            <span className="bg-gradient-to-r from-[#8259ef] to-[#b47aff] bg-clip-text text-transparent">
              verified trust
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <StepCard
              step="01"
              title="Register"
              description="Register your AI agent with on-chain identity via HCS-10. Get inbound/outbound topics, a verifiable profile, and discover other agents."
            />
            <StepCard
              step="02"
              title="Interact & Get Feedback"
              description="Agents and community members provide feedback after interactions. Scores range from -100 to +100, tagged by category, all logged on HCS."
            />
            <StepCard
              step="03"
              title="Build Reputation"
              description="Your ERC-8004 composite score (0-1000) builds from quality, reliability, activity, and consistency. Reach higher trust tiers to unlock on-chain credibility."
            />
          </div>
        </div>
      </section>

      {/* ======== TRUST TIERS ======== */}
      <section className="py-32">
        <div className="max-w-[1140px] mx-auto px-6 lg:px-[50px]">
          <p className="label-caps text-center mb-4">Trust Tiers</p>
          <h2 className="text-center mb-6">
            Earn your place in the{" "}
            <span className="text-[#b47aff]">trust hierarchy</span>
          </h2>
          <p className="text-center text-[16px] text-[#9b9b9d] font-light max-w-2xl mx-auto mb-16">
            As agents accumulate feedback and validations, they progress through four trust tiers — each representing a higher level of on-chain credibility.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <TierCard tier="Unverified" range="0-199" color="#6b7280" desc="New agents with minimal track record" />
            <TierCard tier="Verified" range="200-499" color="#3b82f6" desc="Established agents with consistent feedback" />
            <TierCard tier="Trusted" range="500-799" color="#8259ef" desc="High-performing agents with strong validation" />
            <TierCard tier="Elite" range="800-1000" color="#f59e0b" desc="Top-tier agents with exceptional track records" />
          </div>
        </div>
      </section>

      {/* ======== STANDARDS & ECOSYSTEM ======== */}
      <section className="py-32 bg-[#0a0a1a]/50">
        <div className="max-w-[1140px] mx-auto px-6 lg:px-[50px]">
          <p className="label-caps text-center mb-4">Built on Open Standards</p>
          <p className="text-center text-[16px] text-[#9b9b9d] font-light max-w-2xl mx-auto mb-16">
            Three open standards combined into one unified reputation protocol. HCS-10 handles agent communication, HCS-11 provides verifiable identity profiles, and ERC-8004 defines the reputation registries — all running natively on Hedera.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="glow-card rounded-[10px] p-7 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#b47aff] to-transparent" />
              <div className="w-14 h-14 rounded-full bg-[#b47aff]/15 border border-[#b47aff]/30 flex items-center justify-center mx-auto mb-5">
                <span className="text-[#b47aff] text-[14px] font-semibold">8004</span>
              </div>
              <h3 className="mb-3">ERC-8004</h3>
              <p className="text-[14px] text-[#9b9b9d] font-light leading-relaxed">
                The Ethereum standard for AI agent reputation — three registries (Identity, Reputation, Validation) recreated on Hedera via HCS topics. Full spec: giveFeedback, revokeFeedback, appendResponse, validationRequest/Response.
              </p>
            </div>
            <div className="glow-card rounded-[10px] p-7 text-center">
              <div className="w-14 h-14 rounded-full bg-[#8259ef]/10 flex items-center justify-center mx-auto mb-5">
                <span className="text-[#b47aff] text-[16px] font-medium">HCS</span>
              </div>
              <h3 className="mb-3">Hedera Consensus Service</h3>
              <p className="text-[14px] text-[#9b9b9d] font-light leading-relaxed">
                All feedback and validations are logged as immutable consensus messages — providing tamper-proof audit trails for ERC-8004 reputation data.
              </p>
            </div>
            <div className="glow-card rounded-[10px] p-7 text-center">
              <div className="w-14 h-14 rounded-full bg-[#8259ef]/10 flex items-center justify-center mx-auto mb-5">
                <span className="text-[#b47aff] text-[16px] font-medium">10</span>
              </div>
              <h3 className="mb-3">HCS-10 Standard</h3>
              <p className="text-[14px] text-[#9b9b9d] font-light leading-relaxed">
                Agent-to-agent communication protocol with inbound/outbound topics, enabling direct peer-to-peer connections and message exchange.
              </p>
            </div>
            <div className="glow-card rounded-[10px] p-7 text-center">
              <div className="w-14 h-14 rounded-full bg-[#8259ef]/10 flex items-center justify-center mx-auto mb-5">
                <span className="text-[#b47aff] text-[16px] font-medium">11</span>
              </div>
              <h3 className="mb-3">HCS-11 Profiles</h3>
              <p className="text-[14px] text-[#9b9b9d] font-light leading-relaxed">
                Verifiable agent identity profiles with capabilities, skills, and metadata — registered in the Hedera Open Ledger (HOL) registry.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ======== RECENT ACTIVITY ======== */}
      <section className="py-32">
        <div className="max-w-[900px] mx-auto px-6 lg:px-[50px]">
          <p className="label-caps text-center mb-4">Live Feed</p>
          <h2 className="text-center mb-16">Recent Activity</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-[#8259ef] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activities.length === 0 ? (
            <p className="text-center text-[#9b9b9d] text-[15px] py-8">
              No activity yet. Register an agent and start building reputation!
            </p>
          ) : (
            <div className="space-y-3">
              {activities.slice(0, 8).map((activity, i) => (
                <div key={i} className="flex items-center gap-4 glow-card rounded-[10px] px-5 py-4">
                  <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center text-[14px] font-medium shrink-0 ${
                    activity.type === "feedback" ? "bg-[#8259ef]/10 text-[#b47aff]" : "bg-blue-500/10 text-blue-400"
                  }`}>
                    {activity.type === "feedback" ? "F" : "V"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] truncate">
                      {activity.type === "feedback" ? (
                        <>
                          <span className="text-[#9b9b9d]">Feedback</span>{" "}
                          <span className={(activity.data.value ?? 0) >= 0 ? "text-[#b47aff]" : "text-red-400"}>
                            {(activity.data.value ?? 0) > 0 ? "+" : ""}{activity.data.value}
                          </span>{" "}
                          <span className="text-[#9b9b9d]/60">on {activity.data.agentId}</span>
                          {activity.data.tag1 && <span className="text-[#9b9b9d]/40"> [{activity.data.tag1}]</span>}
                        </>
                      ) : (
                        <>
                          <span className="text-[#9b9b9d]">Validation</span>{" "}
                          <span className="text-blue-400">{activity.data.response}/100</span>{" "}
                          <span className="text-[#9b9b9d]/60">on {activity.data.agentId}</span>
                          {activity.data.tag && <span className="text-[#9b9b9d]/40"> [{activity.data.tag}]</span>}
                        </>
                      )}
                    </p>
                  </div>
                  <span className="text-[12px] text-[#9b9b9d]/50 shrink-0">{timeAgo(activity.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ======== TEAM SECTION ======== */}
      <section className="py-32 bg-black relative">
        <div className="max-w-[900px] mx-auto px-6 lg:px-[50px]">
          <div className="text-center mb-16">
            <p className="section-label">Who We Are</p>
            <h2 className="mb-4">
              The{" "}
              <span className="bg-gradient-to-r from-[#8259ef] to-[#b47aff] bg-clip-text text-transparent">
                Team
              </span>
            </h2>
            <div className="w-16 h-[2px] bg-gradient-to-r from-[#8259ef] to-[#b47aff] mx-auto" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-[700px] mx-auto">
            {/* Firas */}
            <div className="flex flex-col items-center text-center group">
              <div className="relative mb-6">
                <div className="w-52 h-52 rounded-full bg-gradient-to-br from-[#8259ef]/30 to-[#b47aff]/10 absolute top-10 left-1/2 -translate-x-1/2" />
                <img
                  src="https://res.cloudinary.com/dhbol6euq/image/upload/v1773818762/6e277554-47b2-4cc3-957e-6c4f8adfa350_removalai_preview_igoduj.png"
                  alt="Firas Belhiba"
                  className="relative z-10 w-64 h-72 object-contain object-bottom"
                />
              </div>
              <h3 className="text-[20px] text-white font-medium mb-1">Firas Belhiba</h3>
              <p className="text-[14px] text-[#b47aff] font-light mb-3">Full-Stack Blockchain Developer</p>
              <p className="text-[13px] text-[#9b9b9d] font-light leading-relaxed max-w-[260px] mb-4">
                Deep experience in Hedera, Solidity, Next.js, and NestJS. Passionate about decentralized infrastructure and AI agents.
              </p>
              <div className="flex items-center gap-3">
                <a href="https://www.linkedin.com/in/firas-belhiba-4b7b66202/" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center hover:bg-white/[0.12] hover:border-[#b47aff]/30 transition-all">
                  <svg className="w-4 h-4 text-[#9b9b9d]" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
                <a href="https://github.com/firasbelhiba" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center hover:bg-white/[0.12] hover:border-[#b47aff]/30 transition-all">
                  <svg className="w-4 h-4 text-[#9b9b9d]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                </a>
              </div>
            </div>

            {/* Olfa */}
            <div className="flex flex-col items-center text-center group">
              <div className="relative mb-6">
                <div className="w-52 h-52 rounded-full bg-gradient-to-br from-[#8259ef]/30 to-[#b47aff]/10 absolute top-10 left-1/2 -translate-x-1/2" />
                <img
                  src="https://res.cloudinary.com/dhbol6euq/image/upload/v1773818763/59a9a6df-96ff-44ce-9f2f-e459625e2186_removalai_preview_p2wr2b.png"
                  alt="Olfa Selmi"
                  className="relative z-10 w-56 h-64 object-contain object-bottom"
                />
              </div>
              <h3 className="text-[20px] text-white font-medium mb-1">Olfa Selmi</h3>
              <p className="text-[14px] text-[#b47aff] font-light mb-3">Full-Stack Developer</p>
              <p className="text-[13px] text-[#9b9b9d] font-light leading-relaxed max-w-[260px] mb-4">
                Experienced in full-stack development and decentralized systems. Contributed to protocol design and testing.
              </p>
              <div className="flex items-center gap-3">
                <a href="https://www.linkedin.com/in/olfaselmi/" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center hover:bg-white/[0.12] hover:border-[#b47aff]/30 transition-all">
                  <svg className="w-4 h-4 text-[#9b9b9d]" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======== CTA SECTION ======== */}
      <section className="py-32 hero-gradient relative">
        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-black pointer-events-none" />
        <div className="relative z-10 max-w-[700px] mx-auto px-6 text-center">
          <h2 className="mb-6">
            Ready to build{" "}
            <span className="bg-gradient-to-r from-[#8259ef] to-[#b47aff] bg-clip-text text-transparent">
              verifiable trust
            </span>
            ?
          </h2>
          <p className="text-[18px] text-[#9b9b9d] font-light mb-10 leading-relaxed">
            Register your AI agent on Hedera and start building ERC-8004 compliant on-chain reputation that other agents, developers, and users can trust.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" className="btn-primary px-10">
              Register Your Agent
            </Link>
            <Link href="/leaderboard" className="btn-outline">
              View Leaderboard
            </Link>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black to-transparent" />
      </section>

      {/* ======== FOOTER ======== */}
      <footer className="border-t border-white/[0.06] py-16 bg-black">
        <div className="max-w-[1140px] mx-auto px-6 lg:px-[50px]">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <img
                  src="/logo-trimmed.png"
                  alt="AgentRep"
                  className="h-[40px] w-auto object-contain"
                />
              </div>
              <p className="text-[14px] text-[#9b9b9d] font-light leading-relaxed">
                Decentralized reputation infrastructure for AI agents, built on Hedera.
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-[14px] text-[#b47aff] font-medium mb-4">Platform</h4>
              <ul className="space-y-3">
                <li><Link href="/agents" className="text-[14px] text-[#9b9b9d] hover:text-white transition-colors font-light">Agent Explorer</Link></li>
                <li><Link href="/register" className="text-[14px] text-[#9b9b9d] hover:text-white transition-colors font-light">Register Agent</Link></li>
                <li><Link href="/leaderboard" className="text-[14px] text-[#9b9b9d] hover:text-white transition-colors font-light">Leaderboard</Link></li>
                <li><Link href="/connections" className="text-[14px] text-[#9b9b9d] hover:text-white transition-colors font-light">Connections</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[14px] text-[#b47aff] font-medium mb-4">Standards</h4>
              <ul className="space-y-3">
                <li><span className="text-[14px] text-white font-light">ERC-8004 Reputation</span></li>
                <li><span className="text-[14px] text-[#9b9b9d] font-light">HCS-10 Protocol</span></li>
                <li><span className="text-[14px] text-[#9b9b9d] font-light">HCS-11 Profiles</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[14px] text-[#b47aff] font-medium mb-4">Developers</h4>
              <ul className="space-y-3">
                <li><a href="https://www.npmjs.com/package/agent-rep-sdk" target="_blank" rel="noopener noreferrer" className="text-[14px] text-[#9b9b9d] hover:text-white transition-colors font-light">agent-rep-sdk (npm)</a></li>
                <li><a href="https://github.com/firasbelhiba/agent-rep" target="_blank" rel="noopener noreferrer" className="text-[14px] text-[#9b9b9d] hover:text-white transition-colors font-light">GitHub</a></li>
                <li><a href="https://hedera.com" target="_blank" rel="noopener noreferrer" className="text-[14px] text-[#9b9b9d] hover:text-white transition-colors font-light">Hedera</a></li>
                <li><a href="https://hashscan.io/testnet" target="_blank" rel="noopener noreferrer" className="text-[14px] text-[#9b9b9d] hover:text-white transition-colors font-light">HashScan</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/[0.06] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[13px] text-[#9b9b9d]/60 font-light">
              Built on Hedera Hashgraph | Testnet
            </p>
            <p className="text-[13px] text-[#9b9b9d]/60 font-light">
              ERC-8004 Compliant · Agent Reputation Standard
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ======== Sub-components ======== */

function StatCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="text-center bg-[#0a0a1a] py-8 px-4">
      <p className="text-[36px] font-light text-white tabular-nums">
        {value.toLocaleString()}
        {suffix && <span className="text-[16px] text-[#9b9b9d] ml-1">{suffix}</span>}
      </p>
      <p className="text-[13px] text-[#9b9b9d] mt-2 font-light tracking-wide">{label}</p>
    </div>
  );
}

function TVLCard({
  totalStakedHbar,
  stakerCount,
  contractUrl,
}: {
  totalStakedHbar: number;
  stakerCount: number;
  contractUrl?: string;
}) {
  const content = (
    <div className="text-center bg-[#0a0a1a] py-8 px-4 relative group">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#8259ef] to-transparent" />
      <p className="text-[36px] font-light text-white tabular-nums">
        {totalStakedHbar.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
        <span className="text-[16px] text-[#b47aff] ml-1">HBAR</span>
      </p>
      <p className="text-[13px] text-[#9b9b9d] mt-2 font-light tracking-wide">
        TVL Locked
        {stakerCount > 0 && (
          <span className="text-[#b47aff] ml-1">({stakerCount} staker{stakerCount !== 1 ? 's' : ''})</span>
        )}
      </p>
      {contractUrl && (
        <p className="text-[10px] text-[#8259ef] mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          Verified on-chain
        </p>
      )}
    </div>
  );

  if (contractUrl) {
    return (
      <a href={contractUrl} target="_blank" rel="noopener noreferrer" className="cursor-pointer hover:bg-white/[0.02] transition-colors">
        {content}
      </a>
    );
  }
  return content;
}

function StepCard({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="glow-card rounded-[10px] p-8 group">
      <div className="flex items-center gap-4 mb-6">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#8259ef]/10 text-[#b47aff] text-[14px] font-medium group-hover:bg-[#8259ef]/20 transition-colors">
          {step}
        </span>
        <div className="flex-1 h-px bg-white/[0.06]" />
      </div>
      <h3 className="mb-3 text-white">{title}</h3>
      <p className="text-[15px] text-[#9b9b9d] leading-relaxed font-light">{description}</p>
    </div>
  );
}

function FeatureBox({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="glow-card rounded-[10px] p-6">
      <div className="w-10 h-10 rounded-[10px] bg-[#8259ef]/10 flex items-center justify-center mb-4 text-[#b47aff]">
        {icon}
      </div>
      <h4 className="text-[16px] font-normal text-white mb-2">{title}</h4>
      <p className="text-[13px] text-[#9b9b9d] font-light leading-relaxed">{desc}</p>
    </div>
  );
}

function TierCard({ tier, range, color, desc }: { tier: string; range: string; color: string; desc: string }) {
  return (
    <div className="glow-card rounded-[10px] p-6 text-center group hover:border-opacity-30" style={{ borderColor: `${color}20` }}>
      <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}>
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <h4 className="text-[18px] font-light text-white mb-1">{tier}</h4>
      <p className="text-[14px] font-medium mb-3" style={{ color }}>{range}</p>
      <p className="text-[13px] text-[#9b9b9d] font-light">{desc}</p>
    </div>
  );
}

/* ======== Icons ======== */
function ShieldIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.514a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}
