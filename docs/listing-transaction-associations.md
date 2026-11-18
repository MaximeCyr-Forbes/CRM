# Rattachement documentaire Listing / Transaction

Baseline Production et sauvegarde : `15793611ea5cc499501696765eef01aba0fb263a`,
`pre-smart-listing-transaction-link-2026-11-17`.

Le lien existant impose une offre et porte la provenance PA acceptée. Il reste
intact. Une table séparée conserve les associations documentaires, leurs acteurs,
versions et détachements. Aucun backfill ni association automatique.

Les lectures utilisent le client du membre authentifié et les RLS des deux
dossiers. Les mutations passent par un RPC transactionnel à identité vérifiée,
sans acteur fourni par le navigateur. Les droits directs d'écriture sur les
nouvelles tables sont retirés. Les FK sont RESTRICT. Une Transaction ne possède
qu'une association non détachée ; un Listing au plus une association principale.
Un lien PA existant est reconnu sans duplication. Les verrous Listing puis
Transaction sérialisent les confirmations et les liens PA concurrents. La
création PA vérifie aussi les associations avant toute création d'offre.

Une Transaction annulée est proposée en historique. Une association principale
devenue annulée est conservée et reclassée historiquement lors d'un nouveau
rattachement principal, avec audit. Un lien PA ne se détache pas via cette UI.

Le moteur local classe les preuves : Centris exact, adresse complète, adresse
concordante avec éléments manquants, correspondance possible, conflit. Unité,
numéro civique, direction et type incompatibles restent visibles comme conflits.
Le prix n'est pas une clé d'identité. Aucun pourcentage de confiance. L'utilisateur
confirme les deux dossiers et reconnaît explicitement les conflits affichés.

La QA Production consulte les suggestions et le dialogue sans confirmer les vrais
dossiers. Les écritures, courses, détachements et refus sont testés isolément.
Baseline : 18 Listings, 24 Transactions, 693 Contacts, 0 offre, 0 lien PA,
8 attributions de matériel. Aucun changement métier attendu en Production.

Le CLI local a réservé le nom de migration mais son écriture Windows a échoué
avec `MigrationNewWriteError`; le fichier porte exactement le nom retourné.
