// ── Screen Flow ──
export type Screen =
  | 'player_select'
  | 'title'
  | 'world'
  | 'stage_intro'
  | 'gameplay'
  | 'module_result'
  | 'stage_result'
  | 'journal';

// ── Module Types ──
export type ModuleType =
  | 'vocab_sprint'
  | 'sentence_assembly'
  | 'grammar_check'
  | 'dialogue'
  | 'boss';

// ── Building Stages ──
export type BuildingStage =
  | 'empty'
  | 'foundation'
  | 'walls'
  | 'roof'
  | 'decorated'
  | 'flag';

// ── Content Definitions ──
export interface VocabItem {
  ja: string;       // Japanese word/phrase
  reading: string;  // Hiragana reading
  zh: string;       // Chinese meaning
  example?: string; // Example sentence
}

export interface GrammarPoint {
  pattern: string;      // e.g. "Vて形 + もいいです"
  meaning: string;      // Chinese explanation
  examples: { ja: string; zh: string }[];
}

// ── Question Types (Discriminated Union) ──
export interface VocabQuestion {
  type: 'vocab';
  prompt: string;       // Japanese word or sentence to identify
  promptAudio?: string; // Text for TTS
  choices: string[];    // 4 choices (Chinese meanings)
  correctIndex: number;
}

export interface AssemblyQuestion {
  type: 'assembly';
  meaning: string;        // Chinese meaning shown as prompt
  blocks: string[];       // Shuffled word blocks
  correctOrder: string[]; // Correct sentence order
  hint?: string;
}

export interface GrammarCheckQuestion {
  type: 'grammar_check';
  prompt: string;         // Instruction in Chinese
  sentences: string[];    // 3-4 sentence options
  correctIndex: number;   // Index of correct sentence
  explanation: string;    // Why it's correct/incorrect
}

export interface DialogueQuestion {
  type: 'dialogue';
  context: string;         // Scene description in Chinese
  lines: DialogueLine[];   // Chat lines with one blank
  choices: string[];       // 3-4 choices for the blank
  correctIndex: number;
}

export interface DialogueLine {
  speaker: string;   // Speaker name
  text: string;      // Text (use '___' for the blank)
  isBlank?: boolean;
}

export interface BossQuestion {
  type: 'boss';
  subType: 'vocab' | 'assembly' | 'grammar_check' | 'dialogue' | 'reading';
  question: VocabQuestion | AssemblyQuestion | GrammarCheckQuestion | DialogueQuestion | ReadingQuestion;
}

export interface ReadingQuestion {
  type: 'reading';
  passage: string;     // Japanese reading passage
  passageZh: string;   // Chinese translation hint
  question: string;    // Question about the passage
  choices: string[];
  correctIndex: number;
}

export type QuestionDef = VocabQuestion | AssemblyQuestion | GrammarCheckQuestion | DialogueQuestion | BossQuestion | ReadingQuestion;

// ── Module & Lesson Definitions ──
export interface ModuleDef {
  type: ModuleType;
  questionCount: [number, number]; // [min, max]
  timeLimitSec: number;
}

export interface LessonDef {
  id: number;                  // 15-25
  title: string;               // Chinese title
  titleJa: string;             // Japanese title
  grammarPoints: GrammarPoint[];
  vocab: VocabItem[];
  difficulty: 'basic' | 'discrimination' | 'synthesis';
  vocabQuestions: VocabQuestion[];
  assemblyQuestions: AssemblyQuestion[];
  grammarCheckQuestions: GrammarCheckQuestion[];
  dialogueQuestions: DialogueQuestion[];
  bossQuestions?: BossQuestion[];
}

// ── Player Progress ──
export interface PlayerProgress {
  currentLesson: number;
  completedModules: Record<number, ModuleType[]>; // lessonId → completed module types
  buildingStages: Record<number, BuildingStage>;
  xp: number;
  level: number;
  streak: number;
  lastPlayDate: string; // ISO date string
  badges: string[];
  stickers: number;
  stars: Record<string, number>; // "lessonId-moduleType" → 0-3
  mistakes: MistakeEntry[];
  reviewsDone: number[];
  testsDone: number[];
}

export interface MistakeEntry {
  lessonId: number;
  moduleType: ModuleType;
  question: QuestionDef;
  playerAnswer: string;
  correctAnswer: string;
  timestamp: number;
  reviewed: boolean;
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

// ── Module Runtime State ──
export interface ModuleState {
  type: ModuleType;
  lessonId: number;
  questions: QuestionDef[];
  currentIndex: number;
  answers: AnswerRecord[];
  timeRemaining: number;
  timeLimitSec: number;
  score: number;
  combo: number;
  maxCombo: number;
  finished: boolean;
  // Feedback overlay
  feedback: FeedbackState | null;
  // Sentence assembly specific
  assemblyLine?: string[];
  // Boss specific
  bossHp?: number;
  bossMaxHp?: number;
}

export interface AnswerRecord {
  correct: boolean;
  timeSpent: number;
  firstTry: boolean;
}

export interface FeedbackState {
  correct: boolean;
  explanation?: string;
  correctAnswer?: string;
  timer: number; // seconds remaining
}

// ── Rendering ──
export interface HitArea {
  x: number;
  y: number;
  w: number;
  h: number;
  action: string;
  data?: number;
  strData?: string;
}

// ── World ──
export interface BuildingSite {
  lessonId: number;
  gridX: number;      // Block column position
  stage: BuildingStage;
}

export interface WorldState {
  scrollX: number;
  targetScrollX: number;
  sites: BuildingSite[];
  clouds: CloudDef[];
  timeOfDay: number; // 0-1 for sky color
}

export interface CloudDef {
  x: number;
  y: number;
  speed: number;
  width: number;
}
