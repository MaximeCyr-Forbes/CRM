import { describe, expect, it } from "vitest";
import {
  googleDriveFolderHref,
  googleDriveRootHref,
  googleDriveSearchHref,
  readGoogleDriveLocation,
} from "./navigation";

describe("navigation URL Google Drive", () => {
  it("représente les racines par /drive", () => {
    expect(readGoogleDriveLocation(new URLSearchParams())).toEqual({ mode: "roots" });
  });

  it("construit les URLs de racine et de sous-dossier avec leurs IDs", () => {
    expect(googleDriveRootHref("root-uuid")).toBe("/drive?root=root-uuid");
    expect(googleDriveFolderHref("root-uuid", "google_folder_123")).toBe(
      "/drive?root=root-uuid&folder=google_folder_123",
    );
    expect(readGoogleDriveLocation(new URLSearchParams("root=root-uuid&folder=google_folder_123"))).toEqual({
      mode: "folder",
      rootId: "root-uuid",
      folderId: "google_folder_123",
    });
  });

  it("construit une URL de recherche réutilisable après refresh", () => {
    expect(googleDriveSearchHref("  rue de Normandie  ")).toBe("/drive?q=rue+de+Normandie");
    expect(readGoogleDriveLocation(new URLSearchParams("q=rue+de+Normandie"))).toEqual({
      mode: "search",
      query: "rue de Normandie",
    });
  });

  it("donne priorité au dossier lorsque root et q sont présents", () => {
    expect(readGoogleDriveLocation(new URLSearchParams("root=root-uuid&folder=folder-id&q=normandie"))).toEqual({
      mode: "folder",
      rootId: "root-uuid",
      folderId: "folder-id",
    });
  });
});
