export const REASONS = ["initial_plan", "new_decision", "user_requested"] as const;
export type Reason = (typeof REASONS)[number];

export type Briefing = {
  task_id: string;
  reason: Reason;
  task: string;
  proposed_plan: string;
  decision: string;
  constraints: string[];
  relevant_excerpt: string | null;
};

const KEYS = [
  "task_id",
  "reason",
  "task",
  "proposed_plan",
  "decision",
  "constraints",
  "relevant_excerpt",
] as const;

const SECRET =
  /sk-[A-Za-z0-9_\-]{8,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-|ghp_[A-Za-z0-9]{20,}|github_pat_|api[_-]?key\s*[:=]\s*\S+|bearer\s+[A-Za-z0-9._\-]{10,}/i;

export class BriefingError extends Error {
  readonly kind: "invalid" | "too_large" | "secrets";

  constructor(kind: "invalid" | "too_large" | "secrets", message: string) {
    super(message);
    this.name = "BriefingError";
    this.kind = kind;
  }
}

export function parseBriefing(source: string, maxChars: number): Briefing {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new BriefingError("invalid", "Briefingen är inte giltig JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BriefingError("invalid", "Briefingen måste vara ett objekt.");
  }
  const record = value as Record<string, unknown>;
  const extra = Object.keys(record).filter((key) => !KEYS.includes(key as (typeof KEYS)[number]));
  if (extra.length > 0) {
    throw new BriefingError(
      "invalid",
      "Briefingen innehåller fält utanför kontraktet. Advisor-ID tas bara från konfigurationen.",
    );
  }
  for (const key of KEYS) {
    if (!(key in record)) {
      throw new BriefingError("invalid", `Briefingen saknar ${key}.`);
    }
  }
  const briefing: Briefing = {
    task_id: taskId(record.task_id),
    reason: reason(record.reason),
    task: requiredText(record.task, "task"),
    proposed_plan: requiredText(record.proposed_plan, "proposed_plan"),
    decision: requiredText(record.decision, "decision"),
    constraints: constraints(record.constraints),
    relevant_excerpt:
      record.relevant_excerpt == null
        ? null
        : requiredText(record.relevant_excerpt, "relevant_excerpt"),
  };
  const encoded = briefingJson(briefing);
  if (SECRET.test(encoded)) {
    throw new BriefingError(
      "secrets",
      "Briefingen innehåller något som ser ut som en hemlighet. Anropet stoppades.",
    );
  }
  if (encoded.length > maxChars) {
    throw new BriefingError(
      "too_large",
      `Briefingen är ${encoded.length} tecken. Gränsen är ${maxChars}. Ingen trunkering gjordes.`,
    );
  }
  return briefing;
}

export function briefingJson(briefing: Briefing): string {
  return JSON.stringify(briefing);
}

function taskId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,80}$/.test(value)) {
    throw new BriefingError("invalid", "task_id måste vara 1–80 tecken utan mellanslag.");
  }
  return value;
}

function reason(value: unknown): Reason {
  if (REASONS.includes(value as Reason)) return value as Reason;
  throw new BriefingError("invalid", "reason är ogiltig.");
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BriefingError("invalid", `${label} måste vara text.`);
  }
  return value;
}

function constraints(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new BriefingError("invalid", "constraints måste vara en lista av strängar.");
  }
  return value;
}
