import { SavedAnalysisEditor } from "@/app/lib/tools/acm/features/analyses/components/saved-analysis-editor";

export default async function SavedAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="acm-tool-content">
      <main><SavedAnalysisEditor analysisId={id} /></main>
    </div>
  );
}
