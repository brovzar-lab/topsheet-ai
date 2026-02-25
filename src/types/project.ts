/** Production tier determines schedule templates and MPI rate selection */
export type ProductionTier = 'low' | 'mid' | 'premium';

/** Primary shooting location */
export type PrimaryLocation = 'cdmx' | 'guadalajara' | 'monterrey' | 'tijuana' | 'other';

/** A project in the Budget Engine */
export interface Project {
    id: string;
    title: string;
    tier: ProductionTier;
    location: PrimaryLocation;
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
