"use client";

import { TrustTier } from "@/types";

const tierColors: Record<TrustTier, string> = {
  [TrustTier.UNVERIFIED]: "#6B7280",
  [TrustTier.VERIFIED]: "#3B82F6",
  [TrustTier.TRUSTED]: "#8B5CF6",
  [TrustTier.ELITE]: "#F59E0B",
};

export function ScoreRing({
  score,
  tier,
  size = 120,
}: {
  score: number;
  tier: TrustTier;
  size?: number;
}) {
  const maxScore = 1000;
  const percentage = (score / maxScore) * 100;
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const color = tierColors[tier];

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1f2937"
          strokeWidth="8"
        />
        {/* Score ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold score-animate">{score}</span>
        <span className="text-xs text-gray-400">/ {maxScore}</span>
      </div>
    </div>
  );
}
