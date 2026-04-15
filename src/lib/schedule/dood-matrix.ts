/**
 * dood-matrix.ts — Shared Day Out of Days matrix builder.
 *
 * Extracted from DOODsPage.tsx so it can be reused in SeriesRosterPage
 * without duplicating the logic.
 */

import type { ScheduleDraft } from '@/types/schedule';

export type DOODStatus = 'W' | 'SW' | 'WF' | 'SWF' | 'H' | '';

export interface DoodMatrix {
  characters: string[];
  /** Map from character name (uppercase) to per-day status array (1-indexed by dayNumber) */
  matrix: Map<string, DOODStatus[]>;
  totalDays: number;
}

/**
 * Build the full DOODs matrix from a schedule draft.
 * Character names are normalised to UPPERCASE + trimmed.
 */
export function buildDoodMatrix(schedule: ScheduleDraft): DoodMatrix {
  const totalDays = schedule.shootDays.length;

  // Collect all characters and which days they appear in
  const charDays = new Map<string, Set<number>>();
  for (const day of schedule.shootDays) {
    for (const strip of day.strips) {
      for (const char of strip.characters) {
        const key = char.toUpperCase().trim();
        if (!charDays.has(key)) charDays.set(key, new Set());
        charDays.get(key)!.add(day.dayNumber);
      }
    }
  }

  // Sort characters by number of working days (descending)
  const characters = [...charDays.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .map(([name]) => name);

  // Build status matrix
  const matrix = new Map<string, DOODStatus[]>();
  for (const char of characters) {
    const workingDays = charDays.get(char)!;
    const dayNumbers = [...workingDays].sort((a, b) => a - b);
    const firstDay = dayNumbers[0]!;
    const lastDay = dayNumbers[dayNumbers.length - 1]!;

    const statuses: DOODStatus[] = [];
    for (let d = 1; d <= totalDays; d++) {
      if (!workingDays.has(d)) {
        // Between first and last working day → hold
        if (d > firstDay && d < lastDay) {
          statuses.push('H');
        } else {
          statuses.push('');
        }
      } else if (firstDay === lastDay && d === firstDay) {
        statuses.push('SWF'); // Single day
      } else if (d === firstDay) {
        statuses.push('SW');
      } else if (d === lastDay) {
        statuses.push('WF');
      } else {
        statuses.push('W');
      }
    }
    matrix.set(char, statuses);
  }

  return { characters, matrix, totalDays };
}

/**
 * Count work days (W/SW/WF/SWF) for a specific character in a DOODs matrix.
 */
export function countWorkDays(matrix: DoodMatrix, charName: string): number {
  const statuses = matrix.matrix.get(charName.toUpperCase().trim()) ?? [];
  return statuses.filter((s) => s === 'W' || s === 'SW' || s === 'WF' || s === 'SWF').length;
}

/**
 * Count hold days (H) for a specific character in a DOODs matrix.
 */
export function countHoldDays(matrix: DoodMatrix, charName: string): number {
  const statuses = matrix.matrix.get(charName.toUpperCase().trim()) ?? [];
  return statuses.filter((s) => s === 'H').length;
}
