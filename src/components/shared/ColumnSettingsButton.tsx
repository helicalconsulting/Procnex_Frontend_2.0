import { forwardRef } from 'react';
import { MoreVertical } from 'lucide-react';
import { Button } from '../ui/button';

/** The single column-settings entry point, placed in the final table header. */
const ColumnSettingsButton = forwardRef<HTMLButtonElement, {
  open: boolean;
  onClick: () => void;
}>(({ open, onClick }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant={open ? 'secondary' : 'ghost'}
    size="icon-sm"
    className="column-settings-button"
    title="Customize columns"
    aria-label="Customize columns"
    aria-haspopup="dialog"
    aria-expanded={open}
    onClick={onClick}
  >
    <MoreVertical aria-hidden="true" />
  </Button>
));
ColumnSettingsButton.displayName = 'ColumnSettingsButton';
export default ColumnSettingsButton;
