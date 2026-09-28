import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import UserAccessControls from '../UserAccessControls';
import { userAccessPolicy } from '../userAccess';

const user = { fullName: 'Test User', role: 'Purchase Clerk', isActive: true, isMobileAccessEnabled: true };

describe('user access combinations', () => {
  it.each([
    [true, true, 'Mobile allowed', false],
    [true, false, 'Mobile off', false],
    [false, true, 'Mobile on hold', true],
    [false, false, 'Mobile off', true],
  ])('presents active=%s and mobile=%s without losing the saved permission', (isActive, isMobileAccessEnabled, label, disabled) => {
    const state = { ...user, isActive, isMobileAccessEnabled };
    const policy = userAccessPolicy(state, true);
    expect(policy.mobileLabel).toBe(label);
    expect(policy.mobileDisabled).toBe(disabled);
    expect(policy.accountDisabled).toBe(false);
    const markup = renderToStaticMarkup(<UserAccessControls user={state} canManage onAccountChange={() => {}} onMobileChange={() => {}} />);
    const switches = markup.match(/<button[^>]*>/g) ?? [];
    expect(switches).toHaveLength(2);
    expect(switches[1]).toContain(`aria-checked="${isMobileAccessEnabled}"`);
    expect(switches[1].includes('disabled')).toBe(disabled);
  });

  it('keeps both controls unavailable for a read-only administrator and while saving', () => {
    for (const policy of [userAccessPolicy(user, false), userAccessPolicy(user, true, true)]) {
      expect(policy.accountDisabled).toBe(true);
      expect(policy.mobileDisabled).toBe(true);
    }
  });

  it('protects Super Admin account status without merging its mobile permission', () => {
    const policy = userAccessPolicy({ ...user, role: 'Super Admin' }, true);
    expect(policy.accountDisabled).toBe(true);
    expect(policy.mobileDisabled).toBe(false);
  });
});
