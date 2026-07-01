// Immutable list helpers for the form editors, which otherwise re-inline
// map/filter-by-index on every add/update/remove. Pure and behavior-identical
// to the inlined expressions they replace.

export function replaceAt<T>(list: T[], index: number, next: T): T[] {
  return list.map((item, itemIndex) => (itemIndex === index ? next : item));
}

export function patchAt<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

export function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, itemIndex) => itemIndex !== index);
}
