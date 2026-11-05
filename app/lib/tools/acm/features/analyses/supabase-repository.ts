import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisStatus, AnalysisSummary, SaveAnalysisInput, SavedAnalysis } from "../../types";
import { deserializeAnalysisSnapshot, getSnapshotSubject } from "./serialization";
import { AnalysisPersistenceError, type AnalysisRepository } from "./repository";
import "server-only";

interface AnalysisRow {
  id: string;
  owner_id: string;
  title: string;
  status: AnalysisStatus;
  subject_address: string | null;
  subject_city: string | null;
  property_category: AnalysisSummary["propertyCategory"] | null;
  client_first_name: string | null;
  client_last_name: string | null;
  recommended_value: number | null;
  comparable_count: number;
  analysis_data?: unknown;
  created_at: string;
  updated_at: string;
}

const SUMMARY_COLUMNS = "id, owner_id, title, status, subject_address, subject_city, property_category, client_first_name, client_last_name, recommended_value, comparable_count, created_at, updated_at";
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, analysis_data`;

function rowToSummary(row: AnalysisRow): AnalysisSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    subjectAddress: row.subject_address ?? undefined,
    subjectCity: row.subject_city ?? undefined,
    propertyCategory: row.property_category ?? undefined,
    clientFirstName: row.client_first_name ?? undefined,
    clientLastName: row.client_last_name ?? undefined,
    recommendedValue: row.recommended_value ?? undefined,
    comparableCount: row.comparable_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSaved(row: AnalysisRow): SavedAnalysis {
  if (row.analysis_data === undefined) throw new AnalysisPersistenceError("Le détail de cette analyse est indisponible.");
  return { ...rowToSummary(row), ownerId: row.owner_id, snapshot: deserializeAnalysisSnapshot(row.analysis_data) };
}

function writeFields(input: SaveAnalysisInput, ownerId: string) {
  const subject = getSnapshotSubject(input.snapshot);
  const email = input.snapshot.workspaceState.emailDraft;
  return {
    owner_id: ownerId,
    title: input.title.trim() || "Nouvelle ACM",
    status: input.status,
    subject_address: subject?.data.address ?? null,
    subject_city: subject?.data.city ?? null,
    property_category: subject?.data.propertyCategory ?? null,
    client_first_name: email.firstName.trim() || null,
    client_last_name: email.lastName.trim() || null,
    recommended_value: input.snapshot.workspaceState.opinion.recommendedValue ?? null,
    comparable_count: input.snapshot.workspaceState.selection.comparableIds.length,
    analysis_data: input.snapshot,
  };
}

function persistenceFailure(): AnalysisPersistenceError {
  return new AnalysisPersistenceError();
}

export class SupabaseAnalysisRepository implements AnalysisRepository {
  readonly configured = true;

  constructor(private readonly supabase: SupabaseClient, private readonly actorId: string) {}

  async list(): Promise<AnalysisSummary[]> {
    
    const { data, error } = await this.supabase.from("tool_acm_analyses").select(SUMMARY_COLUMNS).order("updated_at", { ascending: false });
    if (error) throw persistenceFailure();
    return (data as AnalysisRow[]).map(rowToSummary);
  }

  async get(id: string): Promise<SavedAnalysis | null> {
    
    const { data, error } = await this.supabase.from("tool_acm_analyses").select(DETAIL_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw persistenceFailure();
    return data ? rowToSaved(data as AnalysisRow) : null;
  }

  async save(input: SaveAnalysisInput): Promise<SavedAnalysis> {
    const user = { id: this.actorId };
    const fields = writeFields(input, user.id);
    const query = input.id
      ? this.supabase.from("tool_acm_analyses").update(fields).eq("id", input.id)
      : this.supabase.from("tool_acm_analyses").insert(fields);
    const { data, error } = await query.select(DETAIL_COLUMNS).single();
    if (error || !data) throw persistenceFailure();
    return rowToSaved(data as AnalysisRow);
  }

  async duplicate(id: string): Promise<SavedAnalysis> {
    const source = await this.get(id);
    if (!source) throw new AnalysisPersistenceError("L’analyse à dupliquer est introuvable.");
    return this.save({ title: `Copie de ${source.title}`, status: "draft", snapshot: source.snapshot });
  }

  async setStatus(id: string, status: AnalysisStatus): Promise<AnalysisSummary> {
    
    const { data, error } = await this.supabase.from("tool_acm_analyses").update({ status }).eq("id", id).select(SUMMARY_COLUMNS).single();
    if (error || !data) throw persistenceFailure();
    return rowToSummary(data as AnalysisRow);
  }

  async delete(id: string): Promise<void> {
    const { data, error } = await this.supabase
      .from("tool_acm_analyses")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new AnalysisPersistenceError("Impossible de supprimer l’analyse pour le moment.");
  }
}

