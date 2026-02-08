import { LessonDef, PlayerProgress, ModuleType } from './types';
import { lesson15 } from './content/lesson15';
import { lesson16 } from './content/lesson16';
import { lesson17 } from './content/lesson17';
import { lesson18 } from './content/lesson18';
import { lesson19 } from './content/lesson19';
import { lesson20 } from './content/lesson20';
import { lesson21 } from './content/lesson21';
import { lesson22 } from './content/lesson22';
import { lesson23 } from './content/lesson23';
import { lesson24 } from './content/lesson24';
import { lesson25 } from './content/lesson25';

export const LESSONS: LessonDef[] = [
  lesson15, lesson16, lesson17, lesson18, lesson19,
  lesson20, lesson21, lesson22, lesson23, lesson24, lesson25,
];

export function getLessonById(id: number): LessonDef | undefined {
  return LESSONS.find(l => l.id === id);
}

export function isLessonUnlocked(lessonId: number, progress: PlayerProgress): boolean {
  if (lessonId === 15) return true; // First lesson always unlocked
  const prevId = lessonId - 1;
  const completed = progress.completedModules[prevId] ?? [];
  return completed.length >= 3; // Need 3/4 modules to unlock next
}

export function getModulesForLesson(lessonId: number): ModuleType[] {
  const modules: ModuleType[] = ['vocab_sprint', 'sentence_assembly', 'grammar_check', 'dialogue'];
  // Boss appears in review stages (after L17, L20, L23) and test stages (after L19, L24)
  // and lesson 25 is the final boss
  if ([17, 20, 23, 19, 24, 25].includes(lessonId)) {
    modules.push('boss');
  }
  return modules;
}

export function isReviewLesson(lessonId: number): boolean {
  return [17, 20, 23].includes(lessonId);
}

export function isTestLesson(lessonId: number): boolean {
  return [19, 24].includes(lessonId);
}

export function isFinalLesson(lessonId: number): boolean {
  return lessonId === 25;
}

export function getLessonProgress(lessonId: number, progress: PlayerProgress): {
  completed: ModuleType[];
  total: number;
  percent: number;
} {
  const completed = progress.completedModules[lessonId] ?? [];
  const total = 4; // 4 standard modules
  return { completed, total, percent: Math.min(1, completed.length / total) };
}
