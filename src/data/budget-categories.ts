import type { BudgetCategoryCode, BudgetSection } from '@/types';

export interface BudgetCategoryDef {
    code: BudgetCategoryCode;
    name: string;
    nameEs: string;
    section: BudgetSection;
}

export const BUDGET_CATEGORIES: BudgetCategoryDef[] = [
    // ATL (Above the Line)
    { code: '1100', name: 'Script', nameEs: 'Guión', section: 'ATL' },
    { code: '1200', name: 'Producers', nameEs: 'Producción', section: 'ATL' },
    { code: '1300', name: 'Direction', nameEs: 'Dirección', section: 'ATL' },
    { code: '1400', name: 'Cast', nameEs: 'Elenco', section: 'ATL' },
    { code: '1600', name: 'ATL Travel', nameEs: 'Viajes ATL', section: 'ATL' },

    // BTL (Below the Line — Production)
    { code: '2000', name: 'Production Staff', nameEs: 'Staff de Producción', section: 'BTL' },
    { code: '2100', name: 'Extras', nameEs: 'Extras', section: 'BTL' },
    { code: '2200', name: 'Set Design', nameEs: 'Diseño de Escenografía', section: 'BTL' },
    { code: '2300', name: 'Construction', nameEs: 'Construcción', section: 'BTL' },
    { code: '2400', name: 'Set Dressing', nameEs: 'Ambientación', section: 'BTL' },
    { code: '2500', name: 'Property', nameEs: 'Utilería', section: 'BTL' },
    { code: '2600', name: 'Vehicles/Animals', nameEs: 'Vehículos/Animales', section: 'BTL' },
    { code: '2700', name: 'Wardrobe', nameEs: 'Vestuario', section: 'BTL' },
    { code: '2800', name: 'Makeup/Hair', nameEs: 'Maquillaje/Peinado', section: 'BTL' },
    { code: '2900', name: 'Set Ops (Grip)', nameEs: 'Grip', section: 'BTL' },
    { code: '3000', name: 'Electrical', nameEs: 'Eléctrico', section: 'BTL' },
    { code: '3100', name: 'Camera', nameEs: 'Cámara', section: 'BTL' },
    { code: '3200', name: 'Sound', nameEs: 'Sonido', section: 'BTL' },
    { code: '3300', name: 'SFX', nameEs: 'Efectos Especiales', section: 'BTL' },
    { code: '3400', name: 'Locations', nameEs: 'Locaciones', section: 'BTL' },
    { code: '3600', name: 'Transport', nameEs: 'Transporte', section: 'BTL' },
    { code: '3700', name: 'Office', nameEs: 'Oficina', section: 'BTL' },
    { code: '3800', name: 'Lab/Media', nameEs: 'Laboratorio/Medios', section: 'BTL' },

    // General
    { code: '4900', name: 'General Expenses', nameEs: 'Gastos Generales', section: 'GENERAL' },

    // Post-Production
    { code: '5000', name: 'Editorial', nameEs: 'Edición', section: 'POST' },
    { code: '5100', name: 'Finishing', nameEs: 'Terminado', section: 'POST' },
    { code: '5200', name: 'Post Sound', nameEs: 'Post Sonido', section: 'POST' },
    { code: '5300', name: 'Stock', nameEs: 'Stock', section: 'POST' },
    { code: '5400', name: 'Titles', nameEs: 'Títulos', section: 'POST' },
    { code: '6000', name: 'Music', nameEs: 'Música', section: 'POST' },
    { code: '6100', name: 'VFX', nameEs: 'VFX', section: 'POST' },

    // Admin / Other
    { code: '7000', name: 'Admin', nameEs: 'Administración', section: 'ADMIN' },
    { code: '7100', name: 'Publicity', nameEs: 'Publicidad', section: 'ADMIN' },
    { code: '7200', name: 'Insurance', nameEs: 'Seguros', section: 'ADMIN' },
];

export function getCategoriesBySection(section: BudgetSection): BudgetCategoryDef[] {
    return BUDGET_CATEGORIES.filter((c) => c.section === section);
}
