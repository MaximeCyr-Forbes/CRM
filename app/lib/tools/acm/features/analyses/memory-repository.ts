import type { AnalysisStatus, AnalysisSummary, SaveAnalysisInput, SavedAnalysis } from "../../types";
import { AnalysisPersistenceError, type AnalysisRepository } from "./repository";
import { deriveAnalysisSummary } from "./serialization";

export class MemoryAnalysisRepository implements AnalysisRepository {
  readonly configured = true;
  private readonly records = new Map<string, SavedAnalysis>();

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => crypto.randomUUID(),
    private failNextSave = false,
    private failNextDelete = false,
  ) {}

  simulateNextSaveFailure() { this.failNextSave = true; }
  simulateNextDeleteFailure() { this.failNextDelete = true; }

  async list(): Promise<AnalysisSummary[]> {
    return [...this.records.values()].map((record) => ({
      id: record.id,
      title: record.title,
      status: record.status,
      subjectAddress: record.subjectAddress,
      subjectCity: record.subjectCity,
      propertyCategory: record.propertyCategory,
      clientFirstName: record.clientFirstName,
      clientLastName: record.clientLastName,
      recommendedValue: record.recommendedValue,
      comparableCount: record.comparableCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(id: string): Promise<SavedAnalysis | null> {
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  async save(input: SaveAnalysisInput): Promise<SavedAnalysis> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new AnalysisPersistenceError();
    }
    const existing = input.id ? this.records.get(input.id) : undefined;
    const id = existing?.id ?? this.createId();
    const timestamp = this.now().toISOString();
    const summary = deriveAnalysisSummary(input, id, existing?.createdAt ?? timestamp, timestamp);
    const saved = { ...summary, ownerId: "test-owner", snapshot: structuredClone(input.snapshot) };
    this.records.set(id, saved);
    return structuredClone(saved);
  }

  async duplicate(id: string): Promise<SavedAnalysis> {
    const source = await this.get(id);
    if (!source) throw new AnalysisPersistenceError("L’analyse à dupliquer est introuvable.");
    return this.save({ title: `Copie de ${source.title}`, status: "draft", snapshot: source.snapshot });
  }

  async setStatus(id: string, status: AnalysisStatus): Promise<AnalysisSummary> {
    const source = await this.get(id);
    if (!source) throw new AnalysisPersistenceError("L’analyse est introuvable.");
    return this.save({ id, title: source.title, status, snapshot: source.snapshot });
  }

  async delete(id: string): Promise<void> {
    if (this.failNextDelete) {
      this.failNextDelete = false;
      throw new AnalysisPersistenceError("Impossible de supprimer l’analyse pour le moment.");
    }
    if (!this.records.delete(id)) throw new AnalysisPersistenceError("L’analyse est introuvable.");
  }
}
