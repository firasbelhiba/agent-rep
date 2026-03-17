"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { Navbar } from "@/components/ui/Navbar";

interface AgentEntry {
  agent: {
    agentId: string;
    name: string;
    description: string;
    inboundTopicId?: string;
    outboundTopicId?: string;
    hcs10Registered?: boolean;
  };
  reputation: {
    overallScore: number;
    trustTier: string;
  };
}

interface Connection {
  id: number;
  fromAgentId: string;
  toAgentId: string;
  connectionTopicId?: string;
  connectionRequestId?: number;
  status: "pending" | "active" | "closed";
  createdAt: number;
}

interface TopicMessage {
  data: unknown;
  consensusTimestamp: string;
  sequenceNumber: number;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ConnectionsPage() {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Connection request state
  const [targetAgentId, setTargetAgentId] = useState<string>("");
  const [requesting, setRequesting] = useState(false);
  const [requestResult, setRequestResult] = useState<string | null>(null);

  // Messaging state
  const [activeConnection, setActiveConnection] = useState<Connection | null>(
    null
  );
  const [messages, setMessages] = useState<TopicMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/agents`)
      .then((r) => r.json())
      .then((data) => {
        const hcs10Agents = (data.agents || []).filter(
          (a: AgentEntry) => a.agent.hcs10Registered
        );
        setAgents(hcs10Agents);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const fetchConnections = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      setConnectionsLoading(true);
      setActiveConnection(null);
      setMessages([]);
      try {
        const res = await fetch(`${API_URL}/api/connections/${agentId}`);
        const data = await res.json();
        setConnections(data.connections || []);
      } catch {
        setConnections([]);
      } finally {
        setConnectionsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedAgent) {
      fetchConnections(selectedAgent);
    }
  }, [selectedAgent, fetchConnections]);

  const handleRequestConnection = async () => {
    if (!selectedAgent || !targetAgentId) return;
    setRequesting(true);
    setRequestResult(null);
    try {
      const res = await fetch(`${API_URL}/api/connections/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAgentId: selectedAgent,
          toAgentId: targetAgentId,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.message || data.error || "Request failed");
      setRequestResult("Connection request sent successfully!");
      setTargetAgentId("");
      fetchConnections(selectedAgent);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Request failed";
      setRequestResult(`Error: ${message}`);
    } finally {
      setRequesting(false);
    }
  };

  const handleAcceptConnection = async (conn: Connection) => {
    try {
      const res = await fetch(`${API_URL}/api/connections/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: conn.toAgentId,
          requestingAccountId: conn.fromAgentId,
          connectionRequestId: conn.connectionRequestId,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.message || data.error || "Accept failed");
      fetchConnections(selectedAgent);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Accept failed";
      alert(message);
    }
  };

  const openMessages = async (conn: Connection) => {
    if (!conn.connectionTopicId) return;
    setActiveConnection(conn);
    setMessagesLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/connections/messages/${conn.connectionTopicId}`
      );
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!activeConnection?.connectionTopicId || !newMessage.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/connections/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionTopicId: activeConnection.connectionTopicId,
          message: newMessage.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed to send");
      setNewMessage("");
      // Refresh messages
      const msgRes = await fetch(
        `${API_URL}/api/connections/messages/${activeConnection.connectionTopicId}`
      );
      const data = await msgRes.json();
      setMessages(data.messages || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Send failed";
      alert(message);
    } finally {
      setSending(false);
    }
  };

  const getAgentName = (agentId: string) => {
    const entry = agents.find((a) => a.agent.agentId === agentId);
    return entry?.agent.name || agentId;
  };

  const otherAgentId = (conn: Connection) =>
    conn.fromAgentId === selectedAgent ? conn.toAgentId : conn.fromAgentId;

  const availableTargets = agents.filter(
    (a) => a.agent.agentId !== selectedAgent
  );

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="max-w-[1140px] mx-auto px-6 lg:px-[50px] py-8 pt-[120px]">
        <div className="pt-8">
          <h2 className="text-3xl font-light mb-2">Agent Connections</h2>
          <p className="text-[#9b9b9d] font-light mb-8">
            Manage HCS-10 peer-to-peer connections between AI agents on Hedera.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#8259ef] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-400">{error}</div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            No HCS-10 registered agents found.{" "}
            <Link href="/register" className="text-[#b47aff] underline">
              Register an agent
            </Link>{" "}
            first.
          </div>
        ) : (
          <>
            {/* Agent Selector */}
            <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-6 mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Select Your Agent
              </label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/10 rounded-[10px] px-4 py-3 text-white focus:outline-none focus:border-[#8259ef]/50"
              >
                <option value="">Choose an agent...</option>
                {agents.map((a) => (
                  <option key={a.agent.agentId} value={a.agent.agentId}>
                    {a.agent.name} ({a.agent.agentId})
                  </option>
                ))}
              </select>
            </div>

            {selectedAgent && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Connections List + Request */}
                <div className="space-y-6">
                  {/* Request New Connection */}
                  <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-6">
                    <h3 className="text-lg font-light mb-4">
                      Request Connection
                    </h3>
                    <div className="space-y-3">
                      <select
                        value={targetAgentId}
                        onChange={(e) => setTargetAgentId(e.target.value)}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-[10px] px-4 py-3 text-white focus:outline-none focus:border-[#8259ef]/50"
                      >
                        <option value="">Select target agent...</option>
                        {availableTargets.map((a) => (
                          <option
                            key={a.agent.agentId}
                            value={a.agent.agentId}
                          >
                            {a.agent.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleRequestConnection}
                        disabled={!targetAgentId || requesting}
                        className="w-full py-3 bg-[#8259ef] hover:bg-[#6d45d9] disabled:bg-gray-700 disabled:text-gray-500 rounded-[10px] font-medium transition-all"
                      >
                        {requesting ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Sending Request...
                          </span>
                        ) : (
                          "Send Connection Request"
                        )}
                      </button>
                      {requestResult && (
                        <p
                          className={`text-sm ${
                            requestResult.startsWith("Error")
                              ? "text-red-400"
                              : "text-[#b47aff]"
                          }`}
                        >
                          {requestResult}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Connections List */}
                  <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-6">
                    <h3 className="text-lg font-light mb-4">
                      Connections
                      {connections.length > 0 && (
                        <span className="text-sm text-gray-500 font-normal ml-2">
                          ({connections.length})
                        </span>
                      )}
                    </h3>

                    {connectionsLoading ? (
                      <div className="flex justify-center py-8">
                        <div className="w-6 h-6 border-2 border-[#8259ef] border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : connections.length === 0 ? (
                      <p className="text-gray-500 text-sm py-4">
                        No connections yet. Send a request to start
                        communicating with another agent.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {connections.map((conn) => (
                          <div
                            key={conn.id}
                            className={`border rounded-[10px] p-4 transition-all cursor-pointer ${
                              activeConnection?.id === conn.id
                                ? "border-[#8259ef] bg-[#8259ef]/10"
                                : "border-white/[0.06] bg-white/[0.02] hover:border-white/10"
                            }`}
                            onClick={() =>
                              conn.status === "active"
                                ? openMessages(conn)
                                : undefined
                            }
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-sm">
                                {getAgentName(otherAgentId(conn))}
                              </span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  conn.status === "active"
                                    ? "bg-[#8259ef]/15 text-[#b47aff] border border-[#8259ef]/30"
                                    : conn.status === "pending"
                                    ? "bg-amber-950 text-amber-400 border border-amber-800"
                                    : "bg-white/[0.03] text-[#9b9b9d] border border-white/10"
                                }`}
                              >
                                {conn.status}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">
                                {timeAgo(conn.createdAt)}
                              </span>
                              {conn.status === "pending" &&
                                conn.toAgentId === selectedAgent && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAcceptConnection(conn);
                                    }}
                                    className="text-xs px-3 py-1 bg-[#8259ef] hover:bg-[#6d45d9] rounded-full font-medium transition-colors"
                                  >
                                    Accept
                                  </button>
                                )}
                              {conn.status === "active" &&
                                conn.connectionTopicId && (
                                  <span className="text-xs text-gray-600 font-mono">
                                    {conn.connectionTopicId}
                                  </span>
                                )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Messages Panel */}
                <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-6 flex flex-col h-[600px]">
                  {activeConnection ? (
                    <>
                      <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/[0.06]">
                        <div>
                          <h3 className="text-lg font-light">
                            {getAgentName(otherAgentId(activeConnection))}
                          </h3>
                          <p className="text-xs text-gray-500 font-mono">
                            Topic: {activeConnection.connectionTopicId}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setActiveConnection(null);
                            setMessages([]);
                          }}
                          className="text-gray-500 hover:text-white transition-colors"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>

                      {/* Messages Area */}
                      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                        {messagesLoading ? (
                          <div className="flex justify-center py-8">
                            <div className="w-6 h-6 border-2 border-[#8259ef] border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : messages.length === 0 ? (
                          <div className="text-center py-8 text-gray-500 text-sm">
                            No messages yet. Start the conversation!
                          </div>
                        ) : (
                          messages.map((msg, i) => (
                            <div
                              key={i}
                              className="bg-white/[0.03] border border-white/[0.06] rounded-[10px] p-3 text-sm"
                            >
                              <div className="text-white break-words">
                                {typeof msg.data === "string"
                                  ? msg.data
                                  : JSON.stringify(msg.data, null, 2)}
                              </div>
                              <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                                <span>Seq #{msg.sequenceNumber}</span>
                                <span>
                                  {new Date(
                                    Number(
                                      msg.consensusTimestamp.split(".")[0]
                                    ) * 1000
                                  ).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Message Input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage();
                            }
                          }}
                          placeholder="Type a message..."
                          className="flex-1 bg-white/[0.03] border border-white/10 rounded-[10px] px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#8259ef]/50"
                        />
                        <button
                          onClick={handleSendMessage}
                          disabled={!newMessage.trim() || sending}
                          className="px-4 py-2.5 bg-[#8259ef] hover:bg-[#6d45d9] disabled:bg-gray-700 disabled:text-gray-500 rounded-[10px] font-medium transition-all"
                        >
                          {sending ? (
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                          ) : (
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-16 h-16 bg-white/[0.03] border border-white/[0.06] rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg
                            className="w-8 h-8 text-gray-600"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                            />
                          </svg>
                        </div>
                        <p className="text-gray-500 text-sm">
                          Select an active connection to view messages
                        </p>
                        <p className="text-gray-600 text-xs mt-1">
                          Messages are stored on Hedera Consensus Service topics
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
