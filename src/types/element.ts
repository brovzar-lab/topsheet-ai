/** The 16+ standard breakdown element categories with industry color codes */
export type ElementCategoryId =
    | 'cast' | 'extras' | 'stunts' | 'sfx' | 'vfx'
    | 'props' | 'set_dressing' | 'vehicles' | 'wardrobe'
    | 'makeup_hair' | 'animals' | 'sound_music'
    | 'special_equipment' | 'locations' | 'greenery'
    | 'art_dept' | 'security';

/** A breakdown element identified in a scene */
export interface BreakdownElement {
    id: string;
    categoryId: ElementCategoryId;
    name: string;
    description?: string;
    quantity?: number;
    /** Notes from AI or manual annotation */
    notes?: string;
    /** Whether this was AI-generated or manually added */
    source: 'ai' | 'manual';
}

/** Elements associated with a single scene */
export interface SceneBreakdown {
    sceneNumber: string;
    elements: BreakdownElement[];
    /** Whether the breakdown has been reviewed by the producer */
    reviewed: boolean;
}
