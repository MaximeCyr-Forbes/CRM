# Communications récurrentes : édition et archivage

Baseline : `9c8e9a267d7eeb1e5c3e2dc92cd151be0f944f41`.
Sauvegarde : `pre-recurring-communications-edit-archive-2026-11-27`.

Le nom enregistré apparaît sur la carte. PATCH conserve le type métier et exige la version lue. DELETE signifie archivage logique ; PATCH avec `action: restore` restaure en pause. Les règles restent disponibles pour les historiques et les actions indépendantes « Fait ».

La migration additive ajoute `archived_at` et `version`. Le RPC utilise les permissions RLS du membre et un verrou de ligne. Le type est immuable. Le déclencheur de version couvre aussi les anciens RPC des boutons de secours. L’audit d’identité existant reste en place. Aucune suppression physique n’est accordée aux rôles applicatifs.

L’archivage désactive les secours dans la même transaction. Les prises en charge d’envoi verrouillent la même règle. Si un envoi est déjà en cours, l’archivage est refusé avec un conflit, sans modifier l’historique ; il faut attendre sa fin. Une prise en charge dont l’état reste incertain ne doit jamais être effacée pour débloquer un test. Les lectures avant envoi et les boucles de secours vérifient également l’archivage. La restauration n’active rien et ne déclenche aucun rattrapage.

## Validation

- Base PGlite isolée : quatre types, édition, archivage, restauration, versions, double opération, intégrité historique, protection des prises en charge, RLS, refus du changement de type et de suppression physique. Application de la migration puis rollback transactionnel également testé avant son application réelle.
- Interface avec réseau intercepté : sauvegarde et nouvelle session, brouillon conservé après conflit, confirmation/annulation, double clic, restauration en pause.
- Services d’anniversaires : Gmail entièrement simulé, règle archivée/restaurée non expéditrice, marquage Fait préservé.
- Production : inspection seulement. Ne pas archiver une vraie règle pour démontrer l’interface. Ne pas activer les secours, appeler les Cron ou effectuer un test Gmail.

Référence avant/après migration : quatre règles, 25 historiques Bonne fête, zéro historique d’anniversaire d’achat et zéro livraison automatique. Noms, contenus, paramètres, statuts et dates de modification inchangés. Contacts : 694 ; Transactions : 23 ; Listings : 19. Les deux secours sont OFF.

## Retour arrière

Revenir au code de sauvegarde uniquement après évaluation de la panne. Conserver les colonnes et protections SQL : les retirer pourrait réactiver un secours ou perdre les informations d’archivage. Ne jamais restaurer les anciennes valeurs de secours automatiquement. Les anciens appels restent compatibles et leurs écritures passent par les protections SQL. Aucun historique ne doit être supprimé. Le code précédent peut réafficher des cartes archivées : corriger cette présentation avant de réouvrir l’édition si des archives existent.
