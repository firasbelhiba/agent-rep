// ============================================================
// @agent-rep/sdk — Fluent Query Builder
// Chain filters to build complex agent searches
// ============================================================

import { AgentWithReputation, TrustTier, FindAgentsOptions } from './types';

type FetchFn = (options: FindAgentsOptions) => Promise<AgentWithReputation[]>;

/**
 * Fluent builder for discovering agents with chained filters.
 *
 * @example
 * ```ts
 * const agents = await client.search()
 *   .skill('defi')
 *   .minScore(500)
 *   .minTier('TRUSTED')
 *   .sortBy('score')
 *   .limit(5)
 *   .execute();
 * ```
 */
export class AgentSearchBuilder {
  private options: FindAgentsOptions = {};
  private customFilters: Array<(agent: AgentWithReputation) => boolean> = [];
  private fetchFn: FetchFn;

  constructor(fetchFn: FetchFn) {
    this.fetchFn = fetchFn;
  }

  /** Filter by skill */
  skill(skill: string): this {
    this.options.skill = skill;
    return this;
  }

  /** Set minimum reputation score */
  minScore(score: number): this {
    this.options.minScore = score;
    return this;
  }

  /** Set minimum trust tier */
  minTier(tier: TrustTier): this {
    this.options.minTier = tier;
    return this;
  }

  /** Sort results */
  sortBy(field: 'score' | 'activity' | 'name'): this {
    this.options.sortBy = field;
    return this;
  }

  /** Limit number of results */
  limit(n: number): this {
    this.options.limit = n;
    return this;
  }

  /** Filter agents that have a specific capability */
  hasCapability(cap: number): this {
    this.customFilters.push((a) => a.agent.capabilities.includes(cap));
    return this;
  }

  /** Filter agents active within the last N milliseconds */
  activeWithin(ms: number): this {
    this.customFilters.push((a) => Date.now() - a.reputation.lastActivity < ms);
    return this;
  }

  /** Filter by minimum feedback count */
  minFeedback(count: number): this {
    this.customFilters.push((a) => a.reputation.feedbackCount >= count);
    return this;
  }

  /** Filter by minimum validation count */
  minValidations(count: number): this {
    this.customFilters.push((a) => a.reputation.validationCount >= count);
    return this;
  }

  /** Filter by name pattern (case-insensitive) */
  nameContains(pattern: string): this {
    const lower = pattern.toLowerCase();
    this.customFilters.push((a) => a.agent.name.toLowerCase().includes(lower));
    return this;
  }

  /** Filter by agent type */
  agentType(type: 'autonomous' | 'manual'): this {
    this.customFilters.push((a) => a.agent.agentType === type);
    return this;
  }

  /** Filter by HCS-10 registration */
  hcs10Only(): this {
    this.customFilters.push((a) => a.agent.hcs10Registered === true);
    return this;
  }

  /** Add a custom filter function */
  where(predicate: (agent: AgentWithReputation) => boolean): this {
    this.customFilters.push(predicate);
    return this;
  }

  /** Execute the search and return matching agents */
  async execute(): Promise<AgentWithReputation[]> {
    let agents = await this.fetchFn(this.options);

    // Apply custom filters
    for (const filter of this.customFilters) {
      agents = agents.filter(filter);
    }

    return agents;
  }

  /** Execute and return only the first result, or null */
  async first(): Promise<AgentWithReputation | null> {
    const results = await this.execute();
    return results[0] || null;
  }

  /** Execute and return the count of matching agents */
  async count(): Promise<number> {
    const results = await this.execute();
    return results.length;
  }
}
