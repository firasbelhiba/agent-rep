// ============================================================
// @agent-rep/sdk — Retry Engine
// Exponential backoff with jitter — zero dependencies
// ============================================================

import { RetryConfig, Logger } from './types';

export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  baseDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 15_000,
  retryOn: [408, 429, 500, 502, 503, 504],
};

export function resolveRetryConfig(input?: boolean | RetryConfig): Required<RetryConfig> | null {
  if (input === false || input === undefined) return null;
  if (input === true) return { ...DEFAULT_RETRY_CONFIG };
  return { ...DEFAULT_RETRY_CONFIG, ...input };
}

/**
 * Calculate the delay before the next retry attempt.
 * Uses exponential backoff with jitter to avoid thundering herd.
 */
export function calculateDelay(attempt: number, config: Required<RetryConfig>): number {
  const exponential = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  const capped = Math.min(exponential, config.maxDelay);
  // Add 0-25% jitter
  const jitter = capped * Math.random() * 0.25;
  return Math.floor(capped + jitter);
}

/**
 * Check if a status code is retryable.
 */
export function isRetryable(statusCode: number, config: Required<RetryConfig>): boolean {
  return config.retryOn.includes(statusCode);
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  config: Required<RetryConfig>,
  logger?: Logger,
  onRetry?: (attempt: number, delay: number, reason: string) => void,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    try {
      return await fn(attempt);
    } catch (error: any) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt > config.maxRetries) break;

      // Check if error is retryable
      const statusCode = error?.statusCode ?? error?.status ?? 0;
      const isNetworkError = error?.name === 'AbortError' || error?.code === 'ECONNRESET';

      if (!isRetryable(statusCode, config) && !isNetworkError) {
        throw error; // Non-retryable error — fail immediately
      }

      const delay = calculateDelay(attempt, config);
      const reason = isNetworkError ? 'network error' : `HTTP ${statusCode}`;

      logger?.warn(`[AgentRep] Retry ${attempt}/${config.maxRetries} in ${delay}ms (${reason})`);
      onRetry?.(attempt, delay, reason);

      await sleep(delay);
    }
  }

  throw lastError;
}
