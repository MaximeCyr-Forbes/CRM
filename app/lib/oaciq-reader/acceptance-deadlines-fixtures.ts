// Synthetic inputs shared by CRM/golden tests and the unmodified Python source.
import { annexF, annexR, counter, document, promise } from "./test-fixtures";

export function acceptanceDossier(options: {
  accepted?: boolean; date?: string; finalCP?: boolean; deferred?: boolean;
} = {}) {
  const pa = promise({ date: options.date ?? "2026-09-01", accepted: options.accepted,
    financing: 0, inspection: 10, documents: 0,
    clause12: "Vérification dans les 30 jours suivant l'acceptation",
    ...(options.finalCP ? { counter: "20002" } : {}),
  });
  pa.pages[0].text += "\n14.1 Validité dans les 90 jours suivant l'acceptation";
  const af = annexF();
  af.pages[0].text = af.pages[0].text.replace("12 jours", "5 jours");
  af.pages[0].words = af.pages[0].words.map((w) => w.text === "12" ? { ...w, text: "5" } : w);
  return [pa, af,
    ...(options.finalCP ? [counter({ accepted: "2026-09-03T10:00:00-04:00" })] : []),
    ...(options.deferred ? [annexR({ defer: true, cancel: 0 })] : []),
  ];
}

export const acceptanceScenarios = [
  { name: "pa-five-ten-thirty", documents: acceptanceDossier() },
  { name: "final-cp-five-ten-thirty", documents: acceptanceDossier({ finalCP: true }) },
  { name: "final-cp-reversed", documents: acceptanceDossier({ finalCP: true }).reverse() },
  { name: "missing-acceptance", documents: acceptanceDossier({ accepted: false }) },
  { name: "bo-not-acceptance", documents: [...acceptanceDossier({ accepted: false }),
    document("BO-60006.pdf", "BONIFICATIONS AVANT ACCEPTATION\nSigné le 2026-09-01 10:00:00") ] },
  { name: "explicitly-deferred", documents: acceptanceDossier({ deferred: true }) },
  { name: "year-boundary", documents: acceptanceDossier({ date: "2026-12-28" }) },
  { name: "dst-spring", documents: acceptanceDossier({ date: "2026-03-07" }) },
  { name: "dst-fall", documents: acceptanceDossier({ date: "2026-10-31" }) },
  { name: "leap-year", documents: acceptanceDossier({ date: "2028-02-25" }) },
];
