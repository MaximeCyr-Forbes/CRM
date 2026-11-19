# Assistant Forbes — décision d'activation du 19 novembre 2026

## Décision

Conserver `ASSISTANT_ENABLED=false`. Le test fournisseur fonctionne, mais
l'approbation de confidentialité n'est pas documentée et aucun gain de
compréhension du chemin externe actuel n'est démontré. Les recherches locales
restent indépendantes du fournisseur, de sa clé et du budget.

Backup : `pre-assistant-forbes-api-activation-2026-11-19`, SHA
`bfbec72d35e38c135ec61472cc47fa9a890db31a`, identique à la Production de départ.

## Preuves financières et accès

- Organisation Personal, projet existant Assistant Forbes CRM.
- Attribution active : 100,00 USD sur 100,00 USD, créée le 19 novembre,
  expiration affichée le 19 décembre 2026 (heure non affichée).
- Facturation API : Free trial, aucun billing plan commencé, aucun moyen de
  paiement configuré et aucune facture. Aucun achat ni recharge activé.
  Aucun mécanisme de facturation de secours observé dans ce compte sans plan.
- Niveau API affiché : Launch. `gpt-6-luna` figure dans les limites autorisées.
- Ancienne clé expirée le 18 novembre. Rotation équivalente le 19 novembre :
  même projet, utilisateur, droits Responses read/write uniquement, durée un jour.
  Nouvelle valeur enregistrée exclusivement dans le secret Production Vercel
  `OPENAI_API_KEY`. Aucune copie sur disque ni dans ce dépôt.
- Aucun cycle de consommation CRM créé ou activé. Les tables existantes
  `assistant_billing_cycles` et `assistant_usage` étaient vides à l'audit.
- Plafond autorisé pour une activation ultérieure : **5 USD maximum**, crédits
  vérifiés uniquement. Ce document n'active pas ce budget. La contrainte SQL
  historique autorise jusqu'à 10 USD : l'activation devra explicitement fixer
  5 USD, jamais reprendre ce défaut historique ni créer de registre parallèle.
- Coupure conservatrice à appliquer à cette attribution :
  **2026-12-18T00:00:00Z**, avec vérification financière valable au plus 24 h.
  Aucun renouvellement automatique. La clé actuelle expire bien avant cette date.

## Test fournisseur réel, distinct du chemin CRM

Un clic Run dans le Playground Responses officiel, projet dédié, modèle
`gpt-6-luna`, Standard, reasoning none, Store logs désactivé, aucun outil.
Contrat JSON strict : module parmi contacts/listings/calendar et opération parmi
navigate/clarify. Entrée entièrement synthétique :
`{"concept":"contact_directory","action":"open"}`.

Résultat visible : `{"module":"contacts","operation":"navigate"}`.
HTTP 200 observé pour `/v1/responses`; interface : 101 tokens d'entrée,
19 de sortie, 1,7 s serveur + 867 ms réseau. Aucun deuxième clic Run, aucun
fallback ni relance initié. L'inspection complémentaire des traces a été
interrompue par le contrôle navigateur : le tab avait été déplacé vers Gmail.
Aucun accès à Gmail n'a été poursuivi. Le nombre de tentatives internes au
Playground n'est donc pas certifié par une trace complète.

Coût calculé d'après les tokens affichés : 0,0000196 USD au tarif Standard
non caché; plafond conservateur 0,000022125 USD si toute l'entrée était facturée
comme écriture de cache. Ce n'est pas un débit comptable relevé au centime.
Le test valide le modèle dans le projet, **pas l'authentification de la nouvelle
clé via le serveur CRM**, ni le registre CRM. Aucune fausse consommation CRM
n'a été insérée pour représenter un appel effectué hors de ce serveur.

Tarifs vérifiés : [fiche officielle GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
0,10 USD entrée / 0,50 USD sortie par million de tokens; cache write 0,125 USD.

## Évaluation de l'utilité

`external-utility.test.ts` contient 30 questions synthétiques : navigation,
guides, explications, demandes d'écriture refusées, clarification et suivi.
Référence identique pour les deux chemins. Le moteur local obtient **29/30**
sur module + mode. Le cas « Ouvre Calendrier » puis « Et pour demain ? »
est routé vers Transactions : limite locale identifiée, non corrigée ici.

L'aide externe existante accepte uniquement un ordre de sections, jamais un
plan de recherche. Les deux ordres opposés autorisés sont simulés et validés :
le plan local reste identique, donc **29/30 avec cette aide, gain 0/30**.
Les tests n'appellent jamais OpenAI. Cette comparaison structurelle ne prétend
pas mesurer la qualité d'un nouveau classifieur neuronal sur 30 appels réels.
Le test fournisseur unique est un smoke test de compatibilité, pas un benchmark
de compréhension. Latence ajoutée réelle observée sur ce smoke test : environ
2,567 s, sans avantage de compréhension établi pour le chemin actuel.

Une projection fermée du plan déjà reconnu (module/mode/action) ne restitue pas
les nuances perdues par le moteur local. Envoyer la question après simple
masquage ne satisfait pas la frontière de confidentialité demandée. Aucun de
ces deux raccourcis n'est activé ou présenté comme une amélioration.

## Confidentialité et conditions restantes

Les requêtes CRM, résultats, noms, notes, coordonnées, adresses, prix, identifiants
et historiques restent dans le traitement serveur CRM/Supabase existant.
Le test ne contient que des concepts synthétiques. OpenAI reçoit néanmoins
les métadonnées de compte/projet, connexion et horodatage du test.
`store:false` ne promet pas une rétention technique nulle. Résidence du projet
Global; les conditions contractuelles et la conservation technique restent à
examiner par le responsable compétent. Voir la revue de confidentialité
existante; aucune signature ni valeur `privacy_reviewed=true` n'a été inventée.

Activation toujours conditionnée à une utilité mesurable d'une nouvelle capacité
réellement sûre, une approbation applicable, un cycle explicite plafonné à 5 USD,
une clé valide et un test serveur avec réservation atomique. Ne pas activer
`GENERIC_PLAN_BODY` pour prétendre améliorer la compréhension.

## Vérifications

Tests ciblés : 895 réussis. Suite complète : 3761 réussis, 0 échec,
7 ignorés (fixtures privées OACIQ non disponibles, déjà ignorées).
TypeScript réussi après correction du typage du nouveau test.
Build Windows local : échec environnemental ENOENT dans `node_modules/.vite-temp`
(jonction des dépendances); le build Vercel reste la preuve Production requise.
Lint déclaré, mais ESLint absent des dépendances installées : non exécutable.
Aucun changement du comportement applicatif ou des données métier.
