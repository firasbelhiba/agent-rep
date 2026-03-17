// ============================================================
// @agent-rep/sdk — Trust Policy Engine
// Define complex trust requirements with a single policy
// ============================================================

import { TrustPolicy, AgentWithReputation, TrustTier } from './types';

const TIER_ORDER: TrustTier[] = ['UNVERIFIED', 'VERIFIED', 'TRUSTED', 'ELITE'];

/**
 * Evaluate whether an agent meets a trust policy.
 *
 * @example
 * ```ts
 * const policy: TrustPolicy = {
 *   minTier: 'VERIFIED',
 *   minScore: 400,
 *   minFeedbackCount: 3,
 *   requiredSkills: ['defi'],
 *   maxInactivity: 7 * 24 * 60 * 60 * 1000, // 7 days
 * };
 *
 * const result = await client.evaluateTrust('0.0.123', policy);
 * if (result.trusted) {
 *   // safe to delegate
 * } else {
 *   console.log('Failed checks:', result.failures);
 * }
 * ```
 */
export interface TrustEvaluation {
  trusted: boolean;
  agent: AgentWithReputation;
  failures: string[];
  checks: {
    tier: boolean;
    score: boolean;
    feedbackCount: boolean;
    validationCount: boolean;
    skills: boolean;
    activity: boolean;
    custom: boolean;
  };
}

export async function evaluatePolicy(
  agent: AgentWithReputation,
  policy: TrustPolicy,
): Promise<TrustEvaluation> {
  const failures: string[] = [];
  const checks = {
    tier: true,
    score: true,
    feedbackCount: true,
    validationCount: true,
    skills: true,
    activity: true,
    custom: true,
  };

  // Check tier
  if (policy.minTier) {
    const agentIdx = TIER_ORDER.indexOf(agent.reputation.trustTier);
    const requiredIdx = TIER_ORDER.indexOf(policy.minTier);
    if (agentIdx < requiredIdx) {
      checks.tier = false;
      failures.push(`Tier ${agent.reputation.trustTier} < required ${policy.minTier}`);
    }
  }

  // Check score
  if (policy.minScore !== undefined) {
    if (agent.reputation.overallScore < policy.minScore) {
      checks.score = false;
      failures.push(`Score ${agent.reputation.overallScore} < required ${policy.minScore}`);
    }
  }

  // Check feedback count
  if (policy.minFeedbackCount !== undefined) {
    if (agent.reputation.feedbackCount < policy.minFeedbackCount) {
      checks.feedbackCount = false;
      failures.push(`Feedback count ${agent.reputation.feedbackCount} < required ${policy.minFeedbackCount}`);
    }
  }

  // Check validation count
  if (policy.minValidationCount !== undefined) {
    if (agent.reputation.validationCount < policy.minValidationCount) {
      checks.validationCount = false;
      failures.push(`Validation count ${agent.reputation.validationCount} < required ${policy.minValidationCount}`);
    }
  }

  // Check required skills
  if (policy.requiredSkills?.length) {
    const agentSkills = new Set(agent.agent.skills);
    const missing = policy.requiredSkills.filter((s) => !agentSkills.has(s));
    if (missing.length > 0) {
      checks.skills = false;
      failures.push(`Missing skills: ${missing.join(', ')}`);
    }
  }

  // Check activity
  if (policy.maxInactivity !== undefined) {
    const inactive = Date.now() - agent.reputation.lastActivity;
    if (inactive > policy.maxInactivity) {
      checks.activity = false;
      const days = Math.floor(inactive / (24 * 60 * 60 * 1000));
      failures.push(`Inactive for ${days} days (max: ${Math.floor(policy.maxInactivity / (24 * 60 * 60 * 1000))} days)`);
    }
  }

  // Custom validation
  if (policy.custom) {
    try {
      const result = await policy.custom(agent);
      if (!result) {
        checks.custom = false;
        failures.push('Custom policy check failed');
      }
    } catch {
      checks.custom = false;
      failures.push('Custom policy check threw an error');
    }
  }

  return {
    trusted: failures.length === 0,
    agent,
    failures,
    checks,
  };
}

// ---- Preset Policies ----

/** Minimal trust — any verified agent */
export const POLICY_BASIC: TrustPolicy = {
  minTier: 'VERIFIED',
};

/** Standard trust — verified + decent score + some feedback */
export const POLICY_STANDARD: TrustPolicy = {
  minTier: 'VERIFIED',
  minScore: 400,
  minFeedbackCount: 3,
};

/** High trust — trusted tier + high score + validations */
export const POLICY_HIGH: TrustPolicy = {
  minTier: 'TRUSTED',
  minScore: 600,
  minFeedbackCount: 5,
  minValidationCount: 2,
};

/** Maximum trust — elite only */
export const POLICY_MAXIMUM: TrustPolicy = {
  minTier: 'ELITE',
  minScore: 800,
  minFeedbackCount: 10,
  minValidationCount: 5,
  maxInactivity: 7 * 24 * 60 * 60 * 1000, // 7 days
};
