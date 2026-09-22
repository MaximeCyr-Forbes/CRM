-- Applied after the compatible application is deployed. No existing birthday setting changes.
update public.automatic_email_rules set send_hour=17,send_minute=0,trigger_config=trigger_config || '{"purchaseAnniversaryFallbackEnabled":false}'::jsonb where rule_type='purchase_anniversary';
