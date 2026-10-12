import { loadCatalog, type ModelCatalog } from "./catalog.ts";
import { checkClaudeAuth, createClaudeProvider } from "./claude-cli.ts";
import {
  loadConfig,
  saveConfig,
  setupConfig,
  swapConfig,
  type Config,
  type Humor,
  type Mode,
  ConfigError,
} from "./config.ts";
import { buildStatus, consult, renderStatus } from "./consult.ts";
import {
  defaultCatalogDir,
  defaultClaudeBin,
  defaultHome,
  SKILL_ROOT,
} from "./paths.ts";
import type { Provider } from "./provider.ts";

export type CliIO = {
  home?: string;
  catalogDir?: string;
  skillRoot?: string;
  claudeBin?: string;
  stdout?: (chunk: string) => void;
  stderr?: (chunk: string) => void;
  stdin?: string;
  provider?: Provider;
  authCheck?: () => Promise<boolean>;
};

type Flags = {
  command: string;
  allowExtra: boolean;
  humor: Humor | null;
  activeDisplayName: string | null;
  activeModelId: string | null;
  mainId: string | null;
  advisorId: string | null;
  mode: Mode | null;
};

export async function runCli(argv: string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((chunk) => process.stdout.write(chunk));
  const stderr = io.stderr ?? ((chunk) => process.stderr.write(chunk));
  let flags: Flags;
  try {
    flags = parseArgs(argv);
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : "Ogiltiga argument"}\n`);
    return 2;
  }
  if (flags.command === "help") {
    stdout(`${HELP}\n`);
    return 0;
  }

  const home = io.home ?? defaultHome();
  const catalogDir = io.catalogDir ?? defaultCatalogDir();
  const skillRoot = io.skillRoot ?? SKILL_ROOT;
  const catalog = loadCatalog(catalogDir);

  try {
    switch (flags.command) {
      case "catalog":
        stdout(formatCatalog(catalog));
        return 0;
      case "setup":
        return setup(flags, home, catalog, stdout, stderr);
      case "status":
        return await status(flags, home, catalog, io, stdout);
      case "swap":
        return await swap(flags, home, catalog, io, stdout, stderr);
      case "off":
        return turnOff(home, catalog, stdout, stderr);
      case "consult":
        return await runConsult(flags, home, catalog, skillRoot, io, stdout, stderr);
      default:
        stderr(`Okänt kommando ${flags.command}\n${HELP}\n`);
        return 2;
    }
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : "Okänt fel"}\n`);
    return 2;
  }
}

function setup(
  flags: Flags,
  home: string,
  catalog: ModelCatalog,
  stdout: (chunk: string) => void,
  stderr: (chunk: string) => void,
): number {
  if (!flags.mainId || !flags.advisorId || !flags.mode) {
    stderr("setup behöver --main-id, --advisor-id och --mode live|parody.\n");
    stdout(formatCatalog(catalog));
    return 2;
  }
  const config = setupConfig({
    catalog,
    mainId: flags.mainId,
    advisorId: flags.advisorId,
    mode: flags.mode,
  });
  saveConfig(home, config);
  stdout(
    renderStatus(
      buildStatus({
        config,
        catalog,
        authOk: null,
      }),
    ),
  );
  return 0;
}

async function status(
  flags: Flags,
  home: string,
  catalog: ModelCatalog,
  io: CliIO,
  stdout: (chunk: string) => void,
): Promise<number> {
  const config = loadConfig(home);
  const authOk = config?.mode === "live" ? await resolveAuth(io) : null;
  stdout(
    renderStatus(
      buildStatus({
        config,
        catalog,
        activeModelId: flags.activeModelId,
        activeDisplayName: flags.activeDisplayName,
        authOk,
      }),
    ),
  );
  return 0;
}

async function swap(
  flags: Flags,
  home: string,
  catalog: ModelCatalog,
  io: CliIO,
  stdout: (chunk: string) => void,
  stderr: (chunk: string) => void,
): Promise<number> {
  const config = loadConfig(home);
  if (!config) {
    stderr("Ingen konfiguration att byta.\n");
    return 2;
  }
  const swapped = swapConfig(config, catalog);
  saveConfig(home, swapped.config);
  const authOk = swapped.config.mode === "live" ? await resolveAuth(io) : null;
  stdout("Bytte önskade roller. Inget anrop gjordes.\n");
  stdout(
    renderStatus(
      buildStatus({
        config: swapped.config,
        catalog,
        activeModelId: flags.activeModelId,
        activeDisplayName: flags.activeDisplayName,
        authOk,
      }),
    ),
  );
  return 0;
}

function turnOff(
  home: string,
  catalog: ModelCatalog,
  stdout: (chunk: string) => void,
  stderr: (chunk: string) => void,
): number {
  const config = loadConfig(home);
  if (!config) {
    stderr("Ingen konfiguration att stänga av.\n");
    return 2;
  }
  const next: Config = { ...config, enabled: false };
  saveConfig(home, next);
  stdout(
    renderStatus(
      buildStatus({
        config: next,
        catalog,
        authOk: null,
      }),
    ),
  );
  return 0;
}

async function runConsult(
  flags: Flags,
  home: string,
  catalog: ModelCatalog,
  skillRoot: string,
  io: CliIO,
  stdout: (chunk: string) => void,
  stderr: (chunk: string) => void,
): Promise<number> {
  const config = loadConfig(home);
  const provider =
    io.provider ??
    createClaudeProvider({ bin: io.claudeBin ?? defaultClaudeBin() });
  const needsAuth = config?.enabled === true && config.mode === "live";
  const authOk = needsAuth ? await resolveAuth(io) : true;
  const result = await consult({
    config,
    catalog,
    skillRoot,
    home,
    briefingSource: io.stdin === undefined ? await readStdin() : io.stdin,
    allowExtra: flags.allowExtra,
    humor: flags.humor,
    activeModelId: flags.activeModelId,
    activeDisplayName: flags.activeDisplayName,
    provider,
    authOk,
  });
  stdout(`${JSON.stringify(result, null, 2)}\n`);
  if (result.error && result.status === "blocked" && result.error.kind === "config") {
    stderr(`${result.error.message}\n`);
  }
  return 0;
}

async function resolveAuth(io: CliIO): Promise<boolean> {
  if (io.authCheck) return io.authCheck();
  return checkClaudeAuth(io.claudeBin ?? defaultClaudeBin());
}

function formatCatalog(catalog: ModelCatalog): string {
  if (catalog.models.length === 0) {
    return "Modellkatalogen saknas. Öppna Claude Code en gång.\n";
  }
  const header = catalog.stale
    ? "Katalogen är gammal. Välj ett ID från listan, inte ett visningsnamn.\n"
    : "Välj ett ID. Ett visningsnamn kopplas inte automatiskt till ett ID.\n";
  const rows = catalog.models.map(
    (model) => `${model.id}\t${model.name}\t${model.section ?? ""}`,
  );
  return `${header}${rows.join("\n")}\n`;
}

async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {
    command: argv[0] ?? "help",
    allowExtra: false,
    humor: null,
    activeDisplayName: null,
    activeModelId: null,
    mainId: null,
    advisorId: null,
    mode: null,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--allow-extra") {
      flags.allowExtra = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new ConfigError(`${token} behöver ett värde`);
    }
    index += 1;
    switch (token) {
      case "--humor":
        if (value !== "dry" && value !== "off") throw new ConfigError("--humor ska vara dry eller off");
        flags.humor = value;
        break;
      case "--active-display-name":
        flags.activeDisplayName = value;
        break;
      case "--active-model-id":
        flags.activeModelId = value;
        break;
      case "--main-id":
        flags.mainId = value;
        break;
      case "--advisor-id":
        flags.advisorId = value;
        break;
      case "--mode":
        if (value !== "live" && value !== "parody") {
          throw new ConfigError("--mode ska vara live eller parody");
        }
        flags.mode = value;
        break;
      default:
        throw new ConfigError(`Okänd flagga ${token}`);
    }
  }
  return flags;
}

const HELP = `ask-your-stupid-boss catalog
ask-your-stupid-boss setup --main-id ID --advisor-id ID --mode live|parody
ask-your-stupid-boss status [--active-display-name NAME] [--active-model-id ID]
ask-your-stupid-boss swap [--active-display-name NAME] [--active-model-id ID]
ask-your-stupid-boss off
ask-your-stupid-boss consult [--allow-extra] [--humor dry|off] [--active-display-name NAME]
`;
