# Comptabilité — registre partagé

La route `/accounting` reprend le shell privé et les identités workspace existantes. Les dépenses ne sont pas filtrées par courtier. `created_by` et `updated_by` proviennent du jeton workspace signé, jamais du JSON client. Les deux catégories sont `marketing` et `operation` ; les montants représentent le total CAD saisi manuellement.

## Stockage et sécurité

Migration : `20261005164219_create_accounting_expenses.sql`. Les deux tables ont RLS activé et aucun grant anon/authenticated. L'accès passe exclusivement par les routes CRM authentifiées et le client serveur service role. Les mutations exigent la même origine et une identité workspace valide. Le diagnostic Supabase « RLS enabled no policy » est intentionnel pour ces tables serveur uniquement.

`accounting-invoices` est privé, sans policy publique, limité à 15 Mio et aux MIME PDF/JPEG/PNG/WEBP. Les noms utilisateurs restent des métadonnées. Les chemins sont générés par le serveur avec deux UUID.

Pour éviter la limite du corps de requête Vercel, le serveur autorise un upload direct vers un chemin unique. L'autorisation Supabase dure deux heures, sans upsert. Le serveur vérifie ensuite taille réelle, MIME et signature binaire avant d'activer la facture. Seules les métadonnées sont chargées dans la liste. L'ouverture exige la session CRM et génère un lien de lecture de 60 secondes.

Une ligne document suit chaque autorisation d'upload : pending, current ou retired. Une contrainte garantit une seule facture active ; une transaction PostgreSQL bascule l'ancienne et la nouvelle facture atomiquement. Une lease serveur sérialise les mutations concurrentes d'une dépense. Les anciens objets sont supprimés via Storage, avant de supprimer une dépense. Un échec est affiché et garde la trace nécessaire pour réessayer.

Les tombstones sans objet restent jusqu'à expiration de l'autorisation d'upload, afin de suivre et nettoyer même un upload tardif après suppression. Une opération authentifiée au chargement contrôlé de la page nettoie jusqu'à 25 uploads expirés. Les uploads abandonnés sont donc suivis et récupérables, sans cron ; ils peuvent rester stockés jusqu'au prochain chargement après expiration. Aucun fichier stocké n'est volontairement laissé sans ligne de suivi.

## Interface et vérifications

Table desktop, cartes sous 768 px, modal native avec Escape et retour du focus, champs 16 px, date du jour Toronto, recherche sur métadonnées, filtres de période/catégorie et totaux en cents. Les trois cards donnent les totaux de la période/recherche ; le compteur donne le total de la catégorie sélectionnée.

48 tests dédiés couvrent validation, montants, filtres, totaux, accès privé, origine, audit Immoplus, CRUD, signatures, remplacement, reprise et erreurs Storage. La suite CRM passe : 1 556 tests, 7 tests optionnels ignorés. TypeScript et build vinext réussis. ESLint n'est pas installé/configuré dans ce dépôt.

Validation QA réelle : création Immoplus avec facture PDF, ouverture dans le lecteur navigateur, modification par France, remplacement PNG par drop simulé CDP ; Supabase confirme l'ancien PDF absent, une facture active et audit inchangé à la création. Les viewports 1512×982, 1440×900, 1280×800, 1100×760, 900×700, 390×844, 393×852, 414×896 et 430×932 ne débordent pas. Vérifications simulées Chrome, pas un appareil Safari physique.

Sauvegarde immuable : `pre-accounting-module-2026-10-05` → `58e58b1484054391b8ee7ed3fc12103ea61dd610`.
