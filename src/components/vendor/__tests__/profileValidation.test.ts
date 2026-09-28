import { describe, expect, it } from 'vitest';
import { bankingFormValues, passwordValidation } from '../profileValidation';

describe('profile password validation', () => {
  const valid = (current: string, next: string, confirmation: string) => !Object.values(passwordValidation(current, next, confirmation)).some(Boolean);

  it.each([
    ['', '', ''],
    ['', 'new-value', 'new-value'],
    ['old-value', '', ''],
    ['old-value', 'short', 'short'],
    ['old-value', 'new-value', ''],
    ['old-value', 'new-value', 'different'],
    ['old-value', 'a'.repeat(129), 'a'.repeat(129)],
  ])('rejects incomplete, mismatched or out-of-range credentials (%#)', (current, next, confirmation) => {
    expect(valid(current, next, confirmation)).toBe(false);
  });

  it.each([8, 128])('accepts matching passwords at the API length boundary %i', length => {
    expect(valid('old-value', 'a'.repeat(length), 'a'.repeat(length))).toBe(true);
  });

  it('compares exactly, without silently trimming meaningful spaces or changing case', () => {
    expect(valid('old-value', ' New-value ', ' New-value ')).toBe(true);
    expect(valid('old-value', ' New-value ', 'New-value')).toBe(false);
    expect(valid('old-value', 'New-value', 'new-value')).toBe(false);
  });

  it('becomes invalid again when any required field is cleared', () => {
    const values = ['old-value', 'new-value', 'new-value'];
    for (let index = 0; index < values.length; index++) {
      const cleared = values.map((value, i) => i === index ? '' : value);
      expect(valid(cleared[0], cleared[1], cleared[2])).toBe(false);
    }
  });
});

describe('banking edit initialization', () => {
  it('preserves the stored account number when editing an unrelated banking field', () => {
    const banking = { bankName: 'Example Bank', bankBranch: 'Central', bankAccountNumber: '0012345678', bankIfscCode: 'EXAMPLE01' };
    const form = bankingFormValues(banking);
    form.bankBranch = 'New branch';
    expect(form.bankAccountNumber).toBe('0012345678');
    expect(banking.bankBranch).toBe('Central');
  });

  it('provides editable empty fields for unconfigured banking details', () => {
    expect(bankingFormValues({ bankName: null, bankBranch: null, bankAccountNumber: null, bankIfscCode: null }))
      .toEqual({ bankName: '', bankBranch: '', bankAccountNumber: '', bankIfscCode: '' });
  });
});
