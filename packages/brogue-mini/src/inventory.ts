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
    if (this.isFull()) return false;
    this.equipped[slot] = null;
    this.items.push(item);
    return true;
  }

  getWeaponBonus(): number {
    return this.equipped.weapon?.value ?? 0;
  }

  getArmorBonus(): number {
    return this.equipped.armor?.value ?? 0;
  }

  /** Degrade weapon durability on player attack. Returns broken item name or null. */
  degradeWeapon(): string | null {
    const eq = this.equipped.weapon;
    if (eq && eq.durability !== undefined) {
      eq.durability--;
      if (eq.durability <= 0) {
        const n = eq.nameId;
        this.equipped.weapon = null;
        return n;
      }
    }
    return null;
  }

  /** Degrade armor durability when player is hit. Returns broken item name or null. */
  degradeArmor(): string | null {
    const eq = this.equipped.armor;
    if (eq && eq.durability !== undefined) {
      eq.durability--;
      if (eq.durability <= 0) {
        const n = eq.nameId;
        this.equipped.armor = null;
        return n;
      }
    }
    return null;
  }

  clear() {
    this.items = [];
    this.equipped = { weapon: null, armor: null };
  }
}
