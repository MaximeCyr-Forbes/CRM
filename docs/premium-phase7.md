# Phase 7 — modules et palette

Sauvegarde immuable : `pre-final-modules-redesign-2026-09-21`, commit
`8e900c7cd4ab354727e8c1badb871032507ac0b8`.

## Périmètre

CSS de présentation pour Drive, Statistiques, Courriels et Paramètres. Les seuls
changements TSX sont l'import de la feuille de style et les titres de Paramètres.
Les liens, gestionnaires, calculs, contrôles d'autorisation, API et moteurs métier
sont conservés. Aucune migration ni modification de configuration.

Les surfaces et accents décoratifs utilisent les tokens du shell : blanc, gris
neutre, texte foncé et bleu doux. Le bandeau des contacts non attribués, la
sélection et le retour sur un contact utilisent le bleu doux. Les dialogues
conservent leur fonctionnement, avec hauteur `dvh`, défilement et commandes
accessibles sur les fenêtres étroites. Les champs mobiles sont à 16 px.

## Usages chauds conservés après audit

| Classification | Sélecteurs / usages | Justification |
| --- | --- | --- |
| INTENTIONAL_BRAND_DETAIL | `--gold`, `.brand-lockup h1 strong` | Petit libellé CRM de l'écran de sélection, aucun panneau décoratif doré. Logos inchangés. |
| INTENTIONAL_BRAND_DETAIL | `.broker-france`, `.calendar-event-france` | Identité chromatique du courtier ; séparation visuelle existante à préserver. |
| INTENTIONAL_BRAND_DETAIL | `.calendar-kind-birthday`, `.calendar-kind-centris_showing`, `.calendar-kind-follow_up` | Couleurs des catégories d'événements, explicitement conservées. |
| SEMANTIC_WARNING | `.priority-tiède`, `.listing-interest-medium`, `.listing-report-interest-medium` | Niveau de priorité ou d'intérêt. |
| SEMANTIC_WARNING | `.listing-offer-status-negotiating`, `.listing-offer-status-countered` | Négociation ou contre-offre en cours. |
| SEMANTIC_WARNING | `.listing-attention-watch`, `.listing-attention-attention`, `.listing-card-expiration-watch` | Surveillance ou expiration d'une inscription. |
| SEMANTIC_WARNING | `.listing-report-warning`, `.listing-report-unavailable`, `.purchase-agreement-warning` | Rapport incomplet ou donnée à vérifier. |
| SEMANTIC_WARNING | `.calendar-pending`, `.calendar-sync-pending`, `.calendar-centris-warning`, `.daily-notifications-data-warning` | Synchronisation en attente et avertissement de données. |
| SEMANTIC_WARNING | `.recommendation-broker-required` | Courtier requis pour la soumission. |
| SEMANTIC_WARNING | `.incomplete-warning`, `.field-confidence-low`, `.oaciq-warnings` | Analyse ou confiance insuffisante. |
| SEMANTIC_WARNING | `.automatic-email-rule-status.incomplete`, `.automatic-email-rule-issues`, `.automatic-email-editor-warning`, `.automatic-email-schedule-list .blocked` et ses détails | Configuration incomplète ou destinataire bloqué ; simulation informative en bleu. |
| SEMANTIC_WARNING | `.dash-status-inspection`, `.dash-status-other_conditions`, statuts conditionnels des Transactions/Listings | Conditions transactionnelles actives. |

Les états de succès restent verts, les erreurs, retards et actions destructives
restent rouges. Ces états ne sont pas des accents décoratifs à supprimer.

## Validation

- Suite complète : 1 347 tests réussis, 0 échoué, 6 ignorés ; TypeScript et build réussis.
- Vérification Chrome sur URL isolée avant push : Drive racine/sous-dossier,
  Précédent/Suivant, retour interne, recherche ; filtres statistiques courtier et
  année ; éditeur automatique annulé, éditeur campagne annulé, aperçu manuel et
  historique sans envoi ; paramètres Google, confirmation de retrait Drive annulée,
  recommandations déjà lues/terminées et filtres.
- 14 dimensions par module, dont 1512/1440/1280/1180/1100/1024/900/800 et
  430/414/393/390 px ; 1375 et 1210 px simulent l'espace disponible à zoom
  110 % et 125 %. Ce ne sont pas des tests physiques macOS/Safari/iPhone.
- Le sélecteur Google s'ouvre ; son iframe demande des cookies Google dans le
  navigateur de test. La sélection finale de dossier n'a pas été exécutée.
- La campagne existante a zéro destinataire : aperçu/historique vérifiés, aucun
  envoi déclenché. Confirmation, personnalisation et signature couvertes par la
  suite automatisée existante ; aucune donnée de destinataire ajoutée pour ce test.
- Le verrou serveur reste actif : `configuredMasterLock=false`, `locked=true`,
  `runnerAvailable=false`, zéro livraison automatique. Aucun cron ajouté.

La phase de QA finale globale distincte n'est pas démarrée.
