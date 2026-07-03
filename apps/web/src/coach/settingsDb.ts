// Tiny Dexie key/value store for coach settings (ADR-010: persist in Dexie).
// Kept in its OWN database so it doesn't touch the WP-4 session-log schema
// (guitar-tutor) — no version bump, no shared-file edit.
import Dexie, { type EntityTable } from "dexie";

interface Setting {
  key: string;
  value: string;
}

type SettingsDB = Dexie & { settings: EntityTable<Setting, "key"> };

let db: SettingsDB | null = null;

function settingsDB(): SettingsDB {
  if (!db) {
    db = new Dexie("guitar-tutor-settings") as SettingsDB;
    db.version(1).stores({ settings: "key" });
  }
  return db;
}

export async function getSetting(key: string): Promise<string | undefined> {
  try {
    const row = await settingsDB().settings.get(key);
    return row?.value;
  } catch {
    // No IndexedDB (SSR / hostile env) — settings are best-effort.
    return undefined;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  try {
    await settingsDB().settings.put({ key, value });
  } catch {
    /* best-effort persistence */
  }
}
