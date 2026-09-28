import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { approvalChain, approvalFormErrors, approvalModulesForSystem, mapApprovalLevel, nextApprovalLevel, persistApprovalMove, reorderApprovalLevels } from '../approvalLevelModel';
import ApprovalChain from '../ApprovalChain';

const levels = () => [
  mapApprovalLevel({ id: 'a', module: 'RFQ', requiredRole: 'Manager', levelNumber: 1 }),
  mapApprovalLevel({ id: 'b', module: 'RFQ', requiredRole: 'Clerk', levelNumber: 2, minValue: 0, maxValue: 500, currency: 'KES' }),
  mapApprovalLevel({ id: 'c', module: 'RFQ', requiredRole: 'Director', levelNumber: 3 }),
  mapApprovalLevel({ id: 'p', module: 'Purchase Orders', requiredRole: 'Clerk', levelNumber: 1 }),
];
const form = { module: 'RFQ', role: 'Manager', hours: '24', min: '', max: '', currency: 'KES' };

describe('approval sequence and engine scope', () => {
  it('moves adjacent levels without changing their metadata, IDs, or other chains', () => {
    const initial = levels();
    const moved = reorderApprovalLevels(initial, 'a', 'right');
    expect(approvalChain(moved, 'RFQ').map(level => level.id)).toEqual(['b', 'a', 'c']);
    expect(moved.find(level => level.id === 'b')).toEqual({ ...initial[1], levelNumber: 1 });
    expect(moved[3]).toBe(initial[3]);
    expect(reorderApprovalLevels(moved, 'a', 'left')).toEqual(initial);
    expect(initial[0].levelNumber).toBe(1);
  });
  it('does not move first left, last right, a single level, or a missing ID', () => {
    const initial = levels();
    for (const [id, direction] of [['a', 'left'], ['c', 'right'], ['p', 'left'], ['p', 'right'], ['missing', 'left']] as const) {
      expect(reorderApprovalLevels(initial, id, direction)).toBe(initial);
    }
  });
  it('normalizes supported aliases and keeps engine views disjoint and complete', () => {
    const initial = [...levels(), mapApprovalLevel({ id: 'x', module: 'Invoices', requiredRole: 'Finance', levelNumber: 1 })];
    const p2p = approvalModulesForSystem('rfq', initial).map(module => module.key);
    const workflow = approvalModulesForSystem('heliflow', initial).map(module => module.key);
    expect(p2p).toEqual(['RFQ', 'Quotations']);
    expect(workflow).toContain('PurchaseOrders');
    expect(workflow).toContain('Invoices');
    expect(workflow).toContain('CustomForms');
    expect(p2p.some(module => workflow.includes(module))).toBe(false);
    expect(initial.every(level => [...p2p, ...workflow].includes(level.module))).toBe(true);
    expect(mapApprovalLevel({ ...initial[0], module: 'QUOTATION' }).module).toBe('Quotations');
  });
  it('appends after the highest existing level, including gaps and empty chains', () => {
    expect(nextApprovalLevel(levels(), 'RFQ')).toBe(4);
    expect(nextApprovalLevel([{ ...levels()[0], levelNumber: 5 }], 'RFQ')).toBe(6);
    expect(nextApprovalLevel([], 'RFQ')).toBe(1);
  });
  it('updates cached order before the network finishes, mapping right to the existing API direction', async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const actions = { cancelRefresh: vi.fn().mockResolvedValue(undefined), setLevels: vi.fn(), persist: vi.fn().mockReturnValue(pending) };
    const request = persistApprovalMove(levels(), 'a', 'right', actions);
    await Promise.resolve();
    expect(actions.setLevels).toHaveBeenCalledOnce();
    expect(approvalChain(actions.setLevels.mock.calls[0][0], 'RFQ').map(level => level.id)).toEqual(['b', 'a', 'c']);
    expect(actions.persist).toHaveBeenCalledWith('a', 'down');
    finish(); await expect(request).resolves.toBe(true);
    expect(actions.setLevels).toHaveBeenCalledOnce();
  });
  it('rolls back the exact original snapshot on a failed save', async () => {
    const initial = levels();
    const actions = { cancelRefresh: vi.fn().mockResolvedValue(undefined), setLevels: vi.fn(), persist: vi.fn().mockRejectedValue(new Error('Network error')) };
    await expect(persistApprovalMove(initial, 'b', 'left', actions)).rejects.toThrow('Network error');
    expect(actions.persist).toHaveBeenCalledWith('b', 'up');
    expect(actions.setLevels).toHaveBeenLastCalledWith(initial);
    expect(actions.setLevels.mock.calls[1][0]).toBe(initial);
  });
  it('does not request a save or update the cache for invalid boundary moves', async () => {
    const actions = { cancelRefresh: vi.fn(), setLevels: vi.fn(), persist: vi.fn() };
    await expect(persistApprovalMove(levels(), 'a', 'left', actions)).resolves.toBe(false);
    expect(actions.persist).not.toHaveBeenCalled();
    expect(actions.setLevels).not.toHaveBeenCalled();
  });
});

describe('approval form validation', () => {
  it('allows optional unbounded ranges, zero amounts, and equal endpoints', () => {
    expect(approvalFormErrors(form)).toEqual({});
    expect(approvalFormErrors({ ...form, min: '0', max: '0' })).toEqual({});
    expect(approvalFormErrors({ ...form, min: '10.50', max: '10.50' })).toEqual({});
  });
  it.each(['', '0', '-1', '169', '1.5', 'NaN'])('rejects invalid time limit %s', hours => {
    expect(approvalFormErrors({ ...form, hours }).hours).toBeTruthy();
  });
  it('rejects missing module, role, and currency and invalid or inverted amounts', () => {
    expect(Object.keys(approvalFormErrors({ ...form, module: '', role: '', currency: '' }))).toEqual(['module', 'role', 'currency']);
    expect(approvalFormErrors({ ...form, min: '-1' }).min).toBeTruthy();
    expect(approvalFormErrors({ ...form, max: 'Infinity' }).max).toBeTruthy();
    expect(approvalFormErrors({ ...form, min: '100', max: '99' }).max).toBeTruthy();
  });
});

describe('approval card interactions', () => {
  const props = { label: 'RFQ', chain: approvalChain(levels(), 'RFQ'), currency: 'KES', pendingId: null, onMove: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };
  it('labels horizontal movement clearly and renders thresholds and roles', () => {
    const html = renderToStaticMarkup(<ApprovalChain {...props} canManage busy={false} />);
    expect(html).toContain('Move Manager right from level 1');
    expect(html).toContain('Move Director left from level 3');
    expect(html).not.toContain('Move Up');
    expect(html).toContain('All amounts');
    expect(html).toContain('500');
    expect((html.match(/disabled=""/g) ?? [])).toHaveLength(2);
  });
  it.each([{ canManage: false, busy: false }, { canManage: true, busy: true }])('locks mutation actions for %j', state => {
    const html = renderToStaticMarkup(<ApprovalChain {...props} {...state} />);
    expect((html.match(/disabled=""/g) ?? [])).toHaveLength(12);
  });
});
