import { PlayerProgress, PlayerProfile, ProfileStore } from './types';

const STORE_KEY = 'our-japan-profiles';

export function defaultProgress(): PlayerProgress {
  return {
    currentLesson: 15,
    completedModules: {},
    buildingStages: {},
    xp: 0,
    level: 1,
    streak: 0,
    lastPlayDate: '',
    badges: [],
    stickers: 0,
    stars: {},
    mistakes: [],
    reviewsDone: [],
    testsDone: [],
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
      for (const p of data.profiles) {
        p.progress = { ...defaultProgress(), ...p.progress };
      }
      return data;
    }
  } catch {
    // fall through
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
