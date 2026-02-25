/** ANDA actor categories */
export type CastCategory = 'estelar' | '1a_parte' | '2a_parte' | 'bit';

/** A character extracted from the screenplay */
export interface Character {
    id: string;
    name: string;
    category: CastCategory;
    /** Scene numbers this character appears in (strings) */
    scenes: string[];
    /** Estimated work days */
    workDays: number;
    /** Estimated hold days (weekly cast only) */
    holdDays: number;
    /** Notes/description */
    notes?: string;
}
