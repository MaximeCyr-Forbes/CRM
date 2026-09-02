# Lecteur OACIQ — moteur uniquement

Porté depuis **App Courriel PA acceptée**, dépôt
`MaximeCyr-Forbes/Courriel-PA-accept-e.-`, worktree officiel `pa_interface`.
Référence vérifiée sur `main` : `ded09b6992554e7c9f2e51fd4975c0fdb75dbc1a`.
Correction multi-formulaires : `e6d5302`.
SHA-256 du `parser.py` de référence :
`29a1385aea7e071c4f9ab3d23992cc12f1d32193268805d5f3451f25fbc5235c`.
La copie locale intitulée `App Courriel PA acceptée` était plus ancienne : elle
n'a pas servi au portage. Le dépôt source reste inchangé.

## Entrée serveur

`analyzeOaciqDocuments([{ name, data }])` accepte des octets PDF ou des
`OaciqExtractedDocument` déjà extraits. Le résultat est un `OaciqAnalysis` sans
écriture CRM, envoi de courriel, appel Google ni accès à la base de données.
Aucune nouvelle route ni interface n'est exposée à cette étape.

## Correspondance avec le moteur source

- `pdf.ts` remplace uniquement pdfplumber/pypdf par unpdf (déjà dans le CRM) et
  @cantoo/pdf-lib. Les signatures visibles, annotations FreeText, positions et
  cases cochées restent accessibles, y compris les PDF signés ouvrables avec
  mot de passe vide. Aucun original n'est modifié ni enregistré.
- `forms.ts` reprend classification, clauses, champs positionnés, signatures,
  réponse du vendeur/répondant et options d'inspection PAD.
- `annexes.ts` reprend R2.1, R2.3, R2.4, F2.1 et V2.1 à V2.5.
- `chain.ts` reprend sélection de la PA, chaîne de CP, protection contre les
  cycles, acceptation effective et dates remplacées par la CP acceptée.
- `parser.ts` reprend les règles et leur ordre, les conditions 12.1,
  les délais relatifs, les libellés et les avertissements.
- `dates.ts` conserve les jours civils et le fuseau America/Toronto. Les heures
  et dates ISO sont ajoutées au moment du calcul, jamais déduites d'un libellé
  abrégé sans année. Les heures du certificat ne remplacent pas une signature
  visible. Les accusés de réception ne deviennent pas l'acceptation.

## Adaptations et limites explicites

Le portage TypeScript est nécessaire au runtime Node/Vinext existant : aucune
dépendance Python ni appel au déploiement de l'autre application en production.
Le générateur de courriel et son interface ne sont pas copiés.

L'OCR de l'application source était exécuté dans son interface Tesseract/canvas.
Le moteur accepte les mêmes pages OCR (et marqueurs d'inspection/lecture ciblée)
via `ocrPages`. Un scan sans OCR échoue explicitement : il n'est pas considéré
comme un formulaire sans condition. La prochaine interface devra fournir l'OCR
si elle accepte les scans. Aucun moteur OCR navigateur n'est ajouté ici.

La classification source porte sur la première page de chaque fichier. PA/PAD/PP,
CP, R, F et EAU sont pris en charge. BO est ignoré. Le moteur source n'implémente
pas de traitement spécifique MO/AG ni de séparation automatique de plusieurs
formulaires fusionnés en un PDF : le portage ne prétend pas le faire.

Les calculs et avertissements métier restent ceux de la référence, y compris ses
limites (jours civils, recours à une annexe unique si référence manquante,
conditions EAU calculées sur l'acceptation, tri historique par libellé).
`sourceText`, `sourceSection`, `dueDate`, `dueTime`, `baseDate` et `days` enrichissent
la sortie sans remplacer une date relative par une date supposée. Les avis EAU
regroupant plusieurs dates gardent un `dueDate: null` et le texte complet.

## Validation reproductible

`reader.test.ts` compare les sorties aux 27 jeux de résultats synthétiques
`goldens.json`, produits par le parser Python actuel non modifié. Les sept
régressions de `tests/test_transaction_chain.py` sont adaptées explicitement.
`pdf.test.ts` construit ses PDF fictifs en mémoire ; aucun PDF client n'est suivi.

La comparaison directe optionnelle utilise `OACIQ_REFERENCE_PARSER` (chemin de
`parser.py`) et `OACIQ_PYTHON` (exécutable Python). `OACIQ_PRIVATE_PDF_DIR` permet
également la comparaison des anciens exemples locaux oasis/PA/PAD/AR.
Ces variables sont réservées aux tests locaux, pas à Vercel. Le script
`reference-oracle.py` charge le code source en lecture seule, sans pycache, et
ne copie ni ne lance le serveur source. Aucun accès réseau n'est requis.

Sur les quatre dossiers PDF source privés, dates/délais/avertissements concordent.
Différence d'extraction explicitement testée : `oasis.pdf` fournit désormais son
numéro PA présent en pied de page, que pdfplumber retournait vide. Ce gain de
lecture ne change aucun calcul. Les tests ne tolèrent aucune autre divergence.
