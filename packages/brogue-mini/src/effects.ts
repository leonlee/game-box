export type StatusType = "poison" | "bleed" | "slow" | "blind" | "burn" | "stun" | "fear" | "speed" | "invisible" | "protection";

export interface StatusEffect {
  type: StatusType;
  duration: number; // remaining turns
  value: number;    // damage per turn or intensity
}

export class StatusManager {
  effects: StatusEffect[] = [];

  add(type: StatusType, duration: number, value: number) {
    // Refresh if already present (take stronger)
    const existing = this.effects.find((e) => e.type === type);
    if (existing) {
      existing.duration = Math.max(existing.duration, duration);
      existing.value = Math.max(existing.value, value);
    } else {
      this.effects.push({ type, duration, value });
    }
  }

  has(type: StatusType): boolean {
    return this.effects.some((e) => e.type === type);
  }

  /** Process all effects at turn start. Returns total HP damage taken. */
  tick(): number {
    let damage = 0;
    for (const e of this.effects) {
      if (e.type === "poison" || e.type === "bleed" || e.type === "burn") {
        damage += e.value;
      }
      e.duration--;
    }
    this.effects = this.effects.filter((e) => e.duration > 0);
    return damage;
  }

  clear() {
    this.effects = [];
  }

  /** Get display string for status icons */
  getIcons(): { icon: string; color: string }[] {
    const icons: { icon: string; color: string }[] = [];
    for (const e of this.effects) {
      switch (e.type) {
        case "poison": icons.push({ icon: "PSN", color: "#2ecc71" }); break;
        case "bleed": icons.push({ icon: "BLD", color: "#e74c3c" }); break;
        case "slow": icons.push({ icon: "SLW", color: "#3498db" }); break;
        case "blind": icons.push({ icon: "BLN", color: "#95a5a6" }); break;
        case "burn": icons.push({ icon: "BRN", color: "#ff6600" }); break;
        case "stun": icons.push({ icon: "STN", color: "#ffff00" }); break;
        case "fear": icons.push({ icon: "FER", color: "#9b59b6" }); break;
        case "speed": icons.push({ icon: "SPD", color: "#00ccff" }); break;
        case "invisible": icons.push({ icon: "INV", color: "#aaaaff" }); break;
        case "protection": icons.push({ icon: "PRT", color: "#ffdd44" }); break;
      }
    }
    return icons;
  }
}
