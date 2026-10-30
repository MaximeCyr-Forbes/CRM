import type { OaciqAnalysis } from './types';
/** Technical provenance only: no names, addresses, clauses, tokens or filenames. */
export function logOaciqModifications(analysis: OaciqAnalysis) {
  const amendments=analysis.documentaryState?.modifications ?? [];
  if(!analysis.forms?.some(f=>f.kind==='modification')) return;
  console.info('oaciq.modifications', {
    formType:'MO',
    forms:analysis.forms.filter(f=>f.kind==='modification').map(f=>f.number),
    targets:[...new Set(amendments.map(m=>m.targetForm))],
    changedFields:amendments.filter(m=>m.applied).map(m=>m.section),
    pendingFields:amendments.filter(m=>!m.applied).map(m=>m.section),
    warningCount:analysis.warnings.length,
    persistence:'preview_only',
    manualValuesPreserved:true,
  });
}
