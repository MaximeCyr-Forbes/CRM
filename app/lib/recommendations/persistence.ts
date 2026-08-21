import {
  mapRecommendationRow,
  sortRecommendations,
  type CRMRecommendation,
  type CRMRecommendationDraft,
  type CRMRecommendationRow,
} from "../../data/recommendation-types";
import { getSupabaseAdmin } from "../supabase/server";

const recommendationColumns = "id, title, content, submitted_by, status, created_at, opened_at, opened_by";

export async function listRecommendations(): Promise<CRMRecommendation[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("crm_recommendations")
    .select(recommendationColumns)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return sortRecommendations((data ?? []).map((row) => mapRecommendationRow(row as CRMRecommendationRow)));
}

export async function createRecommendation(draft: CRMRecommendationDraft): Promise<CRMRecommendation> {
  const { data, error } = await getSupabaseAdmin()
    .from("crm_recommendations")
    .insert({
      title: draft.title,
      content: draft.content,
      submitted_by: draft.submittedBy,
    })
    .select(recommendationColumns)
    .single();
  if (error) throw error;
  return mapRecommendationRow(data as CRMRecommendationRow);
}

export async function markRecommendationRead(recommendationId: string): Promise<CRMRecommendation | null> {
  const admin = getSupabaseAdmin();
  const openedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("crm_recommendations")
    .update({ status: "read", opened_at: openedAt, opened_by: "maxime" })
    .eq("id", recommendationId)
    .eq("status", "unread")
    .select(recommendationColumns)
    .maybeSingle();
  if (error) throw error;
  if (data) return mapRecommendationRow(data as CRMRecommendationRow);

  const { data: existing, error: existingError } = await admin
    .from("crm_recommendations")
    .select(recommendationColumns)
    .eq("id", recommendationId)
    .maybeSingle();
  if (existingError) throw existingError;
  return existing ? mapRecommendationRow(existing as CRMRecommendationRow) : null;
}

export async function deleteRecommendation(recommendationId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("crm_recommendations")
    .delete()
    .eq("id", recommendationId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
