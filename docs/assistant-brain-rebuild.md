# Assistant Forbes — architecture de consultation

## Baseline et diagnostic

Baseline : `2818a0e99f054a417bf9a3b775444c403d057420`.
Sauvegarde distante : `pre-assistant-forbes-brain-rebuild-2026-11-17`.
Une demande de navigation Contact avec le suffixe « dans mes contacts » produit
un faux résultat vide en Production (HTTP 200, 431 ms, une observation seulement).
Le nom extrait contient du contexte syntaxique. Le client interprète à nouveau
la commande. La conversation reconstruit son contexte depuis quatre questions,
sans conserver de référence résolue. Les recherches limitent les candidats avant
de donner priorité au nom exact. Ces responsabilités doivent être séparées.

## Architecture cible, définie avant implémentation

1. Catalogue déclaratif des modules, capacités, outils de lecture et relations
   vérifiables, adossé aux contrats UI et aux services existants.
2. Analyse locale produisant un plan strict Zod : mode, module, entité,
   recherche, filtres, relation, tri et référence contextuelle. Aucune requête
   SQL, URL arbitraire ou opération d'écriture ne provient du texte utilisateur.
3. Résolution d'entité indépendante : normalisation du nom entier, priorité
   aux correspondances exactes et inversées, ambiguïté explicite, couverture
   bornée signalée. Une erreur de lecture n'est jamais un résultat vide.
4. Routeur de consultation utilisant exclusivement les lectures existantes
   dans le contexte du membre authentifié. Les liens métier viennent des FK,
   jamais d'une ressemblance d'adresse. RLS et contrôle du courtier restent
   indépendants du plan et sont réappliqués à chaque lecture.
5. Résultat structuré, couverture et navigation décidées côté serveur. Le
   navigateur valide seulement la forme du lien interne et son appartenance
   aux liens retournés; il ne réinterprète pas la question.
6. État conversationnel borné contenant le dernier plan et une référence
   résolue. Cet état est un indice non fiable, jamais une autorisation : membre,
   expiration, nombre de tours et accès à la référence sont revérifiés.
7. Tests synthétiques de grammaire, résolution, permissions, outils, états,
   résultats et interface. Les noms réels de QA ne deviennent pas des fixtures.

## Invariants et limites

Lecture seule; pas de migration, de nouvelle infrastructure ni d'appel IA.
Le chemin IA externe désactivé et ses garde-fous financiers restent inchangés.
Les dépenses se lisent avec `materialize:false`. Les totaux ne sont jamais
calculés depuis un extrait. Les états Centris commerciaux ne finalisent pas une
vente CRM. Les réponses privées ne sont pas journalisées. La télémétrie se limite
aux modes, codes de résultat, nombres d'outils, durées et erreurs génériques.

La mesure initiale unique de 431 ms ne constitue pas un P95. Les mesures
répétées et les contrôles Production seront documentés séparément. Une requête
hors capacités vérifiées doit clarifier ou annoncer sa limite, sans inventer.

## Mesures et couverture avant déploiement

Cinq répétitions réseau de la formulation défaillante sur la baseline :
738, 370, 338, 277, 293 ms (P95 empirique de ce petit échantillon : 738 ms).
Il s'agit de réponses faussement vides, pas de résolutions réussies. La nouvelle
résolution exige deux outils : recherche puis contrôle du détail accessible.
Objectif de contrôle : P95 réseau inférieur à 3 s sur le même parcours, et
P95 du plan local inférieur à 25 ms sur les fixtures. Première mesure du plan :
0,054 ms sur 300 formulations synthétiques. Aucun résultat client n'est exporté.

L'état est limité à 20 tours et 20 minutes, remis à zéro avec la conversation
ou le membre. Les anciennes réponses ne sont jamais réutilisées comme preuve.
Les références partielles ne deviennent pas des références automatiques au
tour suivant. Les relations utilisent une collection explicite du catalogue.

Les modules sans lecture vérifiée (réglages, logiciels, courriels automatiques,
statistiques générales et calendrier Google) proposent leur aide UI et annoncent
leur limite. Le calendrier transactionnel et les liens de dossiers Drive se
consultent via les relations vérifiées; aucun appel Google n'est déclenché.
La compréhension locale n'est pas un modèle de langage universel : les demandes
hors grammaire doivent être précisées. Les vérifications inter-courtiers isolées
sont synthétiques lorsqu'aucune session réelle distincte n'est disponible.
