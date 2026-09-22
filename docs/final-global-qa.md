# QA visuelle finale — 21 septembre 2026

Sauvegarde immuable : `pre-final-global-qa-2026-09-21`, commit
`f4a37fb617ba1e5cf84884aae60586cabe0e8411`, tag publié avant les corrections.

## Corrections confirmées dans le navigateur

- L'en-tête du choix de courtier Immoplus débordait à 390 px. Les éléments
  se répartissent maintenant sur plusieurs lignes sans élargir la page.
- Les commandes principales de la barre mobile et la fermeture de la recherche
  globale ont une cible de 44 px. Le sélecteur de courtier utilise 16 px.
- La création Contact reçoit un nom accessible, le focus initial et une
  fermeture Escape. Le gestionnaire d'adresses reçoit un nom accessible.
- Les éditeurs et aperçus de courriels/campagnes, la simulation des envois et
  l'écran manuel répondent à Escape. Les actions existantes sont réutilisées ;
  Escape est neutralisé pendant les opérations en cours.

Les changements sont limités au CSS, au balisage et aux interactions clavier
des dialogues. Aucun endpoint, moteur métier, calcul, permission, schéma ou
configuration de service n'est modifié. Aucun PDF ou capture client n'est ajouté.

## Contrôles effectués

Chrome sur Windows : sélection, connexion, Immoplus, dashboard, Contacts,
deux fiches Contact, Listings et fiche, Transactions et fiche, références,
calendrier jour/semaine/mois/équipe, Drive et sous-dossier, statistiques,
courriels, campagnes, paramètres et recommandations.

Mesures aux dimensions 1920×1080, 1600×900, 1512×982, 1440×900, 1280×800,
1180×800, 1100×760, 1024×768, 900×700, 850×900, 800×900, 760×900,
1375×893, 1210×786, 430×932, 414×896, 402×874, 393×852 et 390×844.
1375 et 1210 px représentent l'espace disponible aux zooms 110 % et 125 %.

Modales contrôlées : Contact, courriel individuel, suivi, adresse, échéance,
nouvelle Transaction/OACIQ, liaison Drive, visite, offre, édition Listing,
événement/détail calendrier, référence/suivi, règles, simulation, campagne,
aperçu/envoi manuel et recommandation. Aucun formulaire métier enregistré,
aucun courriel envoyé pendant ces contrôles.

Navigation : page 3 Contacts et contact restaurés ; Immoplus utilisateur →
courtier → dashboard dans les deux sens ; lien référence → Transaction et
retour ; Drive racine → sous-dossier avec Précédent/Suivant.

Captures et mesures privées conservées uniquement dans `work/final-qa/`, ignoré
par Git. La classification des couleurs sémantiques/identitaires de
`premium-phase7.md` est conservée.

## Validation et limites

- 1 348 tests réussis, zéro échoué, six ignorés ; TypeScript et build réussis.
- Lint non configuré : script présent, mais ESLint et sa configuration absents.
- Les formats Mac/iPhone sont simulés ; aucun appareil Mac/Safari/iPhone physique
  n'était disponible. La tentative d'émulation `display-mode: standalone` n'a
  pas activé ce mode : le test PWA installé reste non vérifié.
- Deux erreurs préexistantes `[vinext] RSC prefetch setup error: TypeError: p is
  not a function` ont été observées sur la production initiale. Navigation
  fonctionnelle ; aucune modification du framework hors périmètre visuel.
- Aucun envoi réel de campagne : la campagne de contrôle existante ne contient
  aucun destinataire. Aperçu et historique contrôlés ; envoi couvert par les
  tests automatisés. Les quatre anciens envois manuels ne proviennent pas du QA.
- Google Picker reste soumis aux permissions/cookies Google du navigateur ;
  aucune extension d'accès ou nouvelle autorisation de dossier effectuée.
- Surveillance réseau sur les paramètres : aucun cycle de requêtes observé.
  Le verrou automatique reste actif, runner indisponible et zéro livraison
  automatique. Aucune migration ou tâche cron ajoutée.
