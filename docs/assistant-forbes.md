# Assistant Forbes V1

## V2 activation review — 2026-11-17 (pending)

Backup: `pre-assistant-forbes-v2-activation-2026-11-17`, SHA `07541b29e445dd693b9b291791d2645c49dc0b38`.
The live Personal organization now shows USD 6.00 promotional credit, received November 17 and expiring November 19, 2026. Payment methods states no API billing plan has been started; billing history has no invoices. Organization: `org-JwXIZ39unGgmLf3iBc0EUqyn`. A free dedicated project was created: Assistant Forbes CRM, `proj_3nR1EoI68iayqFsFihfVccqC`, Global residency. The organization displays Build-tier limits for gpt-6-luna. These UI facts do not yet prove a successful authenticated model request.

For this grant only, set the existing cycle budget to `min(2, verified remaining promotional credit - 1)` USD; refuse activation if the remainder is below one USD 0.03 reservation. This leaves USD 4 of the observed USD 6 unallocated. No ten-dollar cycle is authorized. Preserve the atomic database reservation. Conservative cutoff: November 18, 2026, 18:00 America/Toronto (23:00 UTC), or an earlier verified provider/key expiry. Financial evidence expires no later than 24 hours after the real verification. No cycle exists yet, and no next grant is presumed. The default Settings budget is two dollars, not a claim of an activated budget.

### Privacy assessment for responsible-person review

| Topic | Observed implementation / outstanding validation |
| --- | --- |
| Purpose | On-demand assistance locating and summarizing authorized CRM records; no automated decision or business mutation. |
| Data transmitted | User question, up to four prior turns and selected read-tool excerpts: names, contact details, property addresses, statuses, amounts, deadlines and short notes. No PDF, Drive file or full database export. Free-text questions and notes can still contain sensitive information. |
| Necessity / minimization | Five records per excerpt, 400 characters per string, bounded context and tools. The current projection can include phone/email even when the question does not require them; necessity of these fields and notes must be reviewed before real-client activation. |
| Recipient and location | Direct OpenAI Responses API via Vercel; Global project. Canada residency was unavailable for this account. No claim of Québec/Canada-only processing. Responsible person must assess cross-border protections and the applicable written agreement/subprocessors. |
| Retention | `store:false`; no saved CRM conversations or content in the usage ledger. Provider abuse-monitoring retention and prompt caching remain possible; this is not zero retention. Browser conversation memory lasts for the session. |
| Training/sharing | Live organization controls show feedback, evaluation/fine-tuning sharing and API input/output sharing all Disabled. No sharing was enabled in exchange for credits. |
| Access / security | Existing live Google membership and member-scoped Supabase client/RLS; strict read-tool allowlist; no write dispatcher; server-only restricted key planned; authenticated same-origin endpoint; bounded quotas. Team accounting access follows the existing shared-member policy, not browser-selected permissions. |
| Information and lawful basis | No client notices, consent records or applicable exception assessment were supplied for this use. The responsible person must document the necessary basis and information/consent duties, access/correction requests and incident handling. |
| Decision | NOT APPROVED. No real-client data may be sent and `privacy_reviewed` must remain false until a documented assessment and actual responsible-person validation are obtained. General permission to deploy is not recorded as privacy approval. |

The [CAI guidance](https://www.cai.gouv.qc.ca/protection-renseignements-personnels/information-entreprises-privees/utilisation-communication-renseignements-personnels) requires assessing necessity and cross-border protection, including the applicable written agreement. The [OpenAI retention documentation](https://developers.openai.com/api/docs/guides/your-data) describes abuse monitoring up to 30 days (with exceptions) and caching up to 24 hours. This technical review does not certify legal compliance.

User decision on November 17: no documented privacy validation yet; leave disabled. The user separately approved creating the dedicated restricted API key. It was created with only Responses permission, one-day expiry (November 18), and saved as a sensitive Production-only `OPENAI_API_KEY` in Vercel. No secret was written to a repository, database, log or local file. `ASSISTANT_ENABLED=false` remains unchanged. No billing cycle is fabricated: no key hash, model-validation flag or privacy approval is inserted without complete evidence. No live inference test or real-client transmission is claimed. Activation remains blocked by the documented privacy decision; the dedicated credential also still needs an authenticated synthetic model test before any future activation.

Functional gaps corrected with isolated tests: three bounded assistant-only read tools reuse the authenticated database scope, real `listing_contacts` owner relationship and existing commercial Listing service. They cover active records by authorized broker and verified contact-to-listing links, without changing MCP write tools or business workflows. The authenticated broker is supplied by the server for questions about “my” dossiers.

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
