import fs from "node:fs";
import path from "node:path";
import { parseYaml, YamlError } from "./yaml.ts";
import { findModel, type ModelCatalog } from "./catalog.ts";

export type Verification = "verified" | "user_confirmed" | "mismatch";
export type Mode = "live" | "parody";
export type Humor = "dry" | "off";

export type Config = {
  version: 1;
  enabled: boolean;
  mode: Mode;
  main: {
    display_name: string;
    model_id: string | null;
    verification: Verification;
  };
  advisor: {
    display_name: string;
    provider: string;
    model_id: string | null;
  };
  consultation: {
    max_per_task: number;
    timeout_seconds: number;
    max_briefing_chars: number;
    max_output_tokens: number;
  };
  presentation: {
    humor: Humor;
    language: string;
  };
  logging: {
    save_content: boolean;
  };
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function configPath(home: string): string {
  return path.join(home, "config.yaml");
}

export function loadConfig(home: string): Config | null {
  const file = configPath(home);
  if (!fs.existsSync(file)) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = parseYaml(fs.readFileSync(file, "utf8"));
  } catch (error) {
    const message = error instanceof YamlError ? error.message : "ogiltig YAML";
    throw new ConfigError(`Konfigurationen kunde inte läsas: ${message}`);
  }
  return validateConfig(parsed);
}

export function saveConfig(home: string, config: Config): void {
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  fs.writeFileSync(configPath(home), formatConfig(config), {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function validateConfig(value: Record<string, unknown>): Config {
  if (value.version !== 1) throw new ConfigError("version måste vara 1");
  const main = nested(value, "main");
  const advisor = nested(value, "advisor");
  const consultation = nested(value, "consultation");
  const presentation = nested(value, "presentation");
  const logging = nested(value, "logging");
  return {
    version: 1,
    enabled: bool(value.enabled, "enabled"),
    mode: mode(value.mode),
    main: {
      display_name: text(main.display_name, "main.display_name"),
      model_id: nullableText(main.model_id, "main.model_id"),
      verification: verification(main.verification),
    },
    advisor: {
      display_name: text(advisor.display_name, "advisor.display_name"),
      provider: text(advisor.provider, "advisor.provider"),
      model_id: nullableText(advisor.model_id, "advisor.model_id"),
    },
    consultation: {
      max_per_task: positiveInt(consultation.max_per_task, "consultation.max_per_task"),
      timeout_seconds: positiveInt(
        consultation.timeout_seconds,
        "consultation.timeout_seconds",
      ),
      max_briefing_chars: positiveInt(
        consultation.max_briefing_chars,
        "consultation.max_briefing_chars",
      ),
      max_output_tokens: positiveInt(
        consultation.max_output_tokens,
        "consultation.max_output_tokens",
      ),
    },
    presentation: {
      humor: humor(presentation.humor),
      language: text(presentation.language, "presentation.language"),
    },
    logging: {
      save_content: bool(logging.save_content, "logging.save_content"),
    },
  };
}

export function formatConfig(config: Config): string {
  return [
    "version: 1",
    `enabled: ${config.enabled}`,
    `mode: ${config.mode}`,
    "main:",
    `  display_name: ${quote(config.main.display_name)}`,
    `  model_id: ${quoteNullable(config.main.model_id)}`,
    `  verification: ${config.main.verification}`,
    "advisor:",
    `  display_name: ${quote(config.advisor.display_name)}`,
    `  provider: ${config.advisor.provider}`,
    `  model_id: ${quoteNullable(config.advisor.model_id)}`,
    "consultation:",
    `  max_per_task: ${config.consultation.max_per_task}`,
    `  timeout_seconds: ${config.consultation.timeout_seconds}`,
    `  max_briefing_chars: ${config.consultation.max_briefing_chars}`,
    `  max_output_tokens: ${config.consultation.max_output_tokens}`,
    "presentation:",
    `  humor: ${config.presentation.humor}`,
    `  language: ${config.presentation.language}`,
    "logging:",
    `  save_content: ${config.logging.save_content}`,
    "",
  ].join("\n");
}

export function setupConfig(input: {
  catalog: ModelCatalog;
  mainId: string;
  advisorId: string;
  mode: Mode;
}): Config {
  const main = requireModel(input.catalog, input.mainId, "main");
  const advisor = requireModel(input.catalog, input.advisorId, "advisor");
  return {
    version: 1,
    enabled: true,
    mode: input.mode,
    main: {
      display_name: main.name,
      model_id: main.id,
      verification: "user_confirmed",
    },
    advisor: {
      display_name: advisor.name,
      provider: "claude-cli",
      model_id: advisor.id,
    },
    consultation: {
      max_per_task: 2,
      timeout_seconds: 30,
      max_briefing_chars: 12000,
      max_output_tokens: 600,
    },
    presentation: { humor: "dry", language: "match_user" },
    logging: { save_content: false },
  };
}

export function swapConfig(config: Config, catalog: ModelCatalog): {
  config: Config;
  problems: string[];
} {
  const next: Config = {
    ...config,
    main: {
      display_name: config.advisor.display_name,
      model_id: config.advisor.model_id,
      verification: "user_confirmed",
    },
    advisor: {
      display_name: config.main.display_name,
      provider: config.advisor.provider,
      model_id: config.main.model_id,
    },
  };
  return { config: next, problems: advisorProblems(next, catalog) };
}

export function advisorProblems(config: Config, catalog: ModelCatalog): string[] {
  const problems: string[] = [];
  if (config.advisor.provider !== "claude-cli") {
    problems.push(`Okänd provider ${config.advisor.provider}. Ingen ersättare används.`);
  }
  if (!config.advisor.model_id) {
    problems.push("Advisor saknar modell-ID. Live är avstängt.");
    return problems;
  }
  if (catalog.models.length === 0) {
    problems.push("Modellkatalogen saknas eller är tom. Live är avstängt.");
    return problems;
  }
  if (!findModel(catalog, config.advisor.model_id)) {
    problems.push(
      `Advisor-ID ${config.advisor.model_id} finns inte i katalogen. Live är avstängt.`,
    );
  }
  return problems;
}

export function requireModel(
  catalog: ModelCatalog,
  id: string,
  role: string,
): { id: string; name: string } {
  if (catalog.models.length === 0) {
    throw new ConfigError("Modellkatalogen saknas. Öppna Claude Code en gång och försök igen.");
  }
  const model = findModel(catalog, id);
  if (!model) {
    throw new ConfigError(
      `${role} ${id} finns inte i katalogen. Välj ett ID från catalog. Visningsnamn räcker inte.`,
    );
  }
  return model;
}

function nested(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const child = value[key];
  if (!child || typeof child !== "object" || Array.isArray(child)) {
    throw new ConfigError(`${key} saknas`);
  }
  return child as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`${label} måste vara text`);
  }
  return value.trim();
}

function nullableText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return text(value, label);
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new ConfigError(`${label} måste vara true eller false`);
  return value;
}

function positiveInt(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ConfigError(`${label} måste vara ett positivt heltal`);
  }
  return value;
}

function mode(value: unknown): Mode {
  if (value === "live" || value === "parody") return value;
  throw new ConfigError("mode måste vara live eller parody");
}

function humor(value: unknown): Humor {
  if (value === "dry" || value === "off") return value;
  throw new ConfigError("presentation.humor måste vara dry eller off");
}

function verification(value: unknown): Verification {
  if (value === "verified" || value === "user_confirmed" || value === "mismatch") {
    return value;
  }
  throw new ConfigError("main.verification är ogiltig");
}

function quote(value: string): string {
  if (/[:#]/.test(value) || value !== value.trim()) return JSON.stringify(value);
  return value;
}

function quoteNullable(value: string | null): string {
  return value == null ? "null" : quote(value);
}
