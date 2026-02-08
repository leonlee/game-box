import { Item } from "./game";

export const MAX_INVENTORY = 8;

export interface EquipSlots {
  weapon: Item | null;
  armor: Item | null;
}

export class Inventory {
  items: Item[] = [];
  equipped: EquipSlots = { weapon: null, armor: null };

  isFull(): boolean {
    return this.items.length >= MAX_INVENTORY;
  }

  add(item: Item): boolean {
    if (this.isFull()) return false;
    this.items.push(item);
    return true;
  }

  remove(index: number): Item | null {
    if (index < 0 || index >= this.items.length) return null;
    return this.items.splice(index, 1)[0];
  }

  equip(index: number): Item | null {
    const item = this.items[index];
    if (!item) return null;
    if (item.type !== "equipment") return null;

    const slot = item.equipSlot!;
    const prev = this.equipped[slot];
    if (prev?.cursed) return null; // can't replace cursed equipment

    // Unequip previous into same slot in inventory
    this.items.splice(index, 1);
    this.equipped[slot] = item;

    if (prev) {
      this.items.push(prev);
    }

    return prev;
  }

  unequip(slot: keyof EquipSlots): boolean {
    const item = this.equipped[slot];
    if (!item) return false;
    if (item.cursed) return false; // can't unequip cursed items
    if (this.isFull()) return false;
    this.equipped[slot] = null;
    this.items.push(item);
    return true;
  }

  getWeaponBonus(): number {
    const wep = this.equipped.weapon;
    if (!wep) return 0;
    return wep.cursed ? Math.max(0, wep.value - 1) : wep.value;
  }

  getArmorBonus(): number {
    const arm = this.equipped.armor;
    if (!arm) return 0;
    return arm.cursed ? Math.max(0, arm.value - 1) : arm.value;
  }

  /** Degrade weapon durability on player attack. Returns {broken, warning} info. */
  degradeWeapon(): { broken: string | null; warning: boolean } {
    const eq = this.equipped.weapon;
    if (eq && eq.durability !== undefined) {
      eq.durability--;
      if (eq.durability <= 0) {
        const n = eq.nameId;
        this.equipped.weapon = null;
        return { broken: n, warning: false };
      }
      if (eq.maxDurability && eq.durability <= Math.ceil(eq.maxDurability * 0.25)) {
        return { broken: null, warning: true };
      }
    }
    return { broken: null, warning: false };
  }

  /** Degrade armor durability when player is hit. Returns {broken, warning} info. */
  degradeArmor(): { broken: string | null; warning: boolean } {
    const eq = this.equipped.armor;
    if (eq && eq.durability !== undefined) {
      eq.durability--;
      if (eq.durability <= 0) {
        const n = eq.nameId;
        this.equipped.armor = null;
        return { broken: n, warning: false };
      }
      if (eq.maxDurability && eq.durability <= Math.ceil(eq.maxDurability * 0.25)) {
        return { broken: null, warning: true };
      }
    }
    return { broken: null, warning: false };
  }

  clear() {
    this.items = [];
    this.equipped = { weapon: null, armor: null };
  }
}
