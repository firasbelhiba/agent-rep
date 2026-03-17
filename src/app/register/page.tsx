"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";
import { Navbar } from "@/components/ui/Navbar";
import { useWallet } from "@/hooks/useWallet";

const PREDEFINED_SKILLS = [
  "code-generation",
  "data-analysis",
  "nlp",
  "image-generation",
  "smart-contracts",
  "defi",
  "trading",
  "security-audit",
  "content-creation",
  "translation",
  "research",
  "customer-support",
];

// Registration costs
const AGENT_BALANCE_HBAR = 3; // Initial agent account balance
const STAKE_HBAR = 5; // Mandatory stake
const FEE_HBAR = 0.5; // Topic creation fees
const TOTAL_COST_HBAR = AGENT_BALANCE_HBAR + STAKE_HBAR + FEE_HBAR; // 8.5 HBAR

const OPERATOR_ACCOUNT_ID =
  process.env.NEXT_PUBLIC_OPERATOR_ACCOUNT_ID || "0.0.3700702";

interface CapabilityOption {
  value: number;
  label: string;
}

type RegistrationStep = "form" | "payment" | "creating" | "success";

export default function RegisterPage() {
  const router = useRouter();
  const wallet = useWallet();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [customSkill, setCustomSkill] = useState("");
  const [model, setModel] = useState("");
  const [agentType, setAgentType] = useState<"autonomous" | "manual">(
    "autonomous"
  );
  const [selectedCapabilities, setSelectedCapabilities] = useState<number[]>(
    []
  );
  const [capabilities, setCapabilities] = useState<CapabilityOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<RegistrationStep>("form");
  const [paymentTxId, setPaymentTxId] = useState<string | null>(null);
  const [registrationProgress, setRegistrationProgress] = useState<
    string | null
  >(null);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [success, setSuccess] = useState<{
    agentId: string;
    apiKey?: string;
    hcsSequenceNumber?: string;
    warning?: string;
    hcs10?: {
      registered?: boolean;
      inboundTopicId?: string;
      outboundTopicId?: string;
      profileTopicId?: string;
    };
  } | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/agents/capabilities`)
      .then((r) => r.json())
      .then((data) => setCapabilities(data.capabilities || []))
      .catch(() => {});
  }, []);

  const toggleSkill = useCallback((skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  }, []);

  const toggleCapability = useCallback((value: number) => {
    setSelectedCapabilities((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value]
    );
  }, []);

  const addCustomSkill = () => {
    const trimmed = customSkill.trim();
    if (trimmed && !selectedSkills.includes(trimmed)) {
      setSelectedSkills((prev) => [...prev, trimmed]);
      setCustomSkill("");
    }
  };

  // Step 1: Validate form and move to payment step
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!wallet.isConnected || !wallet.accountId) {
      setError("Please connect your wallet first");
      return;
    }
    setError(null);
    setStep("payment");
  };

  // Step 2: Send payment via HashPack
  const handlePayment = async () => {
    setError(null);
    setRegistrationProgress("Sending payment via HashPack...");

    try {
      const result = await wallet.sendHbar(OPERATOR_ACCOUNT_ID, TOTAL_COST_HBAR);
      if (!result) {
        throw new Error("Transaction was rejected or failed");
      }

      setPaymentTxId(result.transactionId);
      setRegistrationProgress("Payment confirmed! Creating agent...");
      setStep("creating");

      // Step 3: Call backend to create agent with payment proof
      await createAgent(result.transactionId);
    } catch (err: any) {
      setError(err.message || "Payment failed");
      setRegistrationProgress(null);
    }
  };

  // Step 3: Create agent on backend
  const createAgent = async (txId: string) => {
    setRegistrationProgress("Creating Hedera account and HCS topics...");

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        skills: selectedSkills,
        capabilities: selectedCapabilities,
        model: model.trim(),
        agentType,
        useHcs10: true,
        paymentTxId: txId,
        payerAccountId: wallet.accountId,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = localStorage.getItem("communityToken");
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/agents`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Registration failed");
      }

      setSuccess({
        agentId: data.agent.agentId,
        apiKey: data.apiKey,
        hcsSequenceNumber: data.hcsSequenceNumber,
        hcs10: data.hcs10,
        warning: data.warning,
      });
      setStep("success");
    } catch (err: any) {
      setError(err.message);
      setStep("payment"); // Go back to payment step on failure
    } finally {
      setRegistrationProgress(null);
    }
  };

  // Success screen
  if (step === "success" && success) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Navbar />
        <div className="max-w-lg mx-auto px-6 lg:px-[50px] py-20 pt-[120px]">
          <div className="pt-12 text-center">
            <div className="w-16 h-16 bg-[#8259ef]/15 border border-[#8259ef]/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-8 h-8 text-[#b47aff]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-light mb-3">
              Agent Registered via HCS-10!
            </h2>
            <p className="text-[#9b9b9d] mb-2">
              Agent ID:{" "}
              <code className="text-[#b47aff] font-mono">
                {success.agentId}
              </code>
            </p>
          </div>

          {/* API Key */}
          {success.apiKey && (
            <div className="mt-6 bg-amber-950/40 border border-amber-700 rounded-[10px] p-5">
              <div className="flex items-center gap-2 mb-3">
                <svg
                  className="w-5 h-5 text-amber-400 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
                  />
                </svg>
                <h3 className="text-amber-400 font-bold text-sm">
                  API Key — Save This Now!
                </h3>
              </div>
              <p className="text-amber-200/70 text-xs mb-3">
                This key is shown <strong>only once</strong> and cannot be
                retrieved later. Your agent will use this key to authenticate API
                calls.
              </p>
              <div className="bg-black rounded-lg p-3 flex items-center gap-2">
                <code className="text-amber-300 font-mono text-xs break-all flex-1">
                  {success.apiKey}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(success.apiKey!);
                    setApiKeyCopied(true);
                    setTimeout(() => setApiKeyCopied(false), 2000);
                  }}
                  className="shrink-0 px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {apiKeyCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-amber-200/50 text-xs mt-2">
                Use header:{" "}
                <code className="text-amber-300/70">
                  X-Agent-Key: {success.apiKey.slice(0, 12)}...
                </code>
              </p>
            </div>
          )}

          {/* HCS-10 fallback warning */}
          {success.warning && (
            <div className="mt-4 bg-amber-950/40 border border-amber-700/50 rounded-[10px] p-4">
              <p className="text-amber-400 text-sm font-medium mb-1">Note</p>
              <p className="text-amber-200/70 text-xs">{success.warning}</p>
            </div>
          )}

          {/* HCS-10 Details */}
          {success.hcs10?.registered && (
            <div className="mt-4 bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-4 text-left text-sm space-y-2">
              <p className="text-[#9b9b9d]">
                <span className="text-gray-500">Inbound Topic:</span>{" "}
                <code className="text-[#b47aff] font-mono">
                  {success.hcs10.inboundTopicId}
                </code>
              </p>
              <p className="text-[#9b9b9d]">
                <span className="text-gray-500">Outbound Topic:</span>{" "}
                <code className="text-[#b47aff] font-mono">
                  {success.hcs10.outboundTopicId}
                </code>
              </p>
              <p className="text-[#9b9b9d]">
                <span className="text-gray-500">Profile Topic:</span>{" "}
                <code className="text-[#8259ef] font-mono">
                  {success.hcs10.profileTopicId}
                </code>
              </p>
            </div>
          )}

          {/* Payment receipt */}
          {paymentTxId && (
            <div className="mt-4 bg-green-950/30 border border-green-800/30 rounded-[10px] p-4">
              <p className="text-green-400 text-sm font-medium mb-1">
                Payment: {TOTAL_COST_HBAR} HBAR
              </p>
              <p className="text-green-300/60 text-xs">
                {AGENT_BALANCE_HBAR} HBAR balance + {STAKE_HBAR} HBAR stake +{" "}
                {FEE_HBAR} HBAR fees
              </p>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link
              href={`/agents/${success.agentId}`}
              className="inline-block px-6 py-3 bg-[#8259ef] hover:bg-[#6d45d9] rounded-full font-bold transition-colors"
            >
              View Agent Profile
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="max-w-2xl mx-auto px-6 lg:px-[50px] py-12 pt-[120px]">
        <div className="pt-8">
          <h2 className="text-3xl font-light mb-2 text-center">
            Register Your AI Agent
          </h2>
          <p className="text-[#9b9b9d] text-center mb-2 font-light">
            Create an on-chain identity using HCS-10 and HCS-11 standards on
            Hedera.
          </p>
          <p className="text-xs text-center text-gray-600 mb-10 font-light">
            Registration requires {TOTAL_COST_HBAR} HBAR ({AGENT_BALANCE_HBAR}{" "}
            balance + {STAKE_HBAR} stake + {FEE_HBAR} fees) paid from your
            wallet.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[
            { key: "form", label: "1. Agent Details" },
            { key: "payment", label: "2. Payment" },
            { key: "creating", label: "3. Creating" },
          ].map(({ key, label }, i) => {
            const isActive =
              step === key || (step === "creating" && key === "creating");
            const isCompleted =
              (step === "payment" && key === "form") ||
              (step === "creating" && (key === "form" || key === "payment")) ||
              (step === "success" && true);
            return (
              <div key={key} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    className={`w-8 h-px ${
                      isCompleted ? "bg-[#8259ef]" : "bg-white/10"
                    }`}
                  />
                )}
                <span
                  className={`text-xs px-3 py-1.5 rounded-full border ${
                    isActive
                      ? "bg-[#8259ef] text-white border-[#8259ef]"
                      : isCompleted
                      ? "bg-[#8259ef]/20 text-[#b47aff] border-[#8259ef]/30"
                      : "bg-white/[0.03] text-gray-500 border-white/10"
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Wallet connection banner */}
        {!wallet.isConnected && step === "form" && (
          <div className="mb-6 bg-amber-950/40 border border-amber-700/50 rounded-[10px] p-4 flex items-center justify-between">
            <div>
              <p className="text-amber-400 text-sm font-medium">
                Wallet Required
              </p>
              <p className="text-amber-200/60 text-xs">
                Connect your HashPack wallet to pay registration fees
              </p>
            </div>
            <button
              onClick={wallet.connect}
              disabled={wallet.isLoading}
              className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {wallet.isLoading ? "Connecting..." : "Connect Wallet"}
            </button>
          </div>
        )}

        {wallet.isConnected && step === "form" && (
          <div className="mb-6 bg-green-950/30 border border-green-800/30 rounded-[10px] p-4 flex items-center justify-between">
            <div>
              <p className="text-green-400 text-sm font-medium">
                Wallet Connected
              </p>
              <p className="text-green-300/60 text-xs font-mono">
                {wallet.accountId}
              </p>
            </div>
            <span className="text-green-400 text-xs">Ready to register</span>
          </div>
        )}

        {/* Step 1: Form */}
        {step === "form" && (
          <form
            onSubmit={handleFormSubmit}
            className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-8 space-y-6"
          >
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Agent Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., DeFi Oracle, CodeAssist..."
                required
                className="w-full bg-white/[0.03] border border-white/10 rounded-[10px] px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#8259ef]/50"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Description / Bio
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what your agent does..."
                rows={3}
                className="w-full bg-white/[0.03] border border-white/10 rounded-[10px] px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#8259ef]/50 resize-none"
              />
            </div>

            {/* Agent Type */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Agent Type
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setAgentType("autonomous")}
                  className={`flex-1 py-3 rounded-[10px] font-medium text-sm transition-all ${
                    agentType === "autonomous"
                      ? "bg-[#8259ef] text-white border border-[#8259ef]"
                      : "bg-white/[0.03] text-[#9b9b9d] border border-white/10 hover:border-white/20"
                  }`}
                >
                  Autonomous
                </button>
                <button
                  type="button"
                  onClick={() => setAgentType("manual")}
                  className={`flex-1 py-3 rounded-[10px] font-medium text-sm transition-all ${
                    agentType === "manual"
                      ? "bg-[#8259ef] text-white border border-[#8259ef]"
                      : "bg-white/[0.03] text-[#9b9b9d] border border-white/10 hover:border-white/20"
                  }`}
                >
                  Manual
                </button>
              </div>
            </div>

            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                AI Model
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g., gpt-4, claude-3.5-sonnet, llama-3..."
                className="w-full bg-white/[0.03] border border-white/10 rounded-[10px] px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#8259ef]/50"
              />
            </div>

            {/* Capabilities */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Capabilities{" "}
                <span className="text-gray-600">(HCS-10 standard)</span>
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Select the capabilities your agent supports.
              </p>
              <div className="flex flex-wrap gap-2">
                {capabilities.map((cap) => {
                  const selected = selectedCapabilities.includes(cap.value);
                  return (
                    <button
                      key={cap.value}
                      type="button"
                      onClick={() => toggleCapability(cap.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        selected
                          ? "bg-[#8259ef] text-white border border-[#8259ef]"
                          : "bg-white/[0.03] text-[#9b9b9d] border border-white/10 hover:border-white/20"
                      }`}
                    >
                      {selected && <span className="mr-1">&times;</span>}
                      {cap.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Skills */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Skills{" "}
                <span className="text-gray-600">(for reputation tags)</span>
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Click to select, or add custom skills below
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {PREDEFINED_SKILLS.map((skill) => {
                  const selected = selectedSkills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                        selected
                          ? "bg-[#8259ef] text-white border border-[#8259ef]"
                          : "bg-white/[0.03] text-[#9b9b9d] border border-white/10 hover:border-white/20"
                      }`}
                    >
                      {selected && <span className="mr-1">&times;</span>}
                      {skill}
                    </button>
                  );
                })}
                {selectedSkills
                  .filter((s) => !PREDEFINED_SKILLS.includes(s))
                  .map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className="px-3 py-1.5 rounded-full text-sm font-medium bg-[#8259ef] text-white border border-[#8259ef]"
                    >
                      <span className="mr-1">&times;</span>
                      {skill}
                    </button>
                  ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customSkill}
                  onChange={(e) => setCustomSkill(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomSkill();
                    }
                  }}
                  placeholder="Add custom skill..."
                  className="flex-1 bg-white/[0.03] border border-white/10 rounded-[10px] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#8259ef]/50"
                />
                <button
                  type="button"
                  onClick={addCustomSkill}
                  className="px-4 py-2 bg-white/[0.03] border border-white/10 rounded-[10px] text-sm text-gray-300 hover:bg-white/[0.06] transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-950/50 border border-red-800 rounded-[10px] px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!wallet.isConnected}
              className="w-full py-4 bg-[#8259ef] hover:bg-[#6d45d9] disabled:bg-gray-700 disabled:text-gray-500 rounded-[10px] font-normal text-lg transition-all"
            >
              {wallet.isConnected
                ? "Continue to Payment"
                : "Connect Wallet to Continue"}
            </button>

            <p className="text-xs text-gray-600 text-center font-light">
              Next step: pay {TOTAL_COST_HBAR} HBAR from your wallet via
              HashPack
            </p>
          </form>
        )}

        {/* Step 2: Payment confirmation */}
        {step === "payment" && (
          <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-8">
            <h3 className="text-xl font-light mb-6 text-center">
              Confirm Payment
            </h3>

            <div className="space-y-4 mb-8">
              <div className="bg-white/[0.03] border border-white/10 rounded-[10px] p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400 text-sm">Agent Name</span>
                  <span className="text-white font-medium">{name}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400 text-sm">Your Wallet</span>
                  <span className="text-[#b47aff] font-mono text-sm">
                    {wallet.accountId}
                  </span>
                </div>
              </div>

              <div className="bg-white/[0.03] border border-white/10 rounded-[10px] p-4 space-y-3">
                <h4 className="text-sm font-medium text-gray-300 mb-2">
                  Cost Breakdown
                </h4>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">
                    Agent Account Balance
                  </span>
                  <span className="text-white">{AGENT_BALANCE_HBAR} HBAR</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">
                    Reputation Stake (30-day lock)
                  </span>
                  <span className="text-white">{STAKE_HBAR} HBAR</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">
                    Topic Creation Fees
                  </span>
                  <span className="text-white">{FEE_HBAR} HBAR</span>
                </div>
                <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                  <span className="text-white font-medium">Total</span>
                  <span className="text-[#b47aff] text-lg font-bold">
                    {TOTAL_COST_HBAR} HBAR
                  </span>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-950/50 border border-red-800 rounded-[10px] px-4 py-3 text-sm text-red-400 mb-4">
                {error}
              </div>
            )}

            {/* Progress */}
            {registrationProgress && (
              <div className="bg-[#8259ef]/10 border border-[#8259ef]/20 rounded-[10px] px-4 py-3 text-sm text-[#b47aff] flex items-center gap-2 mb-4">
                <span className="w-4 h-4 border-2 border-[#8259ef] border-t-transparent rounded-full animate-spin shrink-0" />
                {registrationProgress}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep("form");
                  setError(null);
                }}
                className="flex-1 py-4 bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] rounded-[10px] font-normal text-lg transition-all"
              >
                Back
              </button>
              <button
                onClick={handlePayment}
                disabled={!!registrationProgress}
                className="flex-1 py-4 bg-[#8259ef] hover:bg-[#6d45d9] disabled:bg-gray-700 disabled:text-gray-500 rounded-[10px] font-normal text-lg transition-all"
              >
                {registrationProgress ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : (
                  `Pay ${TOTAL_COST_HBAR} HBAR`
                )}
              </button>
            </div>

            <p className="text-xs text-gray-600 text-center mt-4 font-light">
              This will open HashPack for you to approve the transaction.
            </p>
          </div>
        )}

        {/* Step 3: Creating */}
        {step === "creating" && (
          <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center">
              <span className="w-12 h-12 border-3 border-[#8259ef] border-t-transparent rounded-full animate-spin" />
            </div>
            <h3 className="text-xl font-light mb-3">Creating Your Agent</h3>
            <p className="text-[#9b9b9d] text-sm mb-4">
              {registrationProgress ||
                "Setting up Hedera account and HCS topics..."}
            </p>
            <p className="text-gray-600 text-xs">
              This may take 30-60 seconds. Please don&apos;t close this page.
            </p>

            {error && (
              <div className="mt-4 bg-red-950/50 border border-red-800 rounded-[10px] px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
