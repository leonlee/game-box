let ctx: AudioContext | null = null;

export function ensureAudioContext(): void {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
}

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function play(
  freq: number,
  type: OscillatorType,
  duration: number,
  volume = 0.12,
  slide = 0,
) {
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, ac.currentTime + duration);
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + duration);
  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
}

export const sfx = {
  correct() {
    play(523, 'sine', 0.1, 0.1);
    setTimeout(() => play(659, 'sine', 0.1, 0.1), 80);
    setTimeout(() => play(784, 'sine', 0.15, 0.12), 160);
  },

  incorrect() {
    play(300, 'triangle', 0.15, 0.08);
    setTimeout(() => play(250, 'triangle', 0.2, 0.08), 120);
  },

  buttonTap() {
    play(880, 'sine', 0.05, 0.06);
  },

  starEarned() {
    play(784, 'sine', 0.08, 0.08);
    setTimeout(() => play(988, 'sine', 0.08, 0.08), 70);
    setTimeout(() => play(1175, 'sine', 0.12, 0.1), 140);
  },

  levelComplete() {
    play(523, 'sine', 0.12, 0.08);
    setTimeout(() => play(659, 'sine', 0.12, 0.08), 120);
    setTimeout(() => play(784, 'sine', 0.12, 0.08), 240);
    setTimeout(() => play(1047, 'sine', 0.25, 0.1), 360);
  },

  rowComplete() {
    play(523, 'triangle', 0.1, 0.08);
    setTimeout(() => play(659, 'triangle', 0.1, 0.08), 100);
    setTimeout(() => play(784, 'triangle', 0.1, 0.08), 200);
    setTimeout(() => play(1047, 'triangle', 0.15, 0.1), 300);
    setTimeout(() => play(1319, 'sine', 0.3, 0.1), 400);
  },
};

let jaVoice: SpeechSynthesisVoice | null = null;

function findJapaneseVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  return voices.find(v => v.lang.startsWith('ja')) ?? null;
}

function initVoice() {
  jaVoice = findJapaneseVoice();
  if (!jaVoice && speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => {
      jaVoice = findJapaneseVoice();
    };
  }
}

initVoice();

export function speak(text: string): void {
  ensureAudioContext();
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'ja-JP';
  utter.rate = 0.8;
  utter.pitch = 1.2;
  if (!jaVoice) jaVoice = findJapaneseVoice();
  if (jaVoice) utter.voice = jaVoice;
  speechSynthesis.speak(utter);
}
