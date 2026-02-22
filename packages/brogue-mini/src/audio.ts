let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function play(
  freq: number,
  type: OscillatorType,
  duration: number,
  volume = 0.15,
  slide = 0
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

function noise(duration: number, volume = 0.08) {
  const ac = getCtx();
  const bufSize = ac.sampleRate * duration;
  const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  src.connect(gain);
  gain.connect(ac.destination);
  src.start(ac.currentTime);
  src.onended = () => { src.disconnect(); gain.disconnect(); };
}

export const sfx = {
  playerAttack() {
    play(220, "sawtooth", 0.1, 0.12);
    play(330, "square", 0.08, 0.08);
  },

  monsterHit() {
    play(180, "sawtooth", 0.12, 0.1, -60);
    noise(0.06, 0.06);
  },

  monsterDie() {
    play(300, "square", 0.08, 0.1);
    play(200, "sawtooth", 0.15, 0.1, -150);
    noise(0.12, 0.08);
  },

  playerHurt() {
    play(400, "square", 0.06, 0.12);
    play(200, "square", 0.12, 0.1);
    noise(0.08, 0.06);
  },

  pickupPotion() {
    play(523, "sine", 0.08, 0.1);
    setTimeout(() => play(659, "sine", 0.08, 0.1), 60);
    setTimeout(() => play(784, "sine", 0.12, 0.1), 120);
  },

  pickupWeapon() {
    play(440, "triangle", 0.06, 0.1);
    setTimeout(() => play(554, "triangle", 0.06, 0.1), 50);
    setTimeout(() => play(659, "triangle", 0.1, 0.12), 100);
  },

  descend() {
    play(300, "sine", 0.2, 0.1, -200);
    setTimeout(() => play(150, "sine", 0.3, 0.08, -80), 150);
  },

  petHeal() {
    play(600, "sine", 0.1, 0.08);
    setTimeout(() => play(800, "sine", 0.1, 0.08), 80);
    setTimeout(() => play(1000, "sine", 0.15, 0.06), 160);
  },

  petHurt() {
    play(350, "triangle", 0.08, 0.1);
    play(250, "triangle", 0.12, 0.08);
  },

  petDied() {
    play(400, "triangle", 0.15, 0.1, -200);
    setTimeout(() => play(200, "sine", 0.3, 0.1, -100), 150);
  },

  playerDied() {
    play(300, "sawtooth", 0.15, 0.12);
    setTimeout(() => play(250, "sawtooth", 0.15, 0.1), 120);
    setTimeout(() => play(200, "sawtooth", 0.2, 0.1), 240);
    setTimeout(() => play(150, "sawtooth", 0.4, 0.08, -50), 360);
  },

  win() {
    play(523, "square", 0.12, 0.08);
    setTimeout(() => play(659, "square", 0.12, 0.08), 100);
    setTimeout(() => play(784, "square", 0.12, 0.08), 200);
    setTimeout(() => play(1047, "square", 0.3, 0.1), 300);
  },

  drop() {
    play(500, "triangle", 0.06, 0.06);
    play(350, "triangle", 0.1, 0.06);
  },
};
