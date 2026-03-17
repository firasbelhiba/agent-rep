"use client";

import { TrustTier } from "@/types";

const tierConfig: Record<
  TrustTier,
  { label: string; color: string; bg: string; icon: string }
> = {
  [TrustTier.UNVERIFIED]: {
    label: "Unverified",
    color: "text-gray-400",
    bg: "bg-gray-800",
    icon: "?",
  },
  [TrustTier.VERIFIED]: {
    label: "Verified",
    color: "text-blue-400",
    bg: "bg-blue-950",
    icon: "\u2713",
  },
  [TrustTier.TRUSTED]: {
    label: "Trusted",
    color: "text-purple-400",
    bg: "bg-purple-950",
    icon: "\u2605",
  },
  [TrustTier.ELITE]: {
    label: "Elite",
    color: "text-amber-400",
    bg: "bg-amber-950",
    icon: "\u2B50",
  },
};

export function TierBadge({ tier }: { tier: TrustTier }) {
  const config = tierConfig[tier];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${config.bg} ${config.color} ${tier === TrustTier.ELITE ? "tier-elite" : ""}`}
    >
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}
