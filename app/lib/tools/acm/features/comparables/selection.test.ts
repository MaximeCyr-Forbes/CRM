import { describe, expect, it } from "vitest";
import {
  assignPropertyPosition,
  changeSubject,
  createComparisonSelection,
  excludeComparable,
  getIncludedPropertyIds,
  moveComparable,
  reinstateComparable,
} from "./selection";

describe("sélection des propriétés de l'ACM", () => {
  it("choisit la première propriété comme sujet initial", () => {
    expect(createComparisonSelection(["a", "b", "c"])).toEqual({
      subjectId: "a",
      comparableIds: ["b", "c"],
      excludedIds: [],
    });
  });

  it("remet l'ancien sujet parmi les comparables lors d'un changement", () => {
    const selection = createComparisonSelection(["a", "b", "c"]);
    expect(changeSubject(selection, "c")).toEqual({ subjectId: "c", comparableIds: ["b", "a"], excludedIds: [] });
  });

  it("réintègre automatiquement un comparable exclu choisi comme sujet", () => {
    const selection = { subjectId: "a", comparableIds: ["b"], excludedIds: ["c"] };
    expect(changeSubject(selection, "c")).toEqual({ subjectId: "c", comparableIds: ["a", "b"], excludedIds: [] });
  });

  it("exclut puis réintègre un comparable à la fin", () => {
    const excluded = excludeComparable(createComparisonSelection(["a", "b", "c"]), "b");
    expect(excluded).toEqual({ subjectId: "a", comparableIds: ["c"], excludedIds: ["b"] });
    expect(reinstateComparable(excluded, "b").comparableIds).toEqual(["c", "b"]);
  });

  it("réordonne les comparables sans déplacer le sujet", () => {
    const selection = createComparisonSelection(["a", "b", "c", "d"]);
    expect(moveComparable(selection, "c", -1).comparableIds).toEqual(["c", "b", "d"]);
    expect(moveComparable(selection, "c", 1).comparableIds).toEqual(["b", "d", "c"]);
  });

  it("échange le sujet avec Comparable 1 dans les deux sens", () => {
    const selection = createComparisonSelection(["subject", "comparable-1", "comparable-2"]);
    const subjectToComparable = assignPropertyPosition(selection, "subject", 1);
    expect(subjectToComparable).toEqual({
      subjectId: "comparable-1",
      comparableIds: ["subject", "comparable-2"],
      excludedIds: [],
    });
    expect(assignPropertyPosition(selection, "comparable-1", 0)).toEqual(subjectToComparable);
  });

  it("échange Comparable 2 avec Comparable 1 sans doublon", () => {
    const swapped = assignPropertyPosition(createComparisonSelection(["subject", "one", "two"]), "two", 1);
    expect(swapped).toEqual({ subjectId: "subject", comparableIds: ["two", "one"], excludedIds: [] });
    expect(new Set(getIncludedPropertyIds(swapped)).size).toBe(3);
  });

  it("réattribue directement une position parmi cinq propriétés", () => {
    const selection = createComparisonSelection(["subject", "one", "two", "three", "four"]);
    expect(assignPropertyPosition(selection, "four", 1).comparableIds).toEqual(["four", "two", "three", "one"]);
    expect(assignPropertyPosition(selection, "one", 4).comparableIds).toEqual(["four", "two", "three", "one"]);
  });

  it.each(["centris", "jlr", "manual"])("attribue une position indépendamment de la provenance %s", (sourceType) => {
    const selection = createComparisonSelection(["subject", `${sourceType}-property`, "other"]);
    expect(assignPropertyPosition(selection, `${sourceType}-property`, 0).subjectId).toBe(`${sourceType}-property`);
  });
});
