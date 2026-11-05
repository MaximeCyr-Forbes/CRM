import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisSummary, SaveAnalysisInput } from "../../types";
import { assignPropertyPosition, createCmaWorkspaceState } from "../comparables";
import { generateEmailDraft } from "../emails";
import { createReportFixture } from "../reports/report-test-fixtures";
import { scheduleDebouncedTask } from "./autosave";
import { MemoryAnalysisRepository } from "./memory-repository";
import {
  createAnalysisSnapshot,
  deserializeAnalysisSnapshot,
  filterAndSortAnalyses,
} from "./serialization";
import { createValidatedGoogleLocation } from "@/app/lib/tools/acm/features/maps/geocoding";

function analysisInput(overrides: Partial<SaveAnalysisInput> = {}): SaveAnalysisInput {
  const report = createReportFixture({ comparableCount: 2 });
  const properties = [report.subject, ...report.comparables.map(({ property }) => property)];
  const workspaceState = createCmaWorkspaceState(properties.map(({ id }) => id));
  workspaceState.adjustmentsByPropertyId = Object.fromEntries(report.comparables.map(({ property, analysis }) => [property.id, analysis.adjustments]));
  workspaceState.opinion = report.opinion;
  workspaceState.emailDraft = generateEmailDraft(report, { firstName: "Élodie", lastName: "Côté", email: "elodie@example.com" });
  return {
    title: "373 4e Avenue, Deux-Montagnes",
    status: "draft",
    snapshot: createAnalysisSnapshot(properties, workspaceState),
    ...overrides,
  };
}

function summary(overrides: Partial<AnalysisSummary> = {}): AnalysisSummary {
  return {
    id: "a",
    title: "ACM",
    status: "draft",
    subjectAddress: "373 4e Avenue",
    subjectCity: "Deux-Montagnes",
    clientFirstName: "Élodie",
    clientLastName: "Côté",
    comparableCount: 2,
    createdAt: "2026-08-28T10:00:00.000Z",
    updatedAt: "2026-08-29T10:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

describe("persistance des analyses", () => {
  it("crée et sauvegarde une analyse avec ses métadonnées de liste", async () => {
    const repository = new MemoryAnalysisRepository(() => new Date("2026-08-29T12:00:00Z"), () => "analysis-1");
    const saved = await repository.save(analysisInput());
    expect(saved).toMatchObject({ id: "analysis-1", status: "draft", subjectAddress: "373 4e Avenue", comparableCount: 2 });
    expect((await repository.list())[0]).not.toHaveProperty("snapshot");
  });

  it("modifie une analyse existante sans changer son identifiant", async () => {
    const dates = [new Date("2026-08-29T12:00:00Z"), new Date("2026-08-29T12:05:00Z")];
    const repository = new MemoryAnalysisRepository(() => dates.shift()!, () => "analysis-1");
    const first = await repository.save(analysisInput());
    const updated = await repository.save(analysisInput({ id: first.id, title: "Titre révisé" }));
    expect(updated.id).toBe(first.id);
    expect(updated.title).toBe("Titre révisé");
    expect(updated.createdAt).toBe(first.createdAt);
    expect(updated.updatedAt).not.toBe(first.updatedAt);
  });

  it("charge une analyse complète sans perte de données métier", async () => {
    const repository = new MemoryAnalysisRepository(() => new Date("2026-08-29T12:00:00Z"), () => "analysis-1");
    const input = analysisInput();
    const saved = await repository.save(input);
    const loaded = await repository.get(saved.id);
    expect(loaded?.snapshot).toEqual(input.snapshot);
    expect(loaded?.snapshot.workspaceState.emailDraft.body).toContain("Bonjour Élodie,");
    expect(loaded?.snapshot.workspaceState.adjustmentsByPropertyId).toEqual(input.snapshot.workspaceState.adjustmentsByPropertyId);
  });

  it("conserve les coordonnées cartographiques après sauvegarde et rechargement", async () => {
    const repository = new MemoryAnalysisRepository(() => new Date("2026-08-29T12:00:00Z"), () => "analysis-map");
    const input = analysisInput();
    Object.assign(input.snapshot.properties[0].data, createValidatedGoogleLocation(
      { address: input.snapshot.properties[0].data.address!, city: input.snapshot.properties[0].data.city },
      { coordinates: { latitude: 45.5364, longitude: -73.8907 }, formattedAddress: "Sujet, QC, Canada", placeId: "place-subject" },
      "Sujet, QC, Canada",
      "2026-09-01T13:00:00.000Z",
    ));
    Object.assign(input.snapshot.properties[1].data, createValidatedGoogleLocation(
      { address: input.snapshot.properties[1].data.address!, city: input.snapshot.properties[1].data.city },
      { coordinates: { latitude: 45.5412, longitude: -73.8781 }, formattedAddress: "Comparable, QC, Canada", placeId: "place-comparable" },
      "Comparable, QC, Canada",
      "2026-09-01T13:00:00.000Z",
    ));

    const saved = await repository.save(input);
    const loaded = await repository.get(saved.id);

    expect(loaded?.snapshot.properties.map(({ data }) => data.geo)).toEqual(
      input.snapshot.properties.map(({ data }) => data.geo),
    );
  });

  it("conserve le préparateur et migre les anciennes analyses vers Maxime", async () => {
    const repository = new MemoryAnalysisRepository(() => new Date("2026-08-29T12:00:00Z"), () => "analysis-preparer");
    const input = analysisInput();
    input.snapshot.workspaceState.preparedBy = "sandrine";
    const saved = await repository.save(input);
    expect((await repository.get(saved.id))?.snapshot.workspaceState.preparedBy).toBe("sandrine");

    const legacy = JSON.parse(JSON.stringify(input.snapshot));
    delete legacy.workspaceState.preparedBy;
    expect(deserializeAnalysisSnapshot(legacy).workspaceState.preparedBy).toBe("maxime");
  });

  it("conserve le sujet et l’ordre permuté des comparables après sauvegarde et rechargement", async () => {
    const repository = new MemoryAnalysisRepository(() => new Date("2026-08-29T12:00:00Z"), () => "analysis-order");
    const input = analysisInput();
    const initialSelection = input.snapshot.workspaceState.selection;
    const withNewSubject = assignPropertyPosition(initialSelection, initialSelection.comparableIds[1], 0);
    input.snapshot.workspaceState.selection = assignPropertyPosition(withNewSubject, withNewSubject.comparableIds[1], 1);

    const saved = await repository.save(input);
    const loaded = await repository.get(saved.id);

    expect(loaded?.snapshot.workspaceState.selection).toEqual(input.snapshot.workspaceState.selection);
    expect(loaded?.snapshot.workspaceState.selection.subjectId).toBe("comparable-2");
    expect(loaded?.snapshot.workspaceState.selection.comparableIds).toEqual(["subject", "comparable-1"]);
  });

  it("duplique avec un nouvel identifiant, une nouvelle date et le statut draft", async () => {
    const ids = ["analysis-1", "analysis-2"];
    const dates = [new Date("2026-08-29T12:00:00Z"), new Date("2026-08-30T12:00:00Z")];
    const repository = new MemoryAnalysisRepository(() => dates.shift()!, () => ids.shift()!);
    const original = await repository.save(analysisInput({ status: "completed" }));
    const copy = await repository.duplicate(original.id);
    expect(copy).toMatchObject({ id: "analysis-2", title: `Copie de ${original.title}`, status: "draft" });
    expect(copy.createdAt).not.toBe(original.createdAt);
    expect(copy.snapshot).toEqual(original.snapshot);
  });

  it("archive puis restaure sans supprimer", async () => {
    const repository = new MemoryAnalysisRepository(() => new Date("2026-08-29T12:00:00Z"), () => "analysis-1");
    const saved = await repository.save(analysisInput());
    expect((await repository.setStatus(saved.id, "archived")).status).toBe("archived");
    expect(await repository.get(saved.id)).not.toBeNull();
    expect((await repository.setStatus(saved.id, "draft")).status).toBe("draft");
  });

  it.each(["draft", "completed", "archived"] as const)("supprime définitivement une analyse %s", async (status) => {
    const repository = new MemoryAnalysisRepository(() => new Date("2026-08-29T12:00:00Z"), () => `analysis-${status}`);
    const saved = await repository.save(analysisInput({ status }));
    await repository.delete(saved.id);
    expect(await repository.get(saved.id)).toBeNull();
    expect(await repository.list()).toEqual([]);
  });

  it("conserve l’analyse si la suppression échoue", async () => {
    const repository = new MemoryAnalysisRepository(() => new Date("2026-08-29T12:00:00Z"), () => "analysis-1");
    const saved = await repository.save(analysisInput());
    repository.simulateNextDeleteFailure();
    await expect(repository.delete(saved.id)).rejects.toThrow("Impossible de supprimer l’analyse pour le moment.");
    expect(await repository.get(saved.id)).not.toBeNull();
  });

  it("recherche par adresse, ville, prénom et nom", () => {
    const analyses = [summary(), summary({ id: "b", subjectAddress: "10 Rue Principale", subjectCity: "Mirabel", clientFirstName: "Marc", clientLastName: "Roy" })];
    expect(filterAndSortAnalyses(analyses, "4e avenue", "all", "recent").map(({ id }) => id)).toEqual(["a"]);
    expect(filterAndSortAnalyses(analyses, "mirabel", "all", "recent").map(({ id }) => id)).toEqual(["b"]);
    expect(filterAndSortAnalyses(analyses, "élodie", "all", "recent").map(({ id }) => id)).toEqual(["a"]);
    expect(filterAndSortAnalyses(analyses, "roy", "all", "recent").map(({ id }) => id)).toEqual(["b"]);
  });

  it("filtre les statuts et trie les résultats", () => {
    const analyses = [summary(), summary({ id: "b", status: "archived", subjectAddress: "10 Rue Principale", updatedAt: "2026-08-27T10:00:00.000Z" })];
    expect(filterAndSortAnalyses(analyses, "", "archived", "recent").map(({ id }) => id)).toEqual(["b"]);
    expect(filterAndSortAnalyses(analyses, "", "all", "oldest").map(({ id }) => id)).toEqual(["b", "a"]);
    expect(filterAndSortAnalyses(analyses, "", "all", "address").map(({ id }) => id)).toEqual(["b", "a"]);
  });

  it("conserve l’absence de valeur recommandée", async () => {
    const repository = new MemoryAnalysisRepository(() => new Date("2026-08-29T12:00:00Z"), () => "analysis-1");
    const input = analysisInput();
    input.snapshot.workspaceState.opinion.recommendedValue = undefined;
    const saved = await repository.save(input);
    expect(saved.recommendedValue).toBeUndefined();
    expect((await repository.get(saved.id))?.snapshot.workspaceState.opinion.recommendedValue).toBeUndefined();
  });

  it("signale une erreur de sauvegarde sans perdre l’entrée", async () => {
    const repository = new MemoryAnalysisRepository();
    repository.simulateNextSaveFailure();
    await expect(repository.save(analysisInput())).rejects.toThrow("Vos modifications sont toujours présentes dans cette session");
  });

  it("sérialise et désérialise une ACM complète", () => {
    const snapshot = analysisInput().snapshot;
    expect(deserializeAnalysisSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(() => deserializeAnalysisSnapshot({ schemaVersion: 2 })).toThrow("invalides");
  });

  it("déclenche l’autosave une seule fois après le debounce", () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const cancelFirst = scheduleDebouncedTask(save, 2_500);
    cancelFirst();
    scheduleDebouncedTask(save, 2_500);
    vi.advanceTimersByTime(2_499);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
