import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_DRIVE_SERVICE_ACCOUNT_SCOPE,
  resetGoogleDriveServiceAccountTokenCacheForTests,
  serviceAccountGoogleDriveRequest,
} from "./service-account";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

describe("identité Google Drive technique", () => {
  beforeEach(() => {
    process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL = "drive-reader@example.iam.gserviceaccount.com";
    process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY = privateKeyPem;
    resetGoogleDriveServiceAccountTokenCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY;
  });

  it("demande exclusivement drive.readonly sans délégation de domaine", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (url.includes("oauth2.googleapis.com/token")) {
        return Response.json({ access_token: "service-token", expires_in: 3600 });
      }
      return Response.json({ id: "root_folder" });
    }));

    await serviceAccountGoogleDriveRequest("https://www.googleapis.com/drive/v3/files/root_folder", { method: "GET" });
    const tokenBody = new URLSearchParams(String(requests[0].init?.body));
    const assertion = tokenBody.get("assertion")!;
    const claims = JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString("utf8"));
    expect(claims.scope).toBe(GOOGLE_DRIVE_SERVICE_ACCOUNT_SCOPE);
    expect(claims.iss).toBe("drive-reader@example.iam.gserviceaccount.com");
    expect(claims).not.toHaveProperty("sub");
    expect(requests[1].init?.headers).toMatchObject({ Authorization: "Bearer service-token" });
  });

  it.each(["POST", "PATCH", "PUT", "DELETE"])("interdit toute écriture %s avec le service account", async (method) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(serviceAccountGoogleDriveRequest("https://www.googleapis.com/drive/v3/files/root_folder", { method }))
      .rejects.toThrow("strictement en lecture seule");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
