export interface PlayerProgress {
  currentLevel: number;
  completedLevels: number[];
  stars: Record<number, number>;
  stickers: number;
  completedRows: string[];
  masteredKana: string[];
  companion: { level: number; xp: number; mood: string };
}

export interface PlayerProfile {
  id: string;
  name: string;
  progress: PlayerProgress;
  createdAt: number;
}

export interface ProfileStore {
  profiles: PlayerProfile[];
  activeId: string | null;
}

const STORE_KEY = 'japan-syllabary-profiles';
const OLD_SAVE_KEY = 'japan-syllabary-progress';

export function defaultProgress(): PlayerProgress {
  return {
    currentLevel: 0,
    completedLevels: [],
    stars: {},
    stickers: 0,
    completedRows: [],
    masteredKana: [],
    companion: { level: 1, xp: 0, mood: 'happy' },
  };
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function loadStore(): ProfileStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as ProfileStore;
      // Ensure progress fields are forward-compatible
      for (const p of data.profiles) {
        p.progress = { ...defaultProgress(), ...p.progress };
      }
      return data;
    }
  } catch {
    // fall through to migration / default
  }

  // Migration: import old single-save data as "玩家1"
  try {
    const oldRaw = localStorage.getItem(OLD_SAVE_KEY);
    if (oldRaw) {
      const oldProgress = { ...defaultProgress(), ...JSON.parse(oldRaw) } as PlayerProgress;
      const profile: PlayerProfile = {
        id: generateId(),
        name: '玩家1',
        progress: oldProgress,
        createdAt: Date.now(),
      };
      const store: ProfileStore = { profiles: [profile], activeId: profile.id };
      saveStore(store);
      localStorage.removeItem(OLD_SAVE_KEY);
      return store;
    }
  } catch {
    // ignore migration errors
  }

  return { profiles: [], activeId: null };
}

export function saveStore(store: ProfileStore): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // localStorage full or unavailable
  }
}

export function createProfile(store: ProfileStore, name: string): PlayerProfile {
  const profile: PlayerProfile = {
    id: generateId(),
    name,
    progress: defaultProgress(),
    createdAt: Date.now(),
  };
  store.profiles.push(profile);
  store.activeId = profile.id;
  saveStore(store);
  return profile;
}

export function deleteProfile(store: ProfileStore, id: string): void {
  store.profiles = store.profiles.filter(p => p.id !== id);
  if (store.activeId === id) {
    store.activeId = store.profiles.length > 0 ? store.profiles[0].id : null;
  }
  saveStore(store);
}

export function getActiveProfile(store: ProfileStore): PlayerProfile | null {
  return store.profiles.find(p => p.id === store.activeId) ?? null;
}

export function loadProgress(store: ProfileStore): PlayerProgress {
  const profile = getActiveProfile(store);
  return profile ? { ...defaultProgress(), ...profile.progress } : defaultProgress();
}

export function saveProgress(store: ProfileStore, progress: PlayerProgress): void {
  const profile = getActiveProfile(store);
  if (profile) {
    profile.progress = progress;
    saveStore(store);
  }
}
