"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

// HashConnect connection states
type ConnectionState = "Disconnected" | "Connecting" | "Connected" | "Paired";

interface WalletState {
  isConnected: boolean;
  accountId: string | null;
  connectionState: ConnectionState;
  error: string | null;
}

interface WalletContextType extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<{ signature: Uint8Array; publicKey: string } | null>;
  sendHbar: (toAccountId: string, amountHbar: number) => Promise<{ transactionId: string } | null>;
  executeContractCall: (contractId: string, functionName: string, amountHbar: number, agentId?: string) => Promise<{ transactionId: string } | null>;
  isLoading: boolean;
  isInitialized: boolean;
}

const WalletContext = createContext<WalletContextType | null>(null);

// WalletConnect project ID
const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    accountId: null,
    connectionState: "Disconnected",
    error: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const hcRef = useRef<any>(null);
  const initPromiseRef = useRef<Promise<any> | null>(null);
  const mountedRef = useRef(false);

  const ensureInitialized = useCallback(async (): Promise<any> => {
    if (typeof window === "undefined") return null;

    if (hcRef.current && isInitialized) return hcRef.current;

    if (initPromiseRef.current) return initPromiseRef.current;

    initPromiseRef.current = (async () => {
      try {
        if (!PROJECT_ID) {
          setState((prev) => ({
            ...prev,
            error: "WalletConnect Project ID not configured.",
          }));
          return null;
        }

        const { HashConnect } = await import("hashconnect");
        const { LedgerId } = await import("@hashgraph/sdk");

        const metadata = {
          name: "AgentRep",
          description: "On-Chain Reputation for AI Agents",
          icons: ["https://agentrep.xyz/favicon.ico"],
          url: window.location.origin,
        };

        const hc = new HashConnect(
          LedgerId.TESTNET,
          PROJECT_ID,
          metadata,
          true
        );

        hc.pairingEvent.on((data: any) => {
          console.log("[HashConnect] Paired:", data);
          const accountIds = data.accountIds || [];
          if (accountIds.length > 0) {
            setState({
              isConnected: true,
              accountId: accountIds[0],
              connectionState: "Paired",
              error: null,
            });
          }
        });

        hc.connectionStatusChangeEvent.on((status: ConnectionState) => {
          console.log("[HashConnect] Connection status:", status);
          setState((prev) => ({ ...prev, connectionState: status }));
        });

        hc.disconnectionEvent.on(() => {
          console.log("[HashConnect] Disconnected");
          setState({
            isConnected: false,
            accountId: null,
            connectionState: "Disconnected",
            error: null,
          });
        });

        console.log("[HashConnect] Calling init()...");
        await hc.init();
        console.log("[HashConnect] init() complete!");

        hcRef.current = hc;
        setIsInitialized(true);

        const accounts = hc.connectedAccountIds;
        if (accounts && accounts.length > 0) {
          setState({
            isConnected: true,
            accountId: accounts[0].toString(),
            connectionState: "Paired",
            error: null,
          });
        }

        return hc;
      } catch (err) {
        console.error("[HashConnect] Init failed:", err);
        initPromiseRef.current = null;
        setState((prev) => ({
          ...prev,
          error: "Failed to initialize wallet connection. Please refresh and try again.",
        }));
        return null;
      }
    })();

    return initPromiseRef.current;
  }, [isInitialized]);

  useEffect(() => {
    if (!mountedRef.current && typeof window !== "undefined") {
      mountedRef.current = true;
      ensureInitialized();
    }
  }, [ensureInitialized]);

  const connect = useCallback(async () => {
    setIsLoading(true);
    setState((prev) => ({ ...prev, error: null, connectionState: "Connecting" }));

    try {
      const hc = await ensureInitialized();
      if (!hc) throw new Error("HashConnect failed to initialize. Please refresh the page.");
      console.log("[HashConnect] Opening pairing modal...");
      await hc.openPairingModal();
    } catch (err: unknown) {
      console.error("[HashConnect] Connect error:", err);
      let message = err instanceof Error ? err.message : "Failed to connect wallet";
      if (message.includes("Project not found") || message.includes("project")) {
        message = "WalletConnect Project ID is invalid.";
      }
      setState((prev) => ({
        ...prev,
        error: message,
        connectionState: "Disconnected",
      }));
    } finally {
      setIsLoading(false);
    }
  }, [ensureInitialized]);

  const disconnect = useCallback(async () => {
    try {
      const hc = hcRef.current;
      if (hc) {
        await hc.disconnect();
      }
    } catch (err) {
      console.error("[HashConnect] Disconnect error:", err);
    }
    setState({
      isConnected: false,
      accountId: null,
      connectionState: "Disconnected",
      error: null,
    });
  }, []);

  const signMessage = useCallback(
    async (message: string): Promise<{ signature: Uint8Array; publicKey: string } | null> => {
      try {
        const hc = hcRef.current;
        if (!hc || !state.accountId) throw new Error("Wallet not connected");

        const { AccountId } = await import("@hashgraph/sdk");
        const accountId = AccountId.fromString(state.accountId);

        const signerSignatures = await hc.signMessages(accountId, message);
        if (signerSignatures && signerSignatures.length > 0) {
          const sig = signerSignatures[0];
          return {
            signature: sig.signature,
            publicKey: sig.publicKey.toStringRaw(),
          };
        }
        return null;
      } catch (err: unknown) {
        console.error("[HashConnect] Sign error:", err);
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "Failed to sign message",
        }));
        return null;
      }
    },
    [state.accountId]
  );

  const sendHbar = useCallback(
    async (toAccountId: string, amountHbar: number): Promise<{ transactionId: string } | null> => {
      try {
        const hc = hcRef.current;
        if (!hc || !state.accountId) throw new Error("Wallet not connected");

        const { AccountId, TransferTransaction, Hbar, HbarUnit, TransactionId } = await import("@hashgraph/sdk");
        const fromAccount = AccountId.fromString(state.accountId);
        const toAccount = AccountId.fromString(toAccountId);

        const transaction = new TransferTransaction()
          .addHbarTransfer(fromAccount, Hbar.from(-amountHbar, HbarUnit.Hbar))
          .addHbarTransfer(toAccount, Hbar.from(amountHbar, HbarUnit.Hbar))
          .setTransactionId(TransactionId.generate(fromAccount));

        transaction.setNodeAccountIds([AccountId.fromString("0.0.3")]);
        transaction.freeze();

        const receipt = await hc.sendTransaction(fromAccount, transaction);
        console.log("[HashConnect] Transaction receipt:", receipt);

        const txId = transaction.transactionId?.toString() || "";
        return { transactionId: txId };
      } catch (err: unknown) {
        console.error("[HashConnect] Transaction error:", err);
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "Transaction failed",
        }));
        return null;
      }
    },
    [state.accountId]
  );

  const executeContractCall = useCallback(
    async (contractId: string, functionName: string, amountHbar: number, agentId?: string): Promise<{ transactionId: string } | null> => {
      try {
        const hc = hcRef.current;
        if (!hc || !state.accountId) throw new Error("Wallet not connected");

        const { AccountId, ContractExecuteTransaction, ContractFunctionParameters, Hbar, HbarUnit, TransactionId, ContractId } = await import("@hashgraph/sdk");
        const fromAccount = AccountId.fromString(state.accountId);

        const params = new ContractFunctionParameters();
        if (agentId) {
          const encoder = new TextEncoder();
          const data = encoder.encode(agentId);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = new Uint8Array(hashBuffer);
          params.addBytes32(hashArray);
        }

        const transaction = new ContractExecuteTransaction()
          .setContractId(ContractId.fromString(contractId))
          .setGas(300000)
          .setFunction(functionName, params)
          .setPayableAmount(Hbar.from(amountHbar, HbarUnit.Hbar))
          .setTransactionId(TransactionId.generate(fromAccount));

        transaction.setNodeAccountIds([AccountId.fromString("0.0.3")]);
        transaction.freeze();

        console.log(`[HashConnect] Executing contract call: ${functionName} on ${contractId} with ${amountHbar} HBAR`);
        const receipt = await hc.sendTransaction(fromAccount, transaction);
        console.log("[HashConnect] Contract call receipt:", receipt);

        const txId = transaction.transactionId?.toString() || "";
        return { transactionId: txId };
      } catch (err: unknown) {
        console.error("[HashConnect] Contract call error:", err);
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "Contract call failed",
        }));
        return null;
      }
    },
    [state.accountId]
  );

  return (
    <WalletContext.Provider
      value={{
        ...state,
        connect,
        disconnect,
        signMessage,
        sendHbar,
        executeContractCall,
        isLoading,
        isInitialized,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext(): WalletContextType {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWalletContext must be used within a WalletProvider");
  }
  return context;
}
