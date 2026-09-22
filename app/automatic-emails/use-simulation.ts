"use client";
import { useEffect, useRef, useState } from "react";
import type { AutomaticEmailOccurrence } from "../data/automatic-email-types";

export type SimulationSummary = { summary: { today: number; tomorrow: number; nextSevenDays: number }; rules: { ruleId: string; count30Days: number; nextDate: string | null; nextTime: string | null }[] };
export function useSimulation(today: string, through: string, revision: number, ready: boolean, showSchedule: boolean, previewRuleId: string | null) {
  const [summary, setSummary] = useState<SimulationSummary | null>(null);
  const [occurrences, setOccurrences] = useState<AutomaticEmailOccurrence[]>([]);
  const [preview, setPreview] = useState<AutomaticEmailOccurrence | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const cache = useRef(new Map<string, { at: number; data: unknown }>());
  async function read(mode: string, ruleId: string | null, signal: AbortSignal) {
    const key = `${today}:${revision}:${mode}:${ruleId ?? ""}`;
    const cached = cache.current.get(key);
    if (cached && Date.now() - cached.at < 60000) return cached.data;
    const params = new URLSearchParams({ from: today, to: through, mode });
    if (ruleId) params.set("ruleId", ruleId);
    const response = await fetch(`/api/automatic-emails/occurrences?${params}`, { cache: "no-store", signal });
    const body = await response.json();
    if (!response.ok || !body.data) throw new Error(body.error ?? "Simulation temporairement indisponible.");
    if (!signal.aborted) { if (cache.current.size > 12) cache.current.clear(); cache.current.set(key, { at: Date.now(), data: body.data }); }
    return body.data;
  }
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoadingSummary(true); setSummaryError(null);
    // Rules have committed before this effect starts the secondary request.
    void read("summary", null, controller.signal).then(data => { if (!controller.signal.aborted) setSummary(data as SimulationSummary); })
      .catch(e => { if (!controller.signal.aborted) setSummaryError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingSummary(false); });
    return () => controller.abort();
  }, [today, through, revision, ready]);
  useEffect(() => {
    if (!showSchedule) return;
    const controller = new AbortController();
    setLoadingSchedule(true); setScheduleError(null); setOccurrences([]);
    void read("full", null, controller.signal).then(data => { if (!controller.signal.aborted) setOccurrences((data as { occurrences: AutomaticEmailOccurrence[] }).occurrences); })
      .catch(e => { if (!controller.signal.aborted) setScheduleError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingSchedule(false); });
    return () => controller.abort();
  }, [today, through, revision, showSchedule]);
  useEffect(() => {
    if (!previewRuleId) return;
    const controller = new AbortController();
    setLoadingPreview(true); setPreviewError(null); setPreview(null);
    void read("preview", previewRuleId, controller.signal).then(data => { if (!controller.signal.aborted) setPreview((data as { occurrences: AutomaticEmailOccurrence[] }).occurrences[0] ?? null); })
      .catch(e => { if (!controller.signal.aborted) setPreviewError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingPreview(false); });
    return () => controller.abort();
  }, [today, through, revision, previewRuleId]);
  return { summary, occurrences, preview, loadingSummary, loadingSchedule, loadingPreview, summaryError, scheduleError, previewError };
}
