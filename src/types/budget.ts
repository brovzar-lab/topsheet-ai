/**
 * ALL monetary values stored as INTEGERS in centavos (MXN × 100).
 * Convert to pesos ONLY at the display layer.
 * 35000 pesos = 3500000 centavos
 */

/** Budget account categories (1100-7200) */
export type BudgetCategoryCode =
    | '1100' | '1200' | '1300' | '1400' | '1600'
    | '2000' | '2100' | '2200' | '2300' | '2400' | '2500' | '2600' | '2700' | '2800' | '2900'
    | '3000' | '3100' | '3200' | '3300' | '3400' | '3600' | '3700' | '3800'
    | '4900'
    | '5000' | '5100' | '5200' | '5300' | '5400' | '6000' | '6100'
    | '7000' | '7100' | '7200';

/** Budget section groupings */
export type BudgetSection = 'ATL' | 'BTL' | 'POST' | 'GENERAL' | 'ADMIN';

/** A single line item in the budget */
export interface BudgetLineItem {
    id: string;
    categoryCode: BudgetCategoryCode;
    description: string;
    unit: string;
    /** Rate in centavos (integer) */
    rateCentavos: number;
    quantity: number;
    /** Duration multiplier (e.g., number of weeks) */
    duration: number;
    /** Subtotal in centavos: rate × qty × duration */
    subtotalCentavos: number;
    /** Whether the rate was overridden from MPI default */
    isOverridden: boolean;
    /** Source MPI item ID */
    mpiItemId?: string;
    notes?: string;
    /** TV episodes only. 'episode' = direct cost to this episode. 'amortized' = fraction of season deal. */
    costType?: 'episode' | 'amortized';
}

/** A budget draft — immutable once saved */
export interface BudgetDraft {
    id: string;
    projectId: string;
    version: number;
    name: string;
    lineItems: BudgetLineItem[];
    /** Total in centavos */
    totalCentavos: number;
    /** ATL subtotal in centavos */
    atlCentavos: number;
    /** BTL subtotal in centavos */
    btlCentavos: number;
    /** Post subtotal in centavos */
    postCentavos: number;
    /** Contingency percentage (5, 10, or 15) */
    contingencyPercent: number;
    /** Contingency amount in centavos */
    contingencyCentavos: number;
    /** Exchange rate used (MXN per USD) */
    exchangeRate: number;
    createdAt: string;
    notes?: string;
    /** Set when this draft belongs to a TV episode. */
    seriesId?: string;
    episodeId?: string;
}

/** Rate card — per-project overrides on top of MPI */
export interface RateOverride {
    mpiItemId: string;
    /** Overridden rate in centavos */
    rateCentavos: number;
    notes?: string;
}

export interface RateCard {
    projectId: string;
    overrides: RateOverride[];
}
