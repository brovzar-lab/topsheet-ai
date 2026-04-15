import type { IntExt, TimeOfDay } from './scene';

/** Industry-standard strip colors based on INT/EXT × DAY/NIGHT */
export type StripColor = 'white' | 'yellow' | 'blue' | 'green' | 'banner';

/** A single strip on the stripboard — represents one scene */
export interface StripboardStrip {
    id: string;
    sceneNumber: string;
    slugline: string;
    location: string;
    subLocation?: string;
    intExt: IntExt;
    timeOfDay: TimeOfDay;
    /** Page count in 1/8ths (integer) */
    pageCount: number;
    /** Characters in this scene */
    characters: string[];
    /** Industry-standard strip color */
    stripColor: StripColor;
    /** Free-text notes from the producer */
    notes?: string;
}

/** A banner strip — day off, company move, travel, etc. */
export interface BannerStrip {
    id: string;
    label: string;
    type: 'day_off' | 'travel' | 'company_move' | 'custom';
}

/** A single shoot day grouping strips */
export interface ShootDay {
    id: string;
    dayNumber: number;
    /** Optional calendar date */
    date?: string;
    /** Strips assigned to this day */
    strips: StripboardStrip[];
    /** Total pages in 1/8ths for this day */
    totalPages: number;
    /** Primary location for this day */
    location: string;
}

/** Top-level schedule container */
export interface ScheduleDraft {
    id: string;
    projectId: string;
    shootDays: ShootDay[];
    /** Banner strips inserted between days */
    bannerStrips: BannerStrip[];
    /** Target pages per day in 1/8ths (default: 32 = 4 pages) */
    targetPagesPerDay: number;
    /** Shoot days per week (default: 5 — Mon-Fri) */
    shootDaysPerWeek: number;
    /** Target work hours per day (default: 12) */
    hoursPerDay: number;
    createdAt: string;
    notes?: string;
}
