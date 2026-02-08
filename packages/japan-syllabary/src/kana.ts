export interface Kana {
  id: string;
  glyph: string;
  romaji: string;
  row: string;
}

export interface KanaGroup {
  row: string;
  label: string;
  kana: Kana[];
}

export type GameMode = 'listen_pick' | 'see_pick' | 'mixed';

export interface LevelDef {
  id: number;
  label: string;
  newKana: string[];
  reviewKana: string[];
  mode: GameMode;
  targetScore: number;
  isReview: boolean;
  groupIndex: number;
}

function k(glyph: string, romaji: string, row: string): Kana {
  return { id: romaji, glyph, romaji, row };
}

export const KANA_GROUPS: KanaGroup[] = [
  {
    row: 'a', label: 'あ行',
    kana: [k('あ','a','a'), k('い','i','a'), k('う','u','a'), k('え','e','a'), k('お','o','a')],
  },
  {
    row: 'ka', label: 'か行',
    kana: [k('か','ka','ka'), k('き','ki','ka'), k('く','ku','ka'), k('け','ke','ka'), k('こ','ko','ka')],
  },
  {
    row: 'sa', label: 'さ行',
    kana: [k('さ','sa','sa'), k('し','shi','sa'), k('す','su','sa'), k('せ','se','sa'), k('そ','so','sa')],
  },
  {
    row: 'ta', label: 'た行',
    kana: [k('た','ta','ta'), k('ち','chi','ta'), k('つ','tsu','ta'), k('て','te','ta'), k('と','to','ta')],
  },
  {
    row: 'na', label: 'な行',
    kana: [k('な','na','na'), k('に','ni','na'), k('ぬ','nu','na'), k('ね','ne','na'), k('の','no','na')],
  },
  {
    row: 'ha', label: 'は行',
    kana: [k('は','ha','ha'), k('ひ','hi','ha'), k('ふ','fu','ha'), k('へ','he','ha'), k('ほ','ho','ha')],
  },
  {
    row: 'ma', label: 'ま行',
    kana: [k('ま','ma','ma'), k('み','mi','ma'), k('む','mu','ma'), k('め','me','ma'), k('も','mo','ma')],
  },
  {
    row: 'ya', label: 'や行',
    kana: [k('や','ya','ya'), k('ゆ','yu','ya'), k('よ','yo','ya')],
  },
  {
    row: 'ra', label: 'ら行',
    kana: [k('ら','ra','ra'), k('り','ri','ra'), k('る','ru','ra'), k('れ','re','ra'), k('ろ','ro','ra')],
  },
  {
    row: 'wa', label: 'わ行',
    kana: [k('わ','wa','wa'), k('を','wo','wa'), k('ん','n','wa')],
  },
];

export const ALL_KANA: Kana[] = KANA_GROUPS.flatMap(g => g.kana);

export const KANA_BY_ID: Map<string, Kana> = new Map(ALL_KANA.map(k => [k.id, k]));

export function generateLevels(): LevelDef[] {
  const levels: LevelDef[] = [];
  let id = 0;

  for (let gi = 0; gi < KANA_GROUPS.length; gi++) {
    const group = KANA_GROUPS[gi];
    const kanaIds = group.kana.map(k => k.id);

    // Split group into chunks of 3 (or remainder)
    const chunks: string[][] = [];
    for (let i = 0; i < kanaIds.length; i += 3) {
      chunks.push(kanaIds.slice(i, i + 3));
    }

    // Teaching levels for this group
    for (let ci = 0; ci < chunks.length; ci++) {
      const newKana = chunks[ci];
      // Review includes previous chunks from this group
      const reviewKana = chunks.slice(0, ci).flat();
      const mode: GameMode = ci === 0 ? 'listen_pick' : 'mixed';
      levels.push({
        id: id++,
        label: `${group.label} (${ci + 1})`,
        newKana,
        reviewKana,
        mode,
        targetScore: newKana.length * 2,
        isReview: false,
        groupIndex: gi,
      });
    }

    // Review challenge level after each group
    const allPreviousKana: string[] = [];
    for (let pi = 0; pi <= gi; pi++) {
      allPreviousKana.push(...KANA_GROUPS[pi].kana.map(k => k.id));
    }
    levels.push({
      id: id++,
      label: `${group.label} 复习`,
      newKana: [],
      reviewKana: allPreviousKana,
      mode: 'mixed',
      targetScore: Math.min(allPreviousKana.length, 10),
      isReview: true,
      groupIndex: gi,
    });
  }

  return levels;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
