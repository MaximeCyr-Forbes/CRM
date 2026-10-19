# Google identity and MCP rollout

## Identity boundary

Current policy: see `google-login-v3.md`. Three CRM members retain the existing broker keys. Known emails are preferred mappings; verified corporate identities may resolve through a known Google subject, unique provider profile, or one-time rescue-confirmed association. A domain alone grants no CRM access. Provider-owned Google identity data with a verified email, a live OAuth session, and an active member/identity binding are required. User metadata and client-selected broker are never identity evidence. Supabase manual identity linking remains disabled; CRM association uses its own verified, audited flow. The resolver rejects ambiguous or unverified provider identities.

Every individual CRM API request has its own AsyncLocalStorage actor and Supabase user client. RLS enforces ownership even when a caller changes request fields. Admin viewing another broker does not change audit authorship. Private immutable audit rows record member, Google identity, user, operation, entity, and CRM/MCP source. Integration refresh tokens remain server-only, accessed through a broker-permission bridge.

## Current rollout gate

Google provider and exact production redirects are configured. `CRM_GOOGLE_LOGIN_ENABLED=true` and `LEGACY_SHARED_LOGIN_ENABLED=true`. Real Google login with the Maxime RE/MAX alias successfully bound the existing Maxime admin member. Production dashboard, logout/relogin and admin viewing France while retaining the Maxime actor are verified. The France/Sandrine transition and remaining real aliases are still rollout gates. MCP never accepts the legacy cookie or workspace token. Supabase OAuth server is enabled with dynamic registration disabled; a public PKCE ChatGPT client is registered with its exact callback. Consent was granted and the public client is registered. ChatGPT created plugin `plugin_asdk_app_6ad58e1687088191b8949c7a054a8c07`, but its connection requires an authentication update and its reconnect control is disabled. The explicitly authorized read-only test chat returned “Impossible de charger cette réponse”; no authenticated MCP request has been observed yet. Do not claim end-to-end MCP success.

1. Configure Google OAuth web client with redirect `https://nabczucyxmfqlnouvcwo.supabase.co/auth/v1/callback`, retaining existing integration callbacks.
2. Enable Google provider in Supabase with that client ID/secret. Leave Skip nonce checks and Allow users without email OFF. Disable email/password provider; keep manual identity linking OFF. OAuth signups must allow the six aliases to establish their first session; CRM RLS denies unknown identities even if Supabase creates an Auth user.
3. Supabase Site URL: `https://crm-eight-beryl-72.vercel.app`. Add only the exact CRM `/api/access/callback` redirect for production. Do not add wildcard redirects.
4. Enable Supabase OAuth server with consent path `/oauth/consent`. Register the actual ChatGPT OAuth client and its provided redirect, PKCE S256; do not invent a callback or share a service-role key.
5. Enable Google CRM flag, redeploy, and verify real Maxime login/logout/relogin, both aliases, data visibility, unauthorized-account rejection, broker context and audit. Validate France/Sandrine with their usual Google account; keep rescue access permanently enabled.
6. Connect ChatGPT to `/api/mcp`, test initialize/list/read and one synthetic QA write, repeated action ID, revocation and audit. Never send client mail for tests.
7. Keep the existing rescue login permanently enabled and unchanged.

The consent boundary accepts only openid, email, profile and offline_access (refresh tokens). Gmail, Calendar, Drive, phone and arbitrary scopes remain rejected. No MCP production success is implied by synthetic regression tests.

## Revocation

The account menu links to `/oauth/connections`. Each Google account can list and revoke its own application grants. MCP checks live consent and session for every request, so a previously issued JWT does not bypass revocation.

Authorized administrators may deactivate a single `crm_member_auth_identities.active` row or `crm_members.active` for the whole member using trusted database administration. The other alias remains independent. Never grant table editing to a browser or MCP client. Do not delete historical bindings or audits to revoke access.

## MCP safeguards

Official SDK Streamable HTTP; HTTPS canonical resource metadata; verified issuer/audience/client/session/expiration; no legacy, arbitrary SQL, token export, contact deletion, or email-sending tool. Tool inputs are strict schemas. Search before creation. All writes require an action UUID. The persistent ledger is keyed by stable member plus action UUID across aliases. A failed or uncertain attempt must be inspected before retrying; a new UUID is not an automatic retry strategy. Completion is server-only; actual DB mutations are independently audited.

Read-only accounting tools do not materialize recurring expenses. Dates use ISO format and amounts dollars CAD. Existing deadline and Google services remain the sole implementation of secondary calendar synchronization.

## Validation

- `node node_modules/typescript/bin/tsc --noEmit`
- `pnpm test -- --maxWorkers=4`
- `node supabase/tests/run-auth-rls.mjs` (isolated in-memory PostgreSQL; schema-only fixture, no production rows)
- `pnpm run build`
- `node node_modules/vite/bin/vite.js build --config vite.vercel.config.ts`

On Windows sandbox environments that reject temporary-directory renames, set TEMP/TMP to a writable directory under ignored `work/auth-qa/tmp` for the test process. ESLint is not installed in the existing repository; the existing lint script is therefore not runnable.

Migration files are additive, except narrowly changing existing RPC execution security and grants. Never run `20260819131843_remove_contact_pipeline.sql`. No database reset. Schema fixtures contain definitions only; real customer documents and data are excluded.

Rollback checkpoint: `pre-google-auth-mcp-pivot-2026-10-19` at `f9197386909b975d5d59cf6bfc66d52dedbc0429`. Preserve migrations/audit; use rollout flags to stop individual login while investigating, rather than dropping security tables.

## Production validation, 2026-10-18/19

Real Maxime RE/MAX login, dashboard, France consultation retaining Maxime actor, logout and relogin passed. Rescue access remains permanently enabled. Exact Google callback corrected in Google Cloud; login scopes remain openid/email/profile only. ChatGPT additionally uses offline_access for delegated refresh.

Regression totals: 1,972 Vitest passes, 7 skipped; 40 local PostgreSQL business/RLS/MCP scenarios plus six-alias identity regressions; TypeScript and Vercel build pass. Delegated AMR uses oauth_provider/authorization_code and requires an existing verified active binding and live consent/client/session. OAuth consent waits for workspace hydration to avoid consuming one-time authorization twice.

Read-only test chat: https://chatgpt.com/c/6ad5914a-adf0-83ea-9e92-747555ad70d5 . No client mail, customer writes, token extraction, or production QA business records were created in this validation. Real MCP reads/writes/revocation remain unverified.
