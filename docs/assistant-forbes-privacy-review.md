# Assistant Forbes — EFVP V3 et décision de mise en service

## Addendum V3 — décision courante du 17 novembre 2026

Cet addendum remplace les descriptions de transfert de champs pseudonymisés de la V2 conservées ci-dessous comme historique. Baseline V3 : `ffb799bb2f3030e28dddb9112179833c1438a0b2`; backup `pre-assistant-forbes-v3-private-2026-11-17`. La décision reste **désactivé, approbation juridique non obtenue**. L’autorisation du propriétaire couvre l’implémentation et les tests, pas une signature de conformité ou un nouveau budget.

### Flux et frontières de confiance

1. Le navigateur transmet la question et au plus quatre questions antérieures au serveur CRM Vercel authentifié. Les réponses passées ne sont pas retransmises; aucun historique n’est une autorisation d’accès.
2. Le serveur détermine localement l’intention, recherche les entités et vérifie les permissions via les services existants et le client Supabase du membre. L’identité sélectionnée à l’écran ne remplace jamais l’identité Google résolue côté serveur.
3. Les données clients (noms, adresses, coordonnées, UUID, Centris, prix, dates, suivis, notes) restent dans cette frontière CRM. Les lectures sont bornées et ne chargent pas de fichiers externes.
4. Si les conditions financières et de confidentialité sont satisfaites dans une future activation, OpenAI reçoit seulement un **corps constant** demandant un ordre générique de cinq catégories. Aucun résultat, compte, date, montant, intention spécifique, étiquette de client, identifiant stable ou texte libre n’est transmis. Aucun remplacement de variable n’existe dans ce corps.
5. Le serveur valide la liste de catégories renvoyée et assemble lui-même les informations autorisées. L’IA n’accède pas aux outils et son texte libre n’est jamais présenté comme un fait client. Les liens proviennent exclusivement des lectures CRM autorisées.

### Nécessité et minimisation

Il n’existe plus de catégorie de renseignement client nécessaire à OpenAI pour ce traitement. Même un total agrégé ou un statut pseudonymisé est exclu. Les réponses personnalisées sont locales. Le service externe apporte au plus une structure de présentation; sa valeur ne doit pas être décrite comme une compréhension des dossiers. Le registre d’intentions local est extensible, mais borné : synonymes et concepts, résolution des fiches, clarification des ambiguïtés. Une compréhension universelle ou un résumé sémantique des notes privées n’est pas promis.

Les fournisseurs CRM existants Vercel et Supabase continuent de traiter les données pour l’entreprise. La mission ne les rend pas anonymes et ne change ni leur région ni leurs contrats. Leurs garanties restent à rattacher au dossier de conformité global. Les règles d’accès partagées des trois courtiers restent celles du CRM, sans extension par le modèle.

### Réidentification, localisation, journaux et conservation

La transmission de quasi-identifiants client de la V2 (dates/prix/statuts) est supprimée. Le corps fixe empêche ces recoupements dans les requêtes prévues. Cela ne signifie pas anonymat du compte fournisseur : clé/projet OpenAI, adresse réseau Vercel, horaire et métadonnées techniques restent observables. Aucun identifiant de client ou membre CRM n’est ajouté aux en-têtes ou métadonnées. Les journaux applicatifs n’enregistrent pas le contenu des questions/réponses.

Le projet OpenAI reste Global; `store:false` n’est toujours pas une garantie de rétention nulle. Les contrôles de partage vérifiés pendant V2 le 17 novembre étaient désactivés et doivent être recontrôlés avant activation. Les conditions de conservation/support et les sous-traitants documentés ci-dessous restent pertinents au compte et au texte générique. La V3 ne prétend pas envoyer des dossiers clients hors Québec à OpenAI; les traitements hors Québec par l’infrastructure CRM existante et leur EFVP ne sont pas réputés approuvés pour autant.

Mémoire du dialogue : session navigateur seulement, réinitialisation explicite possible; questions antérieures utilisées uniquement dans le backend CRM. Registre d’usage : métadonnées techniques et coûts, pas de contenu ni de fiche client. Les durées contractuelles/hébergement et la conservation du registre restent à faire valider par le responsable, comme dans le dossier V2.

### Contrôles, tests et risques résiduels

- Frontière externe positive : `GENERIC_PLAN_BODY` est constant, sans argument. La protection ne repose pas sur la détection de PII par regex.
- Les tests interceptent chaque `fetch` OpenAI et exigent l’égalité exacte du corps avec cette constante. Les marqueurs synthétiques couvrent nom, téléphone, adresse, courriel, Centris, notes, montant, UUID et date. Ils restent absents même pour recherche libre, suivi conversationnel, résumé et injection.
- Les tests couvrent ambiguïtés, absence de lien propriétaire, données indisponibles, erreurs locales, plans malveillants, contrôle d’accès des trois courtiers et blocage financier. Les écritures ne sont jamais proposées au modèle.
- Risque résiduel technique : une future modification du code pourrait réintroduire une entrée dynamique. Toute modification du contrat externe exige revue du diff et tests de non-divulgation. Les développeurs ne doivent jamais sérialiser le résultat privé ni un message d’erreur dans la requête fournisseur.
- Risque de mauvaise réponse locale : homonymes, relation manquante, extrait tronqué, limites lexicales et statut métier ambigu. Clarifier, montrer les liens sources et définir les critères; ne jamais inventer un vendeur ou une condition juridique.
- Risque d’accès illégitime au CRM : dépendance à la session, aux autorisations et à la sécurité des hébergeurs existants. Le modèle n’est pas une couche d’autorisation.

Le risque de divulgation client par le chemin OpenAI prévu est atténué par l’absence complète de données dynamiques; ce constat technique ne constitue pas une approbation juridique de l’ensemble du CRM. Aucun appel réel n’a validé une conversation IA et aucun paiement n’est autorisé.

### Décision et conditions restant à satisfaire

La personne réellement responsable doit examiner cet addendum, confirmer l’entité contractante et les garanties applicables, valider les avis/base juridique des traitements internes CRM et consigner la décision. La communication des renseignements clients à OpenAI n’est **pas** autorisée par cette V3 : elle n’est pas nécessaire à l’architecture et tout ajout futur la réouvrirait. Ne pas demander ni présumer un consentement client à un transfert qui n’est pas mis en œuvre.

Le formulaire de décision V2 ci-dessous reste utilisable avec référence expresse à cet addendum et au périmètre « aucun renseignement client dans le fournisseur IA ». Aucune signature inventée, `privacy_reviewed` non validé, aucun cycle ajouté, `ASSISTANT_ENABLED=false`. Revalidation financière distincte au rappel existant; aucune duplication du rappel, carte, recharge ou nouveau fournisseur. Les procédures d’incident et de rollback V2 restent applicables. Aucune migration Supabase ni modification des données métier n’est nécessaire.

## Dossier V2 historique — champs externes décrits ci-dessous interdits en V3

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

## Addendum du 19 novembre 2026 — crédits Pro 100

Voir [l'audit d'activation](assistant-forbes-api-audit-2026-11-19.md).
Les crédits et la compatibilité du modèle ont été vérifiés, avec un test
entièrement synthétique dans le Playground officiel. Cela ne constitue pas une
approbation de confidentialité. Le chemin externe Production reste désactivé;
aucun `privacy_reviewed=true` ni cycle actif n'a été créé. Aucun renseignement
client n'a été transmis à OpenAI. Le budget autorisé de 5 USD n'est pas activé.
