export type IndicatorColor = "green" | "yellow" | "red";
export type CriterionDirection = "minimum" | "maximum";
export type DataQuality = "confirmed" | "unconfirmed" | "missing";

export type AnalysisConclusion =
  | "Opportunité intéressante selon les critères sélectionnés"
  | "Analyse prudente recommandée"
  | "Ne respecte pas les critères sélectionnés"
  | "Données insuffisantes pour conclure";

export interface IndicatorEvaluationInput {
  id: string;
  label: string;
  value: number | null;
  threshold: number;
  direction: CriterionDirection;
  dataQuality?: DataQuality;
  yellowMarginPercent?: number;
}

export interface IndicatorEvaluation extends IndicatorEvaluationInput {
  color: IndicatorColor;
  explanation: string;
  dataQuality: DataQuality;
  range?: {
    greenMaximum: number;
    redMinimum: number;
  };
}

export interface MaximumBandIndicatorInput {
  id: string;
  label: string;
  value: number | null;
  greenMaximum: number;
  redMinimum: number;
  dataQuality?: DataQuality;
}

export const DEFAULT_YELLOW_MARGIN_PERCENT = 10;

function explanationWithDataQuality(
  explanation: string,
  dataQuality: DataQuality,
): string {
  if (dataQuality === "unconfirmed") {
    return `${explanation} Données non confirmées; validation requise.`;
  }
  if (dataQuality === "missing") {
    return `${explanation} Certaines données essentielles sont manquantes; le résultat global demeure « Données insuffisantes ».`;
  }
  return explanation;
}

/**
 * Évalue un critère sans règle cachée. Pour un minimum, la zone jaune s'étend
 * jusqu'à 10 % sous le seuil; pour un maximum, jusqu'à 10 % au-dessus.
 */
export function evaluateIndicator(input: IndicatorEvaluationInput): IndicatorEvaluation {
  const dataQuality = input.value === null ? "missing" : (input.dataQuality ?? "confirmed");
  const marginPercent = input.yellowMarginPercent ?? DEFAULT_YELLOW_MARGIN_PERCENT;

  if (!Number.isFinite(input.threshold) || input.threshold < 0) {
    throw new Error("Le seuil doit être un nombre positif ou nul.");
  }
  if (!Number.isFinite(marginPercent) || marginPercent < 0) {
    throw new Error("La marge jaune doit être un nombre positif ou nul.");
  }
  if (input.value !== null && !Number.isFinite(input.value)) {
    throw new Error("Le résultat doit être un nombre fini ou nul.");
  }

  if (input.value === null) {
    return {
      ...input,
      dataQuality: "missing",
      color: "yellow",
      explanation: "Donnée essentielle manquante; aucune conclusion fiable n’est possible.",
    };
  }

  const value = input.value;
  const yellowDistance = input.threshold * (marginPercent / 100);
  const respected =
    input.direction === "minimum" ? value >= input.threshold : value <= input.threshold;

  if (respected) {
    const explanation =
      input.direction === "minimum"
        ? "Le résultat atteint ou dépasse le minimum sélectionné."
        : "Le résultat respecte le maximum sélectionné.";
    return {
      ...input,
      dataQuality,
      color: "green",
      explanation: explanationWithDataQuality(explanation, dataQuality),
    };
  }

  const nearLimit =
    input.direction === "minimum"
      ? value >= input.threshold - yellowDistance
      : value <= input.threshold + yellowDistance;

  const color = nearLimit ? "yellow" : "red";
  const explanation = nearLimit
    ? `Le résultat est à moins de ${marginPercent} % de la limite sélectionnée.`
    : input.direction === "minimum"
      ? "Le résultat est inférieur au minimum sélectionné."
      : "Le résultat dépasse le maximum sélectionné.";

  return {
    ...input,
    dataQuality,
    color,
    explanation: explanationWithDataQuality(explanation, dataQuality),
  };
}

/** Évalue une zone maximale verte, une zone jaune intermédiaire et un début rouge explicite. */
export function evaluateMaximumBandIndicator(
  input: MaximumBandIndicatorInput,
): IndicatorEvaluation {
  const dataQuality = input.value === null ? "missing" : (input.dataQuality ?? "confirmed");
  const base = {
    id: input.id,
    label: input.label,
    value: input.value,
    threshold: input.greenMaximum,
    direction: "maximum" as const,
    dataQuality,
    range: {
      greenMaximum: input.greenMaximum,
      redMinimum: input.redMinimum,
    },
  };

  if (
    !Number.isFinite(input.greenMaximum) ||
    !Number.isFinite(input.redMinimum) ||
    input.greenMaximum < 0 ||
    input.redMinimum < 0
  ) {
    throw new Error("Les seuils de couleur doivent être des nombres positifs ou nuls.");
  }
  if (input.value !== null && !Number.isFinite(input.value)) {
    throw new Error("Le résultat doit être un nombre fini ou nul.");
  }
  if (input.redMinimum <= input.greenMaximum) {
    return {
      ...base,
      dataQuality: "missing",
      color: "yellow",
      explanation: "Seuils MRB invalides : le début de la zone rouge doit être supérieur à la limite verte.",
    };
  }
  if (input.value === null) {
    return {
      ...base,
      dataQuality: "missing",
      color: "yellow",
      explanation: "Donnée essentielle manquante; aucune conclusion fiable n’est possible.",
    };
  }

  const color: IndicatorColor = input.value <= input.greenMaximum
    ? "green"
    : input.value < input.redMinimum
      ? "yellow"
      : "red";
  const explanation = color === "green"
    ? "Le MRB se situe dans la zone verte sélectionnée."
    : color === "yellow"
      ? "Le MRB se situe dans la zone jaune sélectionnée."
      : "Le MRB atteint ou dépasse le début de la zone rouge sélectionnée.";

  return {
    ...base,
    color,
    explanation: explanationWithDataQuality(explanation, dataQuality),
  };
}

/** Règle de synthèse visible : manquant, rouge, à vérifier/jaune, puis vert. */
export function determineConclusion(evaluations: IndicatorEvaluation[]): AnalysisConclusion {
  if (evaluations.length === 0 || evaluations.some((item) => item.dataQuality === "missing")) {
    return "Données insuffisantes pour conclure";
  }
  if (evaluations.some((item) => item.color === "red")) {
    return "Ne respecte pas les critères sélectionnés";
  }
  if (
    evaluations.some((item) => item.dataQuality === "unconfirmed") ||
    evaluations.some((item) => item.color === "yellow")
  ) {
    return "Analyse prudente recommandée";
  }
  return "Opportunité intéressante selon les critères sélectionnés";
}

export function conclusionColor(conclusion: AnalysisConclusion): IndicatorColor {
  if (conclusion === "Opportunité intéressante selon les critères sélectionnés") return "green";
  if (conclusion === "Ne respecte pas les critères sélectionnés") return "red";
  return "yellow";
}
