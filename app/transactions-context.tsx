"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth-context";
import { useBroker } from "./broker-context";
import type {
  Transaction,
  TransactionDraft,
  TransactionPurchaseCompletion,
  TransactionSaleCompletion,
  TransactionStatus,
} from "./data/transaction-types";
import { removeTransactionFromState, replaceTransactionInState } from "./lib/transactions/state";
import type { TransactionReturnToMarketResult } from "./lib/transactions/return-to-market";

type MutationResult = { transaction: Transaction; message?: string };

type TransactionsContextValue = {
  transactions: ReadonlyArray<Transaction>;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  retry: () => Promise<void>;
  createTransaction: (draft: TransactionDraft) => Promise<Transaction>;
  updateTransaction: (transactionId: string, values: TransactionDraft) => Promise<Transaction>;
  updateStatus: (transactionId: string, status: TransactionStatus) => Promise<Transaction>;
  completeSale: (transactionId: string, values: TransactionSaleCompletion) => Promise<Transaction>;
  completePurchase: (transactionId: string, values: TransactionPurchaseCompletion) => Promise<Transaction>;
  returnToMarket: (transactionId: string) => Promise<TransactionReturnToMarketResult>;
  deleteTransaction: (transactionId: string) => Promise<{ message?: string }>;
  addDeadline: (transactionId: string, title: string, dueDate: string, syncToGoogle: boolean) => Promise<MutationResult>;
  updateDeadline: (transactionId: string, deadlineId: string, values: { title?: string; dueDate?: string; completed?: boolean; syncToGoogle?: boolean }) => Promise<MutationResult>;
  deleteDeadline: (transactionId: string, deadlineId: string) => Promise<MutationResult>;
  addNote: (transactionId: string, content: string) => Promise<Transaction>;
};

const TransactionsContext = createContext<TransactionsContextValue | null>(null);

function logDevelopmentWarning(error: unknown) {
  if (process.env.NODE_ENV !== "production") console.warn(error);
}

async function transactionRequest<T>(body: Record<string, unknown>): Promise<{ data: T; calendar?: { message?: string }; warning?: string }> {
  const response = await fetch("/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: string; calendar?: { message?: string }; warning?: string } | null;
  if (!response.ok || !payload?.data) throw new Error(payload?.error ?? "Opération refusée.");
  return { data: payload.data, calendar: payload.calendar, warning: payload.warning };
}

export function TransactionsProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { selectedBroker } = useBroker();
  const actorBroker = selectedBroker?.toLowerCase() as Transaction["broker"] | undefined;
  const [transactions, setTransactions] = useState<ReadonlyArray<Transaction>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    if (status !== "authenticated") {
      setTransactions([]);
      setIsLoading(status === "loading");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/transactions", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { data?: Transaction[]; error?: string } | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error ?? "Chargement refusé.");
      setTransactions(payload.data);
    } catch (caughtError) {
      logDevelopmentWarning(caughtError);
      setError("Les transactions ne peuvent pas être chargées pour le moment.");
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => { void loadTransactions(); }, [loadTransactions]);

  const runWrite = useCallback(async <T,>(operation: () => Promise<T>) => {
    setPendingWrites((current) => current + 1);
    setError(null);
    try { return await operation(); }
    catch (caughtError) {
      logDevelopmentWarning(caughtError);
      setError(caughtError instanceof Error ? caughtError.message : "Opération impossible.");
      throw caughtError;
    } finally { setPendingWrites((current) => Math.max(0, current - 1)); }
  }, []);

  const replaceTransaction = useCallback((transaction: Transaction) => {
    setTransactions((current) => replaceTransactionInState(current, transaction));
    return transaction;
  }, []);

  const create = useCallback((draft: TransactionDraft) => runWrite(async () => {
    const creationKey = crypto.randomUUID();
    const payload = await transactionRequest<Transaction>({ action: "create", draft, creationKey });
    return replaceTransaction(payload.data);
  }), [replaceTransaction, runWrite]);

  const update = useCallback((transactionId: string, values: Partial<TransactionDraft>) => runWrite(async () => {
    const payload = await transactionRequest<Transaction>({ action: "update", transactionId, values });
    return replaceTransaction(payload.data);
  }), [replaceTransaction, runWrite]);

  const updateStatus = useCallback(
    (transactionId: string, transactionStatus: TransactionStatus) => update(transactionId, { status: transactionStatus }),
    [update],
  );

  const completeSale = useCallback((transactionId: string, values: TransactionSaleCompletion) => runWrite(async () => {
    const response = await fetch(`/api/transactions/${encodeURIComponent(transactionId)}/complete-sale`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    });
    const payload = (await response.json().catch(() => null)) as { data?: Transaction; error?: string } | null;
    if (!response.ok || !payload?.data) {
      throw new Error(payload?.error ?? "Impossible de finaliser la vente.");
    }
    return replaceTransaction(payload.data);
  }), [replaceTransaction, runWrite]);

  const completePurchase = useCallback((transactionId: string, values: TransactionPurchaseCompletion) => runWrite(async () => {
    const response = await fetch(`/api/transactions/${encodeURIComponent(transactionId)}/complete-purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    });
    const payload = (await response.json().catch(() => null)) as { data?: Transaction; error?: string } | null;
    if (!response.ok || !payload?.data) {
      throw new Error(payload?.error ?? "Impossible de finaliser l’achat.");
    }
    return replaceTransaction(payload.data);
  }), [replaceTransaction, runWrite]);

  const returnToMarket = useCallback((transactionId: string) => runWrite(async () => {
    const response = await fetch(`/api/transactions/${encodeURIComponent(transactionId)}/return-to-market`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorBroker: actorBroker ?? null }),
    });
    const payload = (await response.json().catch(() => null)) as {
      data?: TransactionReturnToMarketResult;
      error?: string;
    } | null;
    if (!response.ok || !payload?.data) {
      throw new Error(payload?.error ?? "Impossible de remettre le Listing sur le marché.");
    }
    replaceTransaction(payload.data.transaction);
    return payload.data;
  }), [actorBroker, replaceTransaction, runWrite]);

  const removeTransaction = useCallback((transactionId: string) => runWrite(async () => {
    const payload = await transactionRequest<{ transactionId: string }>({ action: "deleteTransaction", transactionId });
    setTransactions((current) => removeTransactionFromState(current, payload.data.transactionId));
    return { message: payload.warning };
  }), [runWrite]);

  const addDeadline = useCallback((transactionId: string, title: string, dueDate: string, syncToGoogle: boolean) => runWrite(async () => {
    const payload = await transactionRequest<Transaction>({ action: "addDeadline", transactionId, title, dueDate, syncToGoogle });
    replaceTransaction(payload.data);
    return { transaction: payload.data, message: payload.calendar?.message };
  }), [replaceTransaction, runWrite]);

  const editDeadline = useCallback((transactionId: string, deadlineId: string, values: { title?: string; dueDate?: string; completed?: boolean; syncToGoogle?: boolean }) => runWrite(async () => {
    const payload = await transactionRequest<Transaction>({ action: "updateDeadline", transactionId, deadlineId, ...values });
    replaceTransaction(payload.data);
    return { transaction: payload.data, message: payload.calendar?.message };
  }), [replaceTransaction, runWrite]);

  const removeDeadline = useCallback((transactionId: string, deadlineId: string) => runWrite(async () => {
    const payload = await transactionRequest<Transaction>({ action: "deleteDeadline", transactionId, deadlineId });
    replaceTransaction(payload.data);
    return { transaction: payload.data, message: payload.warning };
  }), [replaceTransaction, runWrite]);

  const addNote = useCallback((transactionId: string, content: string) => runWrite(async () => {
    const payload = await transactionRequest<Transaction>({ action: "addNote", transactionId, content });
    return replaceTransaction(payload.data);
  }), [replaceTransaction, runWrite]);

  const value = useMemo<TransactionsContextValue>(() => ({
    transactions,
    isLoading,
    isSaving: pendingWrites > 0,
    error,
    retry: loadTransactions,
    createTransaction: create,
    updateTransaction: update,
    updateStatus,
    completeSale,
    completePurchase,
    returnToMarket,
    deleteTransaction: removeTransaction,
    addDeadline,
    updateDeadline: editDeadline,
    deleteDeadline: removeDeadline,
    addNote,
  }), [transactions, isLoading, pendingWrites, error, loadTransactions, create, update, updateStatus, completeSale, completePurchase, returnToMarket, removeTransaction, addDeadline, editDeadline, removeDeadline, addNote]);

  return <TransactionsContext.Provider value={value}>{children}</TransactionsContext.Provider>;
}

export function useTransactions() {
  const context = useContext(TransactionsContext);
  if (!context) throw new Error("useTransactions doit être utilisé dans TransactionsProvider");
  return context;
}
