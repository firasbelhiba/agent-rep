// ============================================================
// @agent-rep/sdk — AgentRep Client (Enhanced)
// ERC-8004 Agent Reputation on Hedera
//
// Features: Middleware, Retry, Cache, Events, Builder,
//           Trust Policies, Reputation Watcher, Batch Ops
// ============================================================

import {
  AgentRepConfig,
  Agent,
  AgentWithReputation,
  AggregatedReputation,
  RegisterAgentParams,
  RegisterAgentResult,
  GiveFeedbackParams,
  FeedbackResult,
  Feedback,
  FeedbackSummary,
  ReadFeedbackResult,
  RequestValidationParams,
  SubmitValidationParams,
  ValidationRequest,
  ValidationResponse,
  ValidationStatus,
  ValidationSummary,
  FindAgentsOptions,
  TrustTier,
  TrustPolicy,
  Middleware,
  MiddlewareContext,
  MiddlewareResponse,
  Logger,
  RetryConfig,
  CacheConfig,
  BatchFeedbackItem,
  BatchFeedbackResult,
  WatchOptions,
  ReputationChange,
  Connection,
  TopicMessage,
} from './types';

import { EventEmitter } from './events';
import { ResponseCache } from './cache';
import { resolveRetryConfig, withRetry } from './retry';
import { AgentSearchBuilder } from './builder';
import { evaluatePolicy, TrustEvaluation } from './trust';
import { ReputationWatcher } from './watcher';

const TIER_ORDER: TrustTier[] = ['UNVERIFIED', 'VERIFIED', 'TRUSTED', 'ELITE'];

export class AgentRepClient extends EventEmitter {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;
  private retryConfig: Required<RetryConfig> | null;
  private cache: ResponseCache | null;
  private debugMode: boolean;
  private logger: Logger;
  private middlewares: Middleware[];
  private customHeaders: Record<string, string>;
  private watcher: ReputationWatcher;
  private requestCount = 0;

  constructor(config: AgentRepConfig) {
    super();
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
    this.debugMode = config.debug ?? false;
    this.middlewares = config.middleware ?? [];
    this.customHeaders = config.headers ?? {};

    // Logger
    this.logger = config.logger ?? {
      debug: (...args: unknown[]) => this.debugMode && console.debug('[AgentRep]', ...args),
      info: (...args: unknown[]) => this.debugMode && console.info('[AgentRep]', ...args),
      warn: (...args: unknown[]) => console.warn('[AgentRep]', ...args),
      error: (...args: unknown[]) => console.error('[AgentRep]', ...args),
    };

    // Retry
    this.retryConfig = resolveRetryConfig(config.retry ?? true);

    // Cache
    if (config.cache) {
      const cacheConfig = config.cache === true ? undefined : config.cache;
      this.cache = new ResponseCache(cacheConfig);
    } else {
      this.cache = null;
    }

    // Reputation watcher
    this.watcher = new ReputationWatcher(
      (agentId) => this.getReputation(agentId),
      (event, data) => this.emit(event as any, data),
    );
  }

  // ================================================================
  //  CONFIGURATION (runtime changes)
  // ================================================================

  /**
   * Update the API key at runtime (e.g., after registration).
   *
   * @example
   * ```ts
   * const result = await client.register({ name: 'MyBot' });
   * client.setApiKey(result.apiKey); // Now authenticated
   * ```
   */
  setApiKey(apiKey: string): this {
    this.apiKey = apiKey;
    return this;
  }

  /**
   * Add middleware at runtime.
   *
   * @example
   * ```ts
   * client.use({
   *   onRequest: (ctx) => {
   *     console.log(`→ ${ctx.method} ${ctx.path}`);
   *     return ctx;
   *   },
   *   onResponse: (ctx, res) => {
   *     console.log(`← ${res.status} (${res.duration}ms)`);
   *   },
   * });
   * ```
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Enable or disable caching at runtime.
   */
  enableCache(config?: Partial<CacheConfig>): this {
    this.cache = new ResponseCache(config);
    return this;
  }

  disableCache(): this {
    this.cache?.clear();
    this.cache = null;
    return this;
  }

  /**
   * Get cache stats (or null if caching is disabled).
   */
  cacheStats(): { size: number; maxSize: number; ttl: number } | null {
    return this.cache?.stats() ?? null;
  }

  /**
   * Invalidate cached entries matching a pattern.
   *
   * @example
   * ```ts
   * client.invalidateCache('/agents/*'); // Clear all agent cache
   * client.invalidateCache('/feedback/*');
   * ```
   */
  invalidateCache(pattern?: string): void {
    if (pattern) {
      this.cache?.invalidate(pattern);
    } else {
      this.cache?.clear();
    }
  }

  /**
   * Enable/disable debug mode at runtime.
   */
  setDebug(enabled: boolean): this {
    this.debugMode = enabled;
    return this;
  }

  /**
   * Get total request count since client creation.
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  // ================================================================
  //  INTERNAL HTTP ENGINE
  // ================================================================

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.customHeaders,
    };
    if (this.apiKey) {
      h['X-Agent-Key'] = this.apiKey;
    }
    return h;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    this.requestCount++;

    // Check cache for GET requests
    const cacheKey = `${method}:${path}`;
    if (method === 'GET' && this.cache) {
      const cached = this.cache.get<T>(cacheKey);
      if (cached !== undefined) {
        this.logger.debug(`Cache HIT: ${path}`);
        this.emit('cache:hit', { path, timestamp: Date.now() });
        return cached;
      }
      this.logger.debug(`Cache MISS: ${path}`);
      this.emit('cache:miss', { path, timestamp: Date.now() });
    }

    // Build middleware context
    let ctx: MiddlewareContext = {
      method,
      path,
      url: `${this.baseUrl}${path}`,
      body,
      headers: this.headers(),
      attempt: 1,
      startTime: Date.now(),
    };

    // Execute request (with optional retry)
    const executeFn = async (attempt: number): Promise<T> => {
      ctx.attempt = attempt;

      // Run onRequest middleware
      for (const mw of this.middlewares) {
        if (mw.onRequest) {
          ctx = await mw.onRequest(ctx);
        }
      }

      // Emit request event
      this.emit('request', {
        method: ctx.method,
        path: ctx.path,
        body: ctx.body,
        timestamp: Date.now(),
      });

      this.logger.debug(`${ctx.method} ${ctx.path}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      try {
        const resp = await fetch(ctx.url, {
          method: ctx.method,
          headers: ctx.headers,
          body: ctx.body ? JSON.stringify(ctx.body) : undefined,
          signal: controller.signal,
        });

        const data = await resp.json();
        const duration = Date.now() - ctx.startTime;

        if (!resp.ok) {
          const message = (data as any)?.message || resp.statusText;
          const error = new AgentRepError(message, resp.status, data);

          // Run onError middleware
          for (const mw of this.middlewares) {
            if (mw.onError) {
              const suppress = await mw.onError(ctx, error);
              if (suppress) return data as T;
            }
          }

          this.emit('error', {
            method: ctx.method,
            path: ctx.path,
            error,
            attempt,
            timestamp: Date.now(),
          });

          throw error;
        }

        // Build response for middleware
        const mwResponse: MiddlewareResponse = {
          status: resp.status,
          data,
          headers: Object.fromEntries(resp.headers.entries()),
          duration,
        };

        // Run onResponse middleware
        for (const mw of this.middlewares) {
          if (mw.onResponse) {
            await mw.onResponse(ctx, mwResponse);
          }
        }

        // Emit response event
        this.emit('response', {
          method: ctx.method,
          path: ctx.path,
          status: resp.status,
          duration,
          timestamp: Date.now(),
        });

        this.logger.debug(`${ctx.method} ${ctx.path} → ${resp.status} (${duration}ms)`);

        // Cache successful GET responses
        if (method === 'GET' && this.cache) {
          this.cache.set(cacheKey, data);
        }

        return data as T;
      } finally {
        clearTimeout(timer);
      }
    };

    // Execute with or without retry
    if (this.retryConfig) {
      return withRetry(
        executeFn,
        this.retryConfig,
        this.logger,
        (attempt, delay, reason) => {
          this.emit('retry', {
            method,
            path,
            attempt,
            delay,
            reason,
            timestamp: Date.now(),
          });
        },
      );
    }

    return executeFn(1);
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  private put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  private del<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  // ================================================================
  //  IDENTITY REGISTRY (ERC-8004)
  // ================================================================

  /**
   * Register a new agent.
   * Returns agent details, reputation, and a one-time API key.
   *
   * @example
   * ```ts
   * const result = await client.register({
   *   name: 'PriceBot',
   *   description: 'Real-time crypto price feeds',
   *   skills: ['defi', 'price-feeds'],
   *   capabilities: [0, 3, 5],
   *   agentURI: 'https://pricebot.ai/agent.json',
   * });
   * console.log(result.apiKey); // Save this!
   * client.setApiKey(result.apiKey); // Auto-authenticate
   * ```
   */
  async register(params: RegisterAgentParams): Promise<RegisterAgentResult> {
    const result = await this.post<RegisterAgentResult>('/agents', params);
    this.emit('agent:registered', result);
    return result;
  }

  /**
   * Get agent details with full reputation, feedback, and validations.
   */
  async getAgent(agentId: string): Promise<{
    agent: Agent;
    reputation: AggregatedReputation;
    feedback: Feedback[];
    validations: { requests: ValidationRequest[]; responses: ValidationResponse[] };
  }> {
    return this.get(`/agents/${agentId}`);
  }

  /**
   * Get just the reputation score for an agent.
   */
  async getReputation(agentId: string): Promise<AggregatedReputation> {
    const data = await this.getAgent(agentId);
    return data.reputation;
  }

  /**
   * Get the trust tier of an agent.
   */
  async getTrustTier(agentId: string): Promise<TrustTier> {
    const rep = await this.getReputation(agentId);
    return rep.trustTier;
  }

  /**
   * Check if an agent meets a minimum trust threshold.
   *
   * @example
   * ```ts
   * if (await client.isTrusted('0.0.8251198', 'VERIFIED')) {
   *   // safe to delegate task
   * }
   * ```
   */
  async isTrusted(agentId: string, minTier: TrustTier = 'VERIFIED'): Promise<boolean> {
    const tier = await this.getTrustTier(agentId);
    const result = TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(minTier);
    this.emit('trust:checked', { agentId, tier, minTier, trusted: result });
    return result;
  }

  /**
   * ERC-8004: setAgentURI — update off-chain metadata pointer.
   * Requires API key authentication (only owner can update).
   */
  async setAgentURI(agentId: string, newURI: string): Promise<{ agent: Agent }> {
    const result = await this.patch<{ agent: Agent }>(`/agents/${agentId}/uri`, { newURI });
    this.invalidateCache(`GET:/agents/${agentId}`);
    this.invalidateCache('GET:/agents');
    return result;
  }

  /**
   * ERC-8004: getMetadata — read a metadata key for an agent.
   */
  async getMetadata(agentId: string, key: string): Promise<unknown> {
    const data = await this.get<{ agentId: string; key: string; value: unknown }>(`/agents/${agentId}/metadata/${key}`);
    return data.value;
  }

  /**
   * ERC-8004: setMetadata — write a metadata key-value pair.
   * Requires API key authentication.
   */
  async setMetadata(agentId: string, key: string, value: unknown): Promise<void> {
    await this.put(`/agents/${agentId}/metadata/${key}`, { value });
    this.invalidateCache(`GET:/agents/${agentId}*`);
  }

  /**
   * ERC-8004: getAgentWallet — get the bound wallet address.
   */
  async getAgentWallet(agentId: string): Promise<string | null> {
    const data = await this.get<{ agentId: string; wallet: string | null }>(`/agents/${agentId}/wallet`);
    return data.wallet;
  }

  /**
   * ERC-8004: setAgentWallet — bind a wallet address to the agent.
   * Requires API key authentication.
   */
  async setAgentWallet(agentId: string, wallet: string): Promise<void> {
    await this.put(`/agents/${agentId}/wallet`, { wallet });
    this.invalidateCache(`GET:/agents/${agentId}*`);
  }

  // ================================================================
  //  REPUTATION REGISTRY (ERC-8004)
  // ================================================================

  /**
   * ERC-8004: giveFeedback — submit feedback about an agent.
   * Requires active HCS-10 connection between your agent and the target.
   *
   * @example
   * ```ts
   * const result = await client.giveFeedback({
   *   agentId: '0.0.8251198',
   *   value: 85,
   *   tag1: 'accuracy',
   *   tag2: 'price-feeds',
   *   endpoint: '/api/price/ETH-USDC',
   * });
   * console.log(result.reputation.overallScore);
   * ```
   */
  async giveFeedback(params: GiveFeedbackParams): Promise<FeedbackResult> {
    const result = await this.post<FeedbackResult>('/feedback', params);
    this.emit('feedback:given', result);
    // Invalidate agent cache since score changed
    this.invalidateCache(`GET:/agents/${params.agentId}`);
    this.invalidateCache('GET:/agents');
    return result;
  }

  /**
   * Submit multiple feedback entries in one call.
   * Executes in parallel with configurable concurrency.
   *
   * @example
   * ```ts
   * const batch = await client.batchFeedback([
   *   { agentId: '0.0.123', value: 90, tag1: 'accuracy', tag2: 'prices' },
   *   { agentId: '0.0.456', value: 75, tag1: 'speed', tag2: 'api' },
   *   { agentId: '0.0.789', value: 60, tag1: 'reliability', tag2: 'uptime' },
   * ]);
   * console.log(`${batch.summary.succeeded}/${batch.summary.total} succeeded`);
   * ```
   */
  async batchFeedback(items: BatchFeedbackItem[], concurrency = 3): Promise<BatchFeedbackResult> {
    const results: BatchFeedbackResult['results'] = [];
    let succeeded = 0;
    let failed = 0;

    // Process in batches of `concurrency`
    for (let i = 0; i < items.length; i += concurrency) {
      const chunk = items.slice(i, i + concurrency);
      const promises = chunk.map(async (item) => {
        try {
          const result = await this.giveFeedback(item);
          succeeded++;
          return { success: true as const, feedback: result.feedback };
        } catch (err: any) {
          failed++;
          return { success: false as const, error: err.message || String(err) };
        }
      });

      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
    }

    return {
      results,
      summary: { total: items.length, succeeded, failed },
    };
  }

  /**
   * ERC-8004: revokeFeedback — revoke feedback you previously submitted.
   */
  async revokeFeedback(feedbackId: string): Promise<{ success: boolean }> {
    const result = await this.del<{ success: boolean }>(`/feedback/${feedbackId}`);
    this.emit('feedback:revoked', { feedbackId });
    return result;
  }

  /**
   * ERC-8004: revokeFeedback by agentId + feedbackIndex.
   */
  async revokeByIndex(agentId: string, feedbackIndex: number): Promise<{ success: boolean }> {
    const result = await this.del<{ success: boolean }>(`/feedback/${agentId}/index/${feedbackIndex}`);
    this.emit('feedback:revoked', { agentId, feedbackIndex });
    return result;
  }

  /**
   * ERC-8004: appendResponse — respond to feedback about your agent.
   * Only the agent the feedback is about can call this.
   */
  async respondToFeedback(feedbackId: string, responseURI: string, responseHash?: string): Promise<{ success: boolean }> {
    return this.patch<{ success: boolean }>(`/feedback/${feedbackId}`, { responseURI, responseHash });
  }

  /**
   * ERC-8004: getSummary — get aggregated feedback summary.
   */
  async getFeedbackSummary(
    agentId: string,
    options?: { clientAddresses?: string[]; tag1?: string; tag2?: string },
  ): Promise<FeedbackSummary> {
    const params = new URLSearchParams();
    if (options?.clientAddresses?.length) params.set('clientAddresses', options.clientAddresses.join(','));
    if (options?.tag1) params.set('tag1', options.tag1);
    if (options?.tag2) params.set('tag2', options.tag2);
    const qs = params.toString();
    return this.get<FeedbackSummary>(`/feedback/${agentId}/summary${qs ? `?${qs}` : ''}`);
  }

  /**
   * ERC-8004: readFeedback — read a single feedback entry.
   */
  async readFeedback(agentId: string, clientAddress: string, feedbackIndex: number): Promise<ReadFeedbackResult> {
    return this.get<ReadFeedbackResult>(
      `/feedback/${agentId}/read?clientAddress=${clientAddress}&feedbackIndex=${feedbackIndex}`,
    );
  }

  /**
   * ERC-8004: readAllFeedback — read all feedback for an agent.
   */
  async readAllFeedback(
    agentId: string,
    options?: { clientAddress?: string; tag1?: string; tag2?: string; includeRevoked?: boolean },
  ): Promise<{ feedback: ReadFeedbackResult[] }> {
    const params = new URLSearchParams();
    if (options?.clientAddress) params.set('clientAddress', options.clientAddress);
    if (options?.tag1) params.set('tag1', options.tag1);
    if (options?.tag2) params.set('tag2', options.tag2);
    if (options?.includeRevoked) params.set('includeRevoked', 'true');
    const qs = params.toString();
    return this.get(`/feedback/${agentId}/read${qs ? `?${qs}` : ''}`);
  }

  /**
   * ERC-8004: getClients — get all addresses that have given feedback to an agent.
   */
  async getClients(agentId: string): Promise<string[]> {
    const data = await this.get<{ clients: string[] }>(`/feedback/${agentId}/clients`);
    return data.clients;
  }

  /**
   * ERC-8004: getLastIndex — get the last feedback index for a client.
   */
  async getLastIndex(agentId: string, clientAddress: string): Promise<number> {
    const data = await this.get<{ lastIndex: number }>(`/feedback/${agentId}/lastIndex?clientAddress=${clientAddress}`);
    return data.lastIndex;
  }

  /**
   * Get all feedback for an agent (non-ERC-8004 convenience method).
   */
  async getFeedback(agentId?: string, tag1?: string): Promise<Feedback[]> {
    const params = new URLSearchParams();
    if (agentId) params.set('agentId', agentId);
    if (tag1) params.set('tag1', tag1);
    const qs = params.toString();
    const data = await this.get<{ feedback: Feedback[] }>(`/feedback${qs ? `?${qs}` : ''}`);
    return data.feedback;
  }

  // ================================================================
  //  VALIDATION REGISTRY (ERC-8004)
  // ================================================================

  /**
   * ERC-8004: validationRequest — request to validate an agent.
   * Requires active HCS-10 connection.
   */
  async requestValidation(params: RequestValidationParams): Promise<{
    request: ValidationRequest;
    hcsSequenceNumber?: string;
  }> {
    const result = await this.post<{ request: ValidationRequest; hcsSequenceNumber?: string }>('/validation', params);
    this.emit('validation:requested', result);
    return result;
  }

  /**
   * ERC-8004: validationResponse — submit validation results.
   */
  async submitValidation(params: SubmitValidationParams): Promise<{
    validationResponse: ValidationResponse;
    reputation: AggregatedReputation;
  }> {
    const result = await this.post<{
      validationResponse: ValidationResponse;
      reputation: AggregatedReputation;
    }>('/validation/respond', params);
    this.emit('validation:submitted', result);
    return result;
  }

  /**
   * ERC-8004: getValidationStatus — get status of a validation request.
   */
  async getValidationStatus(requestHash: string): Promise<ValidationStatus> {
    return this.get<ValidationStatus>(`/validation/status/${requestHash}`);
  }

  /**
   * ERC-8004: getSummary — get aggregated validation summary for an agent.
   */
  async getValidationSummary(
    agentId: string,
    options?: { validatorAddresses?: string[]; tag?: string },
  ): Promise<ValidationSummary> {
    const params = new URLSearchParams();
    if (options?.validatorAddresses?.length) params.set('validatorAddresses', options.validatorAddresses.join(','));
    if (options?.tag) params.set('tag', options.tag);
    const qs = params.toString();
    return this.get<ValidationSummary>(`/validation/${agentId}/summary${qs ? `?${qs}` : ''}`);
  }

  /**
   * ERC-8004: getAgentValidations — get all validation request hashes for an agent.
   */
  async getAgentValidations(agentId: string): Promise<string[]> {
    const data = await this.get<{ requestHashes: string[] }>(`/validation/${agentId}/hashes`);
    return data.requestHashes;
  }

  /**
   * ERC-8004: getValidatorRequests — get all request hashes by a validator.
   */
  async getValidatorRequests(validatorId: string): Promise<string[]> {
    const data = await this.get<{ requestHashes: string[] }>(`/validation/validator/${validatorId}/hashes`);
    return data.requestHashes;
  }

  // ================================================================
  //  AGENT DISCOVERY (enhanced)
  // ================================================================

  /**
   * List all registered agents with their reputation.
   */
  async listAgents(skill?: string): Promise<AgentWithReputation[]> {
    const params = skill ? `?skill=${encodeURIComponent(skill)}` : '';
    const data = await this.get<{ agents: AgentWithReputation[] }>(`/agents${params}`);
    return data.agents;
  }

  /**
   * Find agents matching criteria.
   */
  async findAgents(options: FindAgentsOptions = {}): Promise<AgentWithReputation[]> {
    let agents = await this.listAgents(options.skill);

    if (options.minScore !== undefined) {
      agents = agents.filter((a) => a.reputation.overallScore >= options.minScore!);
    }

    if (options.minTier) {
      const minIdx = TIER_ORDER.indexOf(options.minTier);
      agents = agents.filter((a) => TIER_ORDER.indexOf(a.reputation.trustTier) >= minIdx);
    }

    const sortBy = options.sortBy || 'score';
    agents.sort((a, b) => {
      if (sortBy === 'score') return b.reputation.overallScore - a.reputation.overallScore;
      if (sortBy === 'activity') return b.reputation.lastActivity - a.reputation.lastActivity;
      if (sortBy === 'name') return a.agent.name.localeCompare(b.agent.name);
      return 0;
    });

    if (options.limit) {
      agents = agents.slice(0, options.limit);
    }

    return agents;
  }

  /**
   * Find the single best agent for a skill.
   */
  async findBestAgent(skill: string, minScore = 0): Promise<AgentWithReputation | null> {
    const agents = await this.findAgents({ skill, minScore, sortBy: 'score', limit: 1 });
    return agents[0] || null;
  }

  /**
   * Fluent search builder — chain filters for complex queries.
   *
   * @example
   * ```ts
   * const agents = await client.search()
   *   .skill('defi')
   *   .minScore(500)
   *   .minTier('TRUSTED')
   *   .hasCapability(3)
   *   .activeWithin(7 * 24 * 60 * 60 * 1000) // 7 days
   *   .hcs10Only()
   *   .sortBy('score')
   *   .limit(5)
   *   .execute();
   * ```
   */
  search(): AgentSearchBuilder {
    return new AgentSearchBuilder((options) => this.findAgents(options));
  }

  // ================================================================
  //  TRUST POLICIES (advanced trust evaluation)
  // ================================================================

  /**
   * Evaluate an agent against a trust policy.
   * Returns detailed results showing which checks passed/failed.
   *
   * @example
   * ```ts
   * import { POLICY_HIGH } from '@agent-rep/sdk';
   *
   * const eval = await client.evaluateTrust('0.0.123', POLICY_HIGH);
   * if (eval.trusted) {
   *   console.log('Agent is trustworthy!');
   * } else {
   *   console.log('Failed:', eval.failures);
   * }
   * ```
   */
  async evaluateTrust(agentId: string, policy: TrustPolicy): Promise<TrustEvaluation> {
    const data = await this.getAgent(agentId);
    const agent: AgentWithReputation = { agent: data.agent, reputation: data.reputation };
    const result = await evaluatePolicy(agent, policy);
    this.emit('trust:checked', {
      agentId,
      trusted: result.trusted,
      failures: result.failures,
    });
    return result;
  }

  /**
   * Find all agents that pass a trust policy.
   *
   * @example
   * ```ts
   * const trusted = await client.findTrustedAgents({
   *   minTier: 'VERIFIED',
   *   minScore: 400,
   *   requiredSkills: ['defi'],
   *   maxInactivity: 7 * 24 * 60 * 60 * 1000,
   * });
   * ```
   */
  async findTrustedAgents(policy: TrustPolicy): Promise<AgentWithReputation[]> {
    const all = await this.listAgents();
    const results: AgentWithReputation[] = [];

    for (const agent of all) {
      const evaluation = await evaluatePolicy(agent, policy);
      if (evaluation.trusted) {
        results.push(agent);
      }
    }

    return results;
  }

  // ================================================================
  //  REPUTATION WATCHER
  // ================================================================

  /**
   * Watch an agent's reputation for changes.
   * Emits 'reputation:changed' events when score or tier changes.
   *
   * @example
   * ```ts
   * client.on('reputation:changed', (change) => {
   *   console.log(`${change.agentId}: score ${change.scoreDelta > 0 ? '+' : ''}${change.scoreDelta}`);
   *   if (change.tierChanged) {
   *     console.log(`  Tier: ${change.previous.trustTier} → ${change.current.trustTier}`);
   *   }
   * });
   *
   * await client.watch('0.0.123', { interval: 10000 }); // Poll every 10s
   * ```
   */
  async watch(agentId: string, options?: Partial<WatchOptions>): Promise<void> {
    return this.watcher.watch(agentId, options);
  }

  /**
   * Stop watching an agent.
   */
  unwatch(agentId: string): void {
    this.watcher.unwatch(agentId);
  }

  /**
   * Stop all watchers.
   */
  unwatchAll(): void {
    this.watcher.unwatchAll();
  }

  /**
   * Check if an agent is being watched.
   */
  isWatching(agentId: string): boolean {
    return this.watcher.isWatching(agentId);
  }

  /**
   * Get the last known reputation snapshot for a watched agent.
   */
  getSnapshot(agentId: string): AggregatedReputation | undefined {
    return this.watcher.getSnapshot(agentId);
  }

  // ================================================================
  //  UTILITY METHODS
  // ================================================================

  /**
   * Compare two agents side by side.
   *
   * @example
   * ```ts
   * const comparison = await client.compare('0.0.123', '0.0.456');
   * console.log(`Score difference: ${comparison.scoreDiff}`);
   * console.log(`Winner: ${comparison.winner.agent.name}`);
   * ```
   */
  async compare(agentId1: string, agentId2: string): Promise<{
    agents: [AgentWithReputation, AgentWithReputation];
    scoreDiff: number;
    winner: AgentWithReputation;
    details: {
      feedbackCountDiff: number;
      validationCountDiff: number;
      tierComparison: string;
    };
  }> {
    const [data1, data2] = await Promise.all([this.getAgent(agentId1), this.getAgent(agentId2)]);

    const a1: AgentWithReputation = { agent: data1.agent, reputation: data1.reputation };
    const a2: AgentWithReputation = { agent: data2.agent, reputation: data2.reputation };
    const scoreDiff = a1.reputation.overallScore - a2.reputation.overallScore;

    return {
      agents: [a1, a2],
      scoreDiff: Math.abs(scoreDiff),
      winner: scoreDiff >= 0 ? a1 : a2,
      details: {
        feedbackCountDiff: a1.reputation.feedbackCount - a2.reputation.feedbackCount,
        validationCountDiff: a1.reputation.validationCount - a2.reputation.validationCount,
        tierComparison: `${a1.reputation.trustTier} vs ${a2.reputation.trustTier}`,
      },
    };
  }

  /**
   * Get a formatted reputation report for an agent.
   */
  async getReport(agentId: string): Promise<string> {
    const data = await this.getAgent(agentId);
    const { agent, reputation } = data;

    const lines = [
      `╔══════════════════════════════════════════════════╗`,
      `║  Agent Reputation Report                        ║`,
      `╠══════════════════════════════════════════════════╣`,
      `║  Name:        ${agent.name.padEnd(35)}║`,
      `║  ID:          ${agent.agentId.padEnd(35)}║`,
      `║  Score:       ${String(reputation.overallScore).padEnd(35)}║`,
      `║  Tier:        ${reputation.trustTier.padEnd(35)}║`,
      `║  Feedback:    ${String(reputation.feedbackCount).padEnd(35)}║`,
      `║  Validations: ${String(reputation.validationCount).padEnd(35)}║`,
      `║  Skills:      ${agent.skills.join(', ').padEnd(35)}║`,
      `╠══════════════════════════════════════════════════╣`,
    ];

    // Feedback by tag
    const fbTags = Object.entries(reputation.feedbackByTag);
    if (fbTags.length > 0) {
      lines.push(`║  Feedback by Tag:                                ║`);
      for (const [tag, data] of fbTags) {
        lines.push(`║    ${tag}: avg ${data.avg.toFixed(1)} (${data.count} entries)`.padEnd(51) + '║');
      }
    }

    // Validation by tag
    const valTags = Object.entries(reputation.validationByTag);
    if (valTags.length > 0) {
      lines.push(`║  Validation by Tag:                              ║`);
      for (const [tag, data] of valTags) {
        lines.push(`║    ${tag}: avg ${data.avg.toFixed(1)} (${data.count} entries)`.padEnd(51) + '║');
      }
    }

    lines.push(`╚══════════════════════════════════════════════════╝`);
    return lines.join('\n');
  }

  // ================================================================
  //  STAKING — Stake-based accountability
  // ================================================================

  /** Get staking system info (minimum stake, slash amount, etc.) */
  async getStakingInfo(): Promise<{
    minStakeToFeedback: number;
    minStakeToFeedbackHbar: number;
    slashAmount: number;
    slashAmountHbar: number;
    description: string;
  }> {
    return this.request('GET', '/staking/info');
  }

  /** Get an agent's stake balance */
  async getStake(agentId: string): Promise<{
    agentId: string;
    balance: number;
    balanceHbar: number;
    meetsMinimum: boolean;
    totalDeposited: number;
    totalSlashed: number;
    slashCount: number;
  }> {
    return this.request('GET', `/staking/${agentId}`);
  }

  /** Deposit stake (in tinybars). 1 HBAR = 100_000_000 tinybars. */
  async depositStake(amount: number): Promise<{
    stake: any;
    balanceHbar: number;
    meetsMinimum: boolean;
    hcsSequenceNumber?: string;
  }> {
    return this.request('POST', '/staking/deposit', { amount });
  }

  /** Dispute a feedback entry (only the target agent can dispute) */
  async disputeFeedback(feedbackId: string, reason: string): Promise<{ dispute: any }> {
    return this.request('POST', '/staking/dispute', { feedbackId, reason });
  }

  /** Resolve a dispute as an arbiter (any third-party agent) */
  async resolveDispute(
    disputeId: number,
    upheld: boolean,
    notes?: string,
  ): Promise<{ dispute: any; slashedStake?: any; hcsSequenceNumber?: string }> {
    return this.request('POST', `/staking/dispute/${disputeId}/resolve`, { upheld, notes });
  }

  /** Get disputes for an agent */
  async getDisputes(agentId?: string): Promise<{ disputes: any[] }> {
    const path = agentId ? `/staking/disputes/${agentId}` : '/staking/disputes/all';
    return this.request('GET', path);
  }

  // ================================================================
  //  CONNECTIONS & MESSAGING (HCS-10)
  // ================================================================

  /**
   * List all connections for an agent.
   *
   * @example
   * ```ts
   * const connections = await client.listConnections('0.0.8265268');
   * const active = connections.filter(c => c.status === 'active');
   * ```
   */
  async listConnections(agentId: string): Promise<Connection[]> {
    const data = await this.get<{ connections: Connection[] }>(`/connections/${agentId}`);
    return data.connections;
  }

  /**
   * Send a message on a connection topic (HCS-10).
   *
   * @example
   * ```ts
   * await client.sendMessage('0.0.8265300', 'Hello from my agent!');
   * ```
   */
  async sendMessage(connectionTopicId: string, message: string, memo?: string): Promise<boolean> {
    const data = await this.post<{ success: boolean }>('/connections/message', {
      connectionTopicId,
      message,
      memo,
    });
    this.emit('message:sent', { connectionTopicId, message, timestamp: Date.now() });
    return data.success;
  }

  /**
   * Get messages from a connection topic.
   *
   * @example
   * ```ts
   * const messages = await client.getMessages('0.0.8265300');
   * for (const msg of messages) {
   *   console.log(`[#${msg.sequenceNumber}]`, msg.data);
   * }
   * ```
   */
  async getMessages(connectionTopicId: string): Promise<TopicMessage[]> {
    const data = await this.get<{ messages: TopicMessage[] }>(`/connections/messages/${connectionTopicId}`);
    return data.messages;
  }

  /**
   * Cleanly shut down the client — stops all watchers, clears cache.
   */
  destroy(): void {
    this.unwatchAll();
    this.cache?.clear();
    this.removeAllListeners();
  }
}

// ---- Error class ----

export class AgentRepError extends Error {
  public statusCode: number;
  public response: unknown;

  constructor(message: string, statusCode: number, response?: unknown) {
    super(message);
    this.name = 'AgentRepError';
    this.statusCode = statusCode;
    this.response = response;
  }

  /**
   * Check if this is a rate limit error (429).
   */
  get isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  /**
   * Check if this is an authentication error (401/403).
   */
  get isAuthError(): boolean {
    return this.statusCode === 401 || this.statusCode === 403;
  }

  /**
   * Check if this is a not found error (404).
   */
  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  /**
   * Check if this is a server error (5xx).
   */
  get isServerError(): boolean {
    return this.statusCode >= 500;
  }
}
