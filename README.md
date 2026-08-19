# Équipe Forbes CRM

CRM immobilier privé pour France, Maxime et Sandrine. L’application regroupe les contacts, relances, notes, transactions et échéances, avec persistance Supabase et synchronisation unidirectionnelle vers Google Agenda.

## Prérequis

- Node.js 22.13 ou plus récent
- pnpm, ou npm
- un projet Supabase
- un projet Google Cloud avec Google Calendar API activée

## Installation locale

1. Installer les dépendances :

   ```bash
   pnpm install
   ```

2. Copier `.env.example` vers `.env.local`.
3. Ajouter les variables décrites ci-dessous dans `.env.local`.
4. Exécuter le fichier `supabase/schema.sql` dans l’éditeur SQL Supabase.
5. Lancer l’application :

   ```bash
   pnpm dev
   ```

Le CRM est ensuite disponible sur `http://localhost:3000`.

## Variables d’environnement

Toutes les valeurs sensibles restent uniquement dans `.env.local` ou dans les secrets de l’environnement de déploiement.

| Variable | Utilisation |
| --- | --- |
| `CRM_ACCESS_PASSWORD` | Mot de passe universel du CRM, vérifié côté serveur |
| `NEXT_PUBLIC_SUPABASE_URL` | URL publique du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Accès Supabase réservé au serveur |
| `NEXT_PUBLIC_APP_URL` | Origine complète de l’application, sans barre finale |
| `GOOGLE_CLIENT_ID` | Client OAuth Google |
| `GOOGLE_CLIENT_SECRET` | Secret OAuth Google réservé au serveur |
| `GOOGLE_OAUTH_STATE_SECRET` | Secret long utilisé pour signer l’état OAuth |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Clé Base64 de 32 octets pour chiffrer les jetons Google |

Ne jamais inscrire le vrai mot de passe CRM, une clé Supabase ou un secret Google dans le dépôt, le README ou une variable `NEXT_PUBLIC_*`.

## Accès au CRM

Le mot de passe universel est comparé uniquement sur le serveur. Une connexion valide crée un cookie signé, HTTP-only, `SameSite=Strict`, sécurisé en production et valable sept jours. Toutes les pages et API privées vérifient cette session.

Le courtier sélectionné indique l’environnement consulté. Cette sélection est une préférence temporaire de navigation; les données métier restent toujours dans Supabase.

## Supabase

Le schéma complet se trouve dans `supabase/schema.sql`. Il crée et sécurise notamment :

- `contacts`
- `client_notes`
- `contact_merges`
- `transactions`
- `transaction_contacts`
- `transaction_deadlines`
- `transaction_notes`
- `google_calendar_connections`

Row Level Security est activée sur les tables CRM. Les rôles `anon` et `authenticated` n’ont aucun accès direct aux données. Les lectures et modifications passent par les routes serveur protégées utilisant `service_role`; cette clé n’est jamais envoyée au navigateur.

Réexécuter le schéma après une mise à jour qui ajoute une table, une colonne, un index ou une fonction SQL. Les déclarations sont conçues pour préserver les données existantes.

## Google Agenda

### Configuration Google Cloud

1. Activer Google Calendar API.
2. Configurer l’écran de consentement OAuth.
3. Créer un client OAuth 2.0 de type Application Web.
4. Ajouter les comptes autorisés comme utilisateurs de test si l’application OAuth est en mode test.
5. Configurer les URI de redirection :

   - local : `http://localhost:3000/api/google-calendar/callback`
   - production : `https://votre-domaine/api/google-calendar/callback`

Dans **Paramètres**, connecter séparément le calendrier de France, Maxime et Sandrine. Une relance ou une échéance utilise toujours le calendrier du courtier responsable.

La synchronisation conserve l’identifiant de l’événement pour modifier le même événement au lieu d’en créer un nouveau. Une erreur Google ne bloque pas l’enregistrement des données CRM dans Supabase. Les jetons OAuth sont chiffrés avant leur stockage et ne sont jamais retournés au frontend.

## Commandes

```bash
pnpm dev       # développement local
pnpm build     # build de production
pnpm start     # démarrage du build
pnpm lint      # analyse statique
```

Les commandes npm équivalentes fonctionnent aussi, notamment `npm run build`.

## Déploiement

1. Configurer toutes les variables d’environnement dans la plateforme cible.
2. Utiliser une URL HTTPS comme `NEXT_PUBLIC_APP_URL`.
3. Ajouter l’URI Google OAuth de production.
4. Appliquer `supabase/schema.sql` au projet Supabase de production.
5. Exécuter `pnpm build`, puis déployer le résultat avec la configuration `.openai/hosting.json` ou la plateforme compatible choisie.

Ne jamais copier `.env.local` dans l’artefact de déploiement.

## Structure du projet

```text
app/
  api/                    routes serveur protégées
  components/             navigation, modales et composants partagés
  contacts/               répertoire et fiches contacts
  dashboard/              vue quotidienne par courtier
  settings/               connexions Google Agenda
  transactions/           liste et fiches transactions
  data/                    types et libellés métier
  lib/                     sécurité, Supabase et services Google
proxy.ts                   protection centrale des routes
supabase/schema.sql        schéma, index, fonctions et règles RLS
```

## Sécurité avant mise en production

- `.env.local` et les fichiers `.env*` sensibles sont ignorés par Git.
- `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET` et les jetons OAuth restent côté serveur.
- `CRM_ACCESS_PASSWORD` ne doit jamais être préfixé par `NEXT_PUBLIC_`.
- Le site doit être servi en HTTPS afin que le cookie utilise l’attribut `Secure`.
- Tester la déconnexion et l’accès direct à chaque route privée avant une mise en ligne.
