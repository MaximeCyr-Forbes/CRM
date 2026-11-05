import type { AnalysisStatus, AnalysisSummary, SaveAnalysisInput, SavedAnalysis } from "../../types";

export class AnalysisPersistenceError extends Error {
  constructor(message = "Impossible de sauvegarder pour le moment. Vos modifications sont toujours présentes dans cette session.") {
    super(message);
    this.name = "AnalysisPersistenceError";
  }
}

export interface AnalysisRepository {
  readonly configured: boolean;
  list(): Promise<AnalysisSummary[]>;
  get(id: string): Promise<SavedAnalysis | null>;
  save(input: SaveAnalysisInput): Promise<SavedAnalysis>;
  duplicate(id: string): Promise<SavedAnalysis>;
  setStatus(id: string, status: AnalysisStatus): Promise<AnalysisSummary>;
  delete(id: string): Promise<void>;
}

export class UnavailableAnalysisRepository implements AnalysisRepository {
  readonly configured = false;

  private unavailable(): never {
    throw new AnalysisPersistenceError("Supabase n’est pas configuré. Vos modifications sont toujours présentes dans cette session.");
  }

  async list(): Promise<AnalysisSummary[]> { return this.unavailable(); }
  async get(): Promise<SavedAnalysis | null> { return this.unavailable(); }
  async save(): Promise<SavedAnalysis> { return this.unavailable(); }
  async duplicate(): Promise<SavedAnalysis> { return this.unavailable(); }
  async setStatus(): Promise<AnalysisSummary> { return this.unavailable(); }
  async delete(): Promise<void> { return this.unavailable(); }
}
