// Dialogue module logic
// 3-5 questions, 2 min timer, fill dialogue blank

import { DialogueQuestion, LessonDef } from '../types';
import { pickRandom } from '../util';

export function generateDialogueQuestions(lesson: LessonDef, count = 4): DialogueQuestion[] {
  return pickRandom(lesson.dialogueQuestions, count);
}

export function getDialogueTimeLimitSec(): number {
  return 120;
}
