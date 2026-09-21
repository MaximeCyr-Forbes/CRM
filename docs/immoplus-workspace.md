# Espace Immoplus

Les espaces opérationnels sont France, Maxime, Sandrine et Immoplus. Les courtiers métier restent exclusivement France, Maxime et Sandrine. Aucun schéma Supabase n’est modifié.

`workspaceUser` détermine les capacités; `workingBroker` détermine le contexte métier. `selectedBroker` reste un alias compatible du courtier de travail pour les modules existants. Immoplus commence sans courtier, puis peut changer dans l’en-tête. Les espaces courtier utilisent toujours leur propre courtier. Les anciennes sessions `selected-broker` sont migrées vers deux clés distinctes dans sessionStorage.

Le changement de contexte remonte les fournisseurs de données et les pages: les anciennes requêtes ne peuvent pas remplir le nouvel état. Les filtres du courtier précédent sont retirés lors du changement. Les contacts et listings d’Immoplus sont filtrés par défaut sur son courtier de travail; les filtres explicites restent disponibles.

## Droits constatés

Les seules différences fonctionnelles Maxime existantes sont l’administration des recommandations (lecture, traitement, réouverture, suppression) et leurs notifications dans le tableau de bord. Elles utilisent désormais `workspaceCapabilities(workspaceUser)`. Le serveur exige également un jeton signé de l’espace pour ces opérations. Le jeton est obtenu avec l’accès CRM partagé existant et transmis dans un en-tête par onglet, indépendamment du courtier de travail. L’espace Immoplus n’a jamais la capacité d’administration, même pour Maxime.

L’écran de sélection reste opérationnel, accessible après le mot de passe d’équipe. Il ne constitue pas une authentification individuelle: une personne connaissant ce mot de passe peut choisir un autre espace, comme avant. Aucun compte, mot de passe ou connexion Google Immoplus n’est créé.

## Routage métier

Les créations utilisent le courtier de travail ou le choix explicite du formulaire. Pour une transaction existante, les services d’échéances et Google Agenda continuent d’utiliser transaction.broker. Les racines Drive et le calendrier personnel utilisent le courtier de travail. L’envoi Gmail conserve sa stratégie existante (contact direct: courtier sélectionné; campagne: stratégie persistée). Tous les validateurs de courtiers métier rejettent Immoplus.

Le verrou global des courriels automatiques et l’indisponibilité du runner restent inchangés.
