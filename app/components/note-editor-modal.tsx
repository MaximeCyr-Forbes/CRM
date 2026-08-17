"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

type NoteEditorModalProps = {
  contactName: string;
  initialContent?: string;
  isOpen: boolean;
  mode: "create" | "edit";
  onCancel: () => void;
  onSave: (content: string) => Promise<void>;
};

export function NoteEditorModal({
  contactName,
  initialContent = "",
  isOpen,
  mode,
  onCancel,
  onSave,
}: NoteEditorModalProps) {
  const textareaId = useId();
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  useDialogLifecycle(isOpen, onCancel);

  useEffect(() => {
    if (isOpen) {
      setContent(initialContent);
      setIsSaving(false);
    }
  }, [initialContent, isOpen]);

  if (!isOpen) {
    return null;
  }

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (content.trim()) {
      setIsSaving(true);
      try {
        await onSave(content.trim());
      } catch {
        setIsSaving(false);
      }
    }
  }

  return (
    <div className="contact-modal-backdrop contact-modal-top" onMouseDown={(event) => event.target === event.currentTarget && onCancel()} role="presentation">
      <section
        aria-labelledby="note-editor-title"
        aria-modal="true"
        className="contact-modal note-editor-modal"
        role="dialog"
      >
        <header className="contact-modal-header">
          <div>
            <p className="section-kicker">
              {mode === "create" ? "Nouvelle note" : "Historique client"}
            </p>
            <h2 id="note-editor-title">
              {mode === "create"
                ? `Ajouter une note — ${contactName}`
                : `Modifier la note — ${contactName}`}
            </h2>
          </div>
          <button aria-label="Fermer" onClick={onCancel} type="button">×</button>
        </header>

        <form className="note-editor-form" onSubmit={submitNote}>
          <label htmlFor={textareaId}>Note</label>
          <textarea
            autoFocus
            id={textareaId}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Écrivez les informations importantes de cet échange…"
            rows={8}
            value={content}
          />
          <div className="note-editor-actions">
            <button disabled={isSaving} onClick={onCancel} type="button">Annuler</button>
            <button disabled={!content.trim() || isSaving} type="submit">
              {isSaving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
