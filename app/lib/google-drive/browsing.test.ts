import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleDriveRootRow } from "../../data/google-drive-types";

const rootId = "11111111-1111-4111-8111-111111111111";
const rootRow: GoogleDriveRootRow = {
  id: rootId,
  broker: "maxime",
  folder_id: "root_folder",
  folder_name: "Transactions",
  drive_id: "shared_drive",
  web_view_link: "https://drive.google.com/drive/folders/root_folder",
  google_permission_id: "permission_reader_1",
  created_at: "2026-09-01T12:00:00.000Z",
  updated_at: "2026-09-01T12:00:00.000Z",
};

const state = vi.hoisted(() => ({
  roots: [] as GoogleDriveRootRow[],
  requests: [] as Array<{ url: URL; method: string }>,
  handler: (_url: URL) => Response.json({}),
}));

vi.mock("../google/connection", () => ({
  getGoogleConnection: vi.fn(async () => ({
    broker: "maxime",
    google_account_email: "maxime@example.com",
    calendar_id: "primary",
    encrypted_access_token: "encrypted",
    encrypted_refresh_token: "encrypted-refresh",
    access_token_expires_at: "2026-09-01T15:00:00.000Z",
    scopes: ["openid", "email", "https://www.googleapis.com/auth/drive.file"],
  })),
  getGoogleAccessToken: vi.fn(async () => "token"),
  googleAuthenticatedRequest: vi.fn(async (_connection: unknown, rawUrl: string, init: RequestInit) => {
    const url = new URL(rawUrl);
    state.requests.push({ url, method: init.method ?? "GET" });
    return state.handler(url);
  }),
}));

vi.mock("./service-account", () => ({
  getGoogleDriveServiceAccountEmail: vi.fn(() => "drive-reader@example.iam.gserviceaccount.com"),
  serviceAccountGoogleDriveRequest: vi.fn(async (rawUrl: string, init: RequestInit) => {
    const url = new URL(rawUrl);
    state.requests.push({ url, method: init.method ?? "GET" });
    return state.handler(url);
  }),
}));

vi.mock("../supabase/server", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => {
      const filters = new Map<string, unknown>();
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          filters.set(column, value);
          return builder;
        }),
        maybeSingle: vi.fn(async () => ({
          data: state.roots.find((root) => (
            (!filters.has("id") || root.id === filters.get("id"))
            && (!filters.has("broker") || root.broker === filters.get("broker"))
          )) ?? null,
          error: null,
        })),
        order: vi.fn(async () => ({
          data: state.roots.filter((root) => !filters.has("broker") || root.broker === filters.get("broker")),
          error: null,
        })),
      };
      return builder;
    }),
  })),
}));

import {
  GoogleDriveAccessDeniedError,
  GoogleDriveRootNotFoundError,
  listAuthorizedGoogleDriveFolder,
  searchAuthorizedGoogleDrive,
} from "./service";

function folder(id: string, name: string, parents: string[] = []) {
  return {
    id,
    name,
    mimeType: "application/vnd.google-apps.folder",
    modifiedTime: "2026-09-01T13:00:00.000Z",
    driveId: "shared_drive",
    webViewLink: `https://drive.google.com/drive/folders/${id}`,
    parents,
  };
}

function file(id: string, name: string, parentId: string) {
  return {
    id,
    name,
    mimeType: "application/pdf",
    modifiedTime: "2026-09-01T14:00:00.000Z",
    size: "2048",
    webViewLink: `https://drive.google.com/file/d/${id}/view`,
    driveId: "shared_drive",
    parents: [parentId],
  };
}

describe("navigation Google Drive autorisée", () => {
  beforeEach(() => {
    state.roots = [{ ...rootRow }];
    state.requests = [];
  });

  it("pagine complètement les enfants d’une racine, y compris en Shared Drive", async () => {
    state.handler = (url) => {
      if (url.pathname.endsWith("/root_folder")) return Response.json(folder("root_folder", "Transactions"));
      if (url.searchParams.get("pageToken") === "page-2") {
        return Response.json({ files: [file("offer_pdf", "Promesse.pdf", "root_folder")] });
      }
      return Response.json({
        files: [folder("year_2026", "2026", ["root_folder"])],
        nextPageToken: "page-2",
      });
    };

    const listing = await listAuthorizedGoogleDriveFolder("maxime", rootId);
    expect(listing.breadcrumbs).toEqual([{ id: "root_folder", name: "Transactions" }]);
    expect(listing.items.map((item) => item.name)).toEqual(["2026", "Promesse.pdf"]);
    const listRequests = state.requests.filter((request) => request.url.pathname.endsWith("/files"));
    expect(listRequests).toHaveLength(2);
    expect(listRequests[0].url.searchParams.get("includeItemsFromAllDrives")).toBe("true");
    expect(listRequests[0].url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(listRequests[0].url.searchParams.get("driveId")).toBe("shared_drive");
    expect(state.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("reconstruit le breadcrumb mais refuse un dossier qui ne descend pas de la racine", async () => {
    state.handler = (url) => {
      if (url.pathname.endsWith("/outside_child")) return Response.json(folder("outside_child", "Privé", ["outside_parent"]));
      if (url.pathname.endsWith("/outside_parent")) return Response.json(folder("outside_parent", "Hors CRM"));
      if (url.pathname.endsWith("/root_folder")) return Response.json(folder("root_folder", "Transactions"));
      return Response.json({ files: [] });
    };

    await expect(listAuthorizedGoogleDriveFolder("maxime", rootId, "outside_child"))
      .rejects.toBeInstanceOf(GoogleDriveAccessDeniedError);
    expect(state.requests
      .map((request) => request.url.searchParams.get("q"))
      .filter(Boolean))
      .toEqual(["'root_folder' in parents and trashed = false"]);
  });

  it("retrouve les descendants lorsque Google omet leurs parents hérités", async () => {
    state.handler = (url) => {
      if (url.pathname.endsWith("/child_folder")) return Response.json(folder("child_folder", "2026"));
      if (url.pathname.endsWith("/nested_folder")) return Response.json(folder("nested_folder", "Septembre"));
      if (url.pathname.endsWith("/root_folder")) return Response.json(folder("root_folder", "Transactions"));
      const query = url.searchParams.get("q") ?? "";
      if (query.includes("'root_folder' in parents")) {
        return Response.json({ files: [folder("child_folder", "2026")] });
      }
      if (query.includes("'child_folder' in parents")) {
        return Response.json({ files: [folder("nested_folder", "Septembre")] });
      }
      return Response.json({ files: [] });
    };

    const directChild = await listAuthorizedGoogleDriveFolder("maxime", rootId, "child_folder");
    expect(directChild.breadcrumbs.map((crumb) => crumb.name)).toEqual(["Transactions", "2026"]);

    const nestedChild = await listAuthorizedGoogleDriveFolder("maxime", rootId, "nested_folder");
    expect(nestedChild.breadcrumbs.map((crumb) => crumb.name)).toEqual(["Transactions", "2026", "Septembre"]);
    expect(state.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("utilise la recherche native Google sans parcourir tous les enfants", async () => {
    state.handler = (url) => {
      if (url.pathname.endsWith("/root_folder")) return Response.json(folder("root_folder", "Transactions"));
      const query = url.searchParams.get("q") ?? "";
      if (query === "name contains 'PA' and trashed = false") {
        return Response.json({ files: [file("pa_1", "PA Archambault.pdf", "root_folder")] });
      }
      throw new Error(`Requête inattendue: ${url}`);
    };

    const search = await searchAuthorizedGoogleDrive("maxime", "PA");
    expect(search.results.map((result) => result.name)).toEqual(["PA Archambault.pdf"]);
    const parentQueries = state.requests
      .map((request) => request.url.searchParams.get("q"))
      .filter(Boolean);
    expect(parentQueries).toEqual(["name contains 'PA' and trashed = false"]);
    expect(parentQueries.some((query) => query?.includes("in parents"))).toBe(false);
  });

  it("pagine les candidats natifs sans lancer de balayage récursif", async () => {
    state.handler = (url) => {
      if (url.pathname.endsWith("/root_folder")) return Response.json(folder("root_folder", "Transactions"));
      if (url.searchParams.get("q")?.startsWith("name contains")) {
        return url.searchParams.get("pageToken") === "page-2"
          ? Response.json({ files: [file("normandie_2", "Normandie 2.pdf", "root_folder")] })
          : Response.json({
            files: [file("normandie_1", "Normandie 1.pdf", "root_folder")],
            nextPageToken: "page-2",
          });
      }
      throw new Error(`Requête inattendue: ${url}`);
    };

    const search = await searchAuthorizedGoogleDrive("maxime", "normandie");

    expect(search.results.map((result) => result.id)).toEqual(["normandie_1", "normandie_2"]);
    const nativeSearches = state.requests.filter((request) => request.url.searchParams.get("q")?.startsWith("name contains"));
    expect(nativeSearches).toHaveLength(2);
    expect(nativeSearches[1].url.searchParams.get("pageToken")).toBe("page-2");
    expect(state.requests.some((request) => request.url.searchParams.get("q")?.includes("in parents"))).toBe(false);
  });

  it.each([
    ["normandie", "name contains 'normandie' and trashed = false"],
    ["l'été", "name contains 'l\\'été' and trashed = false"],
    ["O'Connor", "name contains 'O\\'Connor' and trashed = false"],
    ["dossier\\test", "name contains 'dossier\\\\test' and trashed = false"],
  ])("échappe correctement la query Drive %s", async (term, expectedQuery) => {
    state.handler = (url) => {
      if (url.pathname.endsWith("/root_folder")) return Response.json(folder("root_folder", "Transactions"));
      if (url.pathname.endsWith("/files")) return Response.json({ files: [] });
      throw new Error(`Requête inattendue: ${url}`);
    };

    await searchAuthorizedGoogleDrive("maxime", term);

    const nativeSearch = state.requests.find((request) => request.url.searchParams.get("q")?.startsWith("name contains"));
    expect(nativeSearch?.url.searchParams.get("q")).toBe(expectedQuery);
  });

  it("valide un fichier profondément imbriqué et reconstruit son breadcrumb", async () => {
    state.handler = (url) => {
      if (url.pathname.endsWith("/root_folder")) return Response.json(folder("root_folder", "Transactions"));
      if (url.pathname.endsWith("/folder_a")) return Response.json(folder("folder_a", "A", ["root_folder"]));
      if (url.pathname.endsWith("/folder_b")) return Response.json(folder("folder_b", "B", ["folder_a"]));
      if (url.pathname.endsWith("/folder_c")) return Response.json(folder("folder_c", "C", ["folder_b"]));
      if (url.searchParams.get("q")?.startsWith("name contains")) {
        return Response.json({ files: [file("normandie_pdf", "Normandie.pdf", "folder_c")] });
      }
      throw new Error(`Requête inattendue: ${url}`);
    };

    const search = await searchAuthorizedGoogleDrive("maxime", "normandie");

    expect(search.results).toHaveLength(1);
    expect(search.results[0].breadcrumbs.map((crumb) => crumb.name)).toEqual(["Transactions", "A", "B", "C"]);
  });

  it("isole les résultats du courtier et rejette les fichiers hors racines", async () => {
    const franceRootId = "22222222-2222-4222-8222-222222222222";
    state.roots = [
      { ...rootRow },
      { ...rootRow, id: franceRootId, broker: "france", folder_id: "france_root", folder_name: "France" },
    ];
    state.handler = (url) => {
      if (url.pathname.endsWith("/root_folder")) return Response.json(folder("root_folder", "Transactions"));
      if (url.pathname.endsWith("/maxime_parent")) return Response.json(folder("maxime_parent", "Maxime", ["root_folder"]));
      if (url.pathname.endsWith("/france_parent")) return Response.json(folder("france_parent", "France", ["france_root"]));
      if (url.pathname.endsWith("/france_root")) return Response.json(folder("france_root", "France"));
      if (url.pathname.endsWith("/outside_parent")) return Response.json(folder("outside_parent", "Comptabilité"));
      if (url.searchParams.get("q")?.startsWith("name contains")) {
        return Response.json({ files: [
          file("maxime_file", "Normandie Maxime.pdf", "maxime_parent"),
          file("france_file", "Normandie France.pdf", "france_parent"),
          file("outside_file", "Normandie Comptabilité.pdf", "outside_parent"),
        ] });
      }
      throw new Error(`Requête inattendue: ${url}`);
    };

    const search = await searchAuthorizedGoogleDrive("maxime", "normandie");

    expect(search.results.map((result) => result.id)).toEqual(["maxime_file"]);
    expect(state.requests.some((request) => request.url.pathname.endsWith("/france_root"))).toBe(true);
  });

  it("met en cache l’ascendance commune de plusieurs résultats", async () => {
    state.handler = (url) => {
      if (url.pathname.endsWith("/root_folder")) return Response.json(folder("root_folder", "Transactions"));
      if (url.pathname.endsWith("/shared_parent")) return Response.json(folder("shared_parent", "2026", ["root_folder"]));
      if (url.searchParams.get("q")?.startsWith("name contains")) {
        return Response.json({ files: [
          file("normandie_1", "Normandie 1.pdf", "shared_parent"),
          file("normandie_2", "Normandie 2.pdf", "shared_parent"),
        ] });
      }
      throw new Error(`Requête inattendue: ${url}`);
    };

    const search = await searchAuthorizedGoogleDrive("maxime", "normandie");

    expect(search.results).toHaveLength(2);
    expect(state.requests.filter((request) => request.url.pathname.endsWith("/shared_parent"))).toHaveLength(1);
  });

  it("continue avec les racines disponibles et signale les racines indisponibles", async () => {
    const unavailableId = "33333333-3333-4333-8333-333333333333";
    state.roots = [
      { ...rootRow },
      { ...rootRow, id: unavailableId, folder_id: "missing_root", folder_name: "Indisponible" },
    ];
    state.handler = (url) => {
      if (url.pathname.endsWith("/root_folder")) return Response.json(folder("root_folder", "Transactions"));
      if (url.pathname.endsWith("/missing_root")) return new Response(null, { status: 404 });
      if (url.searchParams.get("q")?.startsWith("name contains")) {
        return Response.json({ files: [file("normandie_pdf", "Normandie.pdf", "root_folder")] });
      }
      throw new Error(`Requête inattendue: ${url}`);
    };

    const search = await searchAuthorizedGoogleDrive("maxime", "normandie");

    expect(search.results.map((result) => result.id)).toEqual(["normandie_pdf"]);
    expect(search.unavailableRootIds).toEqual([unavailableId]);
  });

  it("voit un nouvel enfant sans réautoriser la racine", async () => {
    let includeNewDocument = false;
    state.handler = (url) => {
      if (url.pathname.endsWith("/root_folder")) return Response.json(folder("root_folder", "Transactions"));
      return Response.json({
        files: includeNewDocument ? [file("new_pdf", "Nouveau document.pdf", "root_folder")] : [],
      });
    };

    await expect(listAuthorizedGoogleDriveFolder("maxime", rootId))
      .resolves.toMatchObject({ items: [] });
    includeNewDocument = true;
    const refreshed = await listAuthorizedGoogleDriveFolder("maxime", rootId);
    expect(refreshed.items.map((item) => item.name)).toEqual(["Nouveau document.pdf"]);
  });

  it("refuse une racine enregistrée pour un autre courtier avant tout appel Google", async () => {
    state.roots = [{ ...rootRow, broker: "france" }];
    await expect(listAuthorizedGoogleDriveFolder("maxime", rootId))
      .rejects.toBeInstanceOf(GoogleDriveRootNotFoundError);
    expect(state.requests).toHaveLength(0);
  });
});
