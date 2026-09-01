export type GoogleDriveLocation =
  | { mode: "roots" }
  | { mode: "search"; query: string }
  | { mode: "folder"; rootId: string; folderId: string | null };

type SearchParamsReader = Pick<URLSearchParams, "get">;

export function googleDriveRootHref(rootId: string) {
  return `/drive?${new URLSearchParams({ root: rootId }).toString()}`;
}

export function googleDriveFolderHref(rootId: string, folderId: string) {
  return `/drive?${new URLSearchParams({ root: rootId, folder: folderId }).toString()}`;
}

export function googleDriveSearchHref(query: string) {
  const normalizedQuery = query.trim();
  return normalizedQuery ? `/drive?${new URLSearchParams({ q: normalizedQuery }).toString()}` : "/drive";
}

export function readGoogleDriveLocation(searchParams: SearchParamsReader): GoogleDriveLocation {
  const rootId = searchParams.get("root")?.trim() ?? "";
  if (rootId) {
    return {
      mode: "folder",
      rootId,
      folderId: searchParams.get("folder")?.trim() || null,
    };
  }
  const query = searchParams.get("q")?.trim() ?? "";
  return query ? { mode: "search", query } : { mode: "roots" };
}
