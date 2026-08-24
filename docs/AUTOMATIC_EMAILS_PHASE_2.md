# AUTOMATIC EMAILS — PHASE 2

Cette phase ne doit commencer qu’après le GO explicite de Maxime.

Éléments à ajouter volontairement lors de l’activation :

- un scheduler explicite et auditable;
- un runner serveur protégé par le verrou maître;
- une procédure d’activation contrôlée de `AUTOMATIC_EMAILS_ENABLED`;
- les statuts de livraison `sent` et `failed`;
- les retries limités, idempotents et surveillés;
- la file d’approbation et son action d’envoi manuelle;
- le Vercel Cron, seulement après validation de la fréquence et de la sécurité;
- la journalisation, les alertes et le monitoring des erreurs Gmail.

Avant cette future activation, il faudra effectuer une revue de sécurité, tester l’idempotence avec `rule_id + occurrence_key`, confirmer les connexions et signatures Gmail des trois courtiers, puis réaliser un déploiement contrôlé sans destinataire réel.
