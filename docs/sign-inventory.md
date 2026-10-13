# Pancartes / BAC

Accès : **Logiciels → Pancartes / BAC**, route `/sign-inventory`. Le module utilise le shell et la protection CRM existants.

Les propriétés viennent de `public.listings`, liées par ID. La recherche propose d’abord les statuts actifs, avec 30 résultats maximum. Les autres statuts restent recherchables. Une adresse figée sur l’attribution sert uniquement à préserver l’historique après suppression du listing (`ON DELETE SET NULL`). Aucune modification du statut d’un listing ne retourne le matériel.

Les courtiers viennent de l’enum métier `broker_assignment`, sans `unassigned`. Aucune liste de noms supplémentaire. Les pancartes sont comptées par courtier ; BAC et ajouts sont partagés. Les types de pancarte et les libellés d’ajout sont des données extensibles. Aucun stock initial n’est inventé : zéro jusqu’à la saisie dans Inventaire.

## Invariants et concurrence

`sign_inventory_availability()` calcule total − attributions actives, sans compteur manuel à synchroniser. `sign_inventory_write()` sérialise les écritures avec un verrou transactionnel PostgreSQL commun au module ; les opérations en attente relisent l’état validé. Attribution, modification des ajouts et validation finale du stock sont dans la même transaction : un stock insuffisant annule toute l’opération. Le changement de courtier libère et consomme les stocks atomiquement. Le retour est idempotent, conserve l’attribution et libère tout son matériel. Plusieurs attributions différentes peuvent partager le même listing. Un UUID d’opération stable protège contre le double clic et la répétition d’une création après perte de réponse. Les versions protègent les modifications et ajustements concurrents contre les écrasements.

Le total est un entier 0–100000, jamais inférieur au matériel actif. Les cinq tables ont RLS activée, aucun accès `anon`/`authenticated`. Même `service_role` n’a pas de DML direct : lecture et RPC uniquement. La fonction d’écriture est `SECURITY DEFINER`, avec `search_path` fixe et exécution révoquée à PUBLIC/anon/authenticated. L’API serveur valide le cookie CRM, l’origine et l’espace signé ; elle transmet l’acteur vérifié. Tous les membres peuvent attribuer/modifier/retourner ; seuls les rôles admin/assistant existants peuvent ajuster les totaux. L’accès personnel reste celui du CRM actuel (login partagé et espaces opérationnels), sans nouvelle authentification individuelle.

Les attributions conservent les dates et acteurs de création, modification et retour. `sign_inventory_events` garde les états avant/après chaque opération, y compris les stocks. Le volet Historique présente le matériel retourné, paginé par 50 ; aucun effacement utilisateur n’est proposé.

## Vérification

Tests Vitest : validation et permissions de l’API, séparation des ajouts, navigation. `supabase/tests/sign_inventory.sql` vérifie le cycle complet, transferts, conflits, quantités, histoire et privilèges dans une transaction annulée, sur une base isolée. Les courses réelles sur dernière pancarte, dernier ajout et dernière BAC sont aussi vérifiées avec les API en production et des données QA dédiées, supprimées après contrôle. Aucun import Sheets, aucune nouvelle dépendance payante, aucun service supplémentaire.

## Interface V2

Les trois actions permanentes du header ouvrent des dialogues. Le retour global recherche toutes les attributions actives, indépendamment des filtres de la page, et confirme chaque ensemble séparément. Les disponibilités restent regroupées dans une seule carte ; la circulation et les retours utilisent une table sur ordinateur et des cartes sur mobile.

Gérer l’inventaire valide tous les totaux avant de les envoyer, puis réutilise séquentiellement la RPC existante. En cas d’échec partiel, les quantités déjà enregistrées sont conservées ; un rechargement explicite des quantités est requis avant de réessayer. Chaque mutation recharge la vue et affiche une confirmation brève. Aucun changement de schéma, de permissions ou de logique de stock.

La vérification V2 utilise des données isolées pour les mutations et des lectures de production pour contrôler le rendu et l’intégrité des données existantes.
