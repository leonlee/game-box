export function easeOutBounce(t: number): number {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
  if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
  t -= 2.625 / 2.75;
  return 7.5625 * t * t + 0.984375;
}

export function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface Tween {
  startVal: number;
  endVal: number;
  duration: number;
  elapsed: number;
  easing: (t: number) => number;
  current: number;
  onUpdate?: (val: number) => void;
  onComplete?: () => void;
  done: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  shape: 'star' | 'circle' | 'heart';
}

interface ShakeEffect {
  x: number;
  y: number;
  duration: number;
  elapsed: number;
  intensity: number;
  offsetX: number;
  offsetY: number;
}

export class AnimationManager {
  private tweens: Tween[] = [];
  private particles: Particle[] = [];
  private shakes: Map<string, ShakeEffect> = new Map();

  addTween(
    startVal: number,
    endVal: number,
    duration: number,
    easing: (t: number) => number = easeOutCubic,
    onUpdate?: (val: number) => void,
    onComplete?: () => void,
  ): Tween {
    const tw: Tween = { startVal, endVal, duration, elapsed: 0, easing, current: startVal, onUpdate, onComplete, done: false };
    this.tweens.push(tw);
    return tw;
  }

  addStarBurst(x: number, y: number, count = 12): void {
    const colors = ['#FFD700', '#FFA500', '#FF6347', '#FFE066', '#FFFACD'];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
      const speed = 80 + Math.random() * 120;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.6 + Math.random() * 0.4,
        maxLife: 0.6 + Math.random() * 0.4,
        size: 6 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: 'star',
      });
    }
  }

  addHeartBurst(x: number, y: number, count = 8): void {
    const colors = ['#FF69B4', '#FF1493', '#FF6B9D', '#FFB6C1'];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 60 + Math.random() * 80;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 0.8 + Math.random() * 0.4,
        maxLife: 0.8 + Math.random() * 0.4,
        size: 10 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: 'heart',
      });
    }
  }

  addShake(key: string, x: number, y: number, intensity = 6, duration = 0.3): ShakeEffect {
    const shake: ShakeEffect = { x, y, duration, elapsed: 0, intensity, offsetX: 0, offsetY: 0 };
    this.shakes.set(key, shake);
    return shake;
  }

  getShake(key: string): ShakeEffect | undefined {
    return this.shakes.get(key);
  }

  update(dt: number): void {
    // Update tweens
    for (const tw of this.tweens) {
      if (tw.done) continue;
      tw.elapsed += dt;
      const progress = Math.min(tw.elapsed / tw.duration, 1);
      tw.current = tw.startVal + (tw.endVal - tw.startVal) * tw.easing(progress);
      tw.onUpdate?.(tw.current);
      if (progress >= 1) {
        tw.done = true;
        tw.onComplete?.();
      }
    }
    this.tweens = this.tweens.filter(tw => !tw.done);

    // Update particles
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt; // gravity
      p.life -= dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    // Update shakes
    for (const [key, shake] of this.shakes) {
      shake.elapsed += dt;
      if (shake.elapsed >= shake.duration) {
        shake.offsetX = 0;
        shake.offsetY = 0;
        this.shakes.delete(key);
      } else {
        const t = 1 - shake.elapsed / shake.duration;
        shake.offsetX = (Math.random() - 0.5) * shake.intensity * 2 * t;
        shake.offsetY = (Math.random() - 0.5) * shake.intensity * 2 * t;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      if (p.shape === 'star') {
        drawStar(ctx, p.x, p.y, p.size * alpha);
      } else if (p.shape === 'heart') {
        drawHeart(ctx, p.x, p.y, p.size * alpha);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  get active(): boolean {
    return this.tweens.length > 0 || this.particles.length > 0 || this.shakes.size > 0;
  }

  clear(): void {
    this.tweens = [];
    this.particles = [];
    this.shakes.clear();
  }
}

export function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const outerX = x + Math.cos(angle) * r;
    const outerY = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(outerX, outerY);
    else ctx.lineTo(outerX, outerY);
    const innerAngle = angle + Math.PI / 5;
    ctx.lineTo(x + Math.cos(innerAngle) * r * 0.4, y + Math.sin(innerAngle) * r * 0.4);
  }
  ctx.closePath();
  ctx.fill();
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath();
  const s = size * 0.5;
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x - s, y - s * 0.5, x - s * 0.5, y - s, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.5, y - s, x + s, y - s * 0.5, x, y + s * 0.3);
  ctx.closePath();
  ctx.fill();
}
