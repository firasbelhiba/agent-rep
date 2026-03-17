// ============================================================
// @agent-rep/sdk — Response Cache
// In-memory LRU cache with TTL — zero dependencies
// ============================================================

import { CacheConfig } from './types';

interface CacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
  key: string;
}

export class ResponseCache {
  private entries = new Map<string, CacheEntry>();
  private config: Required<CacheConfig>;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      ttl: config?.ttl ?? 60_000,
      maxSize: config?.maxSize ?? 100,
      getOnly: config?.getOnly ?? true,
    };
  }

  /**
   * Get a cached response, or undefined if expired/missing.
   */
  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.data as T;
  }

  /**
   * Store a response in the cache.
   */
  set<T>(key: string, data: T, ttl?: number): void {
    // Evict oldest if at capacity
    if (this.entries.size >= this.config.maxSize && !this.entries.has(key)) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }

    this.entries.set(key, {
      data,
      expiresAt: Date.now() + (ttl ?? this.config.ttl),
      key,
    });
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Invalidate a specific key or pattern.
   */
  invalidate(keyOrPattern: string): number {
    let count = 0;

    if (keyOrPattern.includes('*')) {
      // Wildcard pattern — e.g., "/agents/*" invalidates all agent cache
      const regex = new RegExp('^' + keyOrPattern.replace(/\*/g, '.*') + '$');
      for (const key of this.entries.keys()) {
        if (regex.test(key)) {
          this.entries.delete(key);
          count++;
        }
      }
    } else {
      if (this.entries.delete(keyOrPattern)) count++;
    }

    return count;
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Get cache stats.
   */
  stats(): { size: number; maxSize: number; ttl: number } {
    // Clean expired entries first
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now > entry.expiresAt) this.entries.delete(key);
    }

    return {
      size: this.entries.size,
      maxSize: this.config.maxSize,
      ttl: this.config.ttl,
    };
  }

  /**
   * Whether this cache is configured to only cache GET requests.
   */
  get getOnly(): boolean {
    return this.config.getOnly;
  }
}
