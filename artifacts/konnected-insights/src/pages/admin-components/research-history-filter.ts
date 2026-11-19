import type { RunResultEntry } from '@/lib/admin-future-work-api';

export function matchesResearchFilter(result: RunResultEntry, functionId: string, category: string) {
  if (!functionId && category === 'all') return true;
  if (typeof result === 'string') return false;
  const combination = result.combination;
  return (!functionId || combination.functionId === functionId)
    && (category === 'all' || (combination.kind === 'content' ? String(combination.horizon) : combination.kind) === category);
}