import { DEADLINE_PRESETS } from "../../data/transaction-types";

export const OTHER_CONDITIONS_TITLE = "Autres conditions";
export const OTHER_CONDITIONS_PREFIX = `${OTHER_CONDITIONS_TITLE} — `;

export type DeadlineTitleEditorState = {
  choice: string;
  customTitle: string;
  otherConditionTitle: string;
};

export function deadlineTitleEditorState(initialTitle?: string): DeadlineTitleEditorState {
  if (!initialTitle) {
    return { choice: DEADLINE_PRESETS[0], customTitle: "", otherConditionTitle: "" };
  }
  if (initialTitle === OTHER_CONDITIONS_TITLE) {
    return { choice: OTHER_CONDITIONS_TITLE, customTitle: "", otherConditionTitle: "" };
  }
  if (initialTitle.startsWith(OTHER_CONDITIONS_PREFIX)) {
    return {
      choice: OTHER_CONDITIONS_TITLE,
      customTitle: "",
      otherConditionTitle: initialTitle.slice(OTHER_CONDITIONS_PREFIX.length).trim(),
    };
  }
  if (DEADLINE_PRESETS.includes(initialTitle as (typeof DEADLINE_PRESETS)[number])) {
    return { choice: initialTitle, customTitle: "", otherConditionTitle: "" };
  }
  return { choice: "custom", customTitle: initialTitle, otherConditionTitle: "" };
}

export function showOtherConditionField(choice: string) {
  return choice === OTHER_CONDITIONS_TITLE;
}

export function deadlineTitleFromChoice(
  choice: string,
  customTitle: string,
  otherConditionTitle: string,
) {
  if (showOtherConditionField(choice)) {
    const condition = otherConditionTitle.trim();
    return condition ? `${OTHER_CONDITIONS_PREFIX}${condition}` : null;
  }
  if (choice === "custom") return customTitle.trim() || null;
  return choice.trim() || null;
}
