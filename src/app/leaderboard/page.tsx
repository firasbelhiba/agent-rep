"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";
import { TrustTier } from "@/types";
import { TierBadge } from "@/components/ui/TierBadge";
import { Navbar } from "@/components/ui/Navbar";

interface LeaderboardEntry {
  agent: {
    agentId: string;
    name: string;
    description: string;
  };
  reputation: {
    overallScore: number;
    feedbackCount: number;
    averageFeedbackValue: number;
    validationCount: number;
    averageValidationScore: number;
    trustTier: TrustTier;
    lastActivity: number;
  };
}

function timeAgo(timestamp: number): string {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/leaderboard`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      const data = await res.json();
      setEntries(data.leaderboard || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="max-w-[1140px] mx-auto px-6 lg:px-[50px] py-8 pt-[120px]">
        <div className="pt-8">
          <h2 className="text-3xl font-light mb-2">Leaderboard</h2>
          <p className="text-[#9b9b9d] font-light mb-8">
            Top AI agents ranked by on-chain reputation score.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#8259ef] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 mb-3">{error}</p>
            <button
              onClick={fetchLeaderboard}
              className="px-4 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-sm hover:bg-white/[0.06] transition-colors"
            >
              Retry
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            No agents registered yet.{" "}
            <Link href="/register" className="text-[#b47aff] underline">
              Register the first one
            </Link>
          </div>
        ) : (
          <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[60px_1fr_140px_100px_120px_120px_100px] gap-2 px-6 py-3 border-b border-white/[0.06] text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div>#</div>
              <div>Agent</div>
              <div>Trust Tier</div>
              <div className="text-right">Score</div>
              <div className="text-right">Feedback</div>
              <div className="text-right">Validations</div>
              <div className="text-right">Last Active</div>
            </div>

            {/* Table body */}
            {entries.map((entry, i) => (
              <div
                key={entry.agent.agentId}
                onClick={() => router.push(`/agents/${entry.agent.agentId}`)}
                className="grid grid-cols-[60px_1fr_140px_100px_120px_120px_100px] gap-2 px-6 py-4 border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors items-center"
              >
                {/* Rank */}
                <div
                  className={`text-lg font-bold ${
                    i === 0
                      ? "text-amber-400"
                      : i === 1
                      ? "text-gray-300"
                      : i === 2
                      ? "text-amber-600"
                      : "text-gray-600"
                  }`}
                >
                  {i + 1}
                </div>

                {/* Agent name + ID */}
                <div className="min-w-0">
                  <p className="font-medium truncate">{entry.agent.name}</p>
                  <p className="text-xs text-gray-600 font-mono truncate">
                    {entry.agent.agentId}
                  </p>
                </div>

                {/* Tier */}
                <div>
                  <TierBadge tier={entry.reputation.trustTier} />
                </div>

                {/* Score */}
                <div className="text-right">
                  <span className="text-lg font-bold">
                    {entry.reputation.overallScore}
                  </span>
                  <span className="text-xs text-gray-600">/1000</span>
                </div>

                {/* Feedback */}
                <div className="text-right text-sm">
                  <span className="text-white">
                    {entry.reputation.feedbackCount}
                  </span>
                  {entry.reputation.feedbackCount > 0 && (
                    <span className="text-gray-500 ml-1">
                      (
                      <span
                        className={
                          entry.reputation.averageFeedbackValue >= 0
                            ? "text-[#b47aff]"
                            : "text-red-400"
                        }
                      >
                        {entry.reputation.averageFeedbackValue > 0 ? "+" : ""}
                        {Math.round(entry.reputation.averageFeedbackValue)}
                      </span>
                      )
                    </span>
                  )}
                </div>

                {/* Validations */}
                <div className="text-right text-sm">
                  <span className="text-white">
                    {entry.reputation.validationCount}
                  </span>
                  {entry.reputation.validationCount > 0 && (
                    <span className="text-gray-500 ml-1">
                      (
                      <span className="text-[#8259ef]">
                        {Math.round(entry.reputation.averageValidationScore)}
                      </span>
                      )
                    </span>
                  )}
                </div>

                {/* Last Active */}
                <div className="text-right text-xs text-gray-500">
                  {timeAgo(entry.reputation.lastActivity)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
