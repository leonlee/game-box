// Grammar Check module logic
// 5 questions, 2 min timer, pick correct sentence / find error

import { GrammarCheckQuestion, LessonDef } from '../types';
import { pickRandom } from '../util';

export function generateGrammarCheckQuestions(lesson: LessonDef, count = 5): GrammarCheckQuestion[] {
  return pickRandom(lesson.grammarCheckQuestions, count);
}

export function getGrammarCheckTimeLimitSec(): number {
  return 120;
}
