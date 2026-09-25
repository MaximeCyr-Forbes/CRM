# Reader parity audit before implementation

Source: `MaximeCyr-Forbes/Courriel-PA-accept-e.-`, commit `1474422e5f1e9b5e64464ba645cd4d7b3f188017`.
Parent and previous production: `3b3da6d6d0e6f4d456e7c299ffc8473c4a94f992`. No intermediate commits.

| Rule / source | Previous generator | New generator | CRM equivalent | Initial parity |
| --- | --- | --- | --- | --- |
| CP traversal / transaction_bundle.py | Stops at first acceptance, applies unaccepted intermediate CP | Traverse references; only complete timely accepted CP amend; signed chronology resolves accepted siblings | chain.ts, price.ts | No |
| Filled CP fields / native_reader.py | No native sparse CP terms | P2.3.1 price, P2.3.2 deed, P2.3.3 occupancy/date/time; spaced labels | forms.ts, parser.ts, price.ts | Partial |
| Partial amendments / transaction_bundle.py | Incomplete preservation | Preserve unspecified values and condition identity; time-only occupancy inherits date | parser.ts | No |
| P2.3.4 continuation / native_reader.py | Numeric references split clauses | Preserve continuation and explicit cancellation with dependent deadlines | forms.ts, parser.ts | No |
| Validity / transaction_bundle.py | Incomplete check | Complete signatures plus acceptance inside P2.7 expiry | forms.ts, chain.ts | No |
| MO/BO applicability / transaction_bundle.py | Complete response only | Signed, accepted and subsequent to terminal acceptance | modifications.ts, price.ts | Partial; retain CRM pre-acceptance BO semantics |
| Provenance / transaction_engine.py | Conditions and amendments only | final_contract with values, source and override history | types.ts, parser.ts | Partial |
| Vision / vision_reader.py, merge_visual | Generic CP facts may replace native fields | Canonical CP types, explicit cancellations, native-field conflict warning, expiry preserved | Local uncommitted Vision implementation; deployed reader has no Vision pipeline | Requires targeted compatibility, no infrastructure replacement |
| Listing PA import | N/A | Same final contract | purchase-agreement/parse.ts and parse route | No: independent single-PA parser |
| PA identity and untouched clauses | PA identity retained | Same; accepted CP only changes targeted fields | transaction-details.ts, parser.ts | Yes; preserve 9.1 dual deadlines, 12.1, 14.1 exclusion |
| Generic PDF extraction | Unchanged | Unchanged | pdf.ts, pdf/extract-positioned-text.ts, centris-pdf | No change applicable |

Source changed files: `.gitignore`, `.vercelignore`, `TRANSACTION_ENGINE.md`, `native_reader.py`, `tests/browser_counter_proposal.cjs`, `tests/test_deadline_engine.py`, `tests/test_final_contract.py`, `transaction_bundle.py`, `transaction_engine.py`, `vision_reader.py`. Generator deployment ignores and email/UI code are not ported.

## Implementation and compatibility decisions

- `chain.ts` follows accepted CP links and signed sibling chronology, with expiry and signature completeness. Intermediate countered proposals do not amend the final contract. The established contract survives a subsequent unaccepted proposal. Ambiguous chains require review.
- `counter-clauses.ts` canonicalizes spaced CP markers and retains continuation text. `final-contract.ts` applies filled fields, time-only occupancy and explicit cancellations with dependent deadlines; it retains source and overridden values. The transaction-date adapter reads the resulting deadlines, so a later MO cannot be undone by a second CP override.
- Both production import routes now use `analyzeOaciqTransaction`. Listing accepts PA/CP bundles. The old positioned single-PA utility remains for compatibility tests, with no production caller; it does not resolve contracts.
- CRM-specific pre-acceptance BO pricing and unsigned PA/AF/MO dossier review remain supported. When an accepted CP establishes a contract, later MO overrides require an explicit accepted response, signatures and a subsequent signing date. Explicitly accepted/signed later BO price amendments are also supported. This is a deliberate compatibility boundary, not replacement of existing CRM workflows.
- The deployed CRM accepts supplied OCR pages but has no automatic Vision provider. The separate uncommitted Vision implementation in the primary checkout is preserved untouched. Source native-versus-visual precedence, canonical CP markers, preserved expiry/cancellations and contradiction warnings are ported to the existing OCR input path. The generator's provider prompt/schema changes are not deployed as a new Vision system in this change.
- Clause 9.1 retains delivery and review. Inspection/report, financing, AF, AR, clause 12.1 and documentary-only 14.1 remain in the same CRM deadline workflow. No Calendar, Gmail, Supabase or Centris change.

## Evidence

- Immutable backup `pre-generator-reader-sync-2026-09-25` points to `9e5837830f08cbb8e478fb3d1305d95954f20dd5` and was pushed before implementation.
- `source-parity-oracle.py` checks the external generator SHA and runs its actual contract functions on anonymous cases. `source-parity.json` is its output; TypeScript tests compare the seven cases in both file orders.
- The source's 15 final-contract tests pass, including its two private-document tests. The CRM private test reads only paths supplied through `OACIQ_PRIVATE_PA` and `OACIQ_PRIVATE_CP`; PDFs and extracted private text are never included in Git.
- Real PA/CP analysis yields notary/occupancy November 6, inspection October 3, report October 7 and financing October 9, 2026. Listing and transaction use identical buyers, sellers, address and final price. Analysis has no persistence side effects.
- Full CRM suite: 1509 passed, 0 failed, 5 skipped (optional private cases not supplied); TypeScript and `pnpm run build` pass. ESLint is not installed/configured in this repository. Browser verification passed on the isolated validation deployment for New Transaction and Listing with the same private PA/CP bundle. Both preserve parties, property and final price; New Transaction exposes the five expected dated deadlines. No transaction or offer was saved. Publication follows these checks.
