-- Keep the exact can_access semantics, but resolve the verified member once per
-- statement rather than once per contact. No identity is cached across requests.
-- Parent checks on contact_addresses/notes inherit this optimization.
alter policy crm_member_access on public.contacts
using (
  coalesce(((select crm_auth.member_identity())->'brokers') ? broker::text, false)
  or (coalesce(broker::text, 'unassigned') = 'unassigned' and (select crm_auth.is_admin()))
)
with check (
  coalesce(((select crm_auth.member_identity())->'brokers') ? broker::text, false)
  or (coalesce(broker::text, 'unassigned') = 'unassigned' and (select crm_auth.is_admin()))
);
