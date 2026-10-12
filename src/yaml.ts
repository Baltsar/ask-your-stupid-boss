export class YamlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YamlError";
  }
}

export function parseYaml(source: string): Record<string, unknown> {
  const lines = source.split(/\r?\n/);
  let index = 0;

  function skipBlanks(): void {
    while (index < lines.length) {
      const trimmed = lines[index].trim();
      if (trimmed !== "" && !trimmed.startsWith("#")) return;
      index += 1;
    }
  }

  function parseBlock(indent: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    while (index < lines.length) {
      skipBlanks();
      if (index >= lines.length) break;
      const raw = lines[index];
      const current = raw.match(/^ */)?.[0].length ?? 0;
      if (current < indent) break;
      if (current > indent) {
        throw new YamlError(`Oväntad indentering på rad ${index + 1}`);
      }
      const line = raw.slice(current);
      const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (!match) throw new YamlError(`Ogiltig rad ${index + 1}`);
      const key = match[1];
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        throw new YamlError(`Dubblettnyckel ${key} på rad ${index + 1}`);
      }
      const inline = stripInlineComment(match[2]);
      index += 1;
      if (inline === "") {
        const next = peekIndent();
        if (next > current) result[key] = parseBlock(next);
        else result[key] = null;
      } else {
        result[key] = parseScalar(inline, index);
      }
    }
    return result;
  }

  function peekIndent(): number {
    let cursor = index;
    while (cursor < lines.length) {
      const trimmed = lines[cursor].trim();
      if (trimmed !== "" && !trimmed.startsWith("#")) {
        return lines[cursor].match(/^ */)?.[0].length ?? 0;
      }
      cursor += 1;
    }
    return -1;
  }

  const document = parseBlock(0);
  skipBlanks();
  if (index < lines.length) {
    throw new YamlError(`Oväntat innehåll på rad ${index + 1}`);
  }
  return document;
}

function stripInlineComment(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) return trimmed;
  return trimmed.replace(/\s+#.*$/, "").trim();
}

function parseScalar(value: string, line: number): unknown {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  if (value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value.includes(": ") && !value.startsWith('"')) {
    throw new YamlError(`Ogiltigt värde på rad ${line}`);
  }
  return value;
}
