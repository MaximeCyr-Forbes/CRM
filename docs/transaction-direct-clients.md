# Clients directs des transactions

Saisie manuelle seulement. La section est repliée par défaut entre Drive et Notes. Elle charge une seule liste par transaction, affiche six entrées avant « Voir tout » et ne crée aucun contact CRM.

## Accès et audit

`/api/transactions/[transactionId]/direct-clients` réutilise l'accès partagé CRM, comme `/api/transactions`. Les écritures exigent aussi une origine autorisée et l'identité d'espace signée pour l'audit (y compris Immoplus). Cela ne constitue pas un nouveau système d'authentification individuelle. Les lectures, modifications et suppressions sont filtrées par l'identifiant de transaction fourni dans l'URL ; une entrée ne peut pas être déplacée via le corps d'une requête.

La table `transaction_direct_clients` suit le modèle serveur seul de `transactions` et `transaction_notes` : RLS activée, aucun droit pour PUBLIC/anon/authenticated, accès service_role uniquement côté serveur. L'avis Supabase « RLS enabled, no policy » est attendu pour ce modèle de refus par défaut. La FK supprime seulement les clients directs d'une transaction lorsqu'elle est elle-même supprimée.

Les doublons sont comparés côté serveur par courriel normalisé ou téléphone sans ponctuation (préfixe nord-américain 1 facultatif). Le serveur répond 409 avec les correspondances ; l'utilisateur peut confirmer explicitement. Ce contrôle est un avertissement, pas une contrainte d'unicité, et ne garantit pas l'exclusion de deux ajouts simultanés.

## Vérification

Tests Vitest : `direct-clients.test.ts`, `direct-clients-server.test.ts`, et la route `direct-clients/route.test.ts`.
`supabase/tests/transaction_direct_clients.sql` teste les permissions des rôles publics, FK, audit et suppression ciblée, dans une transaction annulée. Les exemples sont fictifs.

## Import de captures V2

Le bouton Importer une capture ouvre une prévisualisation avant toute écriture. Le dépôt sur la section, le sélecteur de fichier et le collage sont pris en charge. Images PNG/JPEG/WebP limitées à 12 Mo ; OCR local avec les fichiers Tesseract français déjà auto-hébergés dans le CRM, chargés à la demande. Aucune image ni texte OCR brut ne quitte le navigateur ou ne reste en stockage permanent. Le worker est terminé après lecture ou annulation.

Le parseur utilise les positions des mots pour reconstruire les colonnes puis rapproche les deux tableaux par nom normalisé. Les dates sans année sont signalées ; les coordonnées incertaines et doublons existants sont décochés. L’utilisateur peut corriger les six champs, choisir les lignes et confirmer un doublon. Les demandes multiples conservent leur contexte et la date la plus récente. Une capture sans tableau reconnu ne produit aucune entrée.

POST action=import réutilise les gardes authentification/origine/espace et la validation existantes. Un seul INSERT enregistre le lot entier. Les identifiants dérivés de la transaction et des UUID de prévisualisation rendent les reprises identiques idempotentes. Aucun contact, événement, note de transaction ou migration n’est créé par ce workflow.

Validation : 1 848 tests réussis, 7 ignorés ; TypeScript et build réussis ; tests SQL locaux de RLS/FK/audit réussis. ESLint absent de l’environnement. OCR réel testé sur capture synthétique avec six clients, formats PNG/JPEG/WebP, dépôt/sélecteur/collage et prévisualisation aux largeurs 1512/1440/1280/1100/390/393/414/430. La capture réelle fournie ensuite a révélé un défaut de segmentation des captures complètes : la barre latérale perturbait les en-têtes, le pied de tableau était pris pour une ligne et les noms coupés empêchaient la fusion. La segmentation OCR sparse, la délimitation depuis les en-têtes, l’exclusion des petits textes hors tableau et la fusion des noms coupés corrigent ce cas : six clients, dates et demandes regroupées. Un courriel ambigu et une demande partiellement masquée par un bouton nécessitent toujours une relecture signalée. Aucun contenu réel n’est utilisé dans les tests versionnés. Les données OCR doivent toujours être relues avant confirmation.

## Courriel aux clients directs V3

Sélection email uniquement, sélection globale des clients admissibles, composer avec retrait de destinataires et déduplication par adresse normalisée. L’objet reste vide comme dans le composer Contacts. Le serveur résout les adresses à partir des identifiants de clients de la transaction ; le payload ne comporte jamais de téléphone. Un compte courtier utilise son identité signée ; Immoplus utilise le courtier de travail, conformément au modèle existant.

Le service réutilise prepareGmailSender / sendPreparedGmailMessage : Gmail, signature SendAs, Reply-To et MIME existants, un destinataire par message, aucun CC/BCC. Les messages restent dans Gmail Envoyés. Les historiques des campagnes ne sont pas génériques ; une migration additive transaction_direct_client_email_deliveries fournit les reçus d’envoi et les réservations atomiques nécessaires à l’idempotence. Elle ne stocke pas le corps du message ni de téléphone. RLS activé, accès service_role uniquement. Aucun changement au pipeline Gmail partagé ou aux campagnes.

Une clé stable de composer identifie le lot, avec empreinte du contenu et des identifiants sélectionnés. Une ligne pending doit être réservée avant tout appel Gmail ; sent/sending/uncertain ne sont jamais renvoyées. Après réponse réseau perdue, Vérifier le résultat réutilise la même clé. Les résultats distinguent succès, échecs, attentes et résultats incertains. À la fermeture après résultat, seuls les échecs certains restent sélectionnés pour permettre une nouvelle rédaction explicite.

Validation : 1 867 tests réussis / 7 ignorés ; TypeScript et build réussis. Un premier lancement concurrent au build a dépassé le timeout d’un test OACIQ existant ; la suite complète relancée seule passe. ESLint absent de l’environnement. Tests SQL locaux : RLS, huit opérations publiques refusées, unicité et réservation atomique. QA navigateur locale : 29 contrôles, aux largeurs 1512/1440/1280/1100/390/393/414/430. Aucune donnée client réelle dans les fixtures.
