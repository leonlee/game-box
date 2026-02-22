import {
  Screen, ModuleType, BuildingStage, PlayerProgress, PlayerProfile,
  ProfileStore, ModuleState, HitArea, WorldState, CloudDef,
  LessonDef, QuestionDef, FeedbackState, AnswerRecord, MistakeEntry,
  VocabQuestion, AssemblyQuestion, GrammarCheckQuestion, DialogueQuestion,
  BossQuestion,
} from './types';
import { loadStore, saveStore, createProfile, deleteProfile, getActiveProfile, loadProgress, saveProgress, defaultProgress } from './save';
import { sfx, speak, ensureAudioContext } from './audio';
import { AnimationManager } from './animation';
import { getLessonById, LESSONS, isLessonUnlocked, getModulesForLesson } from './content';
import { shuffle, pickRandom, todayStr, clamp } from './util';
import { t } from './i18n';

export const W = 960;
export const H = 640;
const BLOCK = 16;

const MODULE_ORDER: ModuleType[] = ['vocab_sprint', 'sentence_assembly', 'grammar_check', 'dialogue'];

const BUILDING_STAGES: BuildingStage[] = ['empty', 'foundation', 'walls', 'roof', 'decorated', 'flag'];

function nextBuildingStage(current: BuildingStage): BuildingStage {
  const idx = BUILDING_STAGES.indexOf(current);
  if (idx < BUILDING_STAGES.length - 1) return BUILDING_STAGES[idx + 1];
  return current;
}

export class Game {
  screen: Screen = 'player_select';
  store: ProfileStore;
  progress: PlayerProgress;
  anim = new AnimationManager();

  // World state
  world: WorldState;

  // Profile management
  profileInput = '';
  deleteConfirmId: string | null = null;

  // Current lesson/module
  currentLessonId = 15;
  currentModuleIndex = 0;
  currentModuleType: ModuleType = 'vocab_sprint';

  // Module runtime
  module: ModuleState | null = null;

  // Stage intro
  stageIntroTimer = 0;

  // Results
  lastModuleResult: { score: number; total: number; accuracy: number; xpEarned: number; stars: number; timeTaken: number } | null = null;
  lastStageResult: { lessonId: number; modulesCompleted: number; totalModules: number; buildingGrew: boolean; newStage: BuildingStage } | null = null;

  // Journal
  journalPage = 0;
  journalFilter: 'all' | ModuleType = 'all';

  constructor() {
    this.store = loadStore();
    this.progress = this.store.activeId ? loadProgress(this.store) : defaultProgress();
    this.world = this.initWorld();
  }

  private initWorld(): WorldState {
    const sites = LESSONS.map((lesson, i) => ({
      lessonId: lesson.id,
      gridX: 8 + i * 10,
      stage: (this.progress.buildingStages[lesson.id] ?? 'empty') as BuildingStage,
    }));

    const clouds: CloudDef[] = [];
    for (let i = 0; i < 8; i++) {
      clouds.push({
        x: Math.random() * 1920,
        y: 30 + Math.random() * 120,
        speed: 8 + Math.random() * 12,
        width: 40 + Math.random() * 60,
      });
    }

    return { scrollX: 0, targetScrollX: 0, sites, clouds, timeOfDay: 0.5 };
  }

  // ── Profile Management ──
  selectProfile(id: string): void {
    this.store.activeId = id;
    saveStore(this.store);
    this.progress = loadProgress(this.store);
    this.world = this.initWorld();
    this.screen = 'title';
    sfx.buttonTap();
  }

  addProfile(name: string): void {
    if (!name.trim()) return;
    createProfile(this.store, name.trim());
    this.progress = loadProgress(this.store);
    this.world = this.initWorld();
    this.screen = 'title';
    sfx.buttonTap();
  }

  confirmDeleteProfile(id: string): void {
    this.deleteConfirmId = id;
  }

  doDeleteProfile(): void {
    if (this.deleteConfirmId) {
      deleteProfile(this.store, this.deleteConfirmId);
      this.deleteConfirmId = null;
      if (this.store.profiles.length === 0) {
        this.progress = defaultProgress();
      } else {
        this.progress = loadProgress(this.store);
      }
      sfx.buttonTap();
    }
  }

  cancelDelete(): void {
    this.deleteConfirmId = null;
  }

  // ── Navigation ──
  goToTitle(): void {
    this.screen = 'title';
    sfx.buttonTap();
  }

  goToWorld(): void {
    this.screen = 'world';
    this.world = this.initWorld();
    // Scroll to current lesson
    const currentSite = this.world.sites.find(s => s.lessonId === this.progress.currentLesson);
    if (currentSite) {
      this.world.targetScrollX = Math.max(0, currentSite.gridX * BLOCK - W / 2);
      this.world.scrollX = this.world.targetScrollX;
    }
    sfx.buttonTap();
  }

  goToPlayerSelect(): void {
    this.screen = 'player_select';
    this.deleteConfirmId = null;
    sfx.buttonTap();
  }

  goToStageIntro(lessonId: number): void {
    if (!isLessonUnlocked(lessonId, this.progress)) return;
    this.currentLessonId = lessonId;
    this.currentModuleIndex = 0;
    this.stageIntroTimer = 0;
    this.screen = 'stage_intro';
    sfx.buttonTap();
  }

  goToJournal(): void {
    this.journalPage = 0;
    this.journalFilter = 'all';
    this.screen = 'journal';
    sfx.buttonTap();
  }

  // ── Module Lifecycle ──
  startModule(moduleType: ModuleType): void {
    ensureAudioContext();
    const lesson = getLessonById(this.currentLessonId);
    if (!lesson) return;

    const questions = this.generateQuestions(lesson, moduleType);
    if (questions.length === 0) return;

    const timeLimits: Record<ModuleType, number> = {
      vocab_sprint: 120,
      sentence_assembly: 180,
      grammar_check: 120,
      dialogue: 120,
      boss: 270,
    };

    this.currentModuleType = moduleType;
    this.module = {
      type: moduleType,
      lessonId: this.currentLessonId,
      questions,
      currentIndex: 0,
      answers: [],
      timeRemaining: timeLimits[moduleType],
      timeLimitSec: timeLimits[moduleType],
      score: 0,
      combo: 0,
      maxCombo: 0,
      finished: false,
      feedback: null,
      assemblyLine: (moduleType === 'sentence_assembly' || moduleType === 'boss') ? [] : undefined,
      bossHp: moduleType === 'boss' ? questions.length : undefined,
      bossMaxHp: moduleType === 'boss' ? questions.length : undefined,
    };

    this.screen = 'gameplay';
    sfx.buttonTap();

    // Auto-speak first vocab question
    if (moduleType === 'vocab_sprint') {
      const q = questions[0] as VocabQuestion;
      if (q.promptAudio) speak(q.promptAudio);
      else speak(q.prompt);
    }
  }

  private generateQuestions(lesson: LessonDef, moduleType: ModuleType): QuestionDef[] {
    switch (moduleType) {
      case 'vocab_sprint':
        return pickRandom(lesson.vocabQuestions, 10);
      case 'sentence_assembly':
        return pickRandom(lesson.assemblyQuestions, Math.min(8, Math.max(6, lesson.assemblyQuestions.length)));
      case 'grammar_check':
        return pickRandom(lesson.grammarCheckQuestions, 5);
      case 'dialogue':
        return pickRandom(lesson.dialogueQuestions, Math.min(5, Math.max(3, lesson.dialogueQuestions.length)));
      case 'boss': {
        if (lesson.bossQuestions && lesson.bossQuestions.length > 0) {
          return pickRandom(lesson.bossQuestions, Math.min(8, Math.max(6, lesson.bossQuestions.length)));
        }
        // Generate mixed questions from all types
        const mixed: QuestionDef[] = [
          ...pickRandom(lesson.vocabQuestions, 2),
          ...pickRandom(lesson.assemblyQuestions, 2),
          ...pickRandom(lesson.grammarCheckQuestions, 1),
          ...pickRandom(lesson.dialogueQuestions, 1),
        ];
        return shuffle(mixed);
      }
    }
  }

  answerQuestion(answerIndex: number): void {
    const m = this.module;
    if (!m || m.finished || m.feedback) return;

    const q = m.questions[m.currentIndex];
    let correct = false;
    let correctAnswer = '';
    let explanation = '';

    if (q.type === 'vocab') {
      correct = answerIndex === q.correctIndex;
      correctAnswer = q.choices[q.correctIndex];
    } else if (q.type === 'grammar_check') {
      correct = answerIndex === q.correctIndex;
      correctAnswer = q.sentences[q.correctIndex];
      explanation = q.explanation;
    } else if (q.type === 'dialogue') {
      correct = answerIndex === q.correctIndex;
      correctAnswer = q.choices[q.correctIndex];
    } else if (q.type === 'reading') {
      correct = answerIndex === q.correctIndex;
      correctAnswer = q.choices[q.correctIndex];
    } else if (q.type === 'boss') {
      const inner = q.question;
      if (inner.type === 'vocab' || inner.type === 'grammar_check' || inner.type === 'dialogue' || inner.type === 'reading') {
        correct = answerIndex === inner.correctIndex;
        correctAnswer = 'choices' in inner ? inner.choices[inner.correctIndex] : '';
      }
    }

    if (correct) {
      m.score++;
      m.combo++;
      if (m.combo > m.maxCombo) m.maxCombo = m.combo;
      if (m.bossHp !== undefined) m.bossHp--;
      sfx.correct();
    } else {
      m.combo = 0;
      sfx.incorrect();
      // Log mistake
      this.logMistake(q, String(answerIndex), correctAnswer);
    }

    const record: AnswerRecord = {
      correct,
      timeSpent: m.timeLimitSec - m.timeRemaining,
      firstTry: true,
    };
    m.answers.push(record);

    m.feedback = {
      correct,
      explanation: explanation || undefined,
      correctAnswer: correct ? undefined : correctAnswer,
      timer: correct ? 1.0 : 1.8,
    };
  }

  submitAssembly(): void {
    const m = this.module;
    if (!m || m.finished || m.feedback || !m.assemblyLine) return;

    let rawQ = m.questions[m.currentIndex];
    if (rawQ.type === 'boss') rawQ = (rawQ as BossQuestion).question;
    const q = rawQ as AssemblyQuestion;
    const correct = m.assemblyLine.join('') === q.correctOrder.join('');

    if (correct) {
      m.score++;
      m.combo++;
      if (m.combo > m.maxCombo) m.maxCombo = m.combo;
      sfx.correct();
      speak(q.correctOrder.join(''));
    } else {
      m.combo = 0;
      sfx.incorrect();
      this.logMistake(q, m.assemblyLine.join(''), q.correctOrder.join(''));
    }

    m.answers.push({ correct, timeSpent: m.timeLimitSec - m.timeRemaining, firstTry: true });
    m.feedback = {
      correct,
      correctAnswer: correct ? undefined : q.correctOrder.join(''),
      timer: correct ? 1.0 : 1.8,
    };
  }

  addBlock(block: string): void {
    const m = this.module;
    if (!m || !m.assemblyLine || m.feedback) return;
    m.assemblyLine.push(block);
    sfx.blockPlace();
  }

  removeBlock(index: number): void {
    const m = this.module;
    if (!m || !m.assemblyLine || m.feedback) return;
    m.assemblyLine.splice(index, 1);
    sfx.blockRemove();
  }

  clearAssembly(): void {
    const m = this.module;
    if (!m || !m.assemblyLine || m.feedback) return;
    m.assemblyLine = [];
  }

  private logMistake(question: QuestionDef, playerAnswer: string, correctAnswer: string): void {
    this.progress.mistakes.push({
      lessonId: this.currentLessonId,
      moduleType: this.currentModuleType,
      question,
      playerAnswer,
      correctAnswer,
      timestamp: Date.now(),
      reviewed: false,
    });
    // Keep max 200 mistakes
    if (this.progress.mistakes.length > 200) {
      this.progress.mistakes = this.progress.mistakes.slice(-200);
    }
  }

  private advanceQuestion(): void {
    const m = this.module;
    if (!m) return;

    m.feedback = null;
    m.currentIndex++;

    if (m.currentIndex >= m.questions.length || (m.type === 'boss' && m.bossHp !== undefined && m.bossHp <= 0)) {
      this.finishModule();
      return;
    }

    // Reset assembly line for next question
    if (m.assemblyLine !== undefined) {
      m.assemblyLine = [];
    }

    // Auto-speak vocab
    if (m.type === 'vocab_sprint') {
      const q = m.questions[m.currentIndex] as VocabQuestion;
      if (q.promptAudio) speak(q.promptAudio);
      else speak(q.prompt);
    }
  }

  private finishModule(): void {
    const m = this.module;
    if (!m) return;
    m.finished = true;

    const total = m.questions.length;
    const accuracy = total > 0 ? m.score / total : 0;
    const stars = accuracy >= 0.9 ? 3 : accuracy >= 0.7 ? 2 : accuracy >= 0.5 ? 1 : 0;
    const xpBase = m.score * 10;
    const comboBonus = m.maxCombo * 2;
    const xpEarned = xpBase + comboBonus;
    const timeTaken = m.timeLimitSec - m.timeRemaining;

    // Update progress
    const key = `${m.lessonId}-${m.type}`;
    const prevStars = this.progress.stars[key] ?? 0;
    if (stars > prevStars) this.progress.stars[key] = stars;

    if (!this.progress.completedModules[m.lessonId]) {
      this.progress.completedModules[m.lessonId] = [];
    }
    if (!this.progress.completedModules[m.lessonId].includes(m.type)) {
      this.progress.completedModules[m.lessonId].push(m.type);
    }

    // XP & level
    this.progress.xp += xpEarned;
    const newLevel = Math.floor(this.progress.xp / 100) + 1;
    if (newLevel > this.progress.level) {
      this.progress.level = newLevel;
    }

    // Streak
    const today = todayStr();
    if (this.progress.lastPlayDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (this.progress.lastPlayDate === yesterday.toISOString().slice(0, 10)) {
        this.progress.streak++;
      } else if (this.progress.lastPlayDate !== today) {
        this.progress.streak = 1;
      }
      this.progress.lastPlayDate = today;
    }

    // Building stage advancement
    const completedCount = this.progress.completedModules[m.lessonId]?.length ?? 0;
    const currentStage = this.progress.buildingStages[m.lessonId] ?? 'empty';
    const stageIndex = BUILDING_STAGES.indexOf(currentStage as BuildingStage);
    let buildingGrew = false;
    let newStage = currentStage as BuildingStage;

    if (completedCount > stageIndex) {
      newStage = BUILDING_STAGES[Math.min(completedCount, BUILDING_STAGES.length - 1)];
      this.progress.buildingStages[m.lessonId] = newStage;
      if (newStage !== currentStage) buildingGrew = true;
    }

    // Update current lesson if needed
    if (completedCount >= 3 && this.progress.currentLesson === m.lessonId && m.lessonId < 25) {
      this.progress.currentLesson = m.lessonId + 1;
    }

    this.progress.stickers += m.score;
    saveProgress(this.store, this.progress);

    this.lastModuleResult = { score: m.score, total, accuracy, xpEarned, stars, timeTaken };
    this.lastStageResult = {
      lessonId: m.lessonId,
      modulesCompleted: completedCount,
      totalModules: 4,
      buildingGrew,
      newStage: newStage as BuildingStage,
    };

    sfx.moduleComplete();
    this.screen = 'module_result';
  }

  goToStageResult(): void {
    this.screen = 'stage_result';
    if (this.lastStageResult?.buildingGrew) {
      sfx.buildingGrow();
      this.anim.addBlockBurst(W / 2, H / 2, 16);
    }
    sfx.buttonTap();
  }

  nextModuleOrWorld(): void {
    const completed = this.progress.completedModules[this.currentLessonId] ?? [];
    const nextType = MODULE_ORDER.find(mt => !completed.includes(mt));

    if (nextType) {
      this.startModule(nextType);
    } else {
      this.goToWorld();
    }
  }

  retryModule(): void {
    this.startModule(this.currentModuleType);
  }

  // ── Update ──
  update(dt: number): void {
    this.anim.update(dt);

    // Module timer
    if (this.screen === 'gameplay' && this.module && !this.module.finished) {
      // Feedback timer
      if (this.module.feedback) {
        this.module.feedback.timer -= dt;
        if (this.module.feedback.timer <= 0) {
          this.advanceQuestion();
        }
      } else {
        // Main timer countdown
        this.module.timeRemaining -= dt;
        if (this.module.timeRemaining <= 0) {
          this.module.timeRemaining = 0;
          this.finishModule();
        }
      }
    }

    // World scroll
    if (this.screen === 'world') {
      const diff = this.world.targetScrollX - this.world.scrollX;
      if (Math.abs(diff) > 0.5) {
        this.world.scrollX += diff * Math.min(1, 6 * dt);
      }

      // Animate clouds
      const totalWidth = 120 * BLOCK;
      for (const cloud of this.world.clouds) {
        cloud.x += cloud.speed * dt;
        if (cloud.x > totalWidth + 100) cloud.x = -cloud.width;
      }
    }

    // Stage intro timer
    if (this.screen === 'stage_intro') {
      this.stageIntroTimer += dt;
    }
  }

  // ── World scrolling ──
  scrollWorld(dx: number): void {
    const maxScroll = Math.max(0, 120 * BLOCK - W);
    this.world.targetScrollX = clamp(this.world.targetScrollX + dx, 0, maxScroll);
  }

  // ── Journal ──
  getFilteredMistakes(): MistakeEntry[] {
    let mistakes = [...this.progress.mistakes].reverse();
    if (this.journalFilter !== 'all') {
      mistakes = mistakes.filter(m => m.moduleType === this.journalFilter);
    }
    return mistakes;
  }

  markMistakeReviewed(index: number): void {
    const filtered = this.getFilteredMistakes();
    if (index >= 0 && index < filtered.length) {
      filtered[index].reviewed = true;
      saveProgress(this.store, this.progress);
    }
  }
}
