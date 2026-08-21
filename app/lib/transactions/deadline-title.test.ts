import { describe, expect, it } from "vitest";
import {
  deadlineTitleEditorState,
  deadlineTitleFromChoice,
  OTHER_CONDITIONS_TITLE,
  showOtherConditionField,
} from "./deadline-title";

describe("titre des échéances Autres conditions", () => {
  it("compose le titre complet avec un tiret cadratin", () => {
    expect(deadlineTitleFromChoice(OTHER_CONDITIONS_TITLE, "", "Vente de la propriété"))
      .toBe("Autres conditions — Vente de la propriété");
  });

  it.each(["", "   "])("refuse une condition vide %#", (condition) => {
    expect(deadlineTitleFromChoice(OTHER_CONDITIONS_TITLE, "", condition)).toBeNull();
  });

  it("reconnaît et préremplit une échéance détaillée existante", () => {
    expect(deadlineTitleEditorState("Autres conditions — Vente de la propriété")).toEqual({
      choice: OTHER_CONDITIONS_TITLE,
      customTitle: "",
      otherConditionTitle: "Vente de la propriété",
    });
  });

  it("reconnaît une ancienne échéance Autres conditions sans précision", () => {
    expect(deadlineTitleEditorState("Autres conditions")).toEqual({
      choice: OTHER_CONDITIONS_TITLE,
      customTitle: "",
      otherConditionTitle: "",
    });
  });

  it("n’affiche le champ dédié ni pour Inspection ni pour Titre personnalisé", () => {
    expect(showOtherConditionField("Inspection")).toBe(false);
    expect(showOtherConditionField("custom")).toBe(false);
    expect(showOtherConditionField(OTHER_CONDITIONS_TITLE)).toBe(true);
  });

  it("conserve le fonctionnement du titre personnalisé", () => {
    expect(deadlineTitleEditorState("Réception des clés")).toEqual({
      choice: "custom",
      customTitle: "Réception des clés",
      otherConditionTitle: "",
    });
    expect(deadlineTitleFromChoice("custom", "  Réception des clés  ", "Ignoré"))
      .toBe("Réception des clés");
  });
});
