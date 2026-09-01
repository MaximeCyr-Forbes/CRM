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

  it("révoque uniquement la permission CRM et ne contient aucune opération fichier destructive", () => {
    const component = source("app/components/settings-google-drive.tsx");
    const service = source("app/lib/google-drive/service.ts");
    expect(component).toContain("Le contenu restera intact.");
    expect(service).toContain("/permissions");
    expect(service).toContain('role: "reader"');
    expect(service).toContain('method: "DELETE"');
    expect(service).not.toMatch(/files\.(create|update|delete|copy)/i);
    expect(service).not.toContain('method: "PATCH"');
  });

  it("utilise un service account drive.readonly sans délégation de domaine", () => {
    const serviceAccount = source("app/lib/google-drive/service-account.ts");
    expect(serviceAccount).toContain("https://www.googleapis.com/auth/drive.readonly");
    expect(serviceAccount).toContain("GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL");
    expect(serviceAccount).toContain("GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY");
    expect(serviceAccount).not.toMatch(/domain.?wide|delegation|\bsub\s*:/i);
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

  it("ajoute uniquement l’identifiant de permission Google à la racine", () => {
    const migration = source("supabase/migrations/20260901173000_add_google_drive_root_permission.sql");
    expect(migration).toContain("add column if not exists google_permission_id text");
    expect(migration).not.toMatch(/delete\s+from|truncate\s+table|drop\s+table/i);
  });
});
