"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisStatus, ParsedProperty, SavedAnalysis } from "../../../types";
import type { CmaWorkspaceState } from "../../comparables";
import { scheduleDebouncedTask } from "../autosave";
import { getAnalysisRepository } from "../repository-factory";
import { createAnalysisSnapshot, createDefaultAnalysisTitle } from "../serialization";

export type SaveIndicatorState = "dirty" | "saving" | "saved" | "error" | "unavailable";

interface UseAnalysisPersistenceOptions {
  properties: ParsedProperty[];
  workspaceState: CmaWorkspaceState;
  initialAnalysis?: SavedAnalysis;
  debounceMs?: number;
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value);
}

export function useAnalysisPersistence({
  properties,
  workspaceState,
  initialAnalysis,
  debounceMs = 2_500,
}: UseAnalysisPersistenceOptions) {
  const repository = useMemo(() => getAnalysisRepository(), []);
  const snapshot = useMemo(() => createAnalysisSnapshot(properties, workspaceState), [properties, workspaceState]);
  const [analysis, setAnalysis] = useState<SavedAnalysis | undefined>(initialAnalysis);
  const [title, setTitle] = useState(initialAnalysis?.title ?? createDefaultAnalysisTitle(snapshot));
  const [status, setStatus] = useState<AnalysisStatus>(initialAnalysis?.status ?? "draft");
  const [saveState, setSaveState] = useState<SaveIndicatorState>(repository.configured ? (initialAnalysis ? "saved" : "dirty") : "unavailable");
  const [errorMessage, setErrorMessage] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(initialAnalysis?.updatedAt);
  const currentFingerprint = fingerprint({ title, status, snapshot });
  const currentFingerprintRef = useRef(currentFingerprint);
  const lastSavedFingerprint = useRef(initialAnalysis
    ? fingerprint({ title: initialAnalysis.title, status: initialAnalysis.status, snapshot: initialAnalysis.snapshot })
    : "");

  useEffect(() => {
    currentFingerprintRef.current = currentFingerprint;
  }, [currentFingerprint]);

  const persist = useCallback(async (nextStatus: AnalysisStatus, expectedFingerprint: string) => {
    if (!repository.configured) {
      setSaveState("unavailable");
      setErrorMessage("Supabase n’est pas configuré. Vos modifications sont toujours présentes dans cette session.");
      return null;
    }
    setSaveState("saving");
    setErrorMessage("");
    try {
      const saved = await repository.save({ id: analysis?.id, title, status: nextStatus, snapshot });
      setAnalysis(saved);
      setLastSavedAt(saved.updatedAt);
      lastSavedFingerprint.current = expectedFingerprint;
      setSaveState(currentFingerprintRef.current === expectedFingerprint ? "saved" : "dirty");
      return saved;
    } catch (error) {
      setSaveState("error");
      setErrorMessage(error instanceof Error ? error.message : "Impossible de sauvegarder pour le moment. Vos modifications sont toujours présentes dans cette session.");
      return null;
    }
  }, [analysis, repository, snapshot, title]);

  useEffect(() => {
    if (currentFingerprint === lastSavedFingerprint.current) return;
    if (!repository.configured) return;
    const markDirty = scheduleDebouncedTask(() => setSaveState("dirty"), 0);
    const saveLater = scheduleDebouncedTask(() => { void persist(status, currentFingerprint); }, debounceMs);
    return () => { markDirty(); saveLater(); };
  }, [currentFingerprint, debounceMs, persist, repository.configured, status]);

  async function saveNow() {
    return persist(status, currentFingerprint);
  }

  async function changeStatus(nextStatus: AnalysisStatus) {
    setStatus(nextStatus);
    const nextFingerprint = fingerprint({ title, status: nextStatus, snapshot });
    return persist(nextStatus, nextFingerprint);
  }

  return {
    analysis,
    configured: repository.configured,
    errorMessage,
    lastSavedAt,
    saveNow,
    saveState,
    status,
    title,
    setTitle,
    changeStatus,
  };
}
