import fs from "node:fs";
import path from "node:path";

export type CatalogModel = {
  id: string;
  name: string;
  section: string | null;
};

export type ModelCatalog = {
  models: CatalogModel[];
  stale: boolean;
  source: string | null;
};

export function loadCatalog(catalogDir: string, now = Date.now()): ModelCatalog {
  if (!fs.existsSync(catalogDir)) {
    return { models: [], stale: true, source: null };
  }
  const files = fs
    .readdirSync(catalogDir)
    .filter((name) => name.endsWith("-cc.json"))
    .map((name) => {
      const full = path.join(catalogDir, name);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) return { models: [], stale: true, source: null };

  const source = files[0].full;
  const raw = JSON.parse(fs.readFileSync(source, "utf8")) as {
    staleAt?: number;
    catalog?: { config?: { models?: unknown[] } };
  };
  const models: CatalogModel[] = [];
  for (const entry of raw.catalog?.config?.models ?? []) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { id?: unknown; name?: unknown; section?: unknown };
    if (typeof record.id !== "string" || typeof record.name !== "string") continue;
    models.push({
      id: record.id,
      name: record.name,
      section: typeof record.section === "string" ? record.section : null,
    });
  }
  const stale = typeof raw.staleAt === "number" ? now > raw.staleAt : false;
  return { models, stale, source };
}

export function findModel(catalog: ModelCatalog, id: string): CatalogModel | null {
  return catalog.models.find((model) => model.id === id) ?? null;
}
