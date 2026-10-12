import { spawn, type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import os from "node:os";
import { parseAdvice, type Advice } from "./advice.ts";
import type { Provider, ProviderRequest, ProviderResult, Usage } from "./provider.ts";

export type Spawned = EventEmitter & {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  kill: (signal?: NodeJS.Signals) => boolean;
};

export type SpawnImpl = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => Spawned;

export function buildClaudeArgs(input: {
  modelId: string;
  systemPrompt: string;
  schema: unknown;
  userPrompt: string;
}): string[] {
  return [
    "-p",
    "--tools",
    "",
    "--model",
    input.modelId,
    "--system-prompt",
    input.systemPrompt,
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(input.schema),
    "--no-session-persistence",
    "--safe-mode",
    "--strict-mcp-config",
    "--permission-mode",
    "dontAsk",
    "--permission-prompts",
    "none",
    "--disable-slash-commands",
    "--",
    input.userPrompt,
  ];
}

export function createClaudeProvider(options: {
  bin: string;
  spawnImpl?: SpawnImpl;
}): Provider {
  const spawnImpl = options.spawnImpl ?? defaultSpawn;
  return {
    consult(request: ProviderRequest) {
      const args = buildClaudeArgs({
        modelId: request.modelId,
        systemPrompt: request.systemPrompt,
        schema: request.schema,
        userPrompt: request.userPrompt,
      });
      return runProcess({
        bin: options.bin,
        args,
        timeoutMs: request.timeoutMs,
        spawnImpl,
        requestedModelId: request.modelId,
      });
    },
  };
}

export async function checkClaudeAuth(
  bin: string,
  spawnImpl: SpawnImpl = defaultSpawn,
): Promise<boolean> {
  const result = await runProcess({
    bin,
    args: ["auth", "status"],
    timeoutMs: 10_000,
    spawnImpl,
    requestedModelId: "",
  });
  if (!result.rawText) return false;
  try {
    const parsed = JSON.parse(result.rawText) as { loggedIn?: unknown };
    return parsed.loggedIn === true;
  } catch {
    return false;
  }
}

export function normalizeClaudeOutput(input: {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  attempted: boolean;
  requestedModelId: string;
  latencyMs: number | null;
}): ProviderResult {
  const parsed = parseJsonObject(input.stdout);
  if (!parsed) {
    const kind = classifyFailure(input.stderr, input.exitCode);
    return fail(input, kind, safeDetail(input.stderr, failureMessage(kind)));
  }
  if (isAuthStatus(parsed)) {
    return {
      attempted: input.attempted,
      status: "ok",
      advice: null,
      rawText: input.stdout,
      reportedModelId: null,
      usage: null,
      costUsd: null,
      latencyMs: input.latencyMs,
    };
  }
  if (hasToolEscape(parsed)) {
    return fail(
      input,
      "provider",
      "Rådgivaren försökte använda verktyg eller en underrådgivare. Svaret kastades.",
    );
  }
  const reported = reportedModel(parsed, input.requestedModelId);
  const usage = readUsage(parsed);
  const costUsd = typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : null;
  const latencyMs =
    typeof parsed.duration_ms === "number" ? parsed.duration_ms : input.latencyMs;
  if (reported.unexpected) {
    return {
      attempted: input.attempted,
      status: "failed",
      errorKind: "unexpected_model",
      message: `Anropet rapporterade ${reported.id ?? "en annan modell"} i stället för ${input.requestedModelId}. Svaret används inte.`,
      advice: null,
      rawText: null,
      reportedModelId: reported.id,
      usage,
      costUsd,
      latencyMs,
    };
  }
  if (parsed.is_error === true || (input.exitCode !== 0 && input.exitCode !== null && !parsed.structured_output && !parsed.result)) {
    const kind = classifyFailure(
      `${parsed.api_error_status ?? ""} ${input.stderr} ${typeof parsed.result === "string" ? parsed.result : ""}`,
      parsed.api_error_status,
    );
    return fail(input, kind, safeDetail(input.stderr, failureMessage(kind)), {
      reportedModelId: reported.id,
      usage,
      costUsd,
      latencyMs,
    });
  }
  const advice = adviceFrom(parsed);
  if (advice) {
    return {
      attempted: input.attempted,
      status: "ok",
      advice,
      rawText: null,
      reportedModelId: reported.id,
      usage,
      costUsd,
      latencyMs,
    };
  }
  const text = typeof parsed.result === "string" ? parsed.result.trim() : "";
  if (!text) return fail(input, "empty", "Rådgivaren svarade tomt.", { latencyMs, usage, costUsd });
  return {
    attempted: input.attempted,
    status: "unstructured",
    advice: null,
    rawText: text,
    reportedModelId: reported.id,
    usage,
    costUsd,
    latencyMs,
  };
}

function runProcess(input: {
  bin: string;
  args: string[];
  timeoutMs: number;
  spawnImpl: SpawnImpl;
  requestedModelId: string;
}): Promise<ProviderResult> {
  return new Promise((resolve) => {
    let attempted = false;
    let settled = false;
    const started = Date.now();
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let child: Spawned;
    try {
      child = input.spawnImpl(input.bin, input.args, {
        cwd: os.tmpdir(),
        env: advisorEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve(
        fail(
          { attempted: false, latencyMs: null },
          "provider",
          error instanceof Error && "code" in error && error.code === "ENOENT"
            ? "claude hittades inte."
            : "Kunde inte starta claude.",
        ),
      );
      return;
    }
    const finish = (result: ProviderResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      const result = fail(
        { attempted, latencyMs: Date.now() - started },
        "timeout",
        `Tidsgränsen på ${Math.round(input.timeoutMs / 1000)}s nåddes. Konsultationen misslyckades.`,
      );
      finish(result);
      child.kill("SIGKILL");
    }, input.timeoutMs);
    child.on("spawn", () => {
      attempted = true;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      const missing = error.code === "ENOENT";
      finish(
        fail(
          { attempted: missing ? false : attempted, latencyMs: Date.now() - started },
          "provider",
          missing ? "claude hittades inte." : "Kunde inte starta claude.",
        ),
      );
    });
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("close", (code: number | null) => {
      finish(
        normalizeClaudeOutput({
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          exitCode: code,
          attempted: attempted || stdout.length > 0,
          requestedModelId: input.requestedModelId,
          latencyMs: Date.now() - started,
        }),
      );
    });
  });
}

// Thinking pushed a short answer past the timeout; models that cannot stop ignore the cap.
// Haiku can call Claude's own advisor, and --tools "" does not remove it: with advisorModel
// saved, the boss asked Opus what to say.
function advisorEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    MAX_THINKING_TOKENS: "0",
    CLAUDE_CODE_DISABLE_ADVISOR_TOOL: "1",
  };
}

function defaultSpawn(command: string, args: string[], options: SpawnOptions): Spawned {
  return spawn(command, args, options) as Spawned;
}

function parseJsonObject(stdout: string): Record<string, unknown> | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    const last = trimmed.split(/\r?\n/).findLast((line) => line.trim().startsWith("{"));
    if (!last) return null;
    try {
      const value = JSON.parse(last) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function isAuthStatus(parsed: Record<string, unknown>): boolean {
  return typeof parsed.loggedIn === "boolean" && !("result" in parsed);
}

function hasToolEscape(parsed: Record<string, unknown>): boolean {
  const denials = parsed.permission_denials;
  if (Array.isArray(denials) && denials.length > 0) return true;
  const stats = parsed.subagent_stats;
  if (stats && typeof stats === "object" && !Array.isArray(stats)) {
    const spawned = (stats as { spawned?: unknown }).spawned;
    if (typeof spawned === "number" && spawned > 0) return true;
  }
  return false;
}

function reportedModel(
  parsed: Record<string, unknown>,
  requestedModelId: string,
): { id: string | null; unexpected: boolean } {
  const usage = parsed.modelUsage;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return { id: null, unexpected: false };
  }
  const entries = Object.entries(usage as Record<string, unknown>);
  if (entries.length === 0) return { id: null, unexpected: false };
  if (entries.length !== 1) {
    const other = entries.find(([name]) => name !== requestedModelId);
    return { id: (other ?? entries[0])[0], unexpected: true };
  }
  const [id, detail] = entries[0];
  const canonical =
    detail && typeof detail === "object"
      ? (detail as { canonicalModel?: unknown }).canonicalModel
      : null;
  if (id !== requestedModelId) return { id, unexpected: true };
  if (typeof canonical === "string" && !sameModel(requestedModelId, canonical)) {
    return { id: canonical, unexpected: true };
  }
  return { id, unexpected: false };
}

// Claude reports a dated snapshot under its undated canonical name.
function sameModel(requestedModelId: string, canonical: string): boolean {
  if (requestedModelId === canonical) return true;
  return (
    requestedModelId.startsWith(`${canonical}-`) &&
    /^\d{8}$/.test(requestedModelId.slice(canonical.length + 1))
  );
}

function readUsage(parsed: Record<string, unknown>): Usage | null {
  const usage = parsed.usage;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const record = usage as { input_tokens?: unknown; output_tokens?: unknown };
  if (typeof record.input_tokens !== "number" || typeof record.output_tokens !== "number") {
    return null;
  }
  return { input_tokens: record.input_tokens, output_tokens: record.output_tokens };
}

function adviceFrom(parsed: Record<string, unknown>): Advice | null {
  const structured = parseAdvice(parsed.structured_output);
  if (structured) return structured;
  if (typeof parsed.result !== "string") return null;
  try {
    return parseAdvice(JSON.parse(parsed.result));
  } catch {
    return null;
  }
}

function classifyFailure(text: string, status: unknown): string {
  const blob = `${status ?? ""} ${text}`.toLowerCase();
  if (blob.includes("429") || blob.includes("rate limit") || blob.includes("too many requests")) {
    return "rate_limit";
  }
  if (
    blob.includes("401") ||
    blob.includes("403") ||
    blob.includes("not logged") ||
    blob.includes("please run /login") ||
    blob.includes("unauthorized") ||
    blob.includes("authentication")
  ) {
    return "auth";
  }
  return "provider";
}

function failureMessage(kind: string): string {
  if (kind === "auth") return "Claude CLI är inte inloggad. Inget modellbyte gjordes.";
  if (kind === "rate_limit") return "Leverantören begränsade anropet. Inget modellbyte gjordes.";
  if (kind === "empty") return "Rådgivaren svarade tomt.";
  if (kind === "timeout") return "Tidsgränsen nåddes. Konsultationen misslyckades.";
  return "Konsultationen misslyckades.";
}

function safeDetail(stderr: string, fallback: string): string {
  const line = stderr
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!line) return fallback;
  if (/sk-|api[_-]?key|authorization|bearer|token|secret/i.test(line)) return fallback;
  return line.slice(0, 180);
}

function fail(
  input: { attempted: boolean; latencyMs: number | null },
  errorKind: string,
  message: string,
  extra?: Partial<ProviderResult>,
): ProviderResult {
  return {
    attempted: input.attempted,
    status: "failed",
    errorKind,
    message,
    advice: null,
    rawText: null,
    reportedModelId: null,
    usage: null,
    costUsd: null,
    latencyMs: input.latencyMs,
    ...extra,
  };
}
