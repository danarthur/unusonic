/**
 * Normalized Levenshtein distance between two strings.
 * Returns 0 (identical) to 1 (completely different).
 */
export function normalizedEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;

  const la = a.length;
  const lb = b.length;
  const dp: number[] = Array.from({ length: lb + 1 }, (_, i) => i);

  for (let i = 1; i <= la; i++) {
    let prev = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const val = Math.min(dp[j] + 1, prev + 1, dp[j - 1] + cost);
      dp[j - 1] = prev;
      prev = val;
    }
    dp[lb] = prev;
  }

  return dp[lb] / maxLen;
}

/**
 * Classify an edit based on normalized distance.
 */
export function classifyEdit(
  distance: number,
): 'approved_unchanged' | 'light_edit' | 'heavy_edit' {
  if (distance === 0) return 'approved_unchanged';
  if (distance < 0.2) return 'light_edit';
  return 'heavy_edit';
}
