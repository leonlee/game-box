// Boss module logic
// 6-8 questions, 4-5 min timer, mixed types, boss health bar
// 70% to pass

import { BossQuestion, QuestionDef, LessonDef } from '../types';
import { shuffle, pickRandom } from '../util';

export function generateBossQuestions(lesson: LessonDef, count = 7): QuestionDef[] {
  if (lesson.bossQuestions && lesson.bossQuestions.length > 0) {
    return pickRandom(lesson.bossQuestions, count);
  }

  // Generate mixed from all question types
  const mixed: QuestionDef[] = [
    ...pickRandom(lesson.vocabQuestions, 2),
    ...pickRandom(lesson.assemblyQuestions, 2),
    ...pickRandom(lesson.grammarCheckQuestions, 1),
    ...pickRandom(lesson.dialogueQuestions, 1),
  ];
  return shuffle(mixed);
}

export function getBossTimeLimitSec(): number {
  return 270;
}

export function didPassBoss(score: number, total: number): boolean {
  return total > 0 && (score / total) >= 0.7;
}
