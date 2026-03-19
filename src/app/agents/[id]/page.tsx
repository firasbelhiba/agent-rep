"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { AgentProfile, AggregatedReputation, Feedback, ValidationResponse } from "@/types";
import { TierBadge } from "@/components/ui/TierBadge";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Navbar } from "@/components/ui/Navbar";

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

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [reputation, setReputation] = useState<AggregatedReputation | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [validationResponses, setValidationResponses] = useState<ValidationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"feedback" | "validations">("feedback");
  const [copied, setCopied] = useState(false);
  const [hcsTopics, setHcsTopics] = useState<{ identity?: string; feedback?: string; validation?: string }>({});
  const [stake, setStake] = useState<{
    balance: number;
    balanceHbar: number;
    totalDeposited: number;
    totalSlashed: number;
    slashCount: number;
    meetsMinimum: boolean;
    lastDepositAt?: number;
    lastSlashAt?: number;
    arbiterEligible?: boolean;
    arbiterStake?: number;
    totalResolutions?: number;
    majorityRate?: number;
    arbitrationsResolved?: number;
  } | null>(null);
  const [disputes, setDisputes] = useState<any[]>([]);

  // Community feedback form
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewValue, setReviewValue] = useState(70);
  const [reviewTag, setReviewTag] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  // Dispute modal state
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeFeedbackId, setDisputeFeedbackId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [disputeSuccess, setDisputeSuccess] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  // Community auth state
  const [communityUser, setCommunityUser] = useState<{
    walletAddress: string;
    displayName: string;
  } | null>(null);

  // Check if community user is logged in
  useEffect(() => {
    const token = localStorage.getItem("communityToken");
    const userStr = localStorage.getItem("communityUser");
    if (token && userStr) {
      try {
        setCommunityUser(JSON.parse(userStr));
      } catch {
        // invalid stored data
      }
    }
  }, []);

  // Check if current user owns this agent
  useEffect(() => {
    if (agent) {
      const walletAddress = localStorage.getItem("walletAddress");
      if (walletAddress && agent.createdByWallet === walletAddress) {
        setIsOwner(true);
      }
    }
  }, [agent]);

  const handleDispute = async () => {
    if (!disputeFeedbackId || !disputeReason.trim()) return;
    setDisputeSubmitting(true);
    setDisputeError(null);
    setDisputeSuccess(null);

    try {
      const res = await fetch(`${API_URL}/api/staking/dispute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Key": agent?.apiKey || "",
        },
        body: JSON.stringify({
          feedbackId: disputeFeedbackId,
          reason: disputeReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to file dispute");

      const bondHbar = (data.dispute?.bondAmount || 0) / 100_000_000;
      setDisputeSuccess(`Dispute filed! Bond: ${bondHbar} HBAR. Status: ${data.dispute?.status || 'pending'}`);
      setShowDisputeModal(false);
      setDisputeReason("");
      setDisputeFeedbackId(null);
    } catch (err: any) {
      setDisputeError(err.message);
    } finally {
      setDisputeSubmitting(false);
    }
  };

  const handleCommunityReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTag) return;

    const token = localStorage.getItem("communityToken");
    if (!token || !communityUser) {
      setReviewError("Please log in first to submit a review.");
      return;
    }

    setReviewSubmitting(true);
    setReviewError(null);
    try {
      const res = await fetch(`${API_URL}/api/feedback/community`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          agentId: id,
          value: reviewValue,
          tag1: reviewTag,
          comment: reviewComment.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to submit review");

      setReviewSuccess(true);
      setReviewValue(70);
      setReviewTag("");
      setReviewComment("");
      // Refresh data to show the new feedback
      setTimeout(() => {
        fetchData();
        setReviewSuccess(false);
        setShowReviewForm(false);
      }, 2000);
    } catch (err: unknown) {
      setReviewError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, setupRes, stakeRes, disputesRes] = await Promise.all([
        fetch(`${API_URL}/api/agents/${id}`),
        fetch(`${API_URL}/api/setup/status`).catch(() => null),
        fetch(`${API_URL}/api/staking/${id}`).catch(() => null),
        fetch(`${API_URL}/api/staking/disputes/${id}`).catch(() => null),
      ]);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Agent not found");
        throw new Error("Failed to load agent");
      }
      const data = await res.json();
      setAgent(data.agent);
      setReputation(data.reputation);
      setFeedback(data.feedback || []);
      setValidationResponses(data.validations?.responses || []);

      if (setupRes?.ok) {
        const setupData = await setupRes.json();
        setHcsTopics(setupData.topics || {});
      }

      if (stakeRes?.ok) {
        setStake(await stakeRes.json());
      }

      if (disputesRes?.ok) {
        const disputeData = await disputesRes.json();
        setDisputes(disputeData.disputes || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#8259ef] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !agent || !reputation) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || "Agent not found"}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={fetchData} className="px-4 py-2 bg-white/[0.03] border border-white/10 rounded-full text-sm hover:bg-white/[0.06]">
              Retry
            </button>
            <Link href="/agents" className="px-4 py-2 bg-white/[0.03] border border-white/10 rounded-full text-sm hover:bg-white/[0.06]">
              Back to Agents
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Score breakdown
  const normalizedFb = (reputation.averageFeedbackValue + 100) / 200;
  const fbConfidence = Math.min(1, reputation.feedbackCount / 5);
  const qualityScore = Math.round(normalizedFb * 300 * fbConfidence);
  const valConfidence = Math.min(1, reputation.validationCount / 3);
  const reliabilityScore = Math.round((reputation.averageValidationScore / 100) * 300 * valConfidence);
  const totalActivity = reputation.feedbackCount + reputation.validationCount;
  const activityScore = Math.round(Math.min(200, Math.log(1 + totalActivity) * 60));
  const consistencyScore = Math.max(0, reputation.overallScore - qualityScore - reliabilityScore - activityScore);

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="max-w-[1140px] mx-auto px-6 lg:px-[50px] py-8 pt-[120px]">
        {/* Breadcrumb */}
        <div className="text-[14px] text-[#9b9b9d] mb-6">
          <Link href="/agents" className="hover:text-gray-300">Agents</Link> / <span className="text-white">{agent.name}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ======== LEFT COLUMN (2/3) ======== */}
          <div className="lg:col-span-2 space-y-6">
            {/* Agent Header */}
            <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-6">
              <div className="flex items-start gap-6">
                <ScoreRing score={reputation.overallScore} tier={reputation.trustTier} size={110} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-2xl font-light truncate">{agent.name}</h1>
                    <TierBadge tier={reputation.trustTier} />
                  </div>
                  <p className="text-[15px] text-[#9b9b9d] mb-3">{agent.description || "No description provided."}</p>
                  <div className="flex flex-wrap gap-4 text-[14px] text-[#9b9b9d]">
                    <div><span className="text-white font-medium">{reputation.feedbackCount}</span> feedback</div>
                    <div><span className="text-white font-medium">{reputation.validationCount}</span> validations</div>
                    {reputation.lastActivity > 0 && (
                      <div>Last active <span className="text-white">{timeAgo(reputation.lastActivity)}</span></div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Score Breakdown */}
            <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-6">
              <h3 className="text-lg font-light mb-4">Score Breakdown</h3>
              <div className="space-y-4">
                <ScoreBar label="Quality (feedback)" value={qualityScore} max={300} color="bg-[#8259ef]" />
                <ScoreBar label="Reliability (validation)" value={reliabilityScore} max={300} color="bg-blue-500" />
                <ScoreBar label="Activity" value={activityScore} max={200} color="bg-[#b47aff]" />
                <ScoreBar label="Consistency" value={consistencyScore} max={200} color="bg-amber-500" />
              </div>
            </div>

            {/* Tabs: Feedback & Validations (read-only) */}
            <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] overflow-hidden">
              <div className="flex border-b border-white/[0.06]">
                <button
                  onClick={() => setActiveTab("feedback")}
                  className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                    activeTab === "feedback"
                      ? "text-[#b47aff] border-b-2 border-[#8259ef] bg-[#8259ef]/5"
                      : "text-[#9b9b9d] hover:text-gray-300"
                  }`}
                >
                  Feedback ({feedback.length})
                </button>
                <button
                  onClick={() => setActiveTab("validations")}
                  className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                    activeTab === "validations"
                      ? "text-blue-400 border-b-2 border-blue-400 bg-blue-400/5"
                      : "text-[#9b9b9d] hover:text-gray-300"
                  }`}
                >
                  Validations ({validationResponses.length})
                </button>
              </div>

              <div className="p-6">
                {activeTab === "feedback" ? (
                  feedback.length === 0 ? (
                    <p className="text-center text-[#9b9b9d] py-8">
                      No feedback yet. Other agents submit feedback via the API after interactions.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {feedback.map((fb) => (
                        <div key={fb.feedbackId} className="flex items-center gap-4 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                          <div className={`text-lg font-bold w-16 text-center ${fb.value >= 0 ? "text-[#b47aff]" : "text-red-400"}`}>
                            {fb.value > 0 ? "+" : ""}{fb.value}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-sm flex-wrap">
                              {fb.feedbackType === "community" ? (
                                <span className="text-[#9b9b9d]">
                                  <span className="px-1.5 py-0.5 bg-orange-950 text-orange-400 text-xs rounded border border-orange-800 mr-1.5">Community</span>
                                  {fb.fromAgentId}
                                </span>
                              ) : (
                                <span className="text-[#9b9b9d]">
                                  <span className="px-1.5 py-0.5 bg-[#8259ef]/10 text-[#b47aff] text-xs rounded border border-[#8259ef]/20 mr-1.5">Agent</span>
                                  <span className="font-mono">{fb.fromAgentId}</span>
                                </span>
                              )}
                              {fb.tag1 && <span className="px-2 py-0.5 bg-[#8259ef]/10 text-[#b47aff] border border-[#8259ef]/20 text-xs rounded-md">{fb.tag1}</span>}
                              {fb.tag2 && fb.tag2 !== "general" && <span className="px-2 py-0.5 bg-[#8259ef]/10 text-[#b47aff] border border-[#8259ef]/20 text-xs rounded-md">{fb.tag2}</span>}
                            </div>
                            {/* Show comment for community feedback */}
                            {fb.feedbackType === "community" && fb.feedbackURI && (
                              <p className="text-sm text-[#9b9b9d] mt-1 italic">&ldquo;{fb.feedbackURI}&rdquo;</p>
                            )}
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                              <span>{timeAgo(fb.timestamp)}</span>
                              {fb.hcsSequenceNumber && hcsTopics.feedback && (
                                <a href={`https://hashscan.io/testnet/topic/${hcsTopics.feedback}`} target="_blank" rel="noopener noreferrer" className="text-[#8259ef] hover:text-[#b47aff] flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                  HCS Proof
                                </a>
                              )}
                              {/* Validation status badge */}
                              <span className={`px-1.5 py-0.5 text-xs rounded border ${
                                fb.validationStatus === 'validated' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' :
                                fb.validationStatus === 'pending_validation' ? 'bg-yellow-950 text-yellow-400 border-yellow-800' :
                                fb.validationStatus === 'no_validators' ? 'bg-orange-950 text-orange-400 border-orange-800' :
                                'bg-white/[0.03] text-[#9b9b9d] border-white/10'
                              }`}>
                                {fb.validationStatus === 'validated' ? 'Validated' :
                                 fb.validationStatus === 'pending_validation' ? 'Pending Validation' :
                                 fb.validationStatus === 'no_validators' ? 'No Validators' :
                                 'Unvalidated'}
                              </span>
                              {/* Request Validation button — shown for unvalidated/no_validators feedback */}
                              {(fb.validationStatus === 'unvalidated' || fb.validationStatus === 'no_validators' || !fb.validationStatus) && (
                                <button
                                  onClick={async () => {
                                    try {
                                      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/feedback/${fb.feedbackId}/request-validation`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'X-Agent-Key': agent?.apiKey || '' },
                                      });
                                      const data = await res.json();
                                      if (data.status === 'validators_assigned') {
                                        alert(`${data.validators.length} validator(s) assigned! They have 24h to respond.`);
                                      } else if (data.status === 'no_validators') {
                                        alert(data.message);
                                      } else {
                                        alert(data.message || 'Validation requested.');
                                      }
                                      window.location.reload();
                                    } catch (e) {
                                      alert('Failed to request validation.');
                                    }
                                  }}
                                  className="text-[#b47aff] hover:text-white flex items-center gap-1"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  Request Validation
                                </button>
                              )}
                              {isOwner && (
                                <button
                                  onClick={() => {
                                    setDisputeFeedbackId(fb.feedbackId);
                                    setDisputeError(null);
                                    setDisputeSuccess(null);
                                    setDisputeReason("");
                                    setShowDisputeModal(true);
                                  }}
                                  className="text-red-400 hover:text-red-300 flex items-center gap-1 ml-auto"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                                  Dispute
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : validationResponses.length === 0 ? (
                  <p className="text-center text-[#9b9b9d] py-8">
                    No validations yet. Validator agents submit scores via the API.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {validationResponses.map((vr, i) => (
                      <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm">
                            <span className="text-[#9b9b9d]">Validator: </span>
                            <span className="text-gray-300 font-mono">{vr.validatorId}</span>
                          </div>
                          <span className="text-blue-400 font-bold">{vr.response}/100</span>
                        </div>
                        <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden mb-2">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${vr.response}%` }} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-600">
                          {vr.tag && <span className="px-2 py-0.5 bg-[#8259ef]/10 text-[#b47aff] border border-[#8259ef]/20 rounded-md">{vr.tag}</span>}
                          <span>{timeAgo(vr.timestamp)}</span>
                          {vr.hcsSequenceNumber && hcsTopics.validation && (
                            <a href={`https://hashscan.io/testnet/topic/${hcsTopics.validation}`} target="_blank" rel="noopener noreferrer" className="text-[#8259ef] hover:text-[#b47aff] flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                              HCS Proof
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Community Review Section */}
            <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] overflow-hidden">
              {!showReviewForm ? (
                <button
                  onClick={() => setShowReviewForm(true)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-orange-950 border border-orange-800 flex items-center justify-center">
                      <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-medium text-white block">Leave a Community Review</span>
                      <span className="text-xs text-[#9b9b9d]">
                        {communityUser
                          ? `Reviewing as ${communityUser.displayName} (${communityUser.walletAddress})`
                          : "Sign in with your Hedera wallet to rate this agent"}
                      </span>
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              ) : (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-light flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-orange-950 text-orange-400 text-xs rounded border border-orange-800">Community</span>
                      Leave a Review
                    </h3>
                    <button onClick={() => { setShowReviewForm(false); setReviewError(null); }} className="text-[#9b9b9d] hover:text-white text-sm">
                      Cancel
                    </button>
                  </div>

                  {!communityUser ? (
                    /* Not logged in -- show login prompt */
                    <div className="text-center py-6">
                      <div className="w-14 h-14 rounded-full bg-[#8259ef]/10 border border-[#8259ef]/20 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-7 h-7 text-[#b47aff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      </div>
                      <h4 className="text-white font-normal mb-1">Wallet Login Required</h4>
                      <p className="text-[#9b9b9d] text-sm mb-4">
                        Sign in with your Hedera wallet address to submit verified community reviews.
                      </p>
                      <Link
                        href="/login"
                        className="inline-block px-6 py-2.5 bg-[#8259ef] hover:bg-[#8259ef]/80 rounded-full font-medium text-sm transition-colors"
                      >
                        Sign In / Register
                      </Link>
                      <p className="text-xs text-gray-600 mt-3">
                        Your wallet address is attached to each review for transparency and sybil resistance.
                      </p>
                    </div>
                  ) : reviewSuccess ? (
                    <div className="text-center py-6">
                      <div className="w-12 h-12 bg-[#8259ef]/10 border border-[#8259ef]/20 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-[#b47aff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </div>
                      <p className="text-[#b47aff] font-medium">Review submitted!</p>
                      <p className="text-[#9b9b9d] text-xs mt-1">Logged on-chain via HCS</p>
                    </div>
                  ) : (
                    <form onSubmit={handleCommunityReview} className="space-y-4">
                      {/* Logged-in user info */}
                      <div className="flex items-center gap-3 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8259ef] to-[#b47aff] flex items-center justify-center text-xs font-bold">
                          {communityUser.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium truncate">{communityUser.displayName}</p>
                          <p className="text-xs text-[#9b9b9d] font-mono">{communityUser.walletAddress}</p>
                        </div>
                        <span className="px-2 py-0.5 bg-[#8259ef]/10 text-[#b47aff] text-xs rounded border border-[#8259ef]/20">Verified</span>
                      </div>

                      <div>
                        <label className="block text-xs text-[#9b9b9d] mb-1">Category</label>
                        <select
                          value={reviewTag}
                          onChange={(e) => setReviewTag(e.target.value)}
                          required
                          className="w-full bg-[#0a0a1a] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#8259ef]/50 [&>option]:bg-[#0a0a1a] [&>option]:text-white"
                        >
                          <option value="">Select a category...</option>
                          {(agent?.skills || []).map((skill) => (
                            <option key={skill} value={skill}>{skill}</option>
                          ))}
                          <option value="general">General</option>
                          <option value="reliability">Reliability</option>
                          <option value="speed">Speed</option>
                          <option value="accuracy">Accuracy</option>
                          <option value="usability">Usability</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs text-[#9b9b9d] mb-1">
                          Rating: <span className={`font-bold ${reviewValue >= 50 ? "text-[#b47aff]" : reviewValue >= 0 ? "text-amber-400" : "text-red-400"}`}>{reviewValue > 0 ? "+" : ""}{reviewValue}</span>
                        </label>
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          value={reviewValue}
                          onChange={(e) => setReviewValue(Number(e.target.value))}
                          className="w-full accent-[#8259ef]"
                        />
                        <div className="flex justify-between text-xs text-gray-600 mt-1">
                          <span>-100 (terrible)</span>
                          <span>0</span>
                          <span>+100 (excellent)</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-[#9b9b9d] mb-1">Comment <span className="text-gray-600">(optional)</span></label>
                        <textarea
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          placeholder="Share your experience with this agent..."
                          rows={2}
                          maxLength={500}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#8259ef]/50 resize-none"
                        />
                      </div>

                      {reviewError && (
                        <div className="bg-red-950/50 border border-red-800 rounded-xl px-3 py-2 text-sm text-red-400">
                          {reviewError}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={reviewSubmitting || !reviewTag}
                        className="w-full py-3 bg-[#8259ef] hover:bg-[#8259ef]/80 disabled:bg-white/[0.06] disabled:text-[#9b9b9d] rounded-full font-medium text-sm transition-colors"
                      >
                        {reviewSubmitting ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Submitting...
                          </span>
                        ) : (
                          "Submit Community Review"
                        )}
                      </button>

                      <p className="text-xs text-gray-600 text-center">
                        Community reviews carry 50% weight vs. authenticated agent feedback. Rate limited to 5/hour. Your wallet ({communityUser.walletAddress}) is publicly linked.
                      </p>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ======== RIGHT COLUMN (1/3) ======== */}
          <div className="space-y-6">
            {/* Agent Info Card */}
            <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-6">
              <h3 className="text-lg font-light mb-4">Agent Info</h3>
              <div className="space-y-3">
                <div>
                  <span className="text-xs text-[#9b9b9d] block mb-1">Agent ID</span>
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-[#b47aff] font-mono flex-1 truncate">{agent.agentId}</code>
                    <button onClick={() => copyToClipboard(agent.agentId)} className="text-xs text-[#9b9b9d] hover:text-white px-2 py-1 bg-white/[0.03] border border-white/10 rounded-lg transition-colors">
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {agent.skills.length > 0 && (
                  <div>
                    <span className="text-xs text-[#9b9b9d] block mb-1">Skills</span>
                    <div className="flex flex-wrap gap-1.5">
                      {agent.skills.map((skill) => (
                        <span key={skill} className="px-2 py-0.5 bg-[#8259ef]/10 text-[#b47aff] border border-[#8259ef]/20 text-xs rounded-md">{skill}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <span className="text-xs text-[#9b9b9d] block mb-1">Registered</span>
                  <span className="text-sm text-gray-300">{new Date(agent.createdAt).toLocaleDateString()}</span>
                </div>

                {agent.model && (
                  <div>
                    <span className="text-xs text-[#9b9b9d] block mb-1">AI Model</span>
                    <span className="text-sm text-gray-300">{agent.model}</span>
                  </div>
                )}

                {agent.agentType && (
                  <div>
                    <span className="text-xs text-[#9b9b9d] block mb-1">Agent Type</span>
                    <span className="text-sm text-gray-300 capitalize">{agent.agentType}</span>
                  </div>
                )}

                {agent.capabilities && agent.capabilities.length > 0 && (
                  <div>
                    <span className="text-xs text-[#9b9b9d] block mb-1">HCS-10 Capabilities</span>
                    <div className="flex flex-wrap gap-1.5">
                      {agent.capabilities.map((cap: number) => (
                        <span key={cap} className="px-2 py-0.5 bg-[#8259ef]/10 text-[#b47aff] text-xs rounded-md border border-[#8259ef]/20">
                          {capabilityLabel(cap)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {agent.inboundTopicId && (
                  <div>
                    <span className="text-xs text-[#9b9b9d] block mb-1">Inbound Topic (HCS-10)</span>
                    <a href={`https://hashscan.io/testnet/topic/${agent.inboundTopicId}`} target="_blank" rel="noopener noreferrer" className="text-sm text-[#b47aff] hover:text-[#8259ef] font-mono">
                      {agent.inboundTopicId}
                    </a>
                  </div>
                )}

                {agent.outboundTopicId && (
                  <div>
                    <span className="text-xs text-[#9b9b9d] block mb-1">Outbound Topic (HCS-10)</span>
                    <a href={`https://hashscan.io/testnet/topic/${agent.outboundTopicId}`} target="_blank" rel="noopener noreferrer" className="text-sm text-[#b47aff] hover:text-[#8259ef] font-mono">
                      {agent.outboundTopicId}
                    </a>
                  </div>
                )}

                {agent.profileTopicId && (
                  <div>
                    <span className="text-xs text-[#9b9b9d] block mb-1">Profile Topic (HCS-11)</span>
                    <a href={`https://hashscan.io/testnet/topic/${agent.profileTopicId}`} target="_blank" rel="noopener noreferrer" className="text-sm text-[#b47aff] hover:text-[#8259ef] font-mono">
                      {agent.profileTopicId}
                    </a>
                  </div>
                )}

                {agent.hcs10Registered && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="w-2 h-2 bg-[#8259ef] rounded-full" />
                    <span className="text-xs text-[#b47aff] font-medium">HCS-10 Registered</span>
                  </div>
                )}
              </div>
            </div>

            {/* Staking & Accountability */}
            {stake && (
              <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-6">
                <h3 className="text-lg font-light mb-4 flex items-center gap-2">
                  Stake
                  {stake.meetsMinimum ? (
                    <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 text-xs rounded border border-emerald-800">Active</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-red-950 text-red-400 text-xs rounded border border-red-800">Insufficient</span>
                  )}
                </h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-xs text-[#9b9b9d] block mb-1">Staked Balance</span>
                    <span className="text-2xl font-light text-white">{stake.balanceHbar} <span className="text-sm text-[#9b9b9d]">HBAR</span></span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                      <span className="text-xs text-[#9b9b9d] block">Total Deposited</span>
                      <span className="text-sm text-white font-medium">{(Number(stake.totalDeposited) / 100_000_000).toFixed(1)} HBAR</span>
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                      <span className="text-xs text-[#9b9b9d] block">Total Slashed</span>
                      <span className={`text-sm font-medium ${Number(stake.totalSlashed) > 0 ? 'text-red-400' : 'text-white'}`}>
                        {(Number(stake.totalSlashed) / 100_000_000).toFixed(1)} HBAR
                      </span>
                    </div>
                  </div>

                  {stake.slashCount > 0 && (
                    <div className="flex items-center gap-2 bg-red-950/30 border border-red-800/30 rounded-lg px-3 py-2">
                      <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <span className="text-xs text-red-400">{stake.slashCount} dispute{stake.slashCount !== 1 ? 's' : ''} upheld against this agent</span>
                    </div>
                  )}

                  {stake.lastDepositAt && (
                    <div className="text-xs text-gray-600">
                      Last deposit: {timeAgo(stake.lastDepositAt)}
                    </div>
                  )}
                </div>

                {/* Disputes */}
                {disputes.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/[0.06]">
                    <h4 className="text-sm font-medium text-[#9b9b9d] mb-2">Disputes ({disputes.length})</h4>
                    <div className="space-y-2">
                      {disputes.slice(0, 3).map((d: any) => (
                        <div key={d.id} className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded border ${
                              d.status === 'upheld' ? 'bg-red-950 text-red-400 border-red-800' :
                              d.status === 'dismissed' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' :
                              'bg-amber-950 text-amber-400 border-amber-800'
                            }`}>{d.status}</span>
                            {d.slashAmount > 0 && (
                              <span className="text-xs text-red-400">-{(d.slashAmount / 100_000_000).toFixed(1)} HBAR</span>
                            )}
                          </div>
                          <p className="text-xs text-[#9b9b9d] truncate">{d.reason}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
                            <span>{timeAgo(d.createdAt)}</span>
                            {d.hcsSequenceNumber && hcsTopics.feedback && (
                              <a href={`https://hashscan.io/testnet/topic/${hcsTopics.feedback}/message/${d.hcsSequenceNumber}`} target="_blank" rel="noopener noreferrer" className="text-[#8259ef] hover:text-[#b47aff] flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                HCS Proof
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Arbiter Status */}
            {stake && (
              <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-6">
                <h3 className="text-lg font-light mb-4 flex items-center gap-2">
                  Arbiter Status
                  {stake.arbiterEligible ? (
                    <span className="px-2 py-0.5 bg-[#8259ef]/20 text-[#b47aff] text-xs rounded border border-[#8259ef]/40">Eligible</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-white/[0.03] text-[#9b9b9d] text-xs rounded border border-white/[0.06]">Not Eligible</span>
                  )}
                </h3>

                {stake.arbiterEligible ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-center">
                        <span className="text-xs text-[#9b9b9d] block">Arbiter Stake</span>
                        <span className="text-sm text-[#b47aff] font-medium">{(Number(stake.arbiterStake || 0) / 100_000_000).toFixed(1)} HBAR</span>
                      </div>
                      <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-center">
                        <span className="text-xs text-[#9b9b9d] block">Resolved</span>
                        <span className="text-sm text-white font-medium">{stake.arbitrationsResolved || 0}</span>
                      </div>
                      <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-center">
                        <span className="text-xs text-[#9b9b9d] block">Majority Rate</span>
                        <span className={`text-sm font-medium ${(stake.majorityRate || 0) >= 60 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {(stake.majorityRate || 0).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-[#9b9b9d]">
                      Arbiters resolve disputes between agents. Requirements:
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${Number(stake.balance) + Number(stake.arbiterStake || 0) >= 1_000_000_000 ? 'bg-emerald-950 text-emerald-400' : 'bg-white/[0.03] text-[#9b9b9d]'}`}>
                          {Number(stake.balance) + Number(stake.arbiterStake || 0) >= 1_000_000_000 ? '✓' : '○'}
                        </span>
                        <span className="text-[#9b9b9d]">Minimum 10 HBAR total stake</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${(reputation?.overallScore || 0) >= 500 ? 'bg-emerald-950 text-emerald-400' : 'bg-white/[0.03] text-[#9b9b9d]'}`}>
                          {(reputation?.overallScore || 0) >= 500 ? '✓' : '○'}
                        </span>
                        <span className="text-[#9b9b9d]">Trusted tier (score &ge; 500)</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-xs bg-white/[0.03] text-[#9b9b9d]">○</span>
                        <span className="text-[#9b9b9d]">Minimum 10 interactions</span>
                      </div>
                    </div>

                    {/* Become Arbiter Action — only visible to agent owner */}
                    {communityUser && agent?.createdByWallet && communityUser.walletAddress.toLowerCase() === agent.createdByWallet.toLowerCase() && (
                    <div className="pt-2 border-t border-white/[0.06]">
                      <p className="text-xs text-[#9b9b9d] mb-3">
                        You own this agent. Stake additional HBAR to become an arbiter.
                      </p>
                      <div className="space-y-2">
                        <input
                          type="number"
                          placeholder="Stake amount (min 10 HBAR)"
                          defaultValue={10}
                          min={10}
                          id={`arbiter-stake-amount-${agent?.agentId}`}
                          className="w-full bg-[#0a0a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-[#9b9b9d] focus:outline-none focus:border-[#8259ef]/50"
                        />
                        <button
                          onClick={async () => {
                            const amountEl = document.getElementById(`arbiter-stake-amount-${agent?.agentId}`) as HTMLInputElement;
                            const amount = Number(amountEl?.value || 10);
                            if (amount < 10) { alert('Minimum arbiter stake is 10 HBAR'); return; }
                            const apiKey = agent?.apiKey;
                            if (!apiKey) { alert('Could not retrieve agent API key'); return; }
                            try {
                              const res = await fetch(`${API_URL}/api/staking/arbiter/stake`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                                body: JSON.stringify({ amount }),
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.message || 'Failed to stake as arbiter');
                              alert(`Arbiter stake deposited! Eligible: ${data.arbiterEligible}`);
                              window.location.reload();
                            } catch (err: unknown) {
                              alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
                            }
                          }}
                          className="w-full px-4 py-2.5 bg-[#8259ef] hover:bg-[#7048d6] text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          Become Arbiter
                        </button>
                      </div>
                    </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* How Reputation Works */}
            <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-6">
              <h3 className="text-lg font-light mb-3">How Reputation Works</h3>
              <div className="space-y-3 text-[14px] text-[#9b9b9d]">
                <p className="font-normal text-gray-300 mb-1">Two feedback tracks:</p>
                <div className="flex gap-3">
                  <span className="px-1.5 py-0.5 bg-[#8259ef]/10 text-[#b47aff] text-xs rounded border border-[#8259ef]/20 shrink-0">Agent</span>
                  <p>Authenticated agents rate each other via API after HCS-10 interactions (full weight)</p>
                </div>
                <div className="flex gap-3">
                  <span className="px-1.5 py-0.5 bg-orange-950 text-orange-400 text-xs rounded border border-orange-800 shrink-0">Community</span>
                  <p>Human users leave reviews via the dashboard (50% weight, rate-limited)</p>
                </div>
                <hr className="border-white/[0.06]" />
                <p className="text-xs text-[#9b9b9d]">All feedback is logged on-chain via HCS for immutable proof. Score (0-1000) computed from quality, reliability, activity & consistency.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dispute Modal */}
      {showDisputeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowDisputeModal(false)}>
          <div className="bg-[#0f0f23] border border-white/10 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-white mb-2">Dispute Feedback</h3>
            <p className="text-sm text-[#9b9b9d] mb-4">
              File a dispute against this feedback. A variable bond will be charged based on validation status.
            </p>

            <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 mb-4">
              <p className="text-xs label-caps text-[#9b9b9d] mb-2">Bond Structure</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-[#9b9b9d]">Unvalidated feedback</span><span className="text-white">2 HBAR</span></div>
                <div className="flex justify-between"><span className="text-[#9b9b9d]">Validated & confirmed</span><span className="text-amber-400">4 HBAR</span></div>
                <div className="flex justify-between"><span className="text-[#9b9b9d]">Flagged as outlier</span><span className="text-emerald-400">Free</span></div>
              </div>
            </div>

            <label className="block text-sm text-[#9b9b9d] mb-1">Reason for dispute</label>
            <textarea
              value={disputeReason}
              onChange={e => setDisputeReason(e.target.value)}
              placeholder="Explain why this feedback is unfair or fraudulent..."
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#8259ef]/50 resize-none h-24 mb-4"
            />

            {disputeError && (
              <div className="bg-red-950/50 border border-red-800 text-red-400 text-sm rounded-lg px-3 py-2 mb-4">{disputeError}</div>
            )}
            {disputeSuccess && (
              <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-400 text-sm rounded-lg px-3 py-2 mb-4">{disputeSuccess}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowDisputeModal(false)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDispute}
                disabled={disputeSubmitting || !disputeReason.trim()}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {disputeSubmitting ? "Filing..." : "File Dispute"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CAPABILITY_LABELS: Record<number, string> = {
  0: "Text Generation", 1: "Image Generation", 2: "Audio Generation",
  3: "Video Generation", 4: "Code Generation", 5: "Language Translation",
  6: "Summarization", 7: "Knowledge Retrieval", 8: "Data Integration",
  9: "Market Intelligence", 10: "Transaction Analytics", 11: "Smart Contract Audit",
  12: "Governance", 13: "Security Monitoring", 14: "Compliance Analysis",
  15: "Fraud Detection", 16: "Multi-Agent Coordination", 17: "API Integration",
  18: "Workflow Automation",
};

function capabilityLabel(value: number): string {
  return CAPABILITY_LABELS[value] || `Capability ${value}`;
}

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-[14px] mb-1">
        <span className="text-[#9b9b9d]">{label}</span>
        <span className="text-white font-medium">{value}/{max}</span>
      </div>
      <div className="w-full h-3 bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
