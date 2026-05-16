import { layoutTypeSchema } from "../digests/schemas";

export function normalizeDailyDigestModelPayload(payload: Record<string, unknown>) {
  const layoutType = normalizeLayoutType(payload.layout_type);
  return {
    ...payload,
    layout_type: layoutType,
    full_level_versions: normalizeFullLevelVersions(payload.full_level_versions),
  };
}

function normalizeLayoutType(value: unknown) {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const parsed = layoutTypeSchema.safeParse(normalized);
    if (parsed.success) return parsed.data;
  }

  return "concept_explainer";
}

function normalizeFullLevelVersions(value: unknown) {
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([level, content]) => [level, stringifyLevelContent(content)]),
  );
}

function stringifyLevelContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((item) => stringifyLevelContent(item)).filter(Boolean).join("\n");
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, nestedValue]) => {
        const text = stringifyLevelContent(nestedValue);
        if (!text) return "";
        return `${humanizeKey(key)}: ${text}`;
      })
      .filter(Boolean)
      .join("\n\n");
  }
  if (value === null || value === undefined) return "";
  return String(value);
}

function humanizeKey(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
