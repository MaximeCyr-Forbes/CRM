# Paiements des références hypothécaires

Une référence sans `paid_at` et `paid_amount` est à venir, indépendamment de sa date de création, de la transaction et du suivi Google. Ces deux champs sont soit tous deux nuls, soit une date et un montant positif `numeric(12,2)`. Les références existantes ne sont pas réécrites par la migration.

Le total annuel est dérivé de toutes les références chargées pour le courtier, selon l’année civile de `paid_at`, avant la recherche textuelle. L’addition utilise des cents entiers BigInt. La vue Payé et son compteur suivent l’année ; À venir couvre toutes les années.

Les paiements passent par la même route protégée, avec identité d’espace signée côté serveur. La fonction SQL SECURITY INVOKER est réservée à service_role ; RLS et les permissions des références restent inchangées. Courtier, montant, date et version sont validés côté serveur et SQL. Le verrou de ligne et payment_version empêchent les écrasements concurrents ; la fonction respecte aussi le verrou existant de suivi Google. Un paiement ne contacte jamais Google.

Une modification ordinaire ne touche pas aux champs financiers. Corriger ou annuler un paiement met à jour payment_updated_at/by et incrémente sa version. L’annulation remet les deux champs financiers à NULL, en conservant l’auteur de la dernière opération. Aucun total annuel matérialisé ni deuxième système comptable.

Tests : validation des décimales/dates, calcul annuel, contexte courtier, permissions et annulation dans Vitest ; cycle SQL et contraintes dans supabase/tests/mortgage_referral_payments.sql sur base isolée. QA de production avec références explicitement techniques, puis suppression de ces seules références.
