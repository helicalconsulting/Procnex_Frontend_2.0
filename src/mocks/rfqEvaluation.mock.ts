/**
 * Mock data for RFQ Evaluation System
 * 9 categories with full predefined sub-parameters as specified.
 *
 * ALL categories (except Business Requirements) have weightages summing to 100%.
 * ALL sub-parameter groups sum to 100% within their category.
 */

import type { EvalCategory, EvalSubParameter } from '../types/rfqEvaluation';

// ─── Helper ─────────────────────────────────────────────────

let spId = 1;
let catId = 1;

function sp(name: string, weightage = 0, required = false): EvalSubParameter {
  return {
    id: `predef-sp-${spId++}`,
    name,
    source: 'predefined',
    enabled: true,
    required,
    weightage,
    maxScore: 10,
  };
}

function cat(name: string, weightage: number, subParameters: EvalSubParameter[]): EvalCategory {
  return {
    id: `predef-cat-${catId++}`,
    name,
    weightage,
    enabled: true,
    subParameters,
    expanded: false,
  };
}

// ─── 9 Categories ───────────────────────────────────────────

export const PREDEFINED_EVAL_CATEGORIES: EvalCategory[] = [
  // 1. Business Requirements (informational only — vendor fills but no scoring)
  cat('Business Requirements', 0, [
    sp('Procurement Category', 0, true),
    sp('Project Name', 0, true),
    sp('Budget Availability', 0, true),
    sp('Cost Center', 0, false),
    sp('Department', 0, false),
    sp('Procurement Method', 0, true),
    sp('Tender Type', 0, true),
    sp('Procurement Plan Reference', 0, false),
    sp('Urgency', 0, true),
    sp('CAPEX/OPEX', 0, false),
    sp('Funding Source', 0, false),
    sp('Donor Funded', 0, false),
    sp('Framework Agreement', 0, false),
    sp('Multi-year Contract', 0, false),
    sp('Estimated Value', 0, true),
    sp('Procurement Justification', 0, true),
  ]),

  // 2. Supplier Prequalification (sum = 100)
  cat('Supplier Prequalification', 15, [
    sp('Company Age', 5, false),
    sp('Annual Turnover', 10, true),
    sp('Financial Statements', 5, false),
    sp('Credit Rating', 5, false),
    sp('Bank Solvency', 5, false),
    sp('Tax Compliance', 10, true),
    sp('Business Registration', 10, true),
    sp('Shareholding', 5, false),
    sp('Litigation History', 5, true),
    sp('Blacklist Status', 5, true),
    sp('Debarment Check', 8, true),
    sp('References', 4, false),
    sp('Similar Projects', 4, false),
    sp('Insurance', 4, false),
    sp('Factory Visit', 4, false),
    sp('Manufacturing Capacity', 5, false),
    sp('Staff Strength', 3, false),
    sp('Regional Presence', 3, false),
  ]),

  // 3. Technical Evaluation (sum = 100)
  cat('Technical Evaluation', 25, [
    sp('Compliance to Specification', 17, true),
    sp('Technical Methodology', 10, true),
    sp('Team Capability', 10, true),
    sp('Project Experience', 10, true),
    sp('Innovation', 10, false),
    sp('Risk Mitigation', 10, true),
    sp('Delivery Plan', 10, true),
    sp('After Sales Support', 8, false),
    sp('Warranty', 10, true),
    sp('Training', 5, false),
  ]),

  // 4. Commercial Parameters (sum = 100)
  cat('Commercial Parameters', 25, [
    sp('Unit Price', 15, true),
    sp('Total Cost', 15, true),
    sp('Taxes', 10, true),
    sp('Freight', 5, false),
    sp('Insurance', 5, false),
    sp('Incoterms', 5, false),
    sp('Payment Terms', 10, true),
    sp('Currency', 5, false),
    sp('Validity', 5, false),
    sp('Discounts', 5, false),
    sp('Price Escalation', 5, false),
    sp('Cost Breakdown', 5, false),
    sp('Lifecycle Cost', 5, false),
    sp('Total Cost of Ownership', 5, false),
  ]),

  // 5. Delivery Parameters (sum = 100)
  cat('Delivery Parameters', 10, [
    sp('Lead Time', 15, true),
    sp('Delivery Schedule', 17, true),
    sp('Partial Deliveries', 10, false),
    sp('Delivery Location', 10, true),
    sp('Transportation', 10, false),
    sp('Logistics Plan', 10, true),
    sp('Warehouse Capacity', 10, false),
    sp('Packaging', 10, true),
    sp('Installation Timeline', 8, false),
  ]),

  // 6. Quality Parameters (sum = 100)
  cat('Quality Parameters', 10, [
    sp('ISO Certification', 18, true),
    sp('GMP', 5, false),
    sp('HACCP', 5, false),
    sp('FDA', 5, false),
    sp('CE', 5, false),
    sp('Test Reports', 15, true),
    sp('Inspection Plan', 10, true),
    sp('QA/QC Manual', 10, true),
    sp('Defect Rate', 10, false),
    sp('First Pass Yield', 5, false),
    sp('Acceptance Criteria', 12, true),
  ]),

  // 7. Contractual Parameters (sum = 100)
  cat('Contractual Parameters', 5, [
    sp('Contract Duration', 12, true),
    sp('Renewal', 7, false),
    sp('Liquidated Damages', 10, true),
    sp('Performance Bond', 12, true),
    sp('Bid Security', 10, true),
    sp('Warranty Period', 12, true),
    sp('SLA', 7, false),
    sp('Escalation Matrix', 8, false),
    sp('Penalties', 12, true),
    sp('Termination Clause', 10, true),
  ]),

  // 8. ESG Parameters (sum = 100)
  cat('ESG Parameters', 5, [
    sp('Carbon Footprint', 13, true),
    sp('Local Content', 10, false),
    sp('Gender Diversity', 5, false),
    sp('Child Labour Policy', 14, true),
    sp('Human Rights', 14, true),
    sp('Anti-Bribery', 14, true),
    sp('Waste Management', 10, false),
    sp('Circular Economy', 5, false),
    sp('Renewable Energy', 5, false),
    sp('Environmental Policy', 10, true),
  ]),

  // 9. Vendor Performance History (sum = 100)
  cat('Vendor Performance History', 5, [
    sp('Previous Contracts', 10, true),
    sp('OTIF (On-Time In-Full)', 15, true),
    sp('Delivery Accuracy', 10, true),
    sp('Quality Rating', 15, true),
    sp('Invoice Accuracy', 5, false),
    sp('Responsiveness', 5, false),
    sp('Warranty Claims', 10, true),
    sp('CAPA Closure', 5, false),
    sp('Audit Findings', 10, true),
    sp('Customer Satisfaction', 5, false),
    sp('Contract Compliance', 10, true),
  ]),
];
