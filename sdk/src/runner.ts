// ============================================================
// @agent-rep/sdk — AgentRunner
// HCS-10 Message Listener & Auto-Responder
//
// Polls active connection topics for new messages and
// dispatches them to a user-defined handler. If the handler
// returns a string, it is auto-sent as a reply.
//
// Usage:
//   const runner = new AgentRunner({
//     client,
//     agentId: '0.0.8265268',
//     onMessage: async (msg) => {
//       console.log('Received:', msg.data);
//       return `Got it! You said: "${msg.data}"`;
//     },
//   });
//   await runner.start();
// ============================================================

import { AgentRepClient } from './client';
import { Connection, IncomingMessage, TopicMessage } from './types';

export interface AgentRunnerConfig {
  /** AgentRepClient instance (must have baseUrl configured) */
  client: AgentRepClient;
  /** The agent ID to listen as */
  agentId: string;
  /** Handler called for each new message. Return a string to auto-reply, or null to skip. */
  onMessage: (msg: IncomingMessage) => Promise<string | null>;
  /** Polling interval in ms (default: 5000) */
  pollInterval?: number;
  /** Called when an error occurs during polling (default: console.error) */
  onError?: (error: Error) => void;
}

export class AgentRunner {
  private client: AgentRepClient;
  private agentId: string;
  private handler: (msg: IncomingMessage) => Promise<string | null>;
  private errorHandler: (error: Error) => void;
  private pollInterval: number;
  private running = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private lastSeen = new Map<string, number>(); // topicId → last sequence number
  private connections: Connection[] = [];

  constructor(config: AgentRunnerConfig) {
    this.client = config.client;
    this.agentId = config.agentId;
    this.handler = config.onMessage;
    this.pollInterval = config.pollInterval ?? 5000;
    this.errorHandler = config.onError ?? ((e) => console.error('[AgentRunner]', e.message));
  }

  /**
   * Start listening on all active connections.
   * Fetches connections, then polls each connection topic at the configured interval.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Fetch active connections
    try {
      const allConnections = await this.client.listConnections(this.agentId);
      this.connections = allConnections.filter(
        (c) => c.status === 'active' && c.connectionTopicId,
      );
    } catch (err: any) {
      this.errorHandler(new Error(`Failed to fetch connections: ${err.message}`));
      this.running = false;
      return;
    }

    if (this.connections.length === 0) {
      this.running = false;
      return;
    }

    // Initialize lastSeen for each topic by fetching current messages
    for (const conn of this.connections) {
      try {
        const messages = await this.client.getMessages(conn.connectionTopicId);
        const maxSeq = messages.reduce((max, m) => Math.max(max, m.sequenceNumber), 0);
        this.lastSeen.set(conn.connectionTopicId, maxSeq);
      } catch {
        this.lastSeen.set(conn.connectionTopicId, 0);
      }
    }

    // Start polling each connection
    for (const conn of this.connections) {
      const otherAgentId = conn.fromAgentId === this.agentId
        ? conn.toAgentId
        : conn.fromAgentId;

      const timer = setInterval(async () => {
        if (!this.running) return;
        try {
          await this.pollTopic(conn.connectionTopicId, otherAgentId);
        } catch (err: any) {
          this.errorHandler(err);
        }
      }, this.pollInterval);

      this.timers.push(timer);
    }
  }

  /**
   * Stop listening on all connections.
   */
  stop(): void {
    this.running = false;
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
  }

  /**
   * Check if the runner is currently active.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the number of active connections being monitored.
   */
  getConnectionCount(): number {
    return this.connections.length;
  }

  /**
   * Poll a single topic for new messages and dispatch to handler.
   */
  private async pollTopic(topicId: string, fromAgentId: string): Promise<void> {
    const messages = await this.client.getMessages(topicId);
    const lastSeq = this.lastSeen.get(topicId) ?? 0;

    // Filter to only new messages (sequence > lastSeen)
    const newMessages = messages
      .filter((m) => m.sequenceNumber > lastSeq)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    for (const msg of newMessages) {
      // Update lastSeen immediately to avoid re-processing
      this.lastSeen.set(topicId, msg.sequenceNumber);

      const incoming: IncomingMessage = {
        connectionTopicId: topicId,
        fromAgentId,
        data: msg.data,
        consensusTimestamp: msg.consensusTimestamp,
        sequenceNumber: msg.sequenceNumber,
      };

      try {
        const reply = await this.handler(incoming);
        if (reply !== null && reply !== undefined) {
          await this.client.sendMessage(topicId, reply, undefined, this.agentId);
        }
      } catch (err: any) {
        this.errorHandler(new Error(`Handler error on topic ${topicId}: ${err.message}`));
      }
    }
  }
}
