# Assistant Forbes — dossier EFVP et décision de mise en service

Version : 17 novembre 2026. Projet : CRM Équipe Forbes existant. Baseline : `beeebef16548e7a449967e900f628cd7e1d2ef52`. Sauvegarde : `pre-assistant-forbes-privacy-completion-2026-11-17`, même SHA.

**Décision technique : livrable désactivé. Décision de conformité : en attente.** Le dossier est préparé dans la mesure des preuves disponibles; aucune signature, validation juridique, acceptation contractuelle ou autorisation client n’est présumée. Le propriétaire a autorisé le développement, les audits internes, les tests synthétiques et le déploiement sans frais. Il n’a pas fourni de validation documentée du responsable des renseignements personnels. Aucune communication réelle à OpenAI n’a été effectuée pour cette mission.

## 1. Finalité, portée et proportionnalité

Assistance ponctuelle aux membres authentifiés pour retrouver des fiches, lire des états structurés, repérer des échéances et consulter l’inventaire. Aucune décision automatisée sur une personne, prospection, écriture métier ou finalisation. L’utilisateur doit vérifier les fiches sources avant toute action. Les fonctionnalités CRM ordinaires restent utilisables sans IA.

Alternative retenue : recherche et permissions entièrement dans le backend CRM, puis formulation sur un extrait minimal. Alternative écartée : envoyer question libre, historique et notes au modèle pour qu’il explore les données. Une demande non reconnue est clarifiée localement. Le résumé est volontairement limité aux champs structurés; il ne résume pas les notes privées. L’utilité réelle du modèle devra être évaluée ultérieurement avec des exemples synthétiques autorisés, sans déduire sa qualité des mocks.

## 2. Personnes, catégories de données et nécessité

Personnes potentiellement concernées : clients, prospects, propriétaires et membres autorisés. Les dossiers immobiliers peuvent contenir des renseignements financiers, familiaux ou d’autres données sensibles. Le périmètre du destinataire externe est nettement plus étroit que celui des lectures internes.

| Demande | Recherche interne autorisée | Données candidates pour OpenAI | Exclusions |
| --- | --- | --- | --- |
| Nombre de Listings actifs | Service Listings existant, courtiers permis | Total numérique uniquement | Toutes les fiches individuelles |
| Recherche par nom/adresse | Recherche locale, cinq résultats maximum par catégorie | Étiquettes éphémères et champs structurés disponibles, cinq fiches maximum au total | Terme recherché, noms, adresses, UUID, liens |
| Résumé d’une fiche ouverte | Lecture du dossier après contrôle d’accès | Statut de vocabulaire fermé, type, dates pertinentes, échéances limitées | Coordonnées, notes, documents, signatures |
| Prix demandé explicitement | Même fiche autorisée | Champs de prix numériques autorisés | Prix vendu inventé, données financières de notes ou de comptabilité |
| Échéances | Lecture bornée par dates | Dates, état terminé, étiquettes | Titres libres, clauses et noms |
| Stocks | Disponibilités existantes | Total/utilisé/disponible numériques | Adresses, personnes et instructions libres |
| Coordonnées, notes ou documents | Lien vers la fiche autorisée si contexte fourni | Aucun appel modèle | Contenus demandés restent consultables dans le CRM |

Les dates/statuts/prix peuvent permettre une réidentification par recoupement. Il s’agit de **pseudonymisation**, pas d’une anonymisation légale garantie. Les étiquettes sont recréées à chaque question. Les liens réels restent visibles uniquement dans le CRM, après une lecture autorisée; leur libellé n’est pas envoyé au fournisseur. Aucun export intégral, pièce jointe, signature, PDF, image ou fichier Drive.

## 3. Flux, destinataires et accès

Navigateur CRM authentifié → route serveur Vercel → résolution du membre Google en base → lectures existantes avec client Supabase du membre/RLS → projection fermée → éventuel POST HTTPS Responses → réponse texte et liens CRM séparés.

Le navigateur envoie la question au CRM, mais plus son historique. Le serveur ne transfère ni question brute ni historique ancien accepté par compatibilité. Au plus quatre lectures locales et un appel modèle. Aucun outil n’est fourni au modèle. Un retour demandant un outil est refusé, sans exécution. Le contrôle de membre est répété immédiatement avant tout appel externe; les permissions proviennent de l’identité serveur, jamais du courtier sélectionné dans l’interface. Les accès partagés actuels entre courtiers sont conservés; aucun rôle n’est élargi par cette mission.

Le registre d’usage est accessible seulement au service serveur. Vérification Production du 17 novembre : RLS activée sur Contacts, Listings, Transactions et les deux tables Assistant; aucun privilège de table accordé à `anon`/`authenticated` sur les tables Assistant. Zéro cycle et zéro ligne d’usage. Les tests couvrent refus d’identité, contexte interdit, autre courtier hors périmètre et accès partagé autorisé. Une activation doit conserver ces contrôles.

## 4. Fournisseur, région et communication hors Québec

L’organisation OpenAI accessible est Personal; le projet dédié Assistant Forbes CRM a une résidence **Global**, et l’option Canada n’était pas disponible lors de la préparation V2 le 17 novembre. Aucun traitement exclusivement québécois ou canadien n’est promis. Vercel et Supabase demeurent les hébergeurs CRM existants; leur localisation effective et leurs contrats doivent être rattachés à l’EFVP globale de l’entreprise, dont aucune référence approuvée n’a été fournie ici.

La liste OpenAI du 14 octobre 2026 prévoit notamment de l’infrastructure API aux États-Unis et dans plusieurs autres pays, ainsi que des services de support/modération. Elle ne permet pas d’affirmer où une requête particulière sera traitée. Conserver sa version lors de l’approbation et suivre les changements. [Liste officielle des sous-traitants](https://openai.com/policies/sub-processor-list/).

L’évaluation hors Québec reste **à compléter par le responsable** : entité contractante exacte de l’entreprise, régimes juridiques des destinations pertinentes, protection adéquate, accès gouvernementaux, recours et mesures contractuelles applicables. La projection réduit l’exposition sans supprimer ce travail. La CAI demande une EFVP et une entente écrite pour la communication hors Québec; l’absence de résidence canadienne n’est ni une interdiction automatique ni une conformité acquise. [CAI — utilisation et communication](https://www.cai.gouv.qc.ca/protection-renseignements-personnels/information-entreprises-privees/utilisation-communication-renseignements-personnels).

## 5. Conservation, entraînement et journalisation

Le code fixe `store:false` sur Responses. La documentation du fournisseur indique que les données API ne servent pas à l’entraînement par défaut, sauf partage volontaire; elle distingue le stockage applicatif des journaux de surveillance des abus, pouvant durer jusqu’à 30 jours avec exceptions. Le cache de prompts peut persister jusqu’à 24 heures. Aucun droit Zero Data Retention n’est établi pour ce compte. Ces limites excluent toute promesse de conservation zéro. [Contrôles de données OpenAI](https://developers.openai.com/api/docs/guides/your-data).

Observation du compte revérifiée dans le navigateur le 17 novembre pendant cette mission : partages feedback, évaluations/fine-tuning et entrées/sorties API désactivés; journalisation API « Enabled per call », dont l’interface indique que `store:false` désactive le stockage Responses. Cela ne garantit pas une rétention globale nulle. Recontrôler ces réglages avant activation. Aucun partage n’a été activé pour obtenir des crédits; aucun réglage global des autres projets n’a été modifié.

Le CRM ne persiste pas les conversations de cet Assistant. Le dialogue reste en mémoire du composant jusqu’à sa réinitialisation ou la fin de session; fermer puis rouvrir peut conserver cette mémoire. Pas de contenu dans le registre d’usage : identifiants techniques, dates, jetons, coûts et état seulement. Pas de `console.log` de question, résultat ou secret dans ce chemin. Les journaux d’hébergement peuvent contenir les métadonnées HTTP; le responsable doit confirmer leur durée et l’accès administratif. Définir la durée du registre technique dans la politique de conservation globale; aucune suppression automatique n’est introduite.

## 6. Garanties contractuelles et base juridique

Le DPA public OpenAI, effectif le 1er janvier 2026, décrit un rôle de sous-traitant, des instructions documentées, la confidentialité, la sécurité, l’assistance aux droits, les incidents et la sous-traitance. Sa publication n’établit pas que l’entreprise Forbes est correctement identifiée et engagée par le compte Personal. Il faut conserver la preuve du contrat applicable, de l’entité cliente, du signataire habilité et des garanties retenues pour ce traitement. Aucune acceptation nouvelle n’est simulée dans ce dossier. [DPA OpenAI](https://openai.com/policies/data-processing-addendum/).

La loi québécoise prévoit notamment l’EFVP pour un système traitant des renseignements personnels et l’évaluation hors Québec. L’exception de mandat/contrat de service de l’article 18.3 peut être une piste à examiner, avec nécessité et garanties écrites; son applicabilité à cet usage n’est pas présumée. À défaut d’une base applicable documentée, déterminer les consentements requis. L’autorisation de coder du propriétaire n’est pas le consentement des clients. [Loi P-39.1, notamment articles 3.3, 17 et 18.3](https://www.legisquebec.gouv.qc.ca/fr/pdf/lc/P-39.1.pdf).

Action du responsable : vérifier les finalités initiales de collecte, la compatibilité de l’assistance IA, les avis de confidentialité existants et le régime de consentement/exception choisi; documenter les droits d’accès, correction et retrait lorsqu’applicables. Une information client préparatoire pourrait préciser l’assistance interne, les catégories minimisées, le fournisseur et le transfert hors Québec, les durées réelles et le contact du responsable. Elle ne doit pas être publiée comme approuvée avant cette décision. Les coordonnées et la nomination de la personne responsable restent à confirmer. [CAI — responsabilité de l’entreprise](https://www.cai.gouv.qc.ca/protection-renseignements-personnels/information-entreprises-privees/responsable-protection-renseignements-personnels-entreprise).

## 7. Registre des risques et mesures

Échelle qualitative : faible, moyen, élevé. Le risque résiduel décrit une éventuelle mise en service avec les contrôles techniques; les inconnues légales restent bloquantes.

| Risque | Initial | Mesure vérifiable | Résiduel / décision |
| --- | --- | --- | --- |
| Envoi excessif de notes/coordonnées | Élevé | Projection fermée, aucune question/historique brut, textes privés exclus | Faible techniquement; tests de non-egress |
| Réidentification via dates/prix | Élevé | Étiquettes éphémères, prix sur demande, cinq fiches | Moyen; nécessité à approuver |
| Injection depuis question ou note | Élevé | Intentions locales, vocabulaire fermé, aucune instruction libre au fournisseur, aucun outil IA | Faible; sorties encore non fiables |
| Accès hors identité | Élevé | Session Google, RLS, contrôles d’accès existants, revalidation avant appel | Faible; comptes compromis restent un risque |
| Écriture métier ou action externe | Élevé | Aucun dispatcher d’écriture ni outil modèle | Faible; tests refus suppression/envoi |
| Hallucination ou mauvaise association | Moyen | Labels, liens vérifiés, clarification locale, pas de décision automatisée | Moyen; vérifier la fiche, qualité IA non testée réellement |
| Fuite de clé | Élevé | Clé restreinte serveur Vercel sensible, pas dans navigateur/logs, expiration courte | Faible; revue des accès administrateurs requise |
| Conservation/support hors Québec | Élevé | `store:false`, partage désactivé, contenu minimisé | Moyen; analyse juridique/contractuelle manquante |
| Base juridique/avis client insuffisants | Élevé | Désactivation et condition `privacy_reviewed` non validée | Bloquant avant transfert réel |
| Dépense non autorisée | Élevé | Flag false, aucun cycle, aucune requête réelle; réservations atomiques testées | Aucun appel de cette livraison; finances à revérifier séparément |

La méthode doit être revue à chaque ajout de champ, outil, fournisseur, résidence, durée, capacité d’écriture ou mémoire. Le [guide EFVP de la CAI](https://www.cai.gouv.qc.ca/uploads/pdfs/CAI_GU_EFVP.pdf) sert de référence à cette évaluation proportionnée. Les tests ne constituent pas une certification juridique.

## 8. Procédure d’incident proposée

1. Responsable opérationnel CRM : bloquer les nouveaux appels en désactivant le cycle s’il existe, maintenir/déployer le flag false; révoquer la clé si compromise. Ne pas effacer les preuves ou les tables métier.
2. Aviser immédiatement la personne réellement responsable des renseignements personnels. Nom, suppléant et coordonnées doivent être consignés avant activation; aucun membre fictif n’est nommé ici.
3. Préserver les identifiants de requête, dates, accès et métadonnées utiles sans recopier les contenus clients dans les tickets. Déterminer destinataires, portée, durée et renseignements concernés, avec le fournisseur si nécessaire.
4. Le responsable évalue le risque de préjudice sérieux, les avis aux personnes et à la CAI requis, les mesures pour réduire le préjudice et le registre d’incidents. Ne pas attendre la conclusion technique pour faire les avis légalement requis. [CAI — incidents de confidentialité](https://www.cai.gouv.qc.ca/protection-renseignements-personnels/information-entreprises-privees/incidents-confidentialite-mesures-securite-entreprises).
5. Corriger, tester sur données synthétiques, documenter la cause et obtenir une nouvelle décision avant réactivation. Aucun courriel d’incident ou test n’est envoyé par cette mission.

## 9. Décision interne prête à compléter

| Élément à consigner | État réel |
| --- | --- |
| Organisation légalement responsable et signataire habilité | À identifier/documenter |
| Personne responsable des renseignements personnels, titre/contact | À confirmer; aucune signature obtenue |
| Version de l’EFVP examinée | Présent dossier, 17 novembre 2026 |
| Finalités et nécessité des champs approuvées | Accord de principe du propriétaire; validation formelle à obtenir |
| Base juridique, avis/consentements applicables | À confirmer avec références des documents clients |
| Contrat/DPA applicable à l’entité Forbes et sous-traitants | Textes publics examinés; preuve contractuelle à joindre |
| Évaluation hors Québec et conclusion de protection adéquate | À compléter, risques et mesures à approuver |
| Conservation, droits et procédure d’incident | Propositions ci-dessus; responsable/durées à valider |
| Risques résiduels acceptés et restrictions | Décision explicite à consigner |
| Décision, auteur, date, référence et prochaine révision | Non renseignés; ne pas remplacer par un accord technique général |

Décision courante : **mise en service non autorisée**, maintien du déploiement désactivé. `privacy_reviewed` reste non validé (aucune ligne de cycle); aucun passage à true. La revue devra être réouverte après approbation réelle, sans demander de nouvelle permission générale de coder.

## 10. Conditions cumulatives d’activation et preuves techniques

Validation responsable et dossier légal/contractuel complet; réglages de partage/rétention recontrôlés; budget réel revérifié sans moyen de paiement/recharge/fallback payant; clé valide et modèle validé par un test synthétique explicitement autorisé; cycle réel documenté; tests de permissions et projections verts. Le rappel budgétaire existant du 19 novembre 2026 à 10 h Québec reste l’unique rappel. La clé préparée en V2 expire le 18 novembre : ne pas présumer sa validité à cette date future, ni créer automatiquement une autre clé.

Les tests `privacy.test.ts`, `service.test.ts`, `tools.test.ts`, `query-tools.test.ts` et `ledger.test.ts` couvrent minimisation A–H, injection, contexte, identité, outils, réservations concurrentes, expiration, erreurs et absence de reprise payante. Les requêtes fournisseur sont mockées. Aucun enregistrement client synthétique en Production. La preuve Production porte uniquement sur l’interface et le blocage réel, pas sur une conversation IA active.

Référence de vérification en lecture du 17 novembre : 693 Contacts, 18 Listings, 24 Transactions, zéro cycle et zéro usage Assistant. Cron Centris inchangé : `centris-listings-sync-12h`, actif, `17 11,23 * * *`. Aucun changement SQL requis; aucun autre projet inspecté ou modifié.

Validation locale de cette livraison : 97 tests ciblés réussis; suite complète 2 862 réussis, zéro échec, sept ignorés (fixtures privées/moteur source OACIQ indisponibles). TypeScript sans erreur. Le script lint existe mais ESLint et sa configuration ne sont pas installés dans ce checkout. Le build local est bloqué par l’erreur d’environnement Windows `EBADF` lors de l’écriture des types de routes générés, également après relance avec les droits autorisés; le build de déploiement Vercel doit donc être vérifié séparément avant de déclarer la livraison prête. Aucun fichier généré n’est inclus dans le diff.
