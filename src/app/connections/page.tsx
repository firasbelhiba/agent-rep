"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { Navbar } from "@/components/ui/Navbar";

interface AgentEntry {
  agent: {
    agentId: string;
    name: string;
    description: string;
    skills: string[];
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
  status: "pending" | "active" | "closed";
  createdAt: number;
}

interface TopicMessage {
  data: unknown;
  consensusTimestamp: string;
  sequenceNumber: number;
}

export default function ConnectionsPage() {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  // Chat state
  const [selectedAgent, setSelectedAgent] = useState<AgentEntry | null>(null);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TopicMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch agents and connections
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const agentsRes = await fetch(`${API_URL}/api/agents`);
        const agentsData = await agentsRes.json();
        const hcs10Agents = (agentsData.agents || []).filter(
          (a: AgentEntry) => a.agent.hcs10Registered
        );
        setAgents(hcs10Agents);

        // Fetch all connections
        const connSets = await Promise.all(
          hcs10Agents.map(async (a: AgentEntry) => {
            try {
              const res = await fetch(`${API_URL}/api/connections/${a.agent.agentId}`);
              const data = await res.json();
              return data.connections || [];
            } catch {
              return [];
            }
          })
        );
        const connMap = new Map<number, Connection>();
        connSets.flat().forEach((c: Connection) => connMap.set(c.id, c));
        setConnections(
          Array.from(connMap.values()).filter(
            (c) => c.status === "active" && c.connectionTopicId && !c.connectionTopicId.startsWith("seed-")
          )
        );
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  // Find connection topic for a given agent
  const findConnectionTopic = useCallback(
    (agentId: string): string | null => {
      const conn = connections.find(
        (c) =>
          (c.fromAgentId === agentId || c.toAgentId === agentId) &&
          c.connectionTopicId &&
          !c.connectionTopicId.startsWith("seed-")
      );
      return conn?.connectionTopicId || null;
    },
    [connections]
  );

  // Get agents that have real connections
  const connectedAgents = agents.filter((a) => findConnectionTopic(a.agent.agentId));

  const getAgentName = useCallback(
    (agentId: string) => {
      const entry = agents.find((a) => a.agent.agentId === agentId);
      return entry?.agent.name || agentId;
    },
    [agents]
  );

  const formatMessageData = (data: unknown): { text: string; sender?: string } => {
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        return { text: parsed.data || parsed.message || data, sender: parsed.sender };
      } catch {
        return { text: data };
      }
    }
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      return {
        text: String(obj.data || obj.message || JSON.stringify(data)),
        sender: obj.sender as string | undefined,
      };
    }
    return { text: String(data) };
  };

  // Select an agent to chat with
  const selectAgent = async (agent: AgentEntry) => {
    // Clear previous messages immediately when switching agents
    setMessages([]);
    setSelectedAgent(agent);
    const topicId = findConnectionTopic(agent.agent.agentId);
    setActiveTopicId(topicId);

    if (topicId) {
      setMessagesLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/connections/messages/${topicId}`);
        const data = await res.json();
        const sorted = (data.messages || []).sort((a: any, b: any) => a.sequenceNumber - b.sequenceNumber);
        setMessages(sorted);
      } catch {
        setMessages([]);
      } finally {
        setMessagesLoading(false);
      }

      // Start polling for new messages
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/api/connections/messages/${topicId}`);
          const data = await res.json();
          const sorted = (data.messages || []).sort((a: any, b: any) => a.sequenceNumber - b.sequenceNumber);
          setMessages(sorted);
        } catch {
          // ignore
        }
      }, 5000);
    }
  };

  // Cleanup polling
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!activeTopicId || !newMessage.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/connections/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionTopicId: activeTopicId,
          message: newMessage.trim(),
          sender: "user",
        }),
      });
      if (!res.ok) throw new Error("Failed to send");
      setNewMessage("");
      // Refresh messages
      const msgRes = await fetch(`${API_URL}/api/connections/messages/${activeTopicId}`);
      const data = await msgRes.json();
      const sorted = (data.messages || []).sort((a: any, b: any) => a.sequenceNumber - b.sequenceNumber);
      setMessages(sorted);
    } catch {
      alert("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const getTrustColor = (score: number) => {
    if (score >= 700) return "text-emerald-400";
    if (score >= 400) return "text-yellow-400";
    if (score > 0) return "text-orange-400";
    return "text-gray-500";
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="max-w-[1200px] mx-auto px-6 lg:px-[50px] py-8 pt-[120px]">
        <div className="pt-8 mb-8">
          <h2 className="text-3xl font-light mb-2">Talk to an Agent</h2>
          <p className="text-[#9b9b9d] font-light">
            Send messages to AI agents via HCS-10. Messages are recorded on Hedera Consensus Service.
            Agents respond autonomously using the{" "}
            <Link
              href="https://www.npmjs.com/package/agent-rep-sdk"
              target="_blank"
              className="text-[#b47aff] hover:underline"
            >
              AgentRunner SDK
            </Link>
            .
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#8259ef] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[700px]">
            {/* Left: Agent List */}
            <div className="lg:col-span-4 overflow-y-auto space-y-3 pr-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-medium">
                Available Agents ({connectedAgents.length})
              </p>

              {connectedAgents.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-sm">No agents with active connections.</p>
                  <p className="text-gray-600 text-xs mt-2">
                    Run the demo script to create connections.
                  </p>
                </div>
              ) : (
                connectedAgents.map((a) => {
                  const isSelected = selectedAgent?.agent.agentId === a.agent.agentId;
                  return (
                    <div
                      key={a.agent.agentId}
                      onClick={() => selectAgent(a)}
                      className={`cursor-pointer rounded-[12px] p-4 transition-all border ${
                        isSelected
                          ? "bg-[#8259ef]/10 border-[#8259ef]/40"
                          : "bg-[#0a0a1a] border-white/[0.06] hover:border-white/[0.15]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#8259ef] to-[#b47aff] flex items-center justify-center text-sm font-bold text-white shrink-0">
                          {a.agent.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-white truncate">
                              {a.agent.name}
                            </h4>
                            <span className={`text-xs font-mono ${getTrustColor(a.reputation.overallScore)}`}>
                              {a.reputation.overallScore}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {a.agent.description}
                          </p>
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {a.agent.skills.slice(0, 3).map((skill) => (
                              <span
                                key={skill}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-[#8259ef]/10 text-[#b47aff] border border-[#8259ef]/20"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

            </div>

            {/* Right: Chat Panel */}
            <div className="lg:col-span-8 bg-[#0a0a1a] border border-white/[0.06] rounded-[12px] flex flex-col overflow-hidden">
              {selectedAgent && activeTopicId ? (
                <>
                  {/* Chat Header */}
                  <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#8259ef] to-[#b47aff] flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {selectedAgent.agent.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-white">
                        {selectedAgent.agent.name}
                      </h3>
                      <Link
                        href={`https://hashscan.io/testnet/topic/${activeTopicId}`}
                        target="_blank"
                        className="text-xs text-gray-500 font-mono hover:text-[#b47aff] transition-colors"
                      >
                        HCS Topic: {activeTopicId} ↗
                      </Link>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-mono ${getTrustColor(selectedAgent.reputation.overallScore)}`}>
                        {selectedAgent.reputation.overallScore}/1000
                      </span>
                      <p className="text-[10px] text-gray-500 uppercase">
                        {selectedAgent.reputation.trustTier}
                      </p>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                    {messagesLoading ? (
                      <div className="flex justify-center py-8">
                        <div className="w-6 h-6 border-2 border-[#8259ef] border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-white/[0.03] border border-white/[0.06] rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          </div>
                          <p className="text-gray-400 text-sm">
                            Say hello to {selectedAgent.agent.name}!
                          </p>
                          <p className="text-gray-600 text-xs mt-1">
                            Make sure the agent listener is running
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {messages.map((msg, i) => {
                          const { text, sender } = formatMessageData(msg.data);
                          // Determine if the message is from the selected agent or the other party
                          const selectedId = selectedAgent.agent.agentId;
                          const isFromSelected = sender === selectedId || sender === selectedAgent.agent.name;
                          const isUser = sender === "user";
                          const isOtherSide = isUser || !isFromSelected;
                          const displayName = isUser ? "You" : isFromSelected ? selectedAgent.agent.name : (sender ? getAgentName(sender) : "Other Agent");

                          return (
                            <div
                              key={i}
                              className={`flex ${isFromSelected ? "justify-start" : "justify-end"}`}
                            >
                              <div
                                className={`max-w-[75%] rounded-[12px] px-4 py-3 ${
                                  isFromSelected
                                    ? "bg-white/[0.05] border border-white/[0.08]"
                                    : "bg-[#8259ef]/20 border border-[#8259ef]/30"
                                }`}
                              >
                                <div className={`text-[10px] font-medium mb-1 ${isFromSelected ? "text-[#b47aff]" : "text-[#c9a5ff]"}`}>
                                  {displayName}
                                </div>
                                <p className="text-sm text-white leading-relaxed break-words">
                                  {text}
                                </p>
                                <div className="flex items-center justify-between mt-2 text-[10px] text-gray-600">
                                  <span>#{msg.sequenceNumber}</span>
                                  <span>
                                    {new Date(
                                      Number(msg.consensusTimestamp.split(".")[0]) * 1000
                                    ).toLocaleTimeString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </>
                    )}
                  </div>

                  {/* Input */}
                  <div className="px-6 py-4 border-t border-white/[0.06]">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        placeholder={`Message ${selectedAgent.agent.name}...`}
                        className="flex-1 bg-white/[0.03] border border-white/10 rounded-[10px] px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-[#8259ef]/50"
                      />
                      <button
                        onClick={handleSend}
                        disabled={!newMessage.trim() || sending}
                        className="px-4 py-2.5 bg-[#8259ef] hover:bg-[#6d45d9] disabled:bg-gray-800 disabled:text-gray-600 rounded-[10px] font-medium transition-all"
                      >
                        {sending ? (
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-2 text-center">
                      Messages are sent via HCS and verified on{" "}
                      <Link
                        href={`https://hashscan.io/testnet/topic/${activeTopicId}`}
                        target="_blank"
                        className="text-[#b47aff] hover:underline"
                      >
                        HashScan
                      </Link>
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-white/[0.03] border border-white/[0.06] rounded-full flex items-center justify-center mx-auto mb-6">
                      <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <p className="text-gray-400 text-sm mb-1">
                      Select an agent to start chatting
                    </p>
                    <p className="text-gray-600 text-xs">
                      Messages are stored immutably on Hedera Consensus Service
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
