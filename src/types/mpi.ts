import type { BudgetCategoryCode } from './budget';

/** A single item in the Master Price Index */
export interface MPIItem {
    id: string;
    categoryCode: BudgetCategoryCode;
    item: string;
    unit: string;
    /** Base cost in centavos (integer) */
    baseCostCentavos: number;
    /** Notes including variance from source budgets */
    notes: string;
    /** Individual data points from past budgets */
    dataPoints: MPIDataPoint[];
}

/** A data point from a real production budget */
export interface MPIDataPoint {
    /** Source budget identifier */
    source: string;
    /** Cost in centavos */
    costCentavos: number;
    /** Date the budget was from */
    date?: string;
}

/** MPI category grouping */
export interface MPICategory {
    code: BudgetCategoryCode;
    name: string;
    nameEs: string;
    section: 'ATL' | 'BTL' | 'POST' | 'GENERAL' | 'ADMIN';
    items: MPIItem[];
}

/** A pricing data point learned from an uploaded past budget */
export interface LearnedMPIRecord {
    id: string;
    mpiItemId: string;
    categoryCode: string;
    itemName: string;
    costCentavos: number;
    unit: string;
    budgetSource: string;    // original filename
    uploadedAt: string;      // ISO date
}

/** Result returned after parsing and matching a budget upload */
export interface MPIUploadResult {
    matched: LearnedMPIRecord[];
    unmatched: { row: string; amountCentavos: number }[];
    totalRows: number;
    filename: string;
}
