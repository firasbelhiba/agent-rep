// ============================================================
// @agent-rep/sdk — Event Emitter
// Lightweight event system for the SDK — zero dependencies
// ============================================================

import { AgentRepEvent, EventHandler } from './types';

export class EventEmitter {
  private listeners = new Map<AgentRepEvent, Set<EventHandler>>();

  /**
   * Subscribe to an event.
   *
   * @example
   * ```ts
   * client.on('feedback:given', (data) => {
   *   console.log(`Feedback submitted! New score: ${data.reputation.overallScore}`);
   * });
   * ```
   */
  on<T = unknown>(event: AgentRepEvent, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as EventHandler);

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Subscribe to an event, but only fire once.
   */
  once<T = unknown>(event: AgentRepEvent, handler: EventHandler<T>): () => void {
    const wrapper: EventHandler<T> = (data) => {
      this.off(event, wrapper);
      handler(data);
    };
    return this.on(event, wrapper);
  }

  /**
   * Unsubscribe from an event.
   */
  off<T = unknown>(event: AgentRepEvent, handler: EventHandler<T>): void {
    this.listeners.get(event)?.delete(handler as EventHandler);
  }

  /**
   * Remove all listeners for an event, or all events.
   */
  removeAllListeners(event?: AgentRepEvent): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Emit an event to all listeners.
   */
  protected emit<T = unknown>(event: AgentRepEvent, data: T): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch {
          // Don't let listener errors crash the SDK
        }
      }
    }
  }

  /**
   * Get the number of listeners for an event.
   */
  listenerCount(event: AgentRepEvent): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
