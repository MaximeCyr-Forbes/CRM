"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import type { ParsedProperty, PropertyData, SavedAnalysis } from "../../../types";
import type { CmaWorkspaceState } from "../../comparables";
import { CmaWorkspace } from "../../analysis/components/cma-workspace";
import { addManualPropertyToAnalysis, type ManualPropertyRole } from "../../analysis/manual-property";
import { MAX_FILES_PER_ANALYSIS } from "../../property-parser/constants";
import { parsePropertyFiles } from "../../property-import/parse-property-files";
import { addImportedComparable } from "../../property-import/imported-properties";
import { getAnalysisRepository } from "../repository-factory";

export function SavedAnalysisEditor({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const repository = useMemo(() => getAnalysisRepository(), []);
  const [analysis, setAnalysis] = useState<SavedAnalysis | null>(null);
  const [properties, setProperties] = useState<ParsedProperty[]>([]);
  const [workspaceState, setWorkspaceState] = useState<CmaWorkspaceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    repository.get(analysisId).then((saved) => {
      if (!active) return;
      if (!saved) {
        setError("Cette analyse est introuvable ou vous n’y avez pas accès.");
        return;
      }
      setAnalysis(saved);
      setProperties(saved.snapshot.properties);
      setWorkspaceState(saved.snapshot.workspaceState);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Impossible de charger cette analyse.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [analysisId, repository]);

  function updateProperty(id: string, data: PropertyData) {
    setProperties((current) => current.map((property) => property.id === id ? { ...property, data } : property));
  }

  function addManualProperty(data: PropertyData, role: ManualPropertyRole) {
    if (properties.length >= MAX_FILES_PER_ANALYSIS) return;
    const addition = addManualPropertyToAnalysis(properties, workspaceState, data, role);
    setProperties(addition.properties);
    setWorkspaceState(addition.workspaceState);
  }

  async function addComparableFiles(files: File[]) {
    const availableSlots = Math.max(0, MAX_FILES_PER_ANALYSIS - properties.length);
    if (availableSlots === 0) return { added: 0, errors: [`Une analyse accepte au maximum ${MAX_FILES_PER_ANALYSIS} propriétés.`] };
    const result = await parsePropertyFiles(files.slice(0, availableSlots));
    const existingIds = new Set(properties.map(({ id }) => id));
    const additions = result.properties.filter(({ id }) => !existingIds.has(id));
    setProperties((current) => [...current, ...additions]);
    setWorkspaceState((current) => current ? {
      ...current,
      selection: { ...current.selection, comparableIds: [...current.selection.comparableIds, ...additions.map(({ id }) => id)] },
    } : current);
    const overflowErrors = files.length > availableSlots ? [`Seulement ${availableSlots} fichier(s) pouvaient être ajoutés.`] : [];
    return { added: additions.length, errors: [...result.errors, ...overflowErrors] };
  }

  function addJlrComparable(property: ParsedProperty) {
    if (!workspaceState || properties.length >= MAX_FILES_PER_ANALYSIS) return;
    const addition = addImportedComparable(properties, workspaceState, property);
    setProperties(addition.properties);
    setWorkspaceState(addition.workspaceState);
  }

  if (loading) return <div className="analysis-history-state"><LoaderCircle className="spin" size={22} /> Chargement de l’analyse…</div>;
  if (error || !analysis || !workspaceState) {
    return <div className="analysis-load-error" role="alert"><strong>Impossible d’ouvrir l’analyse</strong><p>{error}</p><button className="secondary-button" type="button" onClick={() => router.push("/logiciels/generateur-acm/analyses")}>Retour aux analyses</button></div>;
  }

  return (
    <CmaWorkspace
      properties={properties}
      analysisState={workspaceState}
      initialAnalysis={analysis}
      onAnalysisStateChange={setWorkspaceState}
      onPropertyChange={updateProperty}
      onAddPropertyFiles={addComparableFiles}
      onAddManualProperty={addManualProperty}
      onAddJlrComparable={addJlrComparable}
      onBack={() => router.push("/logiciels/generateur-acm/analyses")}
    />
  );
}
