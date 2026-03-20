"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";
import { Navbar } from "@/components/ui/Navbar";
import { useWalletContext } from "@/context/WalletContext";

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
const AGENT_BALANCE_HBAR = 3;
const STAKE_HBAR = 5;
const FEE_HBAR = 0.5;
const TOTAL_COST_HBAR = AGENT_BALANCE_HBAR + STAKE_HBAR + FEE_HBAR;

const OPERATOR_ACCOUNT_ID =
  process.env.NEXT_PUBLIC_OPERATOR_ACCOUNT_ID || "0.0.3700702";

interface CapabilityOption {
  value: number;
  label: string;
}

interface ProgressStage {
  stage: string;
  message: string;
  percent: number;
  status: "pending" | "active" | "completed" | "error";
}

type RegistrationStep = "form" | "payment" | "creating" | "success";

const STAGE_ORDER = [
  { key: "payment_verify", label: "Verifying payment" },
  { key: "preparing", label: "Preparing registration" },
  { key: "submitting", label: "Creating HCS topics" },
  { key: "confirming", label: "Confirming on-chain" },
  { key: "verifying", label: "Verifying HCS-11 profile" },
  { key: "completed", label: "HCS-10 registration complete" },
  { key: "hol_credits", label: "Checking HOL credits" },
  { key: "hol_register", label: "Registering on HOL Broker" },
  { key: "done", label: "Done!" },
];

export default function RegisterPage() {
  const router = useRouter();
  const wallet = useWalletContext();

  // Check if community user is logged in with a verified wallet
  const [communityWallet, setCommunityWallet] = useState<string | null>(null);
  useEffect(() => {
    const userStr = localStorage.getItem("communityUser");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.hederaAccountId) {
          setCommunityWallet(user.hederaAccountId);
        }
      } catch {}
    }
  }, []);

  // Treat wallet as connected if either HashConnect OR community wallet is available
  const isWalletReady = wallet.isConnected || !!communityWallet;
  const walletAccountId = wallet.accountId || communityWallet;

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
  const [registerOnHol, setRegisterOnHol] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<RegistrationStep>("form");
  const [paymentTxId, setPaymentTxId] = useState<string | null>(null);
  const [registrationProgress, setRegistrationProgress] = useState<
    string | null
  >(null);
  const [progressStages, setProgressStages] = useState<ProgressStage[]>([]);
  const [progressPercent, setProgressPercent] = useState(0);
  const [holWarning, setHolWarning] = useState<string | null>(null);
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
    broker?: {
      registered?: boolean;
      uaid?: string;
      error?: string;
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
    if (!isWalletReady || !walletAccountId) {
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

      // Step 3: Call SSE endpoint for live progress
      await createAgentWithProgress(result.transactionId);
    } catch (err: any) {
      setError(err.message || "Payment failed");
      setRegistrationProgress(null);
    }
  };

  // Step 3: Create agent via SSE endpoint with live progress
  const createAgentWithProgress = async (txId: string) => {
    // Build the visible stages based on whether HOL is opted in
    const visibleStages = STAGE_ORDER.filter((s) => {
      if (!registerOnHol && (s.key === "hol_credits" || s.key === "hol_register")) {
        return false;
      }
      return true;
    });

    setProgressStages(
      visibleStages.map((s) => ({
        stage: s.key,
        message: s.label,
        percent: 0,
        status: "pending" as const,
      }))
    );
    setProgressPercent(0);
    setHolWarning(null);

    const body: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim(),
      skills: selectedSkills,
      capabilities: selectedCapabilities,
      model: model.trim(),
      agentType,
      useHcs10: true,
      registerOnHol,
      paymentTxId: txId,
      payerAccountId: wallet.accountId,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = localStorage.getItem("communityToken");
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const response = await fetch(`${API_URL}/api/agents/register-with-progress`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || "Registration failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              handleSSEEvent(currentEvent, data);
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
      setStep("payment");
      setRegistrationProgress(null);
      setProgressStages([]);
    }
  };

  const handleSSEEvent = (event: string, data: any) => {
    if (event === "progress") {
      setProgressPercent(data.percent || 0);
      setRegistrationProgress(data.message);

      // Update stage statuses
      setProgressStages((prev) => {
        const stageIndex = prev.findIndex((s) => s.stage === data.stage);
        return prev.map((s, i) => {
          if (i < stageIndex) {
            return { ...s, status: "completed" as const };
          } else if (i === stageIndex) {
            return {
              ...s,
              message: data.message,
              percent: data.percent,
              status: data.stage === "hol_no_credits" || data.stage === "hol_failed"
                ? "error" as const
                : "active" as const,
            };
          }
          return s;
        });
      });

      // Handle HOL credit warnings
      if (data.stage === "hol_no_credits") {
        setHolWarning(data.message);
      }
    } else if (event === "complete") {
      setProgressStages((prev) =>
        prev.map((s) => ({ ...s, status: "completed" as const }))
      );
      setProgressPercent(100);
      setSuccess({
        agentId: data.agent?.agentId,
        apiKey: data.apiKey,
        hcsSequenceNumber: data.hcsSequenceNumber,
        hcs10: data.hcs10,
        broker: data.broker,
        warning: data.warning,
      });
      setTimeout(() => setStep("success"), 800);
    } else if (event === "error") {
      setError(data.message);
      setStep("payment");
      setRegistrationProgress(null);
      setProgressStages([]);
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
                retrieved later.
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
            </div>
          )}

          {/* HOL Broker result */}
          {success.broker?.registered && (
            <div className="mt-4 bg-green-950/30 border border-green-800/30 rounded-[10px] p-4">
              <p className="text-green-400 text-sm font-medium mb-1">
                Registered on HOL Registry Broker
              </p>
              {success.broker.uaid && (
                <p className="text-green-300/60 text-xs font-mono">
                  UAID: {success.broker.uaid}
                </p>
              )}
            </div>
          )}

          {success.broker && !success.broker.registered && success.broker.error && (
            <div className="mt-4 bg-amber-950/40 border border-amber-700/50 rounded-[10px] p-4">
              <p className="text-amber-400 text-sm font-medium mb-1">HOL Registry</p>
              <p className="text-amber-200/70 text-xs mb-2">
                {success.broker.error.includes("insufficient_credits") || success.broker.error.includes("402")
                  ? "Insufficient HOL credits. Your agent was registered on HCS-10 successfully, but could not be listed on the HOL Registry Broker."
                  : success.broker.error.includes("409") || success.broker.error.includes("already")
                  ? "Agent already registered on HOL Registry."
                  : `HOL registration failed. Your agent is still fully functional on HCS-10.`}
              </p>
              {(success.broker.error.includes("insufficient_credits") || success.broker.error.includes("402")) && (
                <a
                  href="https://hol.org/registry/billing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#8259ef] text-xs hover:underline"
                >
                  Get HOL credits →
                </a>
              )}
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
        {!isWalletReady && !wallet.isLoading && wallet.isInitialized && step === "form" && (
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

        {!isWalletReady && !wallet.isInitialized && step === "form" && (
          <div className="mb-6 bg-gray-900/40 border border-gray-700/50 rounded-[10px] p-4 flex items-center justify-center">
            <p className="text-gray-400 text-sm">Detecting wallet connection...</p>
          </div>
        )}

        {isWalletReady && step === "form" && (
          <div className="mb-6 bg-green-950/30 border border-green-800/30 rounded-[10px] p-4 flex items-center justify-between">
            <div>
              <p className="text-green-400 text-sm font-medium">
                Wallet Connected
              </p>
              <p className="text-green-300/60 text-xs font-mono">
                {walletAccountId}
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

            {/* Register on HOL */}
            <div className="border border-white/[0.06] rounded-[10px] p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={registerOnHol}
                  onChange={(e) => setRegisterOnHol(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-white/20 bg-white/[0.03] text-[#8259ef] focus:ring-[#8259ef]/50 cursor-pointer accent-[#8259ef]"
                />
                <div>
                  <p className="text-sm font-medium text-gray-300">
                    Register on HOL Registry Broker
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Make your agent discoverable on{" "}
                    <a
                      href="https://hol.org/registry"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#b47aff] hover:underline"
                    >
                      hol.org
                    </a>
                    . Requires HOL credits. If you don&apos;t have credits, your
                    agent will still be registered on HCS-10.
                  </p>
                </div>
              </label>
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
              disabled={!isWalletReady}
              className="w-full py-4 bg-[#8259ef] hover:bg-[#6d45d9] disabled:bg-gray-700 disabled:text-gray-500 rounded-[10px] font-normal text-lg transition-all"
            >
              {isWalletReady
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
                {registerOnHol && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">HOL Registry</span>
                    <span className="text-[#8259ef] text-sm">Enabled</span>
                  </div>
                )}
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

        {/* Step 3: Creating — with live progress stages */}
        {step === "creating" && (
          <div className="bg-[#0a0a1a] border border-white/[0.06] rounded-[10px] p-8">
            <h3 className="text-xl font-light mb-6 text-center">
              Creating Your Agent
            </h3>

            {/* Progress bar */}
            <div className="w-full h-2 bg-white/[0.06] rounded-full mb-6 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#8259ef] to-[#b47aff] rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Stage list */}
            <div className="space-y-3 mb-6">
              {progressStages.map((stage) => (
                <div
                  key={stage.stage}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${
                    stage.status === "active"
                      ? "bg-[#8259ef]/10 border border-[#8259ef]/20"
                      : stage.status === "completed"
                      ? "bg-green-950/20 border border-green-800/20"
                      : stage.status === "error"
                      ? "bg-amber-950/20 border border-amber-700/20"
                      : "bg-white/[0.02] border border-transparent"
                  }`}
                >
                  {/* Status icon */}
                  {stage.status === "completed" && (
                    <svg
                      className="w-4 h-4 text-green-400 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  )}
                  {stage.status === "active" && (
                    <span className="w-4 h-4 border-2 border-[#8259ef] border-t-transparent rounded-full animate-spin shrink-0" />
                  )}
                  {stage.status === "pending" && (
                    <span className="w-4 h-4 rounded-full border border-white/10 shrink-0" />
                  )}
                  {stage.status === "error" && (
                    <svg
                      className="w-4 h-4 text-amber-400 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                      />
                    </svg>
                  )}

                  <span
                    className={`text-sm ${
                      stage.status === "active"
                        ? "text-[#b47aff]"
                        : stage.status === "completed"
                        ? "text-green-400"
                        : stage.status === "error"
                        ? "text-amber-400"
                        : "text-gray-600"
                    }`}
                  >
                    {stage.message}
                  </span>
                </div>
              ))}
            </div>

            {/* HOL credit warning */}
            {holWarning && (
              <div className="bg-amber-950/40 border border-amber-700/50 rounded-[10px] p-4 mb-4">
                <p className="text-amber-400 text-sm font-medium mb-1">
                  HOL Registry
                </p>
                <p className="text-amber-200/70 text-xs">{holWarning}</p>
                <a
                  href="https://hol.org/registry/billing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-xs text-[#b47aff] hover:underline"
                >
                  Purchase HOL credits
                </a>
              </div>
            )}

            {error && (
              <div className="mt-4 bg-red-950/50 border border-red-800 rounded-[10px] px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <p className="text-gray-600 text-xs text-center">
              This may take 30-60 seconds. Please don&apos;t close this page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
