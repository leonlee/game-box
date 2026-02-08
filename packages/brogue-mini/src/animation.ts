export interface Animation {
  type: "move" | "flash";
  x: number;
  y: number;
  fromX?: number;
  fromY?: number;
  color?: string;
  startTime: number;
  duration: number;
}

export class AnimationQueue {
  animations: Animation[] = [];

  addMove(fromX: number, fromY: number, toX: number, toY: number) {
    this.animations.push({
      type: "move",
      x: toX, y: toY,
      fromX, fromY,
      startTime: performance.now(),
      duration: 80,
    });
  }

  addFlash(x: number, y: number, color = "#ff0000") {
    this.animations.push({
      type: "flash",
      x, y,
      color,
      startTime: performance.now(),
      duration: 100,
    });
  }

  /** Get interpolated position for an entity at (x, y). Returns [renderX, renderY] */
  getPosition(x: number, y: number): [number, number] {
    const now = performance.now();
    for (const anim of this.animations) {
      if (anim.type === "move" && anim.x === x && anim.y === y) {
        const elapsed = now - anim.startTime;
        if (elapsed < anim.duration) {
          const t = elapsed / anim.duration;
          return [
            anim.fromX! + (anim.x - anim.fromX!) * t,
            anim.fromY! + (anim.y - anim.fromY!) * t,
          ];
        }
      }
    }
    return [x, y];
  }

  /** Get flash info for a cell. Returns alpha 0-1 or 0 if no flash. */
  getFlash(x: number, y: number): { alpha: number; color: string } | null {
    const now = performance.now();
    for (const anim of this.animations) {
      if (anim.type === "flash" && anim.x === x && anim.y === y) {
        const elapsed = now - anim.startTime;
        if (elapsed < anim.duration) {
          return { alpha: 1 - elapsed / anim.duration, color: anim.color! };
        }
      }
    }
    return null;
  }

  /** Clean up expired animations */
  cleanup() {
    const now = performance.now();
    this.animations = this.animations.filter(a => now - a.startTime < a.duration);
  }

  hasActive(): boolean {
    const now = performance.now();
    return this.animations.some(a => now - a.startTime < a.duration);
  }
}
