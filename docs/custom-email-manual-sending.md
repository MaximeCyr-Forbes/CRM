# Campagnes personnalisées : envoi manuel

Chaque étape nécessite un aperçu serveur et une confirmation `ENVOYER` sur la route
`/api/automatic-emails/custom-campaigns/[campaignId]/manual-send`.
Les dates, heures, délais et modes de simulation ne sont jamais des déclencheurs.
Les règles automatiques, leur verrou et leurs tables restent indépendants.

L’aperçu et l’envoi utilisent le même rendu de modèle et le service Gmail des
Contacts. Le serveur relit les Contacts sélectionnés et les identités SendAs.
Une empreinte des données et du HTML signé oblige à renouveler l’aperçu si ces
valeurs changent. Le HTML de signature fourni par Gmail est conservé tel quel.

La confirmation déclenche une boucle navigateur de groupes de trois Contacts,
traités séquentiellement côté serveur. Aucune reprise automatique après erreur,
fermeture ou rechargement du navigateur. Un Contact bloqué n’est pas envoyé.

Les tables `custom_email_manual_batches` et `custom_email_manual_deliveries`
sont réservées au serveur (`service_role`, RLS activée, accès public révoqué).
La contrainte unique `(step_id, contact_id)` interdit un deuxième envoi de la
même étape au même Contact, y compris avec un nouvel identifiant de lot.
Une réservation `pending` précède l’appel Gmail et ne peut jamais être reprise.

Un rejet Gmail explicite permet une nouvelle tentative **manuelle**. Le jeton
de tentative et la transition conditionnelle `failed` vers `pending` protègent
contre la répétition concurrente de cette tentative. Les réponses ambiguës,
erreurs réseau, erreurs Gmail 5xx et échecs de journalisation après envoi restent
`pending` : vérifier les messages envoyés dans Gmail, sans renvoyer aveuglément.

Les identifiants historiques n’ont pas de suppression en cascade vers les
Contacts ou les campagnes : leur suppression ne doit pas effacer la protection
ni le journal. Les compteurs visibles sont dérivés du journal des livraisons.
