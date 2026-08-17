import { NextResponse, type NextRequest } from "next/server";
import { CRM_ACCESS_COOKIE, isValidCRMAccessToken } from "./app/lib/crm-access";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/access/login",
  "/api/access/logout",
  "/api/access/session",
]);

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.has(path);
  const isAuthorized = await isValidCRMAccessToken(
    request.cookies.get(CRM_ACCESS_COOKIE)?.value,
  );

  if (path === "/login" && isAuthorized) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (isPublic) return NextResponse.next();
  if (isAuthorized) return NextResponse.next();

  if (path.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Accès CRM requis." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("returnTo", `${path}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
