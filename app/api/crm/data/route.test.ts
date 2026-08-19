import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TestNote = {
  id: string;
  contact_id: string;
  content: string;
  created_at: string;
};

const testState = vi.hoisted(() => ({
  contactRows: Array.from({ length: 702 }, (_, index) => ({
    id: `contact-${index + 1}`,
    first_name: `Contact ${index + 1}`,
    civic_number: String(index + 1),
    address: "rue Principale",
    apartment: "",
    city: "Deux-Montagnes",
    province: "QC",
    postal_code: "J7R 1A1",
    country: "Canada",
  })),
  notes: [] as TestNote[],
  deletedNoteIds: [] as string[],
  lastContactDates: {} as Record<string, string | null>,
}));

vi.mock("../../../lib/crm-access", () => ({
  requireApiAccess: vi.fn(async () => ({ response: null })),
}));

vi.mock("../../../lib/supabase/server", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: (table: string) => {
      if (table === "contacts") {
        return {
          select: () => ({
            order: async () => ({ data: testState.contactRows, error: null }),
          }),
          update: (values: { last_contact_date: string | null }) => ({
            eq: async (_field: string, contactId: string) => {
              testState.lastContactDates[contactId] = values.last_contact_date;
              return { error: null };
            },
          }),
        };
      }
      if (table === "contact_addresses") {
        return {
          select: () => ({
            in: async () => ({
              data: null,
              error: new Error("panne simulée de contact_addresses"),
            }),
          }),
        };
      }
      if (table === "client_notes") {
        return {
          select: () => ({
            eq: (field: string, value: string) => {
              const matchingNotes = testState.notes.filter((note) => note[field as keyof TestNote] === value);
              return {
                single: async () => ({
                  data: matchingNotes[0] ?? null,
                  error: matchingNotes.length > 0 ? null : new Error("Note introuvable"),
                }),
                order: () => ({
                  limit: async (limit: number) => ({
                    data: [...matchingNotes]
                      .sort((first, second) => second.created_at.localeCompare(first.created_at))
                      .slice(0, limit),
                    error: null,
                  }),
                }),
              };
            },
          }),
          delete: () => ({
            eq: async (_field: string, noteId: string) => {
              testState.deletedNoteIds.push(noteId);
              testState.notes = testState.notes.filter((note) => note.id !== noteId);
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`Table inattendue dans le test: ${table}`);
    },
  })),
}));

import { GET, POST } from "./route";

const note10: TestNote = { id: "note-10", contact_id: "contact-1", content: "Note du 10 août", created_at: "2026-08-10T13:00:00.000Z" };
const note15: TestNote = { id: "note-15", contact_id: "contact-1", content: "Note du 15 août", created_at: "2026-08-15T13:00:00.000Z" };
const note19: TestNote = { id: "note-19", contact_id: "contact-1", content: "Note du 19 août", created_at: "2026-08-19T13:00:00.000Z" };

function deleteNoteRequest(noteId: unknown) {
  return POST(new Request("http://localhost/api/crm/data", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ action: "deleteNote", noteId }),
  }));
}

describe("GET resource=contacts", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retourne 702 contacts avec statut 200 si l’historique des adresses échoue", async () => {
    const serverLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new Request("http://localhost/api/crm/data?resource=contacts"));
    const payload = await response.json() as { data: typeof testState.contactRows };

    expect(response.status).toBe(200);
    expect(payload.data).toHaveLength(702);
    expect(payload.data[0]).toMatchObject({
      civic_number: "1",
      address: "rue Principale",
      city: "Deux-Montagnes",
    });
    expect(serverLog).toHaveBeenCalledWith(
      "Chargement de l'historique des adresses impossible:",
      "panne simulée de contact_addresses",
    );
  });
});

describe("POST action=deleteNote", () => {
  beforeEach(() => {
    testState.notes = [note10, note15, note19];
    testState.deletedNoteIds = [];
    testState.lastContactDates = {};
  });

  it("supprime uniquement une note intermédiaire et conserve le dernier contact le plus récent", async () => {
    const response = await deleteNoteRequest(note15.id);
    const payload = await response.json() as { data: { noteId: string; contactId: string; lastContactDate: string | null } };

    expect(response.status).toBe(200);
    expect(testState.deletedNoteIds).toEqual([note15.id]);
    expect(testState.notes.map((note) => note.id)).toEqual([note10.id, note19.id]);
    expect(testState.contactRows).toHaveLength(702);
    expect(testState.lastContactDates["contact-1"]).toBe(note19.created_at);
    expect(payload.data).toEqual({ noteId: note15.id, contactId: "contact-1", lastContactDate: note19.created_at });
  });

  it("recalcule le dernier contact quand la note la plus récente est supprimée", async () => {
    const response = await deleteNoteRequest(note19.id);
    const payload = await response.json() as { data: { lastContactDate: string | null } };

    expect(response.status).toBe(200);
    expect(testState.lastContactDates["contact-1"]).toBe(note15.created_at);
    expect(payload.data.lastContactDate).toBe(note15.created_at);
  });

  it("remet le dernier contact à null quand la dernière note est supprimée", async () => {
    testState.notes = [note10];

    const response = await deleteNoteRequest(note10.id);
    const payload = await response.json() as { data: { lastContactDate: string | null } };

    expect(response.status).toBe(200);
    expect(testState.notes).toEqual([]);
    expect(testState.lastContactDates["contact-1"]).toBeNull();
    expect(payload.data.lastContactDate).toBeNull();
  });

  it("refuse un identifiant de note vide sans supprimer de donnée", async () => {
    const response = await deleteNoteRequest("  ");

    expect(response.status).toBe(400);
    expect(testState.deletedNoteIds).toEqual([]);
    expect(testState.notes).toHaveLength(3);
    expect(testState.contactRows).toHaveLength(702);
  });
});
