# Manual recipients — 20 November 2026

Backup: `pre-manual-campaign-email-recipients-2026-11-20` at
`6155d2b8cfb90f1d6c6668da4e3f77c187447e7c` (main and Production baseline).

## Scope and safety

Manual recipients are campaign records, never CRM Contacts. No campaign is
triggered by saving, previewing, changing status or loading. QA sends use mocked
`sendPreparedGmailMessage` with a network-denying fetch stub. Production QA must
not call manual-send POST or save synthetic recipients.

Baseline, read-only: 2 campaigns, 16 campaign/contact links, 2 steps, 5 batches,
22 deliveries, 693 Contacts. Campaign snapshot MD5:
`ddfc45d139d3332ea03a8565d12cbbde`; delivery snapshot MD5:
`52b53d183bc5af4666f23762853cc3ce` (original columns, ordered by ID).

## Persistence and concurrency

Migration `20261120150000_campaign_manual_recipients.sql` adds a separate table
with generated normalized email, unique active campaign/mailbox index, length
constraints, timestamps and soft removal. RLS is enabled with the existing
`crm_auth.has_functional_access()` membership policy. The scoped authenticated
CRM client and service_role have privileges; anonymous users have none. New RPCs
also reject authenticated non-members. Existing actor auditing is reused.

The editor saves configuration, Contacts, manual recipients and steps in one
transaction. A campaign row lock and expected updated_at reject stale saves (409)
before any data changes. Failed saves roll back the entire selection. The
existing draft/ready/paused intent and simulation-only execution mode are retained.

Delivery identity is exactly one of contact_id or manual_recipient_id. Existing
delivery rows and step/contact uniqueness are retained. Mailbox claims serialize
by step and check both source identity and lowercase trimmed destination against
all existing history. No Gmail call occurs without a successful durable claim.
Pending/uncertain or sent results are never reclaimed; failed deliveries require
an explicit retry with a new attempt key and unchanged destination/identity.
Removing a recipient or deleting its campaign preserves the delivery snapshot.

Normalization is `trim().toLowerCase()` for deduplication only. Stored/submitted
addresses retain spelling; dots and plus-tags are not removed. CRM Contact wins
when a selected manual address duplicates it. Names are not merged. Existing Gmail
validation and template rendering are reused; unresolved tokens block sending.

No consent/suppression registry is implemented in the existing custom-campaign
pipeline. No consent is inferred. The editor warns that manual addition does not
establish consent and that authorizations/oppositions must be verified. Existing
sender identity, SendAs and signature preparation remain shared.

## Verification and rollback

PostgreSQL migration and RPCs are exercised against an isolated in-memory PGlite
database: persistence, edits, removals, transaction rollback, stale versions,
cross-campaign UUID rejection, source collisions, uncertain delivery protection,
manual retries, retained history and role privileges. Component and route tests
intercept all network writes. Production verification is read-only UI inspection.

Rollback code to the backup if necessary; retain the additive schema, manual
recipients and all delivery history. Do not drop tables or erase deliveries.
Before re-enabling an older sender implementation after manual recipients have
been used, preserve the cross-source mailbox claim guard; do not revert to a
contact-only idempotency check. No Cron or Gmail credentials were modified.

Production migration applied successfully. Post-migration counts and both hashes
above are unchanged; manual-recipient table remains empty. RLS enabled and anon
table/RPC permissions denied. No business record was changed for QA.

Full suite: 3,801 passed, 0 failed, 7 skipped (unavailable private fixtures).
TypeScript passed. Local build has the pre-existing Windows `.vite-temp` ENOENT
limitation; the Vercel build is the deployment gate. ESLint is declared but absent
from installed dependencies. No new dependency was introduced.
