import type { Advice } from "./advice.ts";
import type { Humor, Verification } from "./config.ts";

const VERIFICATION_LABEL: Record<Verification, string> = {
  verified: "verifierad",
  user_confirmed: "användarbekräftad",
  mismatch: "fel modell aktiv",
};

export type StatusView = {
  configured: boolean;
  enabled: boolean;
  mode: "live" | "parody";
  mainName: string;
  mainVerification: Verification;
  advisorName: string;
  advisorState: string;
  maxPerTask: number;
  humor: Humor;
  warnings: string[];
};

export function presentStatus(view: StatusView): string {
  if (!view.configured) {
    return [
      "Ask your stupid boss",
      "Inte konfigurerad.",
      "Tre frågor behövs: main, advisor, och live eller parody.",
      "",
    ].join("\n");
  }
  const lines = [
    "Ask your stupid boss",
    `Main: ${view.mainName} — ${VERIFICATION_LABEL[view.mainVerification]}`,
    `Advisor: ${view.advisorName} — ${view.advisorState}`,
    `Läge: ${view.mode}`,
    `Konsultationer: högst ${view.maxPerTask} per uppgift`,
    `Humor: ${view.humor}`,
  ];
  if (!view.enabled) lines.push("Avstängd. Inga konsultationer görs.");
  for (const warning of view.warnings) lines.push(warning);
  lines.push("");
  return lines.join("\n");
}

export function presentLive(input: {
  mainName: string;
  advisorName: string;
  plan: string;
  advice: Advice;
}): string {
  const lines = [
    `MAIN · ${input.mainName}`,
    `Plan: ${input.plan}`,
    "Eskalerar till ledningen.",
    "",
    `ADVISOR · ${input.advisorName} · separat modellanrop`,
  ];
  pushField(lines, "Invändning", input.advice.main_objection);
  pushField(lines, "Alternativ", input.advice.simpler_alternative);
  pushField(lines, "Fråga", input.advice.question);
  pushField(lines, "Osäkerhet", input.advice.uncertainty);
  pushField(lines, "Ledningskommentar", input.advice.executive_remark);
  lines.push("");
  return lines.join("\n");
}

export function presentParody(): string {
  return [
    "ADVISOR · simulerad roll · inget separat modellanrop",
    "Simulerad rådgivare — inget separat modellanrop",
    "",
  ].join("\n");
}

export function presentFailure(input: {
  message: string;
  humor: Humor;
  kind: string;
}): string {
  const lines = [input.message];
  if (input.humor === "dry") {
    const remark = FAILURE_REMARKS[input.kind];
    if (remark) lines.push(`Ledningskommentar: ${remark}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function presentUnstructured(input: {
  advisorName: string;
  text: string;
}): string {
  return [
    `ADVISOR · ${input.advisorName} · separat modellanrop`,
    "Ostrukturerat svar (inte giltig JSON):",
    input.text,
    "",
  ].join("\n");
}

const FAILURE_REMARKS: Record<string, string> = {
  timeout: "Ledningen tolkar tystnad som att frågan var för konkret.",
  rate_limit: "Ledningen är upptagen med ett annat onödigt möte.",
  empty: "Ledningen sammanträdde och producerade inget.",
  auth: "Ledningen hittar inte nyckeln till konferensrummet.",
  provider: "Ledningen kunde inte öppna dörren till rummet.",
};

function pushField(lines: string[], label: string, value: string | null): void {
  if (value == null || value.trim() === "") return;
  lines.push(`${label}: ${value}`);
}
