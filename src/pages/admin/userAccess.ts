export interface UserAccessState {
  isActive: boolean;
  isMobileAccessEnabled: boolean;
  role: string;
  apiRoleName?: string;
}

export function userAccessPolicy(user: UserAccessState, canManage: boolean, busy = false) {
  const protectedAccount = user.role === 'Super Admin' || user.apiRoleName === 'Super Admin';
  return {
    accountDisabled: !canManage || protectedAccount || busy,
    mobileDisabled: !canManage || !user.isActive || busy,
    accountReason: !canManage ? 'You do not have permission to manage access.' : protectedAccount ? 'Super Admin accounts must remain active.' : busy ? 'Saving access changes…' : 'Inactive accounts cannot sign in on web or mobile.',
    mobileReason: !user.isActive ? 'Activate the account to use mobile access. The saved mobile permission is retained.' : !canManage ? 'You do not have permission to manage access.' : busy ? 'Saving access changes…' : 'Allow sign-in from the mobile app.',
    mobileLabel: !user.isActive && user.isMobileAccessEnabled ? 'Mobile on hold' : user.isMobileAccessEnabled ? 'Mobile allowed' : 'Mobile off',
  };
}
