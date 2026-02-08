import { Kana, KANA_BY_ID, KANA_GROUPS, LevelDef, generateLevels, shuffle } from './kana';
import {
  PlayerProgress, ProfileStore, defaultProgress,
  loadStore, saveStore, loadProgress, saveProgress,
  createProfile, deleteProfile as deleteProfileFromStore, getActiveProfile,
} from './save';
import { sfx, speak } from './audio';
import { AnimationManager } from './animation';
import { randomCorrectMsg, randomIncorrectMsg, t } from './i18n';

export type Screen = 'player_select' | 'title' | 'level_select' | 'gameplay' | 'level_complete';

export interface Question {
  targetKana: Kana;
  choices: Kana[];
  mode: 'listen_pick' | 'see_pick';
  answered: boolean;
  correct: boolean;
  selectedIndex: number;
}

export interface LevelResult {
  levelId: number;
  totalQuestions: number;
  correctFirst: number;
  stickersEarned: number;
  stars: number;
  newRowCompleted: string | null;
}

export class GameState {
  screen: Screen = 'player_select';
  store: ProfileStore;
  progress: PlayerProgress;
  levels: LevelDef[];
  currentLevelDef: LevelDef | null = null;
  questions: Question[] = [];
  questionIndex = 0;
  correctFirstCount = 0;
  combo = 0;
  maxCombo = 0;
  feedbackTimer = 0;
  feedbackMsg = '';
  feedbackCorrect = false;
  levelResult: LevelResult | null = null;
  animations: AnimationManager = new AnimationManager();
  levelSelectScroll = 0;
  confirmDeleteId: string | null = null;

  constructor() {
    this.store = loadStore();
    this.progress = loadProgress(this.store);
    this.levels = generateLevels();
  }

  get currentQuestion(): Question | null {
    return this.questions[this.questionIndex] ?? null;
  }

  get isNewGame(): boolean {
    return this.progress.completedLevels.length === 0;
  }

  get totalStars(): number {
    return Object.values(this.progress.stars).reduce((a, b) => a + b, 0);
  }

  get activePlayerName(): string | null {
    const profile = getActiveProfile(this.store);
    return profile ? profile.name : null;
  }

  // --- Profile management ---

  selectProfile(id: string): void {
    this.store.activeId = id;
    saveStore(this.store);
    this.progress = loadProgress(this.store);
    this.confirmDeleteId = null;
    this.screen = 'title';
  }

  createNewProfile(): void {
    const existingNumbers = this.store.profiles
      .map(p => {
        const match = p.name.match(/^玩家(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      });
    const next = Math.max(0, ...existingNumbers) + 1;
    const name = `${t('player_name_prefix')}${next}`;
    createProfile(this.store, name);
    this.progress = loadProgress(this.store);
    this.screen = 'title';
  }

  confirmDelete(id: string): void {
    this.confirmDeleteId = id;
  }

  cancelDelete(): void {
    this.confirmDeleteId = null;
  }

  deleteProfile(id: string): void {
    deleteProfileFromStore(this.store, id);
    this.confirmDeleteId = null;
    // If we deleted the active profile, reload progress
    this.progress = loadProgress(this.store);
  }

  goToPlayerSelect(): void {
    this.screen = 'player_select';
    this.confirmDeleteId = null;
    this.animations.clear();
  }

  // --- Existing navigation ---

  startGame(): void {
    if (this.isNewGame) {
      this.progress = defaultProgress();
      saveProgress(this.store, this.progress);
    }
    this.screen = 'level_select';
  }

  isLevelUnlocked(levelId: number): boolean {
    if (levelId === 0) return true;
    return this.progress.completedLevels.includes(levelId - 1);
  }

  startLevel(levelId: number): void {
    const levelDef = this.levels[levelId];
    if (!levelDef) return;

    this.currentLevelDef = levelDef;
    this.questionIndex = 0;
    this.correctFirstCount = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.feedbackTimer = 0;
    this.levelResult = null;
    this.animations.clear();

    // Build question pool
    const allKanaIds = [...levelDef.newKana, ...levelDef.reviewKana];
    const questions: Question[] = [];
    const numQuestions = levelDef.targetScore;

    // Ensure each new kana appears at least twice
    const kanaPool: string[] = [];
    for (const id of levelDef.newKana) {
      kanaPool.push(id, id);
    }
    // Fill remaining with mix
    while (kanaPool.length < numQuestions) {
      kanaPool.push(allKanaIds[Math.floor(Math.random() * allKanaIds.length)]);
    }

    const shuffledPool = shuffle(kanaPool).slice(0, numQuestions);

    for (const targetId of shuffledPool) {
      const target = KANA_BY_ID.get(targetId);
      if (!target) continue;

      // Pick distractors from available kana
      const distractorPool = allKanaIds.filter(id => id !== targetId);
      const numChoices = Math.min(4, allKanaIds.length);
      const distractors = shuffle(distractorPool).slice(0, numChoices - 1);
      const choiceIds = shuffle([targetId, ...distractors]);
      const choices = choiceIds.map(id => KANA_BY_ID.get(id)!).filter(Boolean);

      // Determine mode
      let mode: 'listen_pick' | 'see_pick';
      if (levelDef.mode === 'listen_pick') mode = 'listen_pick';
      else if (levelDef.mode === 'see_pick') mode = 'see_pick';
      else mode = Math.random() < 0.5 ? 'listen_pick' : 'see_pick';

      questions.push({ targetKana: target, choices, mode, answered: false, correct: false, selectedIndex: -1 });
    }

    this.questions = questions;
    this.screen = 'gameplay';

    // Auto-speak first question if listen mode
    if (this.currentQuestion?.mode === 'listen_pick') {
      setTimeout(() => this.speakCurrent(), 300);
    }
  }

  speakCurrent(): void {
    const q = this.currentQuestion;
    if (!q) return;
    speak(q.targetKana.glyph);
  }

  selectAnswer(choiceIndex: number): void {
    const q = this.currentQuestion;
    if (!q || q.answered || this.feedbackTimer > 0) return;

    q.selectedIndex = choiceIndex;
    const selectedKana = q.choices[choiceIndex];
    q.correct = selectedKana.id === q.targetKana.id;
    q.answered = true;

    if (q.correct) {
      this.correctFirstCount++;
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.feedbackMsg = randomCorrectMsg();
      this.feedbackCorrect = true;
      this.feedbackTimer = 1.2;
      sfx.correct();
      setTimeout(() => speak(q.targetKana.glyph), 200);
    } else {
      this.combo = 0;
      this.feedbackMsg = randomIncorrectMsg();
      this.feedbackCorrect = false;
      this.feedbackTimer = 1.8;
      sfx.incorrect();
      setTimeout(() => speak(q.targetKana.glyph), 600);
    }
  }

  update(dt: number): void {
    this.animations.update(dt);

    if (this.feedbackTimer > 0) {
      this.feedbackTimer -= dt;
      if (this.feedbackTimer <= 0) {
        this.feedbackTimer = 0;
        this.advanceQuestion();
      }
    }
  }

  private advanceQuestion(): void {
    this.questionIndex++;
    if (this.questionIndex >= this.questions.length) {
      this.completeLevel();
    } else {
      const q = this.currentQuestion;
      if (q?.mode === 'listen_pick') {
        setTimeout(() => this.speakCurrent(), 300);
      }
    }
  }

  private completeLevel(): void {
    if (!this.currentLevelDef) return;

    const total = this.questions.length;
    const pct = total > 0 ? this.correctFirstCount / total : 0;
    const stars = pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : pct >= 0.5 ? 1 : 0;
    const stickersEarned = this.correctFirstCount;

    // Check if this level completes a row
    let newRowCompleted: string | null = null;
    const groupIndex = this.currentLevelDef.groupIndex;
    const group = KANA_GROUPS[groupIndex];
    if (group && this.currentLevelDef.isReview && !this.progress.completedRows.includes(group.row)) {
      newRowCompleted = group.row;
    }

    this.levelResult = {
      levelId: this.currentLevelDef.id,
      totalQuestions: total,
      correctFirst: this.correctFirstCount,
      stickersEarned,
      stars,
      newRowCompleted,
    };

    // Update progress
    const lid = this.currentLevelDef.id;
    if (!this.progress.completedLevels.includes(lid)) {
      this.progress.completedLevels.push(lid);
    }
    const prevStars = this.progress.stars[lid] ?? 0;
    if (stars > prevStars) this.progress.stars[lid] = stars;
    this.progress.stickers += stickersEarned;
    if (lid >= this.progress.currentLevel) {
      this.progress.currentLevel = lid + 1;
    }

    // Mark new kana as mastered
    for (const kId of this.currentLevelDef.newKana) {
      if (!this.progress.masteredKana.includes(kId)) {
        this.progress.masteredKana.push(kId);
      }
    }

    // Row completion
    if (newRowCompleted) {
      this.progress.completedRows.push(newRowCompleted);
    }

    // Companion XP
    this.progress.companion.xp += stickersEarned;
    const xpNeeded = this.progress.companion.level * 10;
    if (this.progress.companion.xp >= xpNeeded) {
      this.progress.companion.xp -= xpNeeded;
      this.progress.companion.level++;
      this.progress.companion.mood = 'excited';
    } else {
      this.progress.companion.mood = stars >= 2 ? 'happy' : 'encouraging';
    }

    saveProgress(this.store, this.progress);

    this.screen = 'level_complete';
    sfx.levelComplete();
    if (newRowCompleted) {
      setTimeout(() => sfx.rowComplete(), 500);
    }
  }

  goToTitle(): void {
    this.screen = 'title';
    this.animations.clear();
  }

  goToLevelSelect(): void {
    this.screen = 'level_select';
    this.animations.clear();
  }

  nextLevel(): void {
    if (!this.levelResult) return;
    const nextId = this.levelResult.levelId + 1;
    if (nextId < this.levels.length) {
      this.startLevel(nextId);
    } else {
      this.screen = 'level_select';
    }
  }

  replayLevel(): void {
    if (!this.currentLevelDef) return;
    this.startLevel(this.currentLevelDef.id);
  }
}
