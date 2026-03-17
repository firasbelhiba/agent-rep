// ============================================================
// @agent-rep/sdk — Reputation Watcher
// Poll for reputation changes and emit events
// ============================================================

import { AggregatedReputation, WatchOptions, ReputationChange } from './types';

type FetchRepFn = (agentId: string) => Promise<AggregatedReputation>;
type EmitFn = (event: string, data: ReputationChange) => void;

const DEFAULT_INTERVAL = 30_000; // 30 seconds

export class ReputationWatcher {
  private watchers = new Map<string, NodeJS.Timeout>();
  private snapshots = new Map<string, AggregatedReputation>();
  private fetchRep: FetchRepFn;
  private emitChange: EmitFn;

  constructor(fetchRep: FetchRepFn, emitChange: EmitFn) {
    this.fetchRep = fetchRep;
    this.emitChange = emitChange;
  }

  /**
   * Start watching an agent's reputation for changes.
   * Emits 'reputation:changed' when score or tier changes.
   *
   * @example
   * ```ts
   * client.on('reputation:changed', (change) => {
   *   console.log(`${change.agentId}: ${change.scoreDelta > 0 ? '+' : ''}${change.scoreDelta}`);
   *   if (change.tierChanged) {
   *     console.log(`Tier changed: ${change.previous.trustTier} → ${change.current.trustTier}`);
   *   }
   * });
   *
   * client.watch('0.0.123', { interval: 15000 });
   * ```
   */
  async watch(agentId: string, options?: Partial<WatchOptions>): Promise<void> {
    // Stop existing watcher if any
    this.unwatch(agentId);

    const interval = options?.interval ?? DEFAULT_INTERVAL;

    // Take initial snapshot
    try {
      const initial = await this.fetchRep(agentId);
      this.snapshots.set(agentId, initial);
    } catch {
      // If initial fetch fails, still set up the watcher
    }

    // Set up polling
    const timer = setInterval(async () => {
      try {
        const current = await this.fetchRep(agentId);
        const previous = this.snapshots.get(agentId);

        if (previous) {
          const scoreDelta = current.overallScore - previous.overallScore;
          const tierChanged = current.trustTier !== previous.trustTier;

          if (scoreDelta !== 0 || tierChanged) {
            this.emitChange('reputation:changed', {
              agentId,
              previous,
              current,
              scoreDelta,
              tierChanged,
              timestamp: Date.now(),
            });
          }
        }

        this.snapshots.set(agentId, current);
      } catch {
        // Silently ignore poll errors — will retry next interval
      }
    }, interval);

    this.watchers.set(agentId, timer);

    // Auto-stop after timeout
    if (options?.timeout) {
      setTimeout(() => this.unwatch(agentId), options.timeout);
    }
  }

  /**
   * Stop watching an agent.
   */
  unwatch(agentId: string): void {
    const timer = this.watchers.get(agentId);
    if (timer) {
      clearInterval(timer);
      this.watchers.delete(agentId);
      this.snapshots.delete(agentId);
    }
  }

  /**
   * Stop all watchers.
   */
  unwatchAll(): void {
    for (const [agentId] of this.watchers) {
      this.unwatch(agentId);
    }
  }

  /**
   * Check if an agent is being watched.
   */
  isWatching(agentId: string): boolean {
    return this.watchers.has(agentId);
  }

  /**
   * Get the last known reputation snapshot.
   */
  getSnapshot(agentId: string): AggregatedReputation | undefined {
    return this.snapshots.get(agentId);
  }

  /**
   * Get all currently watched agent IDs.
   */
  getWatchedAgents(): string[] {
    return Array.from(this.watchers.keys());
  }
}
