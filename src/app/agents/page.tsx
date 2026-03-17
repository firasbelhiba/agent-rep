"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";
import { TrustTier } from "@/types";
import { TierBadge } from "@/components/ui/TierBadge";
import { Navbar } from "@/components/ui/Navbar";

interface AgentEntry {
  agent: {
    agentId: string;
    name: string;
    description: string;
    skills: string[];
  };
  reputation: {
    overallScore: number;
    feedbackCount: number;
    averageFeedbackValue: number;
    validationCount: number;
    averageValidationScore: number;
    trustTier: TrustTier;
  };
}

const TIERS = [
  TrustTier.UNVERIFIED,
  TrustTier.VERIFIED,
  TrustTier.TRUSTED,
  TrustTier.ELITE,
];

export default function AgentExplorerPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<string>("");
  const [selectedTier, setSelectedTier] = useState<string>("");

  const fetchAgents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/agents`);
      if (!res.ok) throw new Error("Failed to fetch agents");
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  // Collect all skills from agents
  const allSkills = Array.from(
    new Set(agents.flatMap((a) => a.agent.skills))
  ).sort();

  // Filter agents
  const filtered = agents.filter((entry) => {
    const { agent, reputation } = entry;
    if (
      searchQuery &&
      !agent.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !agent.description.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    if (selectedSkill && !agent.skills.includes(selectedSkill)) {
      return false;
    }
    if (selectedTier && reputation.trustTier !== selectedTier) {
      return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="max-w-[1140px] mx-auto px-6 lg:px-[50px] py-8 pt-[120px]">
        <h2 className="text-[44px] font-light mb-2">Agent Explorer</h2>
        <p className="text-[15px] font-light text-[#9b9b9d] mb-6">
          Discover and explore registered AI agents and their on-chain
          reputation.
        </p>

        {/* Search and filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <input
            type="text"
            placeholder="Search by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-white/[0.03] border border-white/10 rounded-[10px] px-4 py-2.5 text-[15px] font-light text-white placeholder-gray-500 focus:outline-none focus:border-[#8259ef]/50"
          />
          <select
            value={selectedSkill}
            onChange={(e) => setSelectedSkill(e.target.value)}
            className="bg-white/[0.03] border border-white/10 rounded-[10px] px-4 py-2.5 text-[15px] font-light text-white focus:outline-none focus:border-[#8259ef]/50"
          >
            <option value="">All Skills</option>
            {allSkills.map((skill) => (
              <option key={skill} value={skill}>
                {skill}
              </option>
            ))}
          </select>
          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value)}
            className="bg-white/[0.03] border border-white/10 rounded-[10px] px-4 py-2.5 text-[15px] font-light text-white focus:outline-none focus:border-[#8259ef]/50"
          >
            <option value="">All Tiers</option>
            {TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </div>

        {/* Loading / Error / Empty states */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#8259ef] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 mb-3">{error}</p>
            <button
              onClick={fetchAgents}
              className="px-4 py-2 bg-white/[0.03] border border-white/10 rounded-[10px] text-[14px] font-light hover:bg-white/[0.06] transition-colors"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-[#9b9b9d]">
            {agents.length === 0 ? (
              <>
                No agents registered yet.{" "}
                <Link href="/register" className="text-[#b47aff] underline">
                  Register the first one
                </Link>
              </>
            ) : (
              "No agents match your filters."
            )}
          </div>
        ) : (
          <>
            <p className="text-[14px] font-light text-[#9b9b9d] mb-4">
              {filtered.length} agent{filtered.length !== 1 ? "s" : ""} found
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((entry) => (
                <div
                  key={entry.agent.agentId}
                  onClick={() =>
                    router.push(`/agents/${entry.agent.agentId}`)
                  }
                  className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-6 hover:border-[#8259ef]/30 transition-colors cursor-pointer group"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[16px] font-medium truncate group-hover:text-[#b47aff] transition-colors">
                        {entry.agent.name}
                      </h3>
                      <p className="text-xs text-gray-600 font-mono">
                        {entry.agent.agentId}
                      </p>
                    </div>
                    <TierBadge tier={entry.reputation.trustTier} />
                  </div>

                  {/* Description */}
                  <p className="text-[14px] font-light text-[#9b9b9d] mb-4 line-clamp-2">
                    {entry.agent.description || "No description provided."}
                  </p>

                  {/* Score */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="text-[28px] font-normal text-white">
                      {entry.reputation.overallScore}
                    </div>
                    <span className="text-[14px] font-light text-[#9b9b9d]">/1000</span>
                  </div>

                  {/* Stats row */}
                  <div className="flex gap-4 text-[14px] font-light text-[#9b9b9d] mb-4">
                    <div>
                      <span className="text-white font-medium">
                        {entry.reputation.feedbackCount}
                      </span>{" "}
                      feedback
                      {entry.reputation.feedbackCount > 0 && (
                        <span className="ml-1">
                          (avg{" "}
                          <span
                            className={
                              entry.reputation.averageFeedbackValue >= 0
                                ? "text-[#b47aff]"
                                : "text-red-400"
                            }
                          >
                            {entry.reputation.averageFeedbackValue > 0
                              ? "+"
                              : ""}
                            {Math.round(entry.reputation.averageFeedbackValue)}
                          </span>
                          )
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-white font-medium">
                        {entry.reputation.validationCount}
                      </span>{" "}
                      validations
                      {entry.reputation.validationCount > 0 && (
                        <span className="ml-1">
                          (avg{" "}
                          <span className="text-blue-400">
                            {Math.round(
                              entry.reputation.averageValidationScore
                            )}
                          </span>
                          )
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Skills */}
                  <div className="flex flex-wrap gap-1.5">
                    {entry.agent.skills.slice(0, 5).map((skill) => (
                      <span
                        key={skill}
                        className="px-2 py-0.5 bg-[#8259ef]/10 text-[#b47aff] border border-[#8259ef]/20 text-[14px] font-light rounded-[10px]"
                      >
                        {skill}
                      </span>
                    ))}
                    {entry.agent.skills.length > 5 && (
                      <span className="px-2 py-0.5 text-gray-600 text-[14px] font-light">
                        +{entry.agent.skills.length - 5}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
