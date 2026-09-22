# Contact deletion audit

Production FK audit, 2026-09-22. Contact deletion remains one database statement; cascading associations and owned rows are atomic with it. Google cleanup runs first and preserves mappings on provider failure. Missing Google events (404/410) are already absent.

| Table referencing contacts | Category | Contact deletion |
| --- | --- | --- |
| client_notes | A: owned | CASCADE |
| pipeline_history | A: owned | CASCADE |
| contact_addresses | A: owned | CASCADE |
| contact_birthday_calendar_events | A: owned mapping | Google cleanup, CASCADE |
| contact_mortgage_renewal_calendar_events | A: owned mapping | Google cleanup, CASCADE |
| contact_birthday_greetings | A: owned | CASCADE (fixed) |
| purchase_anniversary_greetings | A: owned | CASCADE (fixed); transaction preserved |
| transaction_contacts | B: association | CASCADE link only |
| listing_contacts | B: association | CASCADE link only |
| custom_email_campaign_contacts | B: association | CASCADE link only |
| google_drive_entity_links | B: association | CASCADE link only; Drive file preserved |
| contact_merges | D: audit | SET NULL |
| automatic_email_deliveries | D: audit | SET NULL |

No FK from a principal transaction, listing or mortgage referral to contacts was found. Follow-up calendar IDs live on the contact itself. No principal business object is deleted by these cascades.

The finalized-transaction link trigger previously rejected cascaded contact deletion with P0001 before greeting FKs could report 23503. It now allows DELETE only when the parent contact no longer exists (the FK cascade). Direct link INSERT/UPDATE/DELETE on finalized transactions remains forbidden. No session flag or general bypass is added.

Regression SQL: `supabase/tests/contact_delete_dependencies.sql` creates synthetic data and rolls back everything. It verifies five greeting states, owned data cleanup, association removal, preservation of other contacts and unchanged transaction/listing rows, including a finalized transaction.
