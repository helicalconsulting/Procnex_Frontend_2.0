import { Smartphone } from 'lucide-react';
import { userAccessPolicy, type UserAccessState } from './userAccess';

export function AccessSwitch({ checked, disabled, label, description, onChange }: {
  checked: boolean; disabled?: boolean; label: string; description?: string; onChange: () => void;
}) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
    title={description} className="users-access-switch" onClick={event => { event.stopPropagation(); onChange(); }}>
    <span className="users-access-switch__knob" />
  </button>;
}

export default function UserAccessControls({ user, canManage, busy, onAccountChange, onMobileChange }: {
  user: UserAccessState & { fullName: string }; canManage: boolean; busy?: boolean;
  onAccountChange: () => void; onMobileChange: () => void;
}) {
  const policy = userAccessPolicy(user, canManage, busy);
  return <div className="users-access" aria-label={`Access for ${user.fullName}`}>
    <div className="users-access__row" title={policy.accountReason}>
      <AccessSwitch checked={user.isActive} disabled={policy.accountDisabled} label={`Account access for ${user.fullName}`} description={policy.accountReason} onChange={onAccountChange} />
      <span className={`users-status-toggle__label ${user.isActive ? 'users-access__enabled' : ''}`}>{user.isActive ? 'Active' : 'Inactive'}</span>
    </div>
    <div className="users-access__row" title={policy.mobileReason}>
      <AccessSwitch checked={user.isMobileAccessEnabled} disabled={policy.mobileDisabled} label={`Mobile app access for ${user.fullName}`} description={policy.mobileReason} onChange={onMobileChange} />
      <span className={`users-access__mobile ${user.isActive && user.isMobileAccessEnabled ? 'users-access__enabled' : ''}`}><Smartphone size={14} /> {policy.mobileLabel}</span>
    </div>
  </div>;
}
