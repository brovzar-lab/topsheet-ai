/** Interior/Exterior designation */
export type IntExt = 'INT' | 'EXT' | 'INT/EXT';

/** Time of day — supports both English and Spanish conventions */
export type TimeOfDay =
    | 'DAY' | 'NIGHT' | 'DAWN' | 'DUSK' | 'MORNING' | 'EVENING'
    | 'CONTINUOUS' | 'LATER' | 'SAME TIME' | 'MOMENTS LATER'
    | 'DÍA' | 'NOCHE' | 'TARDE' | 'ATARDECER' | 'AMANECER' | 'MADRUGADA'
    | 'CONTINUO' | 'DESPUÉS' | 'MISMO TIEMPO';

/** Parsed slugline components */
export interface Slugline {
    intExt: IntExt;
    location: string;
    subLocation?: string;
    timeOfDay: TimeOfDay;
    raw: string;
}

/** A single scene parsed from the screenplay */
export interface Scene {
    /** Scene number as a STRING. Never parseInt(). "42A" is valid. */
    sceneNumber: string;
    slugline: Slugline;
    /** Page count in 1/8ths (integer). 1 page = 8. Half page = 4. */
    pageCount: number;
    /** Raw text content of the scene */
    content: string;
    /** AI-generated synopsis (populated after breakdown) */
    synopsis?: string;
    /** Characters speaking in this scene */
    characters: string[];
    /** Start line in the script */
    startLine: number;
    /** End line in the script */
    endLine: number;
}
