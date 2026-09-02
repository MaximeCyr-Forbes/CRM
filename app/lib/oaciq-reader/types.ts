/** Port of App Courriel PA acceptée, parser.py (e6d5302 / ded09b6).
 * Extraction DTOs use PDF points measured from the top-left, like pdfplumber.
 * No CRM persistence, broker assignment, or email generation belongs here. */
export type OaciqFormKind =
  | "promise_to_purchase"
  | "counter_proposal"
  | "annex_r"
  | "annex_f"
  | "annex_water"
  | "ignored_bo"
  | "unknown";
export type OaciqWord = {
  text: string;
  x0: number;
  top: number;
  x1?: number;
  bottom?: number;
};
export type OaciqPage = {
  text: string;
  width: number;
  height: number;
  words: OaciqWord[];
  wordsLoose?: OaciqWord[];
};
export type OaciqAnnotation = {
  pageIndex: number;
  text: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
};
export type OaciqSignature = Partial<OaciqAnnotation> & {
  field: string;
  name: string;
  contact: string;
  reason: string;
  signedAt: string | null;
  certificateSignedAt?: string | null;
  visibleSignedAt?: string | null;
};
export type OaciqExtractedDocument = {
  name: string;
  pages: OaciqPage[];
  signatures: OaciqSignature[];
  annotations: OaciqAnnotation[];
  signatureWidgets: OaciqAnnotation[];
  /** Same optional OCR page overrides accepted by the reference reader. */
  ocrPages?: string[];
};
export type OaciqPdfInput = {
  name: string;
  data: Uint8Array | ArrayBuffer;
  ocrPages?: string[];
};
export type OaciqResponse = {
  action: "unknown" | "accept" | "refuse" | "counter";
  counterProposalNumber: string;
};
export type OaciqCounterProposal = {
  fileName: string;
  formNumber: string;
  targetFormNumber: string;
  responseAction: OaciqResponse["action"];
  nextCounterProposalNumber: string;
  acceptedAt: string | null;
  responseSignedAt: string | null;
  proposerSignedAt: string | null;
  notaryDate: string | null;
  occupationDate: string | null;
  occupationTime: string;
  allDeadlinesDeferred: boolean;
  annexNumbers: string[];
  counterProposers: string[];
  respondents: string[];
};
export type OaciqAnnexR = {
  formNumber: string;
  targetFormNumber: string;
  deadlineDate: string | null;
  deadlineTime: string;
  propertyAddress: string;
  saleConditionChecked: boolean;
  otherOfferCancellationDays: number | null;
  allDeadlinesDeferred: boolean;
};
export type OaciqAnnexF = {
  formNumber: string;
  targetFormNumber: string;
  financingDays: number;
  clause: string;
};
export type OaciqAnnexWater = {
  formNumber: string;
  targetFormNumber: string;
  quantityDays: number | null;
  qualityDays: number | null;
  septicDays: number | null;
  septicPumping: boolean;
  soilDays: number | null;
};
export type OaciqDeadline = {
  title: string;
  type: string;
  dueDate: string | null;
  dueTime: string | null;
  /** Exact human-readable label and rule from the reference engine. */
  dateText: string;
  details: string;
  sourceDocument: string | null;
  sourceForm: string | null;
  sourceSection: string | null;
  sourceText: string | null;
  confidence: "high" | "medium" | "low";
  baseDate: string | null;
  days: number | null;
};
export type OaciqAnalysis = {
  documents: { name: string; pageCount: number; ocrUsed: boolean }[];
  forms: { document: string; kind: OaciqFormKind; number: string }[];
  mainDocument: string;
  acceptanceDateTime: string | null;
  acceptanceSource: string;
  propertyAddress: string;
  buyerNames: string[];
  sellerNames: string[];
  deadlines: OaciqDeadline[];
  warnings: string[];
  transactionDates: Record<string, string | null>;
  allDeadlinesDeferred: boolean;
};
