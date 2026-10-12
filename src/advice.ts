export const VERDICTS = [
  "approve",
  "simplify",
  "reconsider",
  "insufficient_context",
] as const;

export type Verdict = (typeof VERDICTS)[number];

export type Advice = {
  verdict: Verdict;
  main_objection: string | null;
  simpler_alternative: string | null;
  question: string | null;
  uncertainty: string | null;
  executive_remark: string | null;
};

const TEXT_FIELDS = [
  "main_objection",
  "simpler_alternative",
  "question",
  "uncertainty",
  "executive_remark",
] as const;

export function parseAdvice(value: unknown): Advice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!VERDICTS.includes(record.verdict as Verdict)) return null;
  const advice = { verdict: record.verdict as Verdict } as Advice;
  for (const field of TEXT_FIELDS) {
    const item = record[field];
    if (item == null) advice[field] = null;
    else if (typeof item === "string") advice[field] = item;
    else return null;
  }
  return advice;
}
