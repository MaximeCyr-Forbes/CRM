"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowRight, Copy, LoaderCircle, RotateCcw, Search, Trash2 } from "lucide-react";
import type { AnalysisSort, AnalysisStatus, AnalysisStatusFilter, AnalysisSummary, PropertyCategory } from "../../../types";
import { PROPERTY_CATEGORY_LABELS } from "../../../lib/constants/property-categories";
import { getAnalysisRepository } from "../repository-factory";
import { filterAndSortAnalyses } from "../serialization";
import { DeleteAnalysisConfirmation } from "./delete-analysis-confirmation";

const STATUS_LABELS: Record<AnalysisStatus, string> = { draft: "Brouillon", completed: "Terminée", archived: "Archivée" };
const FILTERS: Array<{ value: AnalysisStatusFilter; label: string }> = [
  { value: "all", label: "Toutes" },
  { value: "draft", label: "Brouillons" },
  { value: "completed", label: "Terminées" },
  { value: "archived", label: "Archivées" },
];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatCurrency(value?: number): string {
  return value === undefined ? "Non précisée" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value);
}

export function AnalysisHistory() {
  const router = useRouter();
  const repository = useMemo(() => getAnalysisRepository(), []);
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AnalysisStatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | PropertyCategory>("all");
  const [sort, setSort] = useState<AnalysisSort>("recent");
  const [pendingArchiveId, setPendingArchiveId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AnalysisSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    repository.list().then((items) => {
      if (active) setAnalyses(items);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Impossible de charger les analyses.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [repository]);

  const visibleAnalyses = filterAndSortAnalyses(analyses, query, statusFilter, sort, categoryFilter);

  async function duplicateAnalysis(id: string) {
    setBusyId(id);
    try {
      const duplicated = await repository.duplicate(id);
      router.push(`/logiciels/generateur-acm/analyses/${duplicated.id}`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Impossible de dupliquer l’analyse.");
      setBusyId(null);
    }
  }

  async function updateStatus(id: string, status: AnalysisStatus) {
    setBusyId(id);
    try {
      const updated = await repository.setStatus(id, status);
      setAnalyses((current) => current.map((analysis) => analysis.id === id ? updated : analysis));
      setPendingArchiveId(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Impossible de modifier l’analyse.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAnalysis() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      await repository.delete(id);
      setAnalyses((current) => current.filter((analysis) => analysis.id !== id));
      setPendingDelete(null);
      setNotice("Analyse supprimée");
    } catch {
      setError("Impossible de supprimer l’analyse pour le moment.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="analysis-history-state"><LoaderCircle className="spin" size={22} /> Chargement des analyses…</div>;

  return (
    <section className="analysis-history" aria-labelledby="analysis-history-title">
      <header className="analysis-history__header">
        <div>
          <span className="property-results__eyebrow">Historique ACM</span>
          <h1 id="analysis-history-title">Mes analyses</h1>
          <p>Retrouvez, ouvrez et poursuivez vos analyses sauvegardées.</p>
        </div>
        <Link className="primary-button" href="/logiciels/generateur-acm">Créer une nouvelle ACM <ArrowRight size={15} /></Link>
      </header>

      <div className="analysis-history__toolbar">
        <label className="analysis-history__search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une analyse" />
        </label>
        <div className="analysis-history__filters" aria-label="Filtrer par statut">
          {FILTERS.map((filter) => <button key={filter.value} className={statusFilter === filter.value ? "active" : ""} type="button" onClick={() => setStatusFilter(filter.value)}>{filter.label}</button>)}
        </div>
        <select aria-label="Filtrer par type de propriété" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as "all" | PropertyCategory)}>
          <option value="all">Tous les types</option>
          {Object.entries(PROPERTY_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Trier les analyses" value={sort} onChange={(event) => setSort(event.target.value as AnalysisSort)}>
          <option value="recent">Plus récentes</option>
          <option value="oldest">Plus anciennes</option>
          <option value="address">Adresse A–Z</option>
        </select>
      </div>

      {error && <div className="analysis-history__error" role="alert">{error}</div>}
      {notice && <div className="analysis-history__notice" role="status">{notice}</div>}

      {!error && visibleAnalyses.length === 0 ? (
        <div className="analysis-history__empty">
          <strong>{analyses.length === 0 ? "Aucune analyse sauvegardée" : "Aucune analyse ne correspond à votre recherche"}</strong>
          <span>Créez une ACM ou modifiez les filtres affichés.</span>
          {analyses.length === 0 && <Link className="primary-button primary-button--compact" href="/logiciels/generateur-acm">Créer une nouvelle ACM</Link>}
        </div>
      ) : (
        <div className="analysis-history__grid">
          {visibleAnalyses.map((analysis) => (
            <article className="analysis-history-card" key={analysis.id}>
              <div className="analysis-history-card__topline">
                <span className={`analysis-status analysis-status--${analysis.status}`}>{STATUS_LABELS[analysis.status]}</span>
                <small>Modifiée {formatDate(analysis.updatedAt)}</small>
              </div>
              <h2>{analysis.subjectAddress ?? analysis.title}</h2>
              <p>{[analysis.subjectCity, analysis.propertyCategory ? PROPERTY_CATEGORY_LABELS[analysis.propertyCategory] : null].filter(Boolean).join(" · ") || "Détails à compléter"}</p>
              <dl>
                <div><dt>Client</dt><dd>{[analysis.clientFirstName, analysis.clientLastName].filter(Boolean).join(" ") || "Non précisé"}</dd></div>
                <div><dt>Valeur recommandée</dt><dd>{formatCurrency(analysis.recommendedValue)}</dd></div>
                <div><dt>Comparables</dt><dd>{analysis.comparableCount}</dd></div>
                <div><dt>Créée</dt><dd>{formatDate(analysis.createdAt)}</dd></div>
              </dl>
              {pendingArchiveId === analysis.id ? (
                <div className="analysis-history-card__confirm" role="alert">
                  <span>Archiver sans supprimer?</span>
                  <button type="button" onClick={() => setPendingArchiveId(null)}>Annuler</button>
                  <button type="button" onClick={() => void updateStatus(analysis.id, "archived")}>Confirmer</button>
                </div>
              ) : (
                <div className="analysis-history-card__actions">
                  <Link href={`/logiciels/generateur-acm/analyses/${analysis.id}`}>Ouvrir <ArrowRight size={14} /></Link>
                  <button type="button" disabled={busyId === analysis.id} onClick={() => void duplicateAnalysis(analysis.id)}><Copy size={14} /> Dupliquer</button>
                  {analysis.status === "archived"
                    ? <button type="button" disabled={busyId === analysis.id} onClick={() => void updateStatus(analysis.id, "draft")}><RotateCcw size={14} /> Restaurer</button>
                    : <button type="button" disabled={busyId === analysis.id} onClick={() => setPendingArchiveId(analysis.id)}><Archive size={14} /> Archiver</button>}
                  <button className="analysis-history-card__delete" type="button" disabled={busyId === analysis.id} onClick={() => {
                    setError("");
                    setNotice("");
                    setPendingDelete(analysis);
                  }}><Trash2 size={14} /> Supprimer</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {pendingDelete && (
        <DeleteAnalysisConfirmation
          analysisLabel={pendingDelete.subjectAddress ?? pendingDelete.title}
          busy={busyId === pendingDelete.id}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void deleteAnalysis()}
        />
      )}
    </section>
  );
}
