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
  operatingBalanceHbar: number;
  operatingBalanceTinybar: number;
  apiKey: string | null;
  hashScanUrl: string | null;
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
      setAgents(data.agents || []);
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
    </>
  );
}
