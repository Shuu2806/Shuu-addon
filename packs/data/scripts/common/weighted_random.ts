// ── Tirage pondéré générique ────────────────────────────────────────────────

export interface WeightedEntry<T> {
  weight: number;
  value: T;
}

/** Tire un élément pondéré. Poids <= 0 ignorés. Retourne null si aucun poids valide. */
export function pickWeighted<T>(entries: WeightedEntry<T>[]): T | null {
  const total = entries.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
  if (total <= 0) return null;

  let roll = Math.random() * total;
  for (const e of entries) {
    const w = Math.max(0, e.weight);
    if (roll < w) return e.value;
    roll -= w;
  }
  return entries.length > 0 ? entries[entries.length - 1].value : null;
}
