import { Children, isValidElement, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '../../ui/dialog';

function findTitle(children: ReactNode): ReactNode {
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) continue;
    if (child.type === 'h3' || child.type === 'h2') return child.props.children;
    if (child.props.className === 'company-settings__modal-header') return Children.toArray(child.props.children)[0];
    const nested = findTitle(child.props.children);
    if (nested) return nested;
  }
  return null;
}

/** Shared focus trap, Escape handling, focus restoration, and desktop scrolling. */
export function SettingsModal({ children, onClose, className = '' }: { children: ReactNode; onClose: () => void; className?: string }) {
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent hideClose className={`settings-workspace settings-dialog ${className}`} aria-describedby={undefined} onInteractOutside={event => event.preventDefault()}>
      <DialogTitle className="sr-only">{findTitle(children) || 'Company Settings'}</DialogTitle>
      {children}
    </DialogContent>
  </Dialog>;
}
