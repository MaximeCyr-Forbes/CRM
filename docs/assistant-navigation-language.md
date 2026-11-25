# Navigation naturelle — 25 novembre 2026

La grammaire commune du catalogue lit commande, prépositions/qualificatifs puis destination exacte. Les routes restent issues du catalogue, autorisées par le serveur et validées à nouveau par le client. Aucun second routeur, accès fournisseur IA ou changement métier.

Les deux formulations P0 ont été reproduites sur la Production b7c4fc4 avant correction. Les verbes « mamener » et les qualificatifs « section/onglet » empêchaient la reconnaissance ; une clarification précédente était aussi perdue lors de la reconstruction de l’historique.

Le nouveau benchmark indépendant ajoute 246 tests : 120 navigations dans 15 destinations avec huit familles grammaticales, 90 intentions négatives/aide/écriture, 7 reprises conversationnelles avec état ou historique, 4 changements de sujet, 3 ambiguïtés, 7 recherches ou suffixes non assimilables à un module, 3 contrôles de permissions, 11 formulations dictées ou fautes mineures, et un contrôle de couverture. Les routes attendues sont écrites dans les tests, pas calculées depuis les alias de production. Deux tests supplémentaires passent par le véritable handler HTTP avec authentification simulée et interdisent toute lecture métier ou requête fournisseur. Deux autres vérifient toute la chaîne composant → handler → router. L'assertion de fermeture du dialogue attend l'effet React, évitant une course intermittente du test.

Les tests existants couvrent également recherche de Contacts, Listings, Transactions, comptabilité, échéances et relations documentaires. Le composant continue à suivre uniquement navigateTo validé ; il ne réinterprète pas la phrase.

Limites : grammaire locale déterministe, pas compréhension universelle. Aucune correction approximative des noms de personnes, adresses ou destinations inconnues. Une recherche de documents reste distincte de la navigation et conserve les limites de lecture actuelles. Une simple destination sans commande est acceptée après navigation/clarification ; un onglet explicitement nommé peut être ouvert directement. Les demandes avec plusieurs destinations reconnues proposent un choix, sans navigation automatique.
