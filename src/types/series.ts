import type { ProductionTier, PrimaryLocation, ProductionTerritory } from './project';

export type SeriesFormat =
  | 'drama'
  | 'comedy'
  | 'limited'
  | 'anthology'
  | 'procedural'
  | 'docuseries';

export type RuntimeTemplate =
  | 'half-hour'
  | 'one-hour'
  | 'premium-one-hour'
  | 'limited';

export type EpisodeStatus = 'awaiting' | 'in_progress' | 'complete';

export interface Series {
  id: string;
  userId: string;
  title: string;
  season: number;
  format: SeriesFormat;
  location: PrimaryLocation;
  /** Shooting territory — drives Rafa + Sandra knowledge context */
  territory?: ProductionTerritory;
  tier: ProductionTier;
  episodeCount: number;
  /** Counter used to assign the next airNumber when adding episodes to an existing series */
  airOrderCount: number;
  runtimeMinutes: number;
  runtimeTemplate: RuntimeTemplate;
  runtimeTemplateOverride?: RuntimeTemplate;
  pilotDesignated: boolean;
  createdAt: string;
  updatedAt: string;
  /** Optional. If set, enables per-episode budget validation. In centavos (MXN × 100). */
  totalBudgetCentavos?: number;
}

export interface Episode {
  id: string;
  seriesId: string;
  airNumber: number;
  productionNumber: number;
  isPilot: boolean;
  title?: string;
  projectId?: string;
  status: EpisodeStatus;
  breakdownComplete: boolean;
  scheduleComplete: boolean;
  budgetComplete: boolean;
  sceneCount?: number;
  /** Whole pages (not 1/8ths). Convert from Project.totalPages by dividing by 8. */
  pageCount?: number;
  estimatedShootDays?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RosterEntry {
  id: string;
  seriesId: string;
  name: string;
  role: string;
  department: string;
  isSeriesRegular: boolean;
  episodeOverrides: Record<string, { included: boolean; notes?: string }>;
}

export interface AmortizedCostLine {
  id: string;
  category: string;
  description: string;
  totalCost: number;
  allocatedAmounts: Record<string, number>;
}

export interface SeriesBudget {
  id: string;
  seriesId: string;
  amortizedCosts: AmortizedCostLine[];
  episodeAllocations: Record<string, number>;
  rollupTotal: number;
  updatedAt: string;
}

/**
 * Input type for creating a new series.
 * `runtimeTemplate` is intentionally omitted — the Firestore layer always derives
 * it from `runtimeMinutes` (using `deriveRuntimeTemplate`). Pass `runtimeTemplateOverride`
 * only if you want to force a specific template regardless of runtime.
 */
export interface CreateSeriesInput {
  title: string;
  season: number;
  format: SeriesFormat;
  location: PrimaryLocation;
  /** Shooting territory — Mexico | Spain | Colombia */
  territory?: ProductionTerritory;
  tier: ProductionTier;
  episodeCount: number;
  runtimeMinutes: number;
  runtimeTemplateOverride?: RuntimeTemplate;
  pilotDesignated: boolean;
}

/** Derive the runtime template from a raw minute value */
export function deriveRuntimeTemplate(minutes: number): RuntimeTemplate {
  if (minutes <= 30) return 'half-hour';
  if (minutes <= 52) return 'one-hour';
  if (minutes <= 75) return 'premium-one-hour';
  return 'limited';
}
