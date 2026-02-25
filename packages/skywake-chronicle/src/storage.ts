import { APP_MAJOR_VERSION, STORAGE_KEY, createDefaultSave } from "./content";
import { SaveData } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shallowValidate(data: unknown): data is SaveData {
  if (!isRecord(data)) return false;
  return (
    typeof data.saveId === "string" &&
    typeof data.appMajorVersion === "number" &&
    Array.isArray(data.characters) &&
    Array.isArray(data.tacticsProfiles) &&
    Array.isArray(data.runs) &&
    isRecord(data.inventory)
  );
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSave();

    const parsed = JSON.parse(raw) as unknown;
    if (!shallowValidate(parsed)) {
      return createDefaultSave();
    }

    const save = parsed as SaveData;
    if (save.appMajorVersion !== APP_MAJOR_VERSION) {
      return createDefaultSave();
    }

    return save;
  } catch {
    return createDefaultSave();
  }
}

export function persistSave(save: SaveData): void {
  const output: SaveData = {
    ...save,
    updatedAt: Date.now()
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(output));
}

export function wipeSave(): SaveData {
  const fresh = createDefaultSave();
  persistSave(fresh);
  return fresh;
}
