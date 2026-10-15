# Clients directs des transactions

Saisie manuelle seulement. La section est repliée par défaut entre Drive et Notes. Elle charge une seule liste par transaction, affiche six entrées avant « Voir tout » et ne crée aucun contact CRM.

## Accès et audit

`/api/transactions/[transactionId]/direct-clients` réutilise l'accès partagé CRM, comme `/api/transactions`. Les écritures exigent aussi une origine autorisée et l'identité d'espace signée pour l'audit (y compris Immoplus). Cela ne constitue pas un nouveau système d'authentification individuelle. Les lectures, modifications et suppressions sont filtrées par l'identifiant de transaction fourni dans l'URL ; une entrée ne peut pas être déplacée via le corps d'une requête.

La table `transaction_direct_clients` suit le modèle serveur seul de `transactions` et `transaction_notes` : RLS activée, aucun droit pour PUBLIC/anon/authenticated, accès service_role uniquement côté serveur. L'avis Supabase « RLS enabled, no policy » est attendu pour ce modèle de refus par défaut. La FK supprime seulement les clients directs d'une transaction lorsqu'elle est elle-même supprimée.

Les doublons sont comparés côté serveur par courriel normalisé ou téléphone sans ponctuation (préfixe nord-américain 1 facultatif). Le serveur répond 409 avec les correspondances ; l'utilisateur peut confirmer explicitement. Ce contrôle est un avertissement, pas une contrainte d'unicité, et ne garantit pas l'exclusion de deux ajouts simultanés.

## Vérification

Tests Vitest : `direct-clients.test.ts`, `direct-clients-server.test.ts`, et la route `direct-clients/route.test.ts`.
`supabase/tests/transaction_direct_clients.sql` teste les permissions des rôles publics, FK, audit et suppression ciblée, dans une transaction annulée. Les exemples sont fictifs.
