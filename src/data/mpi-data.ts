/**
 * mpi-data.ts — Master Price Index from 3 real Mexican film productions.
 *
 * Imports the raw JSON (388 items across 34 categories) and converts
 * it into typed MPICategory[] at build time. Vite handles JSON imports natively.
 *
 * All amounts in centavos (integer). The JSON has pesos (float).
 */

import type { MPICategory, MPIItem, BudgetCategoryCode } from '@/types';
import rawMPI from '../../data/master_price_index.json';

// -----------------------------------------------------------------------
// Category code extraction: "1100 Script" → "1100"
// -----------------------------------------------------------------------

const VALID_CODES = new Set<string>([
    '1100', '1200', '1300', '1400', '1600',
    '2000', '2100', '2200', '2300', '2400', '2500', '2600', '2700', '2800', '2900',
    '3000', '3100', '3200', '3300', '3400', '3600', '3700', '3800',
    '4900',
    '5000', '5100', '5200', '5300', '5400', '6000', '6100',
    '7000', '7100', '7200',
]);

function extractCode(key: string): BudgetCategoryCode | null {
    const match = key.match(/^(\d{4})/);
    if (match && VALID_CODES.has(match[1]!)) {
        return match[1] as BudgetCategoryCode;
    }
    return null;
}

function extractName(key: string): string {
    return key.replace(/^\d{4}\s*/, '').trim();
}

// -----------------------------------------------------------------------
// Parse B1/B2/B3 data points from notes
// -----------------------------------------------------------------------

interface RawDataPoint {
    source: string;
    costCentavos: number;
}

function parseDataPoints(notes: string | null): RawDataPoint[] {
    if (!notes) return [];
    const points: RawDataPoint[] = [];

    // Match patterns like: B1: $500,000 | B2: $800,000 | B3: N/A
    // Also handles: B1=B2: $1,500,000 | B3: $1,000,000
    const patterns = [
        /B1[=:]?\s*\$?([\d,]+(?:\.\d+)?)/g,
        /B2[=:]?\s*\$?([\d,]+(?:\.\d+)?)/g,
        /B3[=:]?\s*\$?([\d,]+(?:\.\d+)?)/g,
    ];

    const sources = ['Budget 1', 'Budget 2', 'Budget 3'];

    for (let i = 0; i < patterns.length; i++) {
        const matches = notes.matchAll(patterns[i]!);
        for (const m of matches) {
            const val = parseFloat(m[1]!.replace(/,/g, ''));
            if (!isNaN(val) && val > 0) {
                points.push({
                    source: sources[i]!,
                    costCentavos: Math.round(val * 100),
                });
                break; // Take first match per budget
            }
        }
    }

    return points;
}

// -----------------------------------------------------------------------
// Section mapping
// -----------------------------------------------------------------------

const SECTION_MAP: Record<string, 'ATL' | 'BTL' | 'POST' | 'GENERAL' | 'ADMIN'> = {};
for (const code of ['1100', '1200', '1300', '1400', '1600']) SECTION_MAP[code] = 'ATL';
for (const code of ['2000', '2100', '2200', '2300', '2400', '2500', '2600', '2700', '2800', '2900',
    '3000', '3100', '3200', '3300', '3400', '3600', '3700', '3800']) SECTION_MAP[code] = 'BTL';
for (const code of ['5000', '5100', '5200', '5300', '5400', '6000', '6100']) SECTION_MAP[code] = 'POST';
SECTION_MAP['4900'] = 'GENERAL';
for (const code of ['7000', '7100', '7200']) SECTION_MAP[code] = 'ADMIN';

// Spanish names for categories
const NAME_ES: Record<string, string> = {
    '1100': 'Guión', '1200': 'Producción', '1300': 'Dirección', '1400': 'Elenco', '1600': 'Viajes ATL',
    '2000': 'Staff de Producción', '2100': 'Extras', '2200': 'Diseño de Escenografía', '2300': 'Construcción',
    '2400': 'Ambientación', '2500': 'Utilería', '2600': 'Vehículos/Animales', '2700': 'Vestuario',
    '2800': 'Maquillaje/Peinado', '2900': 'Grip', '3000': 'Eléctrico', '3100': 'Cámara', '3200': 'Sonido',
    '3300': 'Efectos Especiales', '3400': 'Locaciones', '3600': 'Transporte', '3700': 'Oficina',
    '3800': 'Laboratorio/Medios', '4900': 'Gastos Generales', '5000': 'Edición', '5100': 'Terminado',
    '5200': 'Post Sonido', '5300': 'Stock', '5400': 'Títulos', '6000': 'Música', '6100': 'VFX',
    '7000': 'Administración', '7100': 'Publicidad', '7200': 'Seguros',
};

// -----------------------------------------------------------------------
// Build typed MPI data from raw JSON
// -----------------------------------------------------------------------

function buildMPIData(): MPICategory[] {
    const categories: MPICategory[] = [];
    const typedMPI = rawMPI as Record<string, Array<{
        item: string;
        unit: string;
        base_cost_mxn: number;
        notes: string | null;
    }>>;

    for (const [key, items] of Object.entries(typedMPI)) {
        const code = extractCode(key);
        if (!code) continue;

        const name = extractName(key);
        const section = SECTION_MAP[code] ?? 'GENERAL';
        const nameEs = NAME_ES[code] ?? name;

        const mpiItems: MPIItem[] = items.map((raw, idx) => {
            const dataPoints = parseDataPoints(raw.notes);
            const id = `mpi_${code}_${idx}_${raw.item.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40)}`;

            return {
                id,
                categoryCode: code,
                item: raw.item,
                unit: raw.unit,
                baseCostCentavos: Math.round(raw.base_cost_mxn * 100),
                notes: raw.notes ?? '',
                dataPoints: dataPoints.map((dp) => ({
                    source: dp.source,
                    costCentavos: dp.costCentavos,
                })),
            };
        });

        categories.push({
            code,
            name,
            nameEs,
            section,
            items: mpiItems,
        });
    }

    return categories;
}

export const MPI_DATA: MPICategory[] = buildMPIData();

// -----------------------------------------------------------------------
// Lookup helpers
// -----------------------------------------------------------------------

/** Get all MPI items for a given budget category code. */
export function getMPIItemsByCategory(code: BudgetCategoryCode): MPIItem[] {
    const cat = MPI_DATA.find((c) => c.code === code);
    return cat?.items ?? [];
}

/** Get a specific MPI item by ID. */
export function getMPIItemById(id: string): MPIItem | undefined {
    for (const cat of MPI_DATA) {
        const item = cat.items.find((i) => i.id === id);
        if (item) return item;
    }
    return undefined;
}

/** Get all MPI items flattened. */
export function getAllMPIItems(): MPIItem[] {
    return MPI_DATA.flatMap((cat) => cat.items);
}

/** Total item count across all categories. */
export function getMPIItemCount(): number {
    return MPI_DATA.reduce((sum, cat) => sum + cat.items.length, 0);
}
