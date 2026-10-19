# Autorisation fonctionnelle des membres

Un membre Google vérifié, autorisé et actif dispose de toutes les fonctions métier du CRM. Maxime, France et Sandrine ont les mêmes capacités. Les rôles historiques restent des métadonnées, sans hiérarchie fonctionnelle.

La résolution DB conserve les vérifications Google, de session, de consentement OAuth et des identités actives ; elle retourne tous les contextes courtier. Le contexte consulté filtre/attribue les données et ne remplace jamais l’auteur authentifié. Les secrets Google, les tables d’identités, les journaux immuables et les fonctions techniques ne reçoivent aucun droit supplémentaire. Les ACL Google externes restent applicables.

Audit : les blocages étaient dans workspaceCapabilities, canManageStock, canEditBalance, requireWorkspaceAdmin, les policies crm_auth.is_admin, can_access et deux RPC inventaire. Les autres modules héritent des policies parent et du contrôle de membre existant. Les refus de version, stock disponible, origine, session et données invalides restent inchangés.

La surface MCP conserve les mêmes outils : aucun outil de suppression générale ni de diminution du stock. Les membres reçoivent les mêmes capacités pour les outils existants.

Tests : run-auth-rls reproduit d’abord les anciennes restrictions, applique la migration, puis vérifie AUTHORIZED MEMBERS HAVE FUNCTIONAL PARITY pour les trois membres. Les tests utilisent des identités synthétiques locales ; ils ne constituent pas une preuve de connexion OAuth réelle France/Sandrine.
