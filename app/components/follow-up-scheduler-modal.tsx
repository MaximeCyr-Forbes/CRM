"use client";

import { useEffect, useId, useState } from "react";
import { useFollowUps } from "../follow-up-context";
import type { CalendarSyncResult } from "../data/calendar-types";
import { toLocalISODate, type FollowUpPreset } from "../lib/follow-up";

const followUpOptions: ReadonlyArray<{
  directLabel: string;
  workflowLabel: string;
  preset: Exclude<FollowUpPreset, "custom" | "none">;
}> = [
  { directLabel: "Aujourd’hui", workflowLabel: "Aujourd’hui", preset: "today" },
  { directLabel: "Demain", workflowLabel: "Demain", preset: "tomorrow" },
  { directLabel: "Dans 3 jours", workflowLabel: "3 jours", preset: "three-days" },
  { directLabel: "Dans 1 semaine", workflowLabel: "1 semaine", preset: "one-week" },
  { directLabel: "Dans 1 mois", workflowLabel: "1 mois", preset: "one-month" },
];

type FollowUpSchedulerModalProps = {
  contactId: string;
  contactName: string;
  isOpen: boolean;
  mode?: "direct" | "after-note";
  onClose: () => void;
  onScheduled: (nextDate: string | null, calendarSync: CalendarSyncResult) => void;
};

export function FollowUpSchedulerModal({
  contactId,
  contactName,
  isOpen,
  mode = "direct",
  onClose,
  onScheduled,
}: FollowUpSchedulerModalProps) {
  const { scheduleFollowUp } = useFollowUps();
  const dateInputId = useId();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowDatePicker(false);
      setCustomDate("");
      setIsSaving(false);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  async function applyFollowUp(preset: FollowUpPreset, selectedDate?: string) {
    setIsSaving(true);
    try {
      const { nextDate, calendarSync } = await scheduleFollowUp(
        contactId,
        preset,
        selectedDate,
      );
      onScheduled(nextDate, calendarSync);
    } catch {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="follow-up-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-labelledby="follow-up-modal-title"
        aria-modal="true"
        className="follow-up-modal"
        role="dialog"
      >
        <header className="follow-up-modal-header">
          <div>
            <p className="section-kicker">
              {mode === "after-note" ? "Note enregistrée" : "Prochaine étape"}
            </p>
            <h2 id="follow-up-modal-title">
              {mode === "after-note"
                ? `QUAND VEUX-TU RELANCER ${contactName.toUpperCase()} ?`
                : `Relancer ${contactName}`}
            </h2>
          </div>
          <button
            aria-label="Fermer"
            className="close-follow-up-modal"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="follow-up-options">
          {followUpOptions.map((option) => (
            <button
              className="follow-up-option"
              disabled={isSaving}
              key={option.preset}
              onClick={() => void applyFollowUp(option.preset)}
              type="button"
            >
              <span>
                {mode === "after-note" ? option.workflowLabel : option.directLabel}
              </span>
              <span aria-hidden="true">→</span>
            </button>
          ))}
          <button
            className={`follow-up-option ${showDatePicker ? "follow-up-option-active" : ""}`}
            disabled={isSaving}
            onClick={() => setShowDatePicker(true)}
            type="button"
          >
            <span>Choisir une date</span>
            <span aria-hidden="true">＋</span>
          </button>
          <button
            className="follow-up-option follow-up-option-none"
            disabled={isSaving}
            onClick={() => void applyFollowUp("none")}
            type="button"
          >
            <span>Aucune relance</span>
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {showDatePicker && (
          <div className="custom-date-panel">
            <label htmlFor={dateInputId}>Date de la prochaine relance</label>
            <div>
              <input
                id={dateInputId}
                min={toLocalISODate(new Date())}
                onChange={(event) => setCustomDate(event.target.value)}
                type="date"
                value={customDate}
              />
              <button
                disabled={!customDate || isSaving}
                onClick={() => void applyFollowUp("custom", customDate)}
                type="button"
              >
                {isSaving ? "Enregistrement..." : "Programmer cette date"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
