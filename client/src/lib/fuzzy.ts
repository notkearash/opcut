// Dependency-free fuzzy subsequence scorer. Tuned for short app names: it rewards
// matches at word starts, prefixes, and consecutive runs, and penalises gaps.

export interface FuzzyMatch<T> {
  item: T;
  score: number;
  indices: number[];
}

const WORD_BOUNDARY = /[\s\-_.]/;

function scoreOne(query: string, target: string): { score: number; indices: number[] } | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return { score: 0, indices: [] };
  if (q.length > t.length) return null;

  const indices: number[] = [];
  let score = 0;
  let qi = 0;
  let lastMatch = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;

    indices.push(ti);
    let bonus = 1;
    if (ti === 0) bonus += 8; // start of string
    else if (WORD_BOUNDARY.test(t[ti - 1])) bonus += 6; // start of a word
    if (ti === lastMatch + 1) bonus += 5; // consecutive run
    score += bonus;
    lastMatch = ti;
    qi++;
  }

  if (qi < q.length) return null; // not all query chars consumed → no match

  // Reward tight, early, complete matches.
  if (t.startsWith(q)) score += 12;
  if (t === q) score += 20;
  const span = indices[indices.length - 1] - indices[0] + 1;
  score -= (span - q.length) * 2; // gap penalty
  score -= (t.length - q.length) * 0.2; // prefer shorter targets

  return { score, indices };
}

export function fuzzySearch<T>(
  query: string,
  items: T[],
  key: (item: T) => string,
): FuzzyMatch<T>[] {
  const out: FuzzyMatch<T>[] = [];
  for (const item of items) {
    const res = scoreOne(query, key(item));
    if (res) out.push({ item, score: res.score, indices: res.indices });
  }
  // Stable sort by descending score, tie-broken by name length then alphabetically.
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ka = key(a.item);
    const kb = key(b.item);
    if (ka.length !== kb.length) return ka.length - kb.length;
    return ka.localeCompare(kb);
  });
  return out;
}
