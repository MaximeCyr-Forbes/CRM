import type { FieldConfidence, PropertyCategory } from "@/app/lib/tools/acm/types";
import { PROPERTY_CATEGORY_MAPPINGS } from "./category-mappings";
import { normalizeSearchText } from "./normalization";

export interface CategoryDetection {
  category?: PropertyCategory;
  confidence?: FieldConfidence;
  matchedKeywords: string[];
}

export function categorizeProperty(
  propertyType?: string,
  buildingType?: string,
  contextualText?: string,
): CategoryDetection {
  const primary = normalizeSearchText([propertyType, buildingType].filter(Boolean).join(" "));
  const context = normalizeSearchText(contextualText ?? "").slice(0, 1_500);
  const source = primary || context;

  if (!source) return { matchedKeywords: [] };

  const detections = PROPERTY_CATEGORY_MAPPINGS.map((mapping) => ({
    category: mapping.category,
    matchedKeywords: mapping.keywords.filter((keyword) => source.includes(keyword) && (primary || keyword !== "terrain")),
  })).filter((item) => item.matchedKeywords.length > 0);

  if (detections.length === 0) return { matchedKeywords: [] };

  const explicitMulti = detections.find((item) => item.category === "multi_category");
  if (explicitMulti) {
    return {
      category: "multi_category",
      confidence: primary ? "high" : "medium",
      matchedKeywords: explicitMulti.matchedKeywords,
    };
  }

  const highestScore = Math.max(...detections.map((item) => item.matchedKeywords.length));
  const leaders = detections.filter((item) => item.matchedKeywords.length === highestScore);
  if (leaders.length !== 1) {
    return { matchedKeywords: detections.flatMap((item) => item.matchedKeywords) };
  }

  return {
    category: leaders[0].category,
    confidence: primary ? "high" : "low",
    matchedKeywords: leaders[0].matchedKeywords,
  };
}
