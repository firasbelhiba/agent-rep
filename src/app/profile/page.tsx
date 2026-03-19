"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import { Navbar } from "@/components/ui/Navbar";
import { useWallet } from "@/hooks/useWallet";

const OPERATOR_ACCOUNT_ID = process.env.NEXT_PUBLIC_OPERATOR_ACCOUNT_ID || "";

interface AgentBalance {
  agentId: string;
  name: string;
  accountId: string | null;
  balanceTinybar: number;
  balanceHbar: number;
  stakeHbar: number;
  arbiterStakeHbar?: number;
  operatingBalanceHbar: number;
  operatingBalanceTinybar: number;
  apiKey: string | null;
  hashScanUrl: string | null;
  reputationScore?: number;
  feedbackCount?: number;
  arbiterEligible?: boolean;
}

export default function ProfilePage() {
  const [agents, setAgents] = useState<AgentBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topUpAgent, setTopUpAgent] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("1");
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpResult, setTopUpResult] = useState<{
    success: boolean;
    message: string;
    hashScanUrl?: string;
  } | null>(null);
  const [arbiterAgent, setArbiterAgent] = useState<string | null>(null);
  const [arbiterAmount, setArbiterAmount] = useState("10");
  const [arbiterLoading, setArbiterLoading] = useState(false);
  const [arbiterResult, setArbiterResult] = useState<{ success: boolean; message: string; txId?: string } | null>(null);
  const [operatorBalance, setOperatorBalance] = useState<number | null>(null);
  const [userWallet, setUserWallet] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const wallet = useWallet();

  const fetchBalances = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("communityToken");
      if (!token) {
        setAgents([]);
        setError("Please log in to view your agents.");
        setLoading(false);
        return;
      }
      const res = await fetch(`${API_URL}/api/agents/balances`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch balances");
      const data = await res.json();
      const agentList = data.agents || [];

      // Fetch reputation data for each agent
      try {
        const repRes = await fetch(`${API_URL}/api/agents`);
        const repData = await repRes.json();
        const allAgents = repData.agents || repData || [];
        agentList.forEach((a: any) => {
          const match = allAgents.find((item: any) => (item.agent || item).agentId === a.agentId);
          if (match) {
            const rep = match.reputation || {};
            a.reputationScore = rep.overallScore || 0;
            a.feedbackCount = rep.feedbackCount || 0;
          }
        });
      } catch { /* ignore */ }

      setAgents(agentList);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchWalletBalance = async (walletAddress: string) => {
    try {
      const res = await fetch(
        `https://testnet.mirrornode.hedera.com/api/v1/balances?account.id=${walletAddress}`
      );
      const data = await res.json();
      const bal = data?.balances?.[0]?.balance || 0;
      setOperatorBalance(bal / 100_000_000);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const userStr = localStorage.getItem("communityUser");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserWallet(user.walletAddress || null);
        setUserName(user.displayName || null);
        if (user.walletAddress) {
          fetchWalletBalance(user.walletAddress);
        }
      } catch {}
    }
    fetchBalances();
  }, []);

  const handleTopUp = async (agentId: string) => {
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount <= 0 || amount > 50) {
      setTopUpResult({
        success: false,
        message: "Amount must be between 0.01 and 50 HBAR",
      });
      return;
    }

    if (!wallet.isConnected || !wallet.accountId) {
      setTopUpResult({
        success: false,
        message: "Please connect your wallet first",
      });
      return;
    }

    if (!OPERATOR_ACCOUNT_ID) {
      setTopUpResult({
        success: false,
        message: "Operator account not configured",
      });
      return;
    }

    setTopUpLoading(true);
    setTopUpResult(null);
    try {
      // Step 1: Send HBAR from user's wallet to operator via HashPack
      setTopUpResult({ success: false, message: "Approve the transaction in HashPack..." });
      const txResult = await wallet.sendHbar(OPERATOR_ACCOUNT_ID, amount);
      if (!txResult) throw new Error("Transaction was rejected or failed");

      // Step 2: Send payment proof to backend for verification
      setTopUpResult({ success: false, message: "Verifying payment on Hedera..." });
      const res = await fetch(`${API_URL}/api/agents/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          paymentTxId: txResult.transactionId,
          payerAccountId: wallet.accountId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Top-up verification failed");

      setTopUpResult({
        success: true,
        message: `Sent ${amount} HBAR — balance updated!`,
        hashScanUrl: data.hashScanUrl,
      });
      setTopUpAgent(null);
      // Refresh balances after a short delay for mirror node propagation
      setTimeout(() => {
        fetchBalances();
        if (userWallet) fetchWalletBalance(userWallet);
      }, 3000);
    } catch (e: any) {
      setTopUpResult({ success: false, message: e.message });
    } finally {
      setTopUpLoading(false);
    }
  };

  const totalAgentHbar = agents.reduce((sum, a) => sum + (a.operatingBalanceHbar || 0), 0);

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-[var(--nav-height)] pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-white mb-2">
              My Agents
            </h1>
            <p className="text-[#9b9b9d] text-[15px]">
              View and manage your registered agents and their balances.
            </p>
          </div>

          {/* Operator Overview Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="card-dark p-5">
              <div className="text-[12px] text-[#9b9b9d] uppercase tracking-wider mb-1">
                Your Wallet
              </div>
              <div className="text-2xl font-bold text-white">
                {operatorBalance !== null
                  ? `${operatorBalance.toFixed(2)} HBAR`
                  : userWallet ? "..." : "Not connected"}
              </div>
              <div className="text-[11px] text-[#9b9b9d] mt-1">
                {userWallet || "Connect your wallet to view balance"}
              </div>
            </div>
            <div className="card-dark p-5">
              <div className="text-[12px] text-[#9b9b9d] uppercase tracking-wider mb-1">
                Total in Agent Wallets
              </div>
              <div className="text-2xl font-bold text-[#b47aff]">
                {totalAgentHbar.toFixed(2)} HBAR
              </div>
            </div>
            <div className="card-dark p-5">
              <div className="text-[12px] text-[#9b9b9d] uppercase tracking-wider mb-1">
                My Agents
              </div>
              <div className="text-2xl font-bold text-[#00e5a0]">
                {agents.length}
              </div>
            </div>
          </div>

          {/* Top-up Result Banner */}
          {topUpResult && (
            <div
              className={`mb-6 p-4 rounded-lg border ${
                topUpResult.success
                  ? "bg-[#00e5a0]/10 border-[#00e5a0]/30 text-[#00e5a0]"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[14px]">{topUpResult.message}</span>
                <div className="flex items-center gap-3">
                  {topUpResult.hashScanUrl && (
                    <a
                      href={topUpResult.hashScanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] underline hover:opacity-80"
                    >
                      View on HashScan
                    </a>
                  )}
                  <button
                    onClick={() => setTopUpResult(null)}
                    className="text-[12px] opacity-60 hover:opacity-100"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading / Error */}
          {loading && (
            <div className="text-center py-20 text-[#9b9b9d]">
              Loading agent balances...
            </div>
          )}
          {error && (
            <div className="text-center py-20 text-red-400">{error}</div>
          )}

          {/* Agent Balances Table */}
          {!loading && !error && (
            <div className="card-dark overflow-hidden">
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-[16px] font-semibold text-white">
                  Agent Wallets
                </h2>
                <button
                  onClick={() => {
                    fetchBalances();
                    if (userWallet) fetchWalletBalance(userWallet);
                  }}
                  className="text-[12px] text-[#b47aff] hover:text-white transition-colors"
                >
                  Refresh
                </button>
              </div>

              {agents.length === 0 ? (
                <div className="p-10 text-center text-[#9b9b9d]">
                  No agents registered yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-[11px] text-[#9b9b9d] uppercase tracking-wider border-b border-white/5">
                        <th className="px-5 py-3">Agent</th>
                        <th className="px-5 py-3">Hedera Account</th>
                        <th className="px-5 py-3 text-right">Op. Balance</th>
                        <th className="px-5 py-3 text-right">Stake</th>
                        <th className="px-5 py-3">API Key</th>
                        <th className="px-5 py-3 text-center">Arbiter</th>
                        <th className="px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((agent) => (
                        <tr
                          key={agent.agentId}
                          className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-5 py-4">
                            <div className="text-[14px] font-medium text-white">
                              {agent.name}
                            </div>
                            <div className="text-[11px] text-[#9b9b9d] font-mono">
                              {agent.agentId}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            {agent.accountId ? (
                              <a
                                href={agent.hashScanUrl || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[13px] font-mono text-[#b47aff] hover:text-white transition-colors"
                              >
                                {agent.accountId}
                              </a>
                            ) : (
                              <span className="text-[13px] text-[#9b9b9d] italic">
                                No account
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span
                              className={`text-[14px] font-medium ${
                                agent.operatingBalanceHbar < 0.5
                                  ? "text-red-400"
                                  : agent.operatingBalanceHbar < 1.5
                                  ? "text-yellow-400"
                                  : "text-[#00e5a0]"
                              }`}
                            >
                              {agent.operatingBalanceHbar.toFixed(2)} HBAR
                            </span>
                            <div className="text-[10px] text-[#9b9b9d]">
                              {agent.operatingBalanceHbar <= 0 ? "Depleted" : "Active"}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className={`text-[14px] font-medium ${
                              agent.stakeHbar >= 5
                                ? "text-[#00e5a0]"
                                : agent.stakeHbar > 0
                                ? "text-yellow-400"
                                : "text-[#9b9b9d]"
                            }`}>
                              {agent.stakeHbar > 0 ? `${agent.stakeHbar.toFixed(2)} HBAR` : "--"}
                            </span>
                            {(agent.arbiterStakeHbar || 0) > 0 && (
                              <div className="text-[10px] text-[#9b9b9d]">
                                incl. {agent.arbiterStakeHbar?.toFixed(0)} arbiter
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {agent.apiKey ? (
                              <div className="flex items-center gap-1">
                                <code className="text-[11px] text-[#9b9b9d] font-mono max-w-[120px] truncate block">
                                  {agent.apiKey}
                                </code>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(agent.apiKey!);
                                  }}
                                  className="text-[10px] text-[#b47aff] hover:text-white shrink-0"
                                  title="Copy API Key"
                                >
                                  Copy
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-[#9b9b9d] italic">
                                --
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center">
                            {agent.arbiterEligible || (agent.arbiterStakeHbar || 0) >= 10 ? (
                              <span className="px-3 py-1 rounded bg-emerald-950 text-emerald-400 text-[12px] border border-emerald-800">
                                ✓ Arbiter
                              </span>
                            ) : (agent.reputationScore || 0) >= 500 && (agent.feedbackCount || 0) >= 10 ? (
                              <button
                                onClick={() => {
                                  setArbiterAgent(agent.agentId);
                                  setArbiterAmount("10");
                                  setArbiterResult(null);
                                }}
                                className="px-3 py-1 rounded border border-[#8259ef]/30 text-[#8259ef] text-[12px] hover:bg-[#8259ef]/10 transition-colors"
                              >
                                Become Arbiter
                              </button>
                            ) : (
                              <span className="px-3 py-1 rounded bg-white/[0.03] text-[#9b9b9d] text-[11px] border border-white/10 cursor-not-allowed" title={`Needs score ≥ 500 (${agent.reputationScore || 0}) and 10+ feedback (${agent.feedbackCount || 0})`}>
                                Not Eligible
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {agent.accountId ? (
                              topUpAgent === agent.agentId ? (
                                <div className="flex items-center gap-2 justify-end">
                                  <input
                                    type="number"
                                    min="0.01"
                                    max="50"
                                    step="0.1"
                                    value={topUpAmount}
                                    onChange={(e) =>
                                      setTopUpAmount(e.target.value)
                                    }
                                    className="w-20 px-2 py-1 rounded bg-white/5 border border-white/10 text-white text-[13px] text-right focus:border-[#b47aff] outline-none"
                                    placeholder="HBAR"
                                  />
                                  <button
                                    onClick={() =>
                                      handleTopUp(agent.agentId)
                                    }
                                    disabled={topUpLoading}
                                    className="px-3 py-1 rounded bg-[#b47aff] text-white text-[12px] font-medium hover:bg-[#8259ef] disabled:opacity-50 transition-colors"
                                  >
                                    {topUpLoading ? "..." : "Send"}
                                  </button>
                                  <button
                                    onClick={() => setTopUpAgent(null)}
                                    className="text-[12px] text-[#9b9b9d] hover:text-white transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setTopUpAgent(agent.agentId);
                                    setTopUpAmount("1");
                                  }}
                                  className="px-3 py-1 rounded border border-[#b47aff]/30 text-[#b47aff] text-[12px] hover:bg-[#b47aff]/10 transition-colors"
                                >
                                  Top Up
                                </button>
                              )
                            ) : (
                              <span className="text-[11px] text-[#9b9b9d]">
                                N/A
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Arbiter Stake Modal */}
      {arbiterAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#111122] border border-white/[0.08] rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-xl text-white font-medium mb-2">Become an Arbiter</h3>
            <p className="text-sm text-[#9b9b9d] mb-6">
              Stake additional HBAR to qualify as an arbiter for <span className="text-white font-medium">{agents.find(a => a.agentId === arbiterAgent)?.name}</span>. Arbiters resolve disputes and earn rewards.
            </p>

            <div className="space-y-5">
              {/* Stake Amount Input */}
              <div>
                <label className="text-xs text-[#9b9b9d] uppercase tracking-wider block mb-2">Stake Amount</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={10}
                    max={100}
                    step={1}
                    value={arbiterAmount}
                    onChange={(e) => setArbiterAmount(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white text-lg font-medium focus:border-[#8259ef] outline-none transition-colors"
                    placeholder="10"
                  />
                  <span className="text-[#9b9b9d] text-sm">HBAR</span>
                </div>
                <p className="text-xs text-[#9b9b9d] mt-2">Minimum: 10 HBAR</p>
                {Number(arbiterAmount) < 10 && Number(arbiterAmount) > 0 && (
                  <p className="text-xs text-red-400 mt-1">Below minimum — need at least 10 HBAR</p>
                )}
              </div>

              {/* Eligibility Progress */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 space-y-3">
                <p className="text-xs text-[#9b9b9d] uppercase tracking-wider mb-1">Eligibility Checklist</p>

                {/* Stake requirement */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${Number(arbiterAmount) >= 10 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-white/[0.03] text-[#9b9b9d] border border-white/[0.06]'}`}>
                        {Number(arbiterAmount) >= 10 ? '✓' : '○'}
                      </span>
                      <span className={Number(arbiterAmount) >= 10 ? 'text-emerald-400' : 'text-[#9b9b9d]'}>Arbiter Stake</span>
                    </div>
                    <span className={`text-xs ${Number(arbiterAmount) >= 10 ? 'text-emerald-400' : 'text-[#9b9b9d]'}`}>{arbiterAmount}/10 HBAR</span>
                  </div>
                  <div className="ml-7 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${Number(arbiterAmount) >= 10 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, (Number(arbiterAmount) / 10) * 100)}%` }} />
                  </div>
                </div>

                {/* Reputation requirement */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${(agents.find(a => a.agentId === arbiterAgent)?.reputationScore || 0) >= 500 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-white/[0.03] text-[#9b9b9d] border border-white/[0.06]'}`}>
                        {(agents.find(a => a.agentId === arbiterAgent)?.reputationScore || 0) >= 500 ? '✓' : '○'}
                      </span>
                      <span className={(agents.find(a => a.agentId === arbiterAgent)?.reputationScore || 0) >= 500 ? 'text-emerald-400' : 'text-[#9b9b9d]'}>Trusted Tier</span>
                    </div>
                    <span className="text-xs text-[#9b9b9d]">Score ≥ 500 ({agents.find(a => a.agentId === arbiterAgent)?.reputationScore || 0}/500)</span>
                  </div>
                  <div className="ml-7 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${(agents.find(a => a.agentId === arbiterAgent)?.reputationScore || 0) >= 500 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, ((agents.find(a => a.agentId === arbiterAgent)?.reputationScore || 0) / 500) * 100)}%` }} />
                  </div>
                </div>

                {/* Activity requirement */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${(agents.find(a => a.agentId === arbiterAgent)?.feedbackCount || 0) >= 10 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-white/[0.03] text-[#9b9b9d] border border-white/[0.06]'}`}>
                        {(agents.find(a => a.agentId === arbiterAgent)?.feedbackCount || 0) >= 10 ? '✓' : '○'}
                      </span>
                      <span className={(agents.find(a => a.agentId === arbiterAgent)?.feedbackCount || 0) >= 10 ? 'text-emerald-400' : 'text-[#9b9b9d]'}>Activity</span>
                    </div>
                    <span className="text-xs text-[#9b9b9d]">≥ 10 interactions ({agents.find(a => a.agentId === arbiterAgent)?.feedbackCount || 0}/10)</span>
                  </div>
                  <div className="ml-7 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${(agents.find(a => a.agentId === arbiterAgent)?.feedbackCount || 0) >= 10 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, ((agents.find(a => a.agentId === arbiterAgent)?.feedbackCount || 0) / 10) * 100)}%` }} />
                  </div>
                </div>
              </div>

              {arbiterResult && (
                <div className={`rounded-lg px-4 py-3 text-sm ${arbiterResult.success ? 'bg-emerald-950/50 border border-emerald-800 text-emerald-400' : 'bg-red-950/50 border border-red-800 text-red-400'}`}>
                  {arbiterResult.message}
                  {arbiterResult.success && arbiterResult.txId && (
                    <a href={`https://hashscan.io/testnet/transaction/${arbiterResult.txId}`} target="_blank" rel="noopener noreferrer" className="block mt-2 text-[#8259ef] hover:text-[#b47aff] underline text-xs">
                      View on HashScan →
                    </a>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setArbiterAgent(null); setArbiterResult(null); }}
                  className="flex-1 px-4 py-3 rounded-lg border border-white/10 text-[#9b9b9d] text-sm hover:bg-white/[0.03] transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={arbiterLoading || Number(arbiterAmount) < 10 || !wallet.isConnected}
                  onClick={async () => {
                    const agent = agents.find(a => a.agentId === arbiterAgent);
                    if (!agent?.apiKey) { setArbiterResult({ success: false, message: 'No API key found' }); return; }
                    if (!wallet.isConnected) { setArbiterResult({ success: false, message: 'Wallet not connected' }); return; }

                    // Check if already staked as arbiter
                    if (agent.arbiterEligible || (agent.arbiterStakeHbar || 0) >= 10) {
                      setArbiterResult({ success: true, message: `Already staked as arbiter (${agent.arbiterStakeHbar?.toFixed(0)} HBAR on contract). No additional stake needed.` });
                      setTimeout(() => { setArbiterAgent(null); }, 3000);
                      return;
                    }

                    const amount = Number(arbiterAmount);
                    setArbiterLoading(true);
                    try {
                      // Step 1: Call stakeAsArbiter() on smart contract directly via wallet
                      const STAKING_CONTRACT_ID = process.env.NEXT_PUBLIC_STAKING_CONTRACT_ID || '0.0.8291516';
                      const txResult = await wallet.executeContractCall(
                        STAKING_CONTRACT_ID,
                        'stakeAsArbiter',
                        amount,
                        agent.agentId
                      );
                      if (!txResult) throw new Error('Transaction rejected by wallet');

                      // Step 2: Record in backend DB (contract already called by wallet)
                      const res = await fetch(`${API_URL}/api/staking/arbiter/record`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Agent-Key': agent.apiKey },
                        body: JSON.stringify({ amount, txId: txResult.transactionId }),
                      });
                      const data = await res.json();
                      const contractTxId = txResult.transactionId;
                      setArbiterResult({ success: true, message: `✓ Arbiter stake of ${amount} HBAR deposited on smart contract! You are now an arbiter.`, txId: contractTxId });
                      setTimeout(() => { setArbiterAgent(null); fetchBalances(); }, 3000);
                    } catch (err: unknown) {
                      setArbiterResult({ success: false, message: err instanceof Error ? err.message : 'Unknown error' });
                    } finally {
                      setArbiterLoading(false);
                    }
                  }}
                  className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${Number(arbiterAmount) >= 10 ? 'bg-[#8259ef] hover:bg-[#7048d6] text-white' : 'bg-white/[0.06] text-[#9b9b9d]'}`}
                >
                  {arbiterLoading ? 'Staking...' : Number(arbiterAmount) < 10 ? 'Below Minimum' : 'Confirm Stake'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
