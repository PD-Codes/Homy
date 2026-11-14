import type { CatalogEntry, ModuleDef } from './types';

const modules = new Map<string, ModuleDef>();

/** Native modules are bundled into both the web app and the add-on. */
export function defineModule(def: ModuleDef): ModuleDef {
  modules.set(def.type, def);
  return def;
}

export function getModule(type: string): ModuleDef | undefined {
  return modules.get(type);
}

export function allModules(): ModuleDef[] {
  return [...modules.values()];
}

export function moduleToCatalog(def: ModuleDef, locale: string): CatalogEntry {
  const de = locale.startsWith('de');
  return {
    type: def.type,
    name: de ? def.name.de : def.name.en,
    description: de ? def.description.de : def.description.en,
    icon: def.icon,
    category: def.category,
    source: 'native',
    size: def.size,
    schema: def.schema,
    needsServer: def.needsServer,
    only: def.only,
  };
}

/** Read a config value with schema default, normalising legacy "Ja"/"Nein". */
export function cfgBool(config: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = config[key];
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  return s === 'ja' || s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

export function cfgStr(config: Record<string, unknown>, key: string, fallback = ''): string {
  const v = config[key];
  return v === undefined || v === null ? fallback : String(v);
}

export function cfgNum(config: Record<string, unknown>, key: string, fallback: number): number {
  const n = Number(config[key]);
  return Number.isFinite(n) ? n : fallback;
}
