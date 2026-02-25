import type { ElementCategoryId } from '@/types';

export interface ElementCategoryDef {
    id: ElementCategoryId;
    name: string;
    nameEs: string;
    color: string;
    number: number;
}

export const ELEMENT_CATEGORIES: ElementCategoryDef[] = [
    { id: 'cast', name: 'Cast (Speaking)', nameEs: 'Elenco (Parlamento)', color: '#FFFF00', number: 1 },
    { id: 'extras', name: 'Extras/Atmosphere', nameEs: 'Extras/Ambiente', color: '#00FF00', number: 2 },
    { id: 'stunts', name: 'Stunts', nameEs: 'Escenas de Riesgo', color: '#FF8C00', number: 3 },
    { id: 'sfx', name: 'Special Effects (SFX)', nameEs: 'Efectos Especiales (SFX)', color: '#0000FF', number: 4 },
    { id: 'vfx', name: 'VFX', nameEs: 'VFX', color: '#EE82EE', number: 5 },
    { id: 'props', name: 'Props', nameEs: 'Utilería', color: '#8B0000', number: 6 },
    { id: 'set_dressing', name: 'Set Dressing', nameEs: 'Ambientación', color: '#800080', number: 7 },
    { id: 'vehicles', name: 'Vehicles', nameEs: 'Vehículos', color: '#FF69B4', number: 8 },
    { id: 'wardrobe', name: 'Wardrobe', nameEs: 'Vestuario', color: '#FF6347', number: 9 },
    { id: 'makeup_hair', name: 'Makeup/Hair', nameEs: 'Maquillaje/Peinado', color: '#FF0000', number: 10 },
    { id: 'animals', name: 'Animals', nameEs: 'Animales', color: '#8B4513', number: 11 },
    { id: 'sound_music', name: 'Sound/Music', nameEs: 'Sonido/Música', color: '#D2B48C', number: 12 },
    { id: 'special_equipment', name: 'Special Equipment', nameEs: 'Equipo Especial', color: '#4682B4', number: 13 },
    { id: 'locations', name: 'Locations', nameEs: 'Locaciones', color: '#9E9E9E', number: 14 },
    { id: 'greenery', name: 'Greenery', nameEs: 'Vegetación', color: '#228B22', number: 15 },
    { id: 'art_dept', name: 'Art Dept Notes', nameEs: 'Notas de Arte', color: '#757575', number: 16 },
    { id: 'security', name: 'Security', nameEs: 'Seguridad', color: '#808080', number: 17 },
];

export function getCategoryById(id: ElementCategoryId): ElementCategoryDef | undefined {
    return ELEMENT_CATEGORIES.find((c) => c.id === id);
}
