import { describe, it, expect } from 'vitest';
import { acceptPercentageInput, allocatePercentages, percentageUnits } from '../paymentPlanAllocation';

describe('payment milestone percentages', () => {
  it.each(['100.01', '101', '-1', '1e2', 'NaN', 'Infinity', '50.123', '0', '0.00', ''])('does not accept %s as a saved allocation', value => expect(percentageUnits(value)).toBeNull());
  it.each(['100', '100.00'])('allows a single full-payment allocation %s', value => expect(percentageUnits(value)).toBe(10000));
  it.each(['100.01', '999', '-5', '1e2', '5.555', 'abc'])('rejects out-of-range or non-decimal typed/pasted input %s', value => expect(acceptPercentageInput(value)).toBe(false));
  it.each(['', '0.', '0.01', '1', '99.99', '50.', '100', '100.00'])('allows editable decimal input %s', value => expect(acceptPercentageInput(value)).toBe(true));
  it('allocates a single blank milestone to 100%', () => expect(allocatePercentages([''])).toEqual(['100']));
  it('preserves an entered single milestone at 100%', () => expect(allocatePercentages(['100'])).toEqual(['100']));
  it('does not replace an entered single milestone below 100%', () => expect(allocatePercentages(['1'])).toBeNull());
  it('preserves 1% and shares the remaining 99% between two blank milestones', () => expect(allocatePercentages(['1', '', ''])).toEqual(['1', '49.5', '49.5']));
  it('reallocates previously auto-filled rows after the first percentage is edited', () => expect(allocatePercentages(['1', '33.33', '33.33'], [true, false, false])).toEqual(['1', '49.5', '49.5']));
  it('preserves every manual value, even when it matches an earlier auto-filled value', () => expect(allocatePercentages(['1', '33.33', '33.33'], [true, true, false])).toEqual(['1', '33.33', '65.67']));
  it('preserves decimal allocations when filling the balance', () => expect(allocatePercentages(['25.5', '', ''])).toEqual(['25.5', '37.25', '37.25']));
  it('rounds thirds to exactly 100%', () => expect(allocatePercentages(['', '', ''])).toEqual(['33.34', '33.33', '33.33']));
  it('never overwrites a fully entered plan to fix an incorrect total', () => {
    expect(allocatePercentages(['80', '70'])).toBeNull();
    expect(allocatePercentages(['1', '33.33', '33.33'])).toBeNull();
    expect(allocatePercentages(['20', '30', '50'])).toEqual(['20', '30', '50']);
  });
  it('can fill a cleared manual row and preserve the other manual allocations', () => expect(allocatePercentages(['20', '', '50'], [true, true, true])).toEqual(['20', '30', '50']));
  it('redistributes automatic percentages after adding a milestone to a single 100% allocation', () => expect(allocatePercentages(['100', ''], [false, false])).toEqual(['50', '50']));
  it('preserves a manually entered 100% and refuses to add positive allocations beyond it', () => expect(allocatePercentages(['100', ''], [true, false])).toBeNull());
  it('refuses impossible allocations and invalid manual values', () => {
    expect(allocatePercentages([])).toBeNull();
    expect(allocatePercentages(['60', '50', ''])).toBeNull();
    expect(allocatePercentages(['99.99', '', ''])).toBeNull();
    expect(allocatePercentages(['-1', ''])).toBeNull();
    expect(allocatePercentages(['oops', ''])).toBeNull();
    expect(allocatePercentages([''], [])).toBeNull();
  });
  it('allocates a final 0.01% without floating-point drift', () => expect(allocatePercentages(['99.99', ''])).toEqual(['99.99', '0.01']));
  it('maintains exact totals and valid bounds for one through 100 milestones', () => {
    for (let count = 1; count <= 100; count++) {
      const result = allocatePercentages(Array(count).fill(''))!;
      expect(result.reduce((sum, value) => sum + percentageUnits(value)!, 0)).toBe(10000);
      expect(result.every(value => percentageUnits(value)! > 0 && percentageUnits(value)! <= 10000)).toBe(true);
    }
  });
});
