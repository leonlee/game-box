// Vocab Sprint module logic
// 10 questions, 2 min timer, listen/see → pick meaning from 4 choices
// State machine is handled by Game class; this file provides helper utilities

import { VocabQuestion, LessonDef } from '../types';
import { shuffle, pickRandom } from '../util';

export function generateVocabQuestions(lesson: LessonDef, count = 10): VocabQuestion[] {
  return pickRandom(lesson.vocabQuestions, count);
}

export function getVocabTimeLimitSec(): number {
  return 120;
}
