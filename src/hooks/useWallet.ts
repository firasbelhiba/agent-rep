"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// HashConnect connection states
type ConnectionState = "Disconnected" | "Connecting" | "Connected" | "Paired";

interface WalletState {
  isConnected: boolean;
  accountId: string | null;
  connectionState: ConnectionState;
  error: string | null;
}

interface UseWalletReturn extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<{ signature: Uint8Array; publicKey: string } | null>;
  sendHbar: (toAccountId: string, amountHbar: number) => Promise<{ transactionId: string } | null>;
  isLoading: boolean;
  isInitialized: boolean;
}

// WalletConnect project ID — get yours FREE at https://cloud.walletconnect.com
const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export function useWallet(): UseWalletReturn {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    accountId: null,
    connectionState: "Disconnected",
    error: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Refs to hold instance and init promise (avoids SSR issues + race conditions)
  const hcRef = useRef<any>(null);
  const initPromiseRef = useRef<Promise<any> | null>(null);
  const mountedRef = useRef(false);

  /**
   * Ensures HashConnect is created AND initialized (init() completed).
   * Safe to call multiple times — returns the same promise/instance.
   */
  const ensureInitialized = useCallback(async (): Promise<any> => {
    if (typeof window === "undefined") return null;

    // If already initialized, return the instance
    if (hcRef.current && isInitialized) return hcRef.current;

    // If init is in progress, wait for it
    if (initPromiseRef.current) return initPromiseRef.current;

    // Create the init promise (runs once)
    initPromiseRef.current = (async () => {
      try {
        if (!PROJECT_ID) {
          setState((prev) => ({
            ...prev,
            error: "WalletConnect Project ID not configured. Add NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to your .env.local file. Get a free one at https://cloud.walletconnect.com",
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
          true // debug
        );

        // Listen for pairing events
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

        // Listen for connection state changes
        hc.connectionStatusChangeEvent.on((status: ConnectionState) => {
          console.log("[HashConnect] Connection status:", status);
          setState((prev) => ({ ...prev, connectionState: status }));
        });

        // Listen for disconnection
        hc.disconnectionEvent.on(() => {
          console.log("[HashConnect] Disconnected");
          setState({
            isConnected: false,
            accountId: null,
            connectionState: "Disconnected",
            error: null,
          });
        });

        // CRITICAL: Call init() and wait for it to complete
        console.log("[HashConnect] Calling init()...");
        await hc.init();
        console.log("[HashConnect] init() complete!");

        hcRef.current = hc;
        setIsInitialized(true);

        // Check if already connected from a previous session
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
        initPromiseRef.current = null; // Allow retry
        setState((prev) => ({
          ...prev,
          error: "Failed to initialize wallet connection. Please refresh and try again.",
        }));
        return null;
      }
    })();

    return initPromiseRef.current;
  }, [isInitialized]);

  // Auto-initialize on mount
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
      // Wait for full initialization before opening modal
      const hc = await ensureInitialized();
      if (!hc) throw new Error("HashConnect failed to initialize. Please refresh the page.");

      console.log("[HashConnect] Opening pairing modal...");
      await hc.openPairingModal();
    } catch (err: unknown) {
      console.error("[HashConnect] Connect error:", err);
      let message = err instanceof Error ? err.message : "Failed to connect wallet";
      if (message.includes("Project not found") || message.includes("project")) {
        message = "WalletConnect Project ID is invalid. Please update NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local";
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
        if (!hc || !state.accountId) {
          throw new Error("Wallet not connected");
        }

        const { AccountId } = await import("@hashgraph/sdk");
        const accountId = AccountId.fromString(state.accountId);

        console.log("[HashConnect] Signing message...");
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
        if (!hc || !state.accountId) {
          throw new Error("Wallet not connected");
        }

        const { AccountId, TransferTransaction, Hbar, HbarUnit, TransactionId } = await import("@hashgraph/sdk");
        const fromAccount = AccountId.fromString(state.accountId);
        const toAccount = AccountId.fromString(toAccountId);

        // Build the transfer transaction
        const transaction = new TransferTransaction()
          .addHbarTransfer(fromAccount, Hbar.from(-amountHbar, HbarUnit.Hbar))
          .addHbarTransfer(toAccount, Hbar.from(amountHbar, HbarUnit.Hbar))
          .setTransactionId(TransactionId.generate(fromAccount));

        // Freeze with a node account ID (testnet node)
        transaction.setNodeAccountIds([AccountId.fromString("0.0.3")]);
        transaction.freeze();

        console.log("[HashConnect] Sending transaction for approval...");
        const receipt = await hc.sendTransaction(fromAccount, transaction);
        console.log("[HashConnect] Transaction receipt:", receipt);

        // The transactionId is available from the transaction we built
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

  return {
    ...state,
    connect,
    disconnect,
    signMessage,
    sendHbar,
    isLoading,
    isInitialized,
  };
}
