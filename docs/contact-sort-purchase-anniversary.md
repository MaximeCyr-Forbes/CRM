# Contacts, simulation and purchase anniversaries

Contacts accept `sort=created` (default, newest first) or `sort=name` (French Canadian name order). Filtering and sorting precede the existing pagination. Return links preserve the complete query and contact anchor.

Automatic email rules and Gmail connection status load independently. After the rules render, `occurrences?mode=summary` supplies only counts and next dates. The schedule fetches full occurrences on demand; previews use `ruleId` and `mode=preview`. Requests abort on close/unmount or changed dependencies. The page-local cache expires after one minute and its key includes the Quebec date and configuration revision.

Purchase anniversary eligibility requires a purchase with `purchase_finalized_at` and `notary_date`, in an anniversary year later than the notary year. Every linked contact has a distinct `(transaction_id, contact_id, occurrence_date)` identity. February 29 is observed on February 28 in non-leap years. The contact's broker controls notifications and Gmail; unassigned contacts appear in all broker spaces and use the rule's default sender.

The server rechecks the transaction, contact and link. A service-role-only RPC locks the transaction/contact/link before claiming Done or an email. Sending and uncertain claims cannot be reused. Definite failures may be retried manually; an automatic attempt is consumed for the occurrence. The Gmail sender, signature and template renderer reuse the existing infrastructure.

The existing birthday cron URL runs both independent workflows. Purchase fallback requires its own `purchaseAnniversaryFallbackEnabled` flag and Quebec time at or after 17:00, with no next-day catch-up. The other automatic-email locks are unchanged.

Deployment order: apply the additive greetings-table migration, deploy the compatible application, then initialize the purchase rule to 17:00 and explicit OFF with the default-off migration. This avoids passing a new JSON setting to the old production parser. The birthday setting is not modified. No second scheduler or paid plan is needed.
