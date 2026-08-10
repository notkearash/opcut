export interface FuzzyMatch<T> {
  item: T;
  score: number;
  indices: number[];
}

const WORD_BOUNDARY = /[\s\-_.]/;

const MATCHED_CHAR_POINTS = 1;
const FIRST_CHAR_OF_TARGET_BONUS = 8;
const FIRST_CHAR_OF_WORD_BONUS = 6;
const ADJACENT_TO_PREVIOUS_MATCH_BONUS = 5;
const PREFIX_MATCH_BONUS = 12;
const EXACT_MATCH_BONUS = 20;
const PENALTY_PER_SKIPPED_CHAR = 2;
const PENALTY_PER_EXTRA_TARGET_CHAR = 0.2;

function scoreOne(query: string, target: string): { score: number; indices: number[] } | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return { score: 0, indices: [] };
  if (q.length > t.length) return null;

  const indices: number[] = [];
  let score = 0;
  let qi = 0;
  let previousMatch = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;

    indices.push(ti);
    let points = MATCHED_CHAR_POINTS;
    if (ti === 0) points += FIRST_CHAR_OF_TARGET_BONUS;
    else if (WORD_BOUNDARY.test(t[ti - 1])) points += FIRST_CHAR_OF_WORD_BONUS;
    if (ti === previousMatch + 1) points += ADJACENT_TO_PREVIOUS_MATCH_BONUS;
    score += points;
    previousMatch = ti;
    qi++;
  }

  const everyQueryCharMatched = qi === q.length;
  if (!everyQueryCharMatched) return null;

  if (t.startsWith(q)) score += PREFIX_MATCH_BONUS;
  if (t === q) score += EXACT_MATCH_BONUS;

  const matchedSpan = indices[indices.length - 1] - indices[0] + 1;
  const skippedChars = matchedSpan - q.length;
  const extraTargetChars = t.length - q.length;
  score -= skippedChars * PENALTY_PER_SKIPPED_CHAR;
  score -= extraTargetChars * PENALTY_PER_EXTRA_TARGET_CHAR;

  return { score, indices };
}

export function fuzzySearch<T>(
  query: string,
  items: T[],
  key: (item: T) => string,
): FuzzyMatch<T>[] {
  const matches: FuzzyMatch<T>[] = [];
  for (const item of items) {
    const scored = scoreOne(query, key(item));
    if (scored) matches.push({ item, score: scored.score, indices: scored.indices });
  }
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const nameA = key(a.item);
    const nameB = key(b.item);
    if (nameA.length !== nameB.length) return nameA.length - nameB.length;
    return nameA.localeCompare(nameB);
  });
  return matches;
}
