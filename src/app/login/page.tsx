"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { useWalletContext } from "@/context/WalletContext";
import { Navbar } from "@/components/ui/Navbar";

type AuthMode = "wallet" | "password";
type Step = "connect" | "sign" | "display-name" | "done";

export default function LoginPage() {
  // Wallet hook
  const wallet = useWalletContext();

  // Auth state
  const [authMode, setAuthMode] = useState<AuthMode>("wallet");
  const [step, setStep] = useState<Step>("connect");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Password fallback state
  const [walletAddress, setWalletAddress] = useState("");
  const [password, setPassword] = useState("");
  const [pwMode, setPwMode] = useState<"login" | "register">("login");

  // Challenge state
  const [challenge, setChallenge] = useState<string | null>(null);
  const [nonce, setNonce] = useState<string | null>(null);

  // Logged-in user
  const [user, setUser] = useState<{
    walletAddress: string;
    displayName: string;
    feedbackCount?: number;
  } | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);

  // Check if already logged in
  useEffect(() => {
    const token = localStorage.getItem("communityToken");
    if (token) {
      fetch(`${API_URL}/api/community-auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data) => {
          setUser(data.user);
          setStep("done");
        })
        .catch(() => {
          localStorage.removeItem("communityToken");
          localStorage.removeItem("communityUser");
        });
    }
  }, []);

  // When wallet connects, auto-advance to signing step
  useEffect(() => {
    if (wallet.isConnected && wallet.accountId && step === "connect") {
      handleRequestChallenge(wallet.accountId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.isConnected, wallet.accountId]);

  // Step 1: Request challenge from backend
  const handleRequestChallenge = async (accountId: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/community-auth/challenge?walletAddress=${accountId}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to get challenge");

      setChallenge(data.challenge);
      setNonce(data.nonce);
      setStep("sign");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to get challenge");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Sign the challenge with wallet
  // Always requests a fresh challenge right before signing to avoid stale/expired challenges
  const handleSignChallenge = async () => {
    if (!wallet.accountId) return;

    setError(null);
    setLoading(true);
    try {
      // Request a fresh challenge to avoid stale nonce issues (e.g., backend restart)
      const chalRes = await fetch(
        `${API_URL}/api/community-auth/challenge?walletAddress=${wallet.accountId}`
      );
      const chalData = await chalRes.json();
      if (!chalRes.ok) throw new Error(chalData.message || "Failed to get challenge");

      const freshChallenge = chalData.challenge;
      const freshNonce = chalData.nonce;
      setChallenge(freshChallenge);
      setNonce(freshNonce);

      const result = await wallet.signMessage(freshChallenge);
      if (!result) throw new Error("Wallet signing was cancelled or failed");

      // Convert signature to hex
      const sigHex = Buffer.from(result.signature).toString("hex");

      // Try to verify with backend
      const res = await fetch(`${API_URL}/api/community-auth/verify-wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet.accountId,
          nonce: freshNonce,
          signature: sigHex,
          publicKey: result.publicKey,
          displayName: displayName.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // If new user needs display name
        if (data.message?.includes("Display name is required")) {
          setIsNewUser(true);
          setStep("display-name");
          return;
        }
        throw new Error(data.message || "Verification failed");
      }

      // Success!
      localStorage.setItem("communityToken", data.token);
      localStorage.setItem("communityUser", JSON.stringify(data.user));
      setUser(data.user);
      setIsNewUser(data.isNewUser);
      setStep("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signing failed");
    } finally {
      setLoading(false);
    }
  };

  // Step 2b: Submit display name for new users, then re-sign
  const handleSetDisplayName = async () => {
    if (!displayName.trim() || displayName.trim().length < 2) {
      setError("Display name must be at least 2 characters");
      return;
    }
    // Re-request challenge and sign again with display name
    setError(null);
    setLoading(true);
    try {
      // Get fresh challenge
      const chalRes = await fetch(
        `${API_URL}/api/community-auth/challenge?walletAddress=${wallet.accountId}`
      );
      const chalData = await chalRes.json();
      if (!chalRes.ok) throw new Error(chalData.message);

      // Sign it
      const result = await wallet.signMessage(chalData.challenge);
      if (!result) throw new Error("Signing cancelled");

      const sigHex = Buffer.from(result.signature).toString("hex");

      // Verify with display name
      const res = await fetch(`${API_URL}/api/community-auth/verify-wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet.accountId,
          nonce: chalData.nonce,
          signature: sigHex,
          publicKey: result.publicKey,
          displayName: displayName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Verification failed");

      localStorage.setItem("communityToken", data.token);
      localStorage.setItem("communityUser", JSON.stringify(data.user));
      setUser(data.user);
      setIsNewUser(true);
      setStep("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  // Password-based auth (fallback)
  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint =
        pwMode === "register"
          ? `${API_URL}/api/community-auth/register`
          : `${API_URL}/api/community-auth/login`;

      const body: Record<string, string> = { walletAddress, password };
      if (pwMode === "register") body.displayName = displayName;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Request failed");

      localStorage.setItem("communityToken", data.token);
      localStorage.setItem("communityUser", JSON.stringify(data.user));
      setUser(data.user);
      setStep("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("communityToken");
    localStorage.removeItem("communityUser");
    setUser(null);
    setStep("connect");
    setChallenge(null);
    setNonce(null);
    setDisplayName("");
    wallet.disconnect();
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="max-w-lg mx-auto px-6 py-16 pt-[120px]">
        {step === "done" && user ? (
          /* ====== LOGGED IN PROFILE ====== */
          <div className="pt-8">
            <div className="bg-[#0a0a1a] rounded-[10px] border border-white/[0.06] p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#8259ef] to-[#b47aff] flex items-center justify-center text-3xl font-light mx-auto mb-6">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <h1 className="text-2xl font-light mb-2">{user.displayName}</h1>
              <p className="text-[#9b9b9d] font-mono text-sm mb-2">{user.walletAddress}</p>
              {isNewUser && (
                <span className="inline-block px-3 py-1 bg-[#8259ef]/15 text-[#b47aff] text-xs rounded-full border border-[#8259ef]/30 mb-4">
                  Account Created
                </span>
              )}

              <div className="grid grid-cols-2 gap-4 mb-8 mt-4">
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-[10px] p-4">
                  <p className="text-2xl font-bold text-[#b47aff]">{user.feedbackCount || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">Reviews Given</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-[10px] p-4">
                  <div className="flex items-center justify-center gap-1.5">
                    <svg className="w-5 h-5 text-[#8259ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                    <p className="text-xl font-bold text-[#8259ef]">Verified</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Wallet Signed</p>
                </div>
              </div>

              <div className="bg-[#8259ef]/10 border border-[#8259ef]/20 rounded-[10px] p-4 mb-8">
                <p className="text-sm text-[#b47aff] font-light">
                  Your wallet ownership is cryptographically verified. Reviews are signed and linked to your Hedera account.
                </p>
              </div>

              <div className="flex gap-4">
                <Link href="/agents" className="flex-1 px-6 py-3 bg-[#8259ef] hover:bg-[#6d45d9] rounded-[10px] font-normal transition-colors text-center">
                  Browse Agents
                </Link>
                <button onClick={handleLogout} className="px-6 py-3 bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] rounded-[10px] font-normal transition-colors text-[#9b9b9d]">
                  Logout
                </button>
              </div>
            </div>
          </div>
        ) : authMode === "wallet" ? (
          /* ====== WALLET CONNECT FLOW ====== */
          <>
            <div className="pt-8 text-center mb-10">
              <div className="w-16 h-16 rounded-[10px] bg-gradient-to-br from-[#8259ef] to-blue-600 flex items-center justify-center text-2xl mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3" />
                </svg>
              </div>
              <h1 className="text-3xl font-light mb-2">Connect Wallet</h1>
              <p className="text-[#9b9b9d] font-light">
                Verify your Hedera wallet to leave trusted community reviews
              </p>
            </div>

            <div className="bg-[#0a0a1a] rounded-[10px] border border-white/[0.06] p-6">
              {/* Progress Steps */}
              <div className="flex items-center justify-center gap-2 mb-8">
                {["Connect", "Sign", "Done"].map((label, i) => {
                  const stepIdx = step === "connect" ? 0 : step === "sign" || step === "display-name" ? 1 : 2;
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        i <= stepIdx ? "bg-[#8259ef] text-white" : "bg-white/[0.03] text-gray-500 border border-white/10"
                      }`}>
                        {i < stepIdx ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        ) : (
                          i + 1
                        )}
                      </div>
                      <span className={`text-xs font-medium ${i <= stepIdx ? "text-white" : "text-gray-600"}`}>
                        {label}
                      </span>
                      {i < 2 && <div className={`w-8 h-0.5 ${i < stepIdx ? "bg-[#8259ef]" : "bg-white/10"}`} />}
                    </div>
                  );
                })}
              </div>

              {step === "connect" && (
                <div className="text-center">
                  <p className="text-[#9b9b9d] text-sm font-light mb-6">
                    Connect your HashPack or other Hedera wallet to get started.
                  </p>

                  {wallet.connectionState === "Connecting" ? (
                    <div className="flex items-center justify-center gap-3 py-4">
                      <span className="w-5 h-5 border-2 border-[#8259ef] border-t-transparent rounded-full animate-spin" />
                      <span className="text-[#b47aff]">Waiting for wallet...</span>
                    </div>
                  ) : (
                    <button
                      onClick={wallet.connect}
                      disabled={wallet.isLoading}
                      className="w-full py-4 bg-gradient-to-r from-[#8259ef] to-blue-600 hover:from-[#6d45d9] hover:to-blue-500 disabled:from-gray-700 disabled:to-gray-700 rounded-[10px] font-normal text-lg transition-all shadow-lg shadow-[#8259ef]/20 hover:shadow-[#8259ef]/30"
                    >
                      <span className="flex items-center justify-center gap-3">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3" />
                        </svg>
                        Connect Hedera Wallet
                      </span>
                    </button>
                  )}
                </div>
              )}

              {step === "sign" && (
                <div className="text-center">
                  <div className="bg-white/[0.03] border border-white/10 rounded-[10px] px-4 py-3 mb-4">
                    <p className="text-xs text-gray-500 mb-1">Connected Wallet</p>
                    <p className="font-mono text-[#b47aff] font-medium">{wallet.accountId}</p>
                  </div>

                  <p className="text-[#9b9b9d] text-sm font-light mb-4">
                    Sign a verification message to prove you own this wallet. This does <strong className="text-white">not</strong> cost any HBAR.
                  </p>

                  {challenge && (
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-[10px] px-3 py-2 mb-6 text-left">
                      <p className="text-xs text-gray-600 mb-1">Message to sign:</p>
                      <p className="text-xs text-[#9b9b9d] font-mono break-all">{challenge}</p>
                    </div>
                  )}

                  <button
                    onClick={handleSignChallenge}
                    disabled={loading}
                    className="w-full py-4 bg-[#8259ef] hover:bg-[#6d45d9] disabled:bg-gray-700 disabled:text-gray-500 rounded-[10px] font-normal text-lg transition-colors"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Verifying...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                        Sign &amp; Verify
                      </span>
                    )}
                  </button>
                </div>
              )}

              {step === "display-name" && (
                <div className="text-center">
                  <div className="bg-[#8259ef]/10 border border-[#8259ef]/20 rounded-[10px] p-3 mb-4">
                    <p className="text-sm text-[#b47aff] flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Wallet verified! Set up your profile.
                    </p>
                  </div>

                  <p className="text-[#9b9b9d] text-sm font-light mb-4">
                    Choose a display name for your community profile.
                  </p>

                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name or alias"
                    minLength={2}
                    maxLength={50}
                    className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-[10px] text-white placeholder-gray-500 focus:outline-none focus:border-[#8259ef]/50 focus:ring-1 focus:ring-[#8259ef]/50 mb-4"
                  />

                  <button
                    onClick={handleSetDisplayName}
                    disabled={loading || displayName.trim().length < 2}
                    className="w-full py-3.5 bg-[#8259ef] hover:bg-[#6d45d9] disabled:bg-gray-700 disabled:text-gray-500 rounded-[10px] font-normal text-lg transition-colors"
                  >
                    {loading ? "Creating account..." : "Complete Registration"}
                  </button>
                </div>
              )}

              {(error || wallet.error) && (
                <div className="mt-4 bg-red-950/50 border border-red-800/60 rounded-[10px] p-3 text-sm text-red-300">
                  {error || wallet.error}
                </div>
              )}
            </div>

            {/* Switch to password fallback */}
            <div className="mt-6 text-center">
              <button
                onClick={() => setAuthMode("password")}
                className="text-xs text-gray-600 hover:text-[#9b9b9d] transition-colors underline"
              >
                No wallet? Use password authentication instead
              </button>
            </div>

            {/* Why wallet verification info */}
            <div className="mt-6 bg-[#0a0a1a]/50 border border-white/[0.06] rounded-[10px] p-4">
              <h3 className="text-sm font-light text-gray-300 mb-2">
                How wallet verification works
              </h3>
              <ol className="text-xs text-gray-500 space-y-1.5 list-decimal list-inside">
                <li>Connect your <strong className="text-gray-400">HashPack</strong> or Hedera wallet</li>
                <li>Sign a <strong className="text-gray-400">free verification message</strong> (no HBAR cost)</li>
                <li>Backend checks your signature against <strong className="text-gray-400">Hedera Mirror Node</strong></li>
                <li>Your wallet address is <strong className="text-gray-400">cryptographically proven</strong> as yours</li>
              </ol>
            </div>
          </>
        ) : (
          /* ====== PASSWORD FALLBACK ====== */
          <>
            <div className="pt-8 text-center mb-8">
              <h1 className="text-2xl font-light mb-2">
                {pwMode === "login" ? "Password Login" : "Password Register"}
              </h1>
              <p className="text-gray-500 text-sm font-light">
                Fallback authentication (wallet verification recommended)
              </p>
            </div>

            <div className="flex bg-[#0a0a1a] rounded-[10px] p-1 mb-6 border border-white/[0.06]">
              <button
                onClick={() => { setPwMode("login"); setError(null); }}
                className={`flex-1 py-2 rounded-lg text-sm font-normal transition-colors ${pwMode === "login" ? "bg-[#8259ef] text-white" : "text-gray-500"}`}
              >
                Login
              </button>
              <button
                onClick={() => { setPwMode("register"); setError(null); }}
                className={`flex-1 py-2 rounded-lg text-sm font-normal transition-colors ${pwMode === "register" ? "bg-[#8259ef] text-white" : "text-gray-500"}`}
              >
                Register
              </button>
            </div>

            <form onSubmit={handlePasswordAuth} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Hedera Wallet Address</label>
                <input type="text" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="0.0.12345" required className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-[#8259ef]/50 font-mono" />
              </div>
              {pwMode === "register" && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Display Name</label>
                  <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" required minLength={2} maxLength={50} className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-[#8259ef]/50" />
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" required minLength={6} className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-[#8259ef]/50" />
              </div>
              {error && <div className="bg-red-950/50 border border-red-800/60 rounded-[10px] p-3 text-sm text-red-300">{error}</div>}
              <button type="submit" disabled={loading} className="w-full py-3 bg-[#8259ef] hover:bg-[#6d45d9] disabled:bg-gray-700 rounded-[10px] font-normal transition-colors">
                {loading ? "Please wait..." : pwMode === "login" ? "Sign In" : "Create Account"}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button onClick={() => { setAuthMode("wallet"); setError(null); }} className="text-xs text-[#b47aff] hover:text-[#8259ef] transition-colors underline">
                Back to wallet verification (recommended)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
