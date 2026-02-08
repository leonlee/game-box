// Sentence Assembly module logic
// 6-8 questions, 3 min timer, click word blocks in order
// Validation: compare assembled array to correctOrder

import { AssemblyQuestion, LessonDef } from '../types';
import { pickRandom } from '../util';

export function generateAssemblyQuestions(lesson: LessonDef, count = 7): AssemblyQuestion[] {
  return pickRandom(lesson.assemblyQuestions, count);
}

export function validateAssembly(assembled: string[], correctOrder: string[]): boolean {
  if (assembled.length !== correctOrder.length) return false;
  return assembled.every((block, i) => block === correctOrder[i]);
}

export function getAssemblyTimeLimitSec(): number {
  return 180;
}
