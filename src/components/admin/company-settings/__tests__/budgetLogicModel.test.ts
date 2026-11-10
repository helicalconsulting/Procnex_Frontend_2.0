import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_BUDGET_LOGIC,
  BUDGET_LOGIC_PRESETS,
  loadBudgetLogicSettings,
  saveBudgetLogicSettings,
  resetBudgetLogicSettings,
  simulateSpendEvaluation,
  STORAGE_KEY_BUDGET_LOGIC,
  type BudgetLogicConfig,
} from '../budgetLogicModel';

describe('budgetLogicModel', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => { mockStorage[key] = val; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { mockStorage = {}; },
    };
    (globalThis as any).window = {
      localStorage: storageMock,
    };
  });

  describe('load and save settings', () => {
    it('returns default config when storage is empty', () => {
      const config = loadBudgetLogicSettings();
      expect(config.controlLevel).toBe('HARD_STOP');
      expect(config.scopeLevel).toBe('LINE_ITEM');
      expect(config.tolerance.enabled).toBe(true);
      expect(config.tolerance.percent).toBe(5);
    });

    it('persists and loads custom settings', () => {
      const custom: BudgetLogicConfig = {
        ...DEFAULT_BUDGET_LOGIC,
        controlLevel: 'SOFT_WARNING',
        tolerance: {
          ...DEFAULT_BUDGET_LOGIC.tolerance,
          percent: 12,
        },
      };

      saveBudgetLogicSettings(custom);
      const loaded = loadBudgetLogicSettings();
      expect(loaded.controlLevel).toBe('SOFT_WARNING');
      expect(loaded.tolerance.percent).toBe(12);
    });

    it('resets to defaults when requested', () => {
      saveBudgetLogicSettings({ ...DEFAULT_BUDGET_LOGIC, controlLevel: 'NONE' });
      expect(mockStorage[STORAGE_KEY_BUDGET_LOGIC]).toBeDefined();

      const def = resetBudgetLogicSettings();
      expect(def.controlLevel).toBe('HARD_STOP');
      expect(mockStorage[STORAGE_KEY_BUDGET_LOGIC]).toBeUndefined();
    });
  });

  describe('simulateSpendEvaluation', () => {
    it('approves spend within available line balance', () => {
      const outcome = simulateSpendEvaluation(DEFAULT_BUDGET_LOGIC, 50000, 100000, 500000, 'KES');
      expect(outcome.allowed).toBe(true);
      expect(outcome.status).toBe('APPROVED');
      expect(outcome.deficit).toBe(0);
    });

    it('approves spend within tolerance buffer', () => {
      // Annual: 1,000,000. 5% tolerance = 50,000. Balance: 100,000. Effective ceiling = 150,000.
      // Requested: 130,000. (Within tolerance buffer)
      const outcome = simulateSpendEvaluation(DEFAULT_BUDGET_LOGIC, 130000, 100000, 1000000, 'KES');
      expect(outcome.allowed).toBe(true);
      expect(outcome.status).toBe('TOLERANCE_APPROVED');
      expect(outcome.deficit).toBe(30000);
      expect(outcome.effectiveAvailable).toBe(150000);
    });

    it('enforces hard stop when spend exceeds available and tolerance', () => {
      // Annual: 1,000,000. 5% tolerance = 50,000. Balance: 100,000. Effective ceiling = 150,000.
      // Requested: 200,000.
      const outcome = simulateSpendEvaluation(DEFAULT_BUDGET_LOGIC, 200000, 100000, 1000000, 'KES');
      expect(outcome.allowed).toBe(false);
      expect(outcome.status).toBe('HARD_STOP');
      expect(outcome.deficit).toBe(100000);
    });

    it('flags soft warning when controlLevel is SOFT_WARNING', () => {
      const softConfig: BudgetLogicConfig = {
        ...DEFAULT_BUDGET_LOGIC,
        controlLevel: 'SOFT_WARNING',
        tolerance: { ...DEFAULT_BUDGET_LOGIC.tolerance, enabled: false, percent: 0 },
      };
      const outcome = simulateSpendEvaluation(softConfig, 150000, 100000, 500000, 'KES');
      expect(outcome.allowed).toBe(true);
      expect(outcome.status).toBe('SOFT_WARNING');
      expect(outcome.actionRequired).toContain('mandatory override reasoning');
    });

    it('permits all spend when controlLevel is NONE', () => {
      const noneConfig: BudgetLogicConfig = {
        ...DEFAULT_BUDGET_LOGIC,
        controlLevel: 'NONE',
      };
      const outcome = simulateSpendEvaluation(noneConfig, 5000000, 100, 100, 'KES');
      expect(outcome.allowed).toBe(true);
      expect(outcome.status).toBe('TRACKING_ONLY');
    });
  });

  describe('presets', () => {
    it('defines standard presets correctly', () => {
      expect(BUDGET_LOGIC_PRESETS.BALANCED).toBeDefined();
      expect(BUDGET_LOGIC_PRESETS.STRICT_ENTERPRISE).toBeDefined();
      expect(BUDGET_LOGIC_PRESETS.FLEXIBLE_ADVISORY).toBeDefined();
    });
  });
});
