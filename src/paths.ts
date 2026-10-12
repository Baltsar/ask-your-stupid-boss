import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

export const SKILL_ROOT = path.resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);

export function defaultHome(): string {
  return (
    process.env.ASK_YOUR_STUPID_BOSS_HOME ??
    path.join(os.homedir(), ".config", "ask-your-stupid-boss")
  );
}

export function defaultCatalogDir(): string {
  return (
    process.env.ASK_YOUR_STUPID_BOSS_CATALOG_DIR ??
    path.join(os.homedir(), ".claude", "cache", "model-catalog")
  );
}

export function defaultClaudeBin(): string {
  return process.env.ASK_YOUR_STUPID_BOSS_CLAUDE_BIN ?? "claude";
}
