import type { AnalysisRepository } from "./repository";
import { AnalysisPersistenceError } from "./repository";
import type { AnalysisStatus, AnalysisSummary, SaveAnalysisInput, SavedAnalysis } from "../../types";
async function request<T>(action: string, payload: object = {}): Promise<T> {
 const response = await fetch("/api/tools/acm/analyses", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({action, ...payload}), cache: "no-store"});
 const result = await response.json();
 if (!response.ok) throw new AnalysisPersistenceError(result.error);
 return result.data as T;
}
const repository: AnalysisRepository = {
 configured: true,
 list: () => request<AnalysisSummary[]>("list"),
 get: (id: string) => request<SavedAnalysis | null>("get", {id}),
 save: (input: SaveAnalysisInput) => request<SavedAnalysis>("save", {input}),
 duplicate: (id: string) => request<SavedAnalysis>("duplicate", {id}),
 setStatus: (id: string, status: AnalysisStatus) => request<AnalysisSummary>("status", {id, status}),
 delete: (id: string) => request<void>("delete", {id}),
};
export function getAnalysisRepository(): AnalysisRepository { return repository; }
