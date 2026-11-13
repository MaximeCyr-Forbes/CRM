# Centris Listings V2 — déclenchement automatique

La V2 réutilise `syncCentris`, le mapping et le verrou persistant V1 de dix minutes.
Le bouton manuel conserve son identité CRM vérifiée. Le POST `/api/listings/centris/cron`
utilise exclusivement `{memberId:null,broker:null,source:'cron'}` après validation du Bearer.
Le courtier des propriétés provient toujours du mapping Centris.

## Configuration Production uniquement

La migration additive installe les extensions manquantes et adapte le journal des runs.
Elle ne contient aucun secret, URL Production ni job actif. Les extensions existantes ne sont pas déplacées.
Les migrations locales/preview ne déclenchent donc aucun appel Production.

1. Générer en mémoire un secret aléatoire d'au moins 32 octets.
2. Définir `CENTRIS_CRON_SECRET` comme variable Vercel **sensible, Production seulement**.
3. Stocker la même valeur dans Vault sous `centris_cron_secret` et l'origine HTTPS canonique
   du CRM, sans slash final, sous `crm_production_url`. Vérifier les noms avant de créer ;
   utiliser `vault.update_secret` pour une valeur déjà présente.
4. Déployer la route puis créer le job suivant uniquement dans la base Production.
   Le créer désactivé dans la même transaction avec `cron.alter_job(job_id, active := false)`.
5. Tester le même `net.http_post` deux fois, contrôler les réponses HTTP et les runs avant activation.

```sql
select cron.schedule('centris-listings-sync-12h','17 11,23 * * *', $command$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='crm_production_url') || '/api/listings/centris/cron',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
    (select decrypted_secret from vault.decrypted_secrets where name='centris_cron_secret')),
  body := '{"source":"supabase-cron"}'::jsonb,
  timeout_milliseconds := 240000
 );
$command$);
```

Horaire UTC : 11:17 et 23:17, soit toutes les douze heures. Aucun second ordonnanceur.
Le corps ne peut pas modifier le courtier, les filtres ou le mode d'exécution.
Secret absent : 503 ; Bearer invalide : 401 ; verrou occupé : 202 `already_running` sans nouveau run.
Les réponses ne contiennent que l'état et les compteurs. Le moteur a une limite de 240 secondes,
la route Vercel de 300 secondes. Un timeout HTTP ne justifie pas de libérer manuellement le verrou.

## Vérification et exploitation

- Vérifier un seul job nommé `centris-listings-sync-12h`, son horaire et son état actif.
- Lire `net._http_response` par identifiant de requête (conservation temporaire) et
  `centris_sync_runs` : `trigger_source='cron'`, `actor is null`, statut et compteurs.
  Un job pg_cron réussi prouve seulement la mise en file HTTP, pas le succès de l'import.
- En cas de panne, consulter ces deux journaux et l'état V1 ; le bouton manuel reste disponible.
- Au retour sur `/listings`, la liste et le dernier état sont rechargés sans polling.
  Les rafraîchissements rapprochés sont regroupés. Un éditeur ouvert n'est pas réinitialisé ;
  les fiches de détail et leurs brouillons de suivi ne sont pas remontés par ce mécanisme.
- Aucun changement aux contacts, transactions, inventaire, courriels, suppressions ou finalisations.

```sql
-- Désactiver / réactiver, sans modifier directement cron.job :
select cron.alter_job(jobid, active := false)
from cron.job where jobname='centris-listings-sync-12h';
-- Remplacer false par true après vérification pour réactiver.
```

Rotation : désactiver le job, générer un nouveau secret, remplacer la variable Production et
redéployer, mettre à jour Vault, tester un appel contrôlé, réactiver. Ne jamais imprimer la valeur,
la placer dans une migration, un journal ou la commande du job. Ne pas réutiliser le secret en preview.

Références : [Cron](https://supabase.com/docs/guides/cron/quickstart),
[pg_net](https://supabase.com/docs/guides/database/extensions/pg_net),
[Vault](https://supabase.com/docs/guides/database/vault).
