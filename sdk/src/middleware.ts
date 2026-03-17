// ============================================================
// @agent-rep/sdk — Pre-built Middleware
// Drop-in middleware for common use cases
// ============================================================

import { Middleware, MiddlewareContext, MiddlewareResponse, Logger } from './types';

/**
 * Logs every request and response with timing.
 *
 * @example
 * ```ts
 * const client = new AgentRepClient({
 *   baseUrl: 'http://localhost:4000/api',
 *   middleware: [loggingMiddleware()],
 * });
 * ```
 */
export function loggingMiddleware(logger?: Logger): Middleware {
  const log = logger ?? console;
  return {
    onRequest: (ctx) => {
      log.info(`→ ${ctx.method} ${ctx.path}${ctx.attempt > 1 ? ` (retry #${ctx.attempt - 1})` : ''}`);
      return ctx;
    },
    onResponse: (_ctx, res) => {
      log.info(`← ${res.status} (${res.duration}ms)`);
    },
    onError: (ctx, error) => {
      log.error(`✗ ${ctx.method} ${ctx.path} — ${error.message}`);
    },
  };
}

/**
 * Adds timing metrics to every response.
 * Stores metrics in an array you can query later.
 *
 * @example
 * ```ts
 * const metrics = metricsMiddleware();
 * const client = new AgentRepClient({
 *   baseUrl: 'http://localhost:4000/api',
 *   middleware: [metrics.middleware],
 * });
 *
 * // After some requests...
 * console.log('Average latency:', metrics.averageLatency());
 * console.log('Total requests:', metrics.totalRequests());
 * ```
 */
export function metricsMiddleware() {
  const entries: Array<{
    method: string;
    path: string;
    status: number;
    duration: number;
    timestamp: number;
  }> = [];

  const middleware: Middleware = {
    onResponse: (ctx, res) => {
      entries.push({
        method: ctx.method,
        path: ctx.path,
        status: res.status,
        duration: res.duration,
        timestamp: Date.now(),
      });
    },
  };

  return {
    middleware,
    entries: () => [...entries],
    totalRequests: () => entries.length,
    averageLatency: () => {
      if (entries.length === 0) return 0;
      return entries.reduce((sum, e) => sum + e.duration, 0) / entries.length;
    },
    p95Latency: () => {
      if (entries.length === 0) return 0;
      const sorted = [...entries].sort((a, b) => a.duration - b.duration);
      return sorted[Math.floor(sorted.length * 0.95)]?.duration ?? 0;
    },
    errorRate: () => {
      if (entries.length === 0) return 0;
      const errors = entries.filter((e) => e.status >= 400).length;
      return errors / entries.length;
    },
    clear: () => { entries.length = 0; },
  };
}

/**
 * Adds a Bearer token to every request.
 *
 * @example
 * ```ts
 * const client = new AgentRepClient({
 *   middleware: [bearerAuthMiddleware('your-jwt-token')],
 * });
 * ```
 */
export function bearerAuthMiddleware(token: string): Middleware {
  return {
    onRequest: (ctx) => {
      ctx.headers['Authorization'] = `Bearer ${token}`;
      return ctx;
    },
  };
}

/**
 * Adds custom headers to every request.
 *
 * @example
 * ```ts
 * const client = new AgentRepClient({
 *   middleware: [headersMiddleware({
 *     'X-Request-ID': () => crypto.randomUUID(),
 *     'X-Client-Version': '1.0.0',
 *   })],
 * });
 * ```
 */
export function headersMiddleware(
  headers: Record<string, string | (() => string)>,
): Middleware {
  return {
    onRequest: (ctx) => {
      for (const [key, value] of Object.entries(headers)) {
        ctx.headers[key] = typeof value === 'function' ? value() : value;
      }
      return ctx;
    },
  };
}

/**
 * Throttles requests to avoid rate limiting.
 * Adds a minimum delay between consecutive requests.
 *
 * @example
 * ```ts
 * const client = new AgentRepClient({
 *   middleware: [throttleMiddleware(100)], // 100ms between requests
 * });
 * ```
 */
export function throttleMiddleware(minDelayMs: number): Middleware {
  let lastRequest = 0;

  return {
    onRequest: async (ctx) => {
      const now = Date.now();
      const elapsed = now - lastRequest;
      if (elapsed < minDelayMs) {
        await new Promise((r) => setTimeout(r, minDelayMs - elapsed));
      }
      lastRequest = Date.now();
      return ctx;
    },
  };
}

/**
 * Circuit breaker middleware — stops sending requests after too many failures.
 *
 * @example
 * ```ts
 * const breaker = circuitBreakerMiddleware({
 *   failureThreshold: 5,    // Open after 5 failures
 *   resetTimeout: 30000,    // Try again after 30s
 * });
 *
 * const client = new AgentRepClient({
 *   middleware: [breaker.middleware],
 * });
 *
 * // Check state
 * console.log(breaker.state()); // 'closed' | 'open' | 'half-open'
 * ```
 */
export function circuitBreakerMiddleware(options: {
  failureThreshold?: number;
  resetTimeout?: number;
}) {
  const threshold = options.failureThreshold ?? 5;
  const resetTimeout = options.resetTimeout ?? 30000;

  let failures = 0;
  let state: 'closed' | 'open' | 'half-open' = 'closed';
  let lastFailure = 0;

  const middleware: Middleware = {
    onRequest: (ctx) => {
      if (state === 'open') {
        const elapsed = Date.now() - lastFailure;
        if (elapsed > resetTimeout) {
          state = 'half-open';
        } else {
          throw new Error(`Circuit breaker OPEN — ${Math.ceil((resetTimeout - elapsed) / 1000)}s until retry`);
        }
      }
      return ctx;
    },
    onResponse: () => {
      if (state === 'half-open') {
        state = 'closed';
        failures = 0;
      }
    },
    onError: () => {
      failures++;
      lastFailure = Date.now();
      if (failures >= threshold) {
        state = 'open';
      }
    },
  };

  return {
    middleware,
    state: () => state,
    failures: () => failures,
    reset: () => { state = 'closed'; failures = 0; },
  };
}
