/**
 * RFQ Evaluation System — Enterprise-grade Category + Sub-Parameter + Scoring
 *
 * 9 predefined categories, each with sub-parameters.
 * Admin can Add/Edit/Delete/Enable-Disable/Set-Weightage/Mark-Required.
 * Users can add custom sub-parameters per category.
 * Weighted scoring across categories → final vendor score.
 */

// ─── Evaluation Structure ──────────────────────────────────

export interface EvalSubParameter {
  id: string;
  name: string;
  /** Predefined ones come from the template; users can add custom ones */
  source: 'predefined' | 'custom';
  enabled: boolean;
  required: boolean;
  /** Weightage WITHIN its category (e.g. 0–100% distributed among sub-params) */
  weightage: number;
  /** Max possible score for this parameter (e.g. 10) */
  maxScore: number;
  /** Optional description / help text */
  description?: string;
}

export interface EvalCategory {
  id: string;
  name: string;
  /** Category weightage in the OVERALL evaluation (all categories sum to 100%) */
  weightage: number;
  enabled: boolean;
  subParameters: EvalSubParameter[];
  /** Whether this category is expanded in the accordion UI */
  expanded: boolean;
}

// ─── Scoring ───────────────────────────────────────────────

export interface SubParameterScore {
  subParameterId: string;
  vendorId: string;
  score: number;
  remarks?: string;
}

export interface CategoryScore {
  categoryId: string;
  vendorId: string;
  /** Sum of (subParam.weightedScore) for this vendor within this category */
  rawScore: number;
  /** Normalised to the category max */
  percentageScore: number;
}

export interface VendorEvaluationScore {
  vendorId: string;
  vendorName: string;
  categoryScores: CategoryScore[];
  /** Sum of all category percentage scores × category weightage */
  totalWeightedScore: number;
  /** Normalised to 100 */
  finalScore: number;
  rank: number;
}

// ─── Full Evaluation Config (what an RFQ carries) ──────────

export interface RFQEvaluationConfig {
  categories: EvalCategory[];
  /** Whether scoring is enabled for this RFQ */
  scoringEnabled: boolean;
  /** Max score per sub-parameter (default 10) */
  defaultMaxScore: number;
}

// ─── Helper: default sub-parameter factory ─────────────────

export function createSubParameter(name: string, source: 'predefined' | 'custom' = 'custom'): EvalSubParameter {
  return {
    id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    source,
    enabled: true,
    required: false,
    weightage: 0,
    maxScore: 10,
  };
}

export function createCategory(name: string): EvalCategory {
  return {
    id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    weightage: 0,
    enabled: true,
    subParameters: [],
    expanded: false,
  };
}
