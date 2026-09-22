# Anniversaires clients

Le contact détermine le courtier Google Agenda. Un contact non attribué n'a pas
d'événement anniversaire. Le trigger conserve les anciens identifiants jusqu'à
leur suppression Google confirmée (404/410 compris). Un ancien compte déconnecté
conserve son mapping en erreur, à reprendre à la reconnexion. La synchronisation
existante des anniversaires traite cette file; aucun autre agenda n'est modifié.

Les notifications du jour montrent les anniversaires du courtier de travail et
les contacts non attribués. `contact_birthday_greetings` conserve l'action globale,
l'acteur, les dates et l'identifiant Gmail. Le verrou atomique contact/date est
commun à Fait, au manuel et au scheduler. Un envoi en cours ou incertain n'est
jamais repris automatiquement. Un échec définitif peut être repris manuellement;
une occurrence ne bénéficie que d'une tentative automatique.

Le Gmail du contact attribué prime toujours. Pour un non-attribué, Bonne fête
utilise son expéditeur configuré. L'envoi réutilise la préparation Gmail, sa vraie
signature et `users/me`; les champs du destinataire sont relus côté serveur.

## Secours à 17 h

Le bouton Bonne fête contrôle seulement `trigger_config.birthdayFallbackEnabled`.
Il commence OFF. Les autres règles et le verrou maître ne sont pas modifiés.
Modifier le modèle depuis une page ancienne ne peut pas réactiver un bouton OFF.

Supabase Cron `crm-birthday-5pm-fallback` appelle toutes les cinq minutes
`/api/cron/birthday-greetings`, indépendamment du navigateur. Le endpoint demande
`BIRTHDAY_CRON_SECRET`, conservé aussi dans Vault sous `crm_birthday_cron_secret`.
Le job est créé inactif par la migration, puis activé après vérification du
déploiement officiel. Le plan Vercel Hobby n'est pas modifié.

Le serveur vérifie America/Toronto, l'anniversaire du jour et le bouton avant
chaque envoi. Aucun rattrapage des jours précédents. Les lots sont limités à vingt
contacts séquentiels. Le 29 février suit l'observation existante au dernier jour
de février. Les tests de courriels réels ne visent que des contacts QA dont la
boîte destinataire est contrôlée; les données privées ne figurent pas dans Git.

## Vérifications d'exploitation

- Comparer le nombre de contacts avant/après chaque migration.
- Compter les mappings dont le courtier diffère du contact ou sans naissance.
- Après réconciliation, vérifier les erreurs Google avant d'annoncer zéro doublon.
- Vérifier `cron.job`, `cron.job_run_details` et `net._http_response`, sans afficher
  la commande contenant des secrets ou les tokens Google.
- Les états `manual_sending`, `auto_sending` ou `uncertain` bloqués demandent une
  vérification des messages Gmail; ne pas les transformer aveuglément en échec.
