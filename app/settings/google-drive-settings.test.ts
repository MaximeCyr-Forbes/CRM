import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("interface Google Drive dans Paramètres", () => {
  it("ouvre Google Picker uniquement pour des dossiers, y compris les Shared Drives", () => {
    const picker = source("app/lib/google-drive/picker-client.ts");
    expect(picker).toContain("myDriveView");
    expect(picker).toContain("sharedDrivesView");
    expect(picker).toContain(".addView(myDriveView)");
    expect(picker).toContain(".addView(sharedDrivesView)");
    expect(picker).toContain("setSelectFolderEnabled(true)");
    expect(picker).toContain("setIncludeFolders(true)");
    expect(picker).toContain("setEnableDrives(true)");
    expect(picker).toContain("GOOGLE_DRIVE_FOLDER_MIME_TYPE");
    expect(picker).not.toContain("UploadView");
  });

  it("utilise la connexion du courtier consulté et une clé Picker publique", () => {
    const component = source("app/components/settings-google-drive.tsx");
    const picker = source("app/lib/google-drive/picker-client.ts");
    expect(component).toContain("BROKER_KEYS[selectedBroker]");
    expect(picker).toContain("NEXT_PUBLIC_GOOGLE_PICKER_API_KEY");
    expect(picker).toContain("NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER");
    expect(component).toContain("capability=drive");
  });

  it("retire seulement la liaison CRM et ne contient aucune opération Drive destructive", () => {
    const component = source("app/components/settings-google-drive.tsx");
    const service = source("app/lib/google-drive/service.ts");
    expect(component).toContain("Son contenu Google Drive est inchangé.");
    expect(service).not.toMatch(/drive\/v3\/files\/.*(delete|trash)/i);
    expect(service).not.toContain('method: "POST"');
    expect(service).not.toContain('method: "PATCH"');
  });

  it("déclare une migration additive service_role seulement", () => {
    const migration = source("supabase/migrations/20260901120000_add_google_drive_roots.sql");
    expect(migration).toContain("create table if not exists public.google_drive_roots");
    expect(migration).toContain("unique (broker, folder_id)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.google_drive_roots from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on public.google_drive_roots to service_role");
    expect(migration).not.toMatch(/delete\s+from|truncate\s+table|drop\s+table/i);
  });
});
