/** 12.1 is intentionally allowed. A PA acceptance-validity clause is not an agenda task. */
export function isExcludedDeadlineSection(section: string | null | undefined) {
  return /^(?:PA\s*[·:-]?\s*)?(?:clause\s+)?14[.,]1(?:[.]\d+)*$/i.test(
    (section ?? "").trim(),
  );
}
