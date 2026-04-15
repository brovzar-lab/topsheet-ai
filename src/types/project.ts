/** Production tier determines schedule templates and MPI rate selection */
export type ProductionTier = 'low' | 'mid' | 'premium';

/** @deprecated Use ProductionTerritory instead */
export type PrimaryLocation = 'cdmx' | 'guadalajara' | 'monterrey' | 'tijuana' | 'other';

/** Shooting territory — determines which reference knowledge agents use */
export type ProductionTerritory = 'mexico' | 'spain' | 'colombia';

/** A project in the Budget Engine */
export interface Project {
    id: string;
    title: string;
    tier: ProductionTier;
    /** @deprecated kept for backwards compat; use territory instead */
    location: PrimaryLocation;
    /** Shooting territory — drives agent knowledge context */
    territory?: ProductionTerritory;
    /** Raw script text extracted from PDF */
    scriptText: string;
    /** Total page count in 1/8ths (integer). 1 page = 8 */
    totalPages: number;
    /** Number of parsed scenes */
    sceneCount: number;
    /** Original PDF filename */
    pdfFilename: string;
    createdAt: string;
    updatedAt: string;
}

