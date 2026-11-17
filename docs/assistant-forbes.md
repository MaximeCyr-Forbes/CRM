# Assistant Forbes V1

Delivered disabled. `ASSISTANT_ENABLED=false` in Production. No API key was created or transferred and no inference request was sent during development. On 2026-11-17 the accessible Personal OpenAI organization displayed USD 0.00 and an unlinked ChatGPT benefit. Linking was blocked by automatic approval review; billing was left unchanged.

## Architecture

The authenticated app shell mounts a session-only dialog. Opening, navigating and resetting it never request inference. Only submitting a question calls `/api/assistant/chat`. Settings reads `/api/assistant/usage`, not OpenAI. The server resolves the current live Google membership with the existing CRM resolver, validates Origin and a bounded strict body, and runs an explicit subset of MCP read tools with that member's Supabase client and request context. There is no MCP write dispatcher in the assistant.

Responses API, fixed `gpt-6-luna`, `store:false`, standard processing, no reasoning, 700 output tokens per call, three model calls and four local read tools per question. No retry, fallback provider, built-in paid tool, persistent conversation, files or external retrieval. Four recent conversation turns are kept only in component memory. Responses are plain React text, not HTML/Markdown; clickable links are separately constructed from IDs returned by authorized CRM reads. Browser-supplied context is a hint checked through the corresponding read service before transmission.

## Financial gate and operation

`OPENAI_API_KEY` must be a dedicated project credential. Existing credentials for other tools must not be overwritten. No key is required to deploy disabled. A service-only `assistant_billing_cycles` row must hold independently verified organization/project IDs, key SHA-256 (never the key), grant dates, available promotional credits, no-paid-fallback and auto-recharge-off evidence, model availability and privacy approval. No cycle is created automatically. The cycle cannot exceed actual verified credit expiry; evidence expires within 24 hours and requires a new real verification. Daily evidence refresh is not a budget reset. Reuse the same cycle ID; never create a new budget for the same grant. There is no UI activation switch and no scheduled billing task.

Before activation the account owner must resolve the unlinked benefit, verify the actual grant and expiry, confirm no pay-as-you-go fallback and auto-recharge, identify consumption by other projects and approve the privacy assessment. The local ledger is not the official OpenAI balance and cannot independently establish a billing guarantee. If any item is unverified, keep the flag false and cycle disabled. No card, credit purchase or recharge is authorized.

An advisory transaction lock serializes all reservations and reconciliations. One pending question/member, three globally, 20/member and 60/team per Toronto day. All attempts count. Each question reserves USD 0.03 against at most USD 10 per verified grant cycle. The maximum serialized input is 48,000 UTF-8 bytes per model call, with 12,000 extra tokens of conservative framing allowance: `(60,000 × 0.125 + 700 × 0.5) × 3 / 1,000,000 = 0.02355 USD`. Input is estimated at the higher cache-write price; output includes all billed output tokens. This remains below the reserve. Review current provider prices before enabling a new verification period.

Usage totals come from provider usage fields. Missing usage, timeout, provider error, interrupted execution or failed reconciliation retain the whole reservation. After five minutes a stale reservation may stop holding the concurrency slot but still consumes its entire budget. No automatic refund. Abnormal measured usage over the reserve disables the cycle. Replayed request IDs cannot make a second external call. Membership and cycle eligibility are rechecked before each external call. A flag change requires deployment; disabling the cycle blocks subsequent calls immediately.

Only service-role infrastructure accesses the ledger; authenticated/anonymous clients have no table or RPC grant. The ledger stores member/request/cycle IDs, tokens, costs, status and timestamps, never questions, answers, client names or CRM records. No business table is modified.

## Privacy review — activation pending

Technical minimization is implemented, but it does not establish legal compliance. The privacy officer must complete/document the applicable EFVP, necessity and legal basis for client-data communication, the recipient/subprocessors, processing location, contractual protections, retention and access handling before `privacy_reviewed` can be true. No real client content was sent for this delivery. `store:false` does not itself mean zero retention: provider abuse-monitoring and prompt-cache retention can still apply. This is a deployment safeguard, not a legal certification.

Sources verified 2026-11-17:
- [Model and pricing](https://developers.openai.com/api/docs/models/gpt-6-luna): Responses and function calling; USD 0.10 input / 0.125 cache-write / 0.50 output per million tokens.
- [Subscription credits](https://developers.openai.com/api/docs/guides/chatgpt-api-credits): actual grant, linkage and expiry must be checked in the organization.
- [Provider data controls](https://developers.openai.com/api/docs/guides/your-data): retention limits and controls.
- [CAI: use and communication](https://www.cai.gouv.qc.ca/protection-renseignements-personnels/information-entreprises-privees/utilisation-communication-renseignements-personnels): privacy evaluation and communication outside Québec.

## Verification

Tests mock every OpenAI request and use an isolated PGlite database for real SQL reservations, quotas, concurrent calls, expiry, reconciliation and denied grants. Production QA uses the disabled branch; it cannot validate model quality or a live CRM-to-model response. No synthetic business record is created in Production. No API test is permitted until the financial and privacy gates are verified.
