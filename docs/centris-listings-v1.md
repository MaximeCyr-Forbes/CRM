# Centris Listings V1

Manual import in Listings → Synchroniser Centris → preview → confirmation.
The preview does not persist mappings, logs, photos or listings. There is no cron.

Official source: https://datadistributionqc.centris.ca/openapi/v1/consumer.json
API: https://datadistributionqc.centris.ca/v1/odata/
Documentation: https://docs.datadistributionqc.centris.ca/getting-started/
The issued credential uses `Authorization: Bearer` with `CENTRIS_API_KEY` (server only).
Optional OAuth client credentials use https://accounts.centris.ca/connect/token;
no OAuth scopes are assumed. Never put credentials in URLs, logs or client variables.

Member discovery matches active, verified CRM email identities exactly to active
Centris Members. MemberEmail cannot be filtered server-side in the current feed;
discovery uses bounded pagination and saves the three mappings only on a real run.
Primary ListAgentKey wins; a team CoListAgentKey is used only when the primary agent
is outside the team. ListingKey is the stable identity; ListingId can adopt a legacy
record only when it has no conflicting key. Conflicts stop the real import.

New records require StandardStatus=Active and MlsStatus=Active. Existing source
statuses are stored independently from the operational CRM status. Closed records
do not finalize a sale or rental. CRM-finalized records are left untouched.

StreetShortName preserves the street prefix; Township supplies the readable city.
Residential Lease maps to rental. Otherwise exactly one positive sale/rent price
is required. Unknown property types are flagged; an entirely unknown feed stops.
OnMarketTimestamp is interpreted in America/Toronto. Missing contract dates are
not invented. Centris does not own notes, owners, offers, visits, contract expiry,
checklist progress, Drive links, transaction links or finalization fields.

The supplier requires local hosting of photos. Only the first active Photo by
Order is copied to `centris-listing-images`, using deterministic versioned paths.
No virtual tours or other media are imported. Media requests carry no API key;
host, scheme, redirects, MIME type, size and time limits are checked. A failed
image download leaves that listing unchanged for a later retry.

The server authorizes the active CRM identity before using the private integration
tables/RPCs. Public/anonymous/authenticated direct access is revoked; RLS is enabled.
A persistent ten-minute lease prevents concurrent real runs. Each property is
applied atomically through the existing Listing RPCs, preserving price history.
Repeated unchanged runs do not write listing rows. All properties are preflighted
before any listing mutation. Partial per-record failures are reported separately.

Rollback code reference: `pre-centris-listings-v1-2026-11-13`.
Do not run a database reset or automatically delete imported records on rollback.
The pre-import data backup is private, ignored by Git, under `work/`.
