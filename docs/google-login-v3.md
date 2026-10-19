# Connexion Google V3

La connexion de secours existante est permanente. Sa validation, son mot de passe, ses routes, son cookie et ses variables restent inchangés. La confirmation d’une première association appelle le même validateur dans un endpoint distinct, limité à cinq tentatives par identité sur quinze minutes.

La base est la source d’autorité : Google vérifié, session vivante, domaine exact autorisé, membre actif. Les deux domaines sont configurés dans `crm_auth.allowed_google_domains`. Un domaine seul ne donne aucun accès CRM.

Ordre de résolution : sujet Google déjà lié, adresse connue, nom complet du profil Google correspondant exactement à un unique membre, puis confirmation manuelle. La comparaison de profil lit exclusivement `auth.identities`, jamais les métadonnées utilisateur modifiables ni des attributs fournis par le navigateur. Les identités désactivées ou conflictuelles ne peuvent pas se réassocier automatiquement. Aucun membre n’est créé.

Un compte inconnu du domaine conserve une session limitée à l’association : choix d’un membre existant et mot de passe de secours. Seul le serveur, après vérification, peut appeler la confirmation privilégiée. Les associations sont auditées avec leur méthode ; aucune donnée OAuth sensible n’est journalisée.

Le sujet Google reste la clé après association, même si l’adresse corporative change. Un passage vers un domaine externe est refusé. Les sessions MCP conservent la vérification de consentement et ne peuvent pas créer une association.

Les erreurs OAuth reviennent à un écran lisible. « Utiliser un autre compte Google » nettoie la session CRM Google et lance `select_account`. L’ouverture du secours nettoie uniquement la session Google partielle ; les connexions Gmail, Agenda et Drive sont indépendantes.

Validation : tests PostgreSQL sur aliases, sujets, domaines, profils ambigus, identité désactivée, RLS avant association, confirmation privilégiée, audit et limites ; tests HTTP sur callback, nettoyage, origine et confirmation. Les tests synthétiques ne remplacent pas une connexion OAuth réelle de Sandrine ou France.

Sauvegarde : `pre-google-login-v3-2026-10-19`. Pour revenir en arrière, restaurer le code depuis ce tag sans modifier le tag ; conserver le secours actif. La migration additive conserve les anciennes tables et signatures de résolution. Ne supprimer aucune identité ou donnée métier pour un retour arrière.
