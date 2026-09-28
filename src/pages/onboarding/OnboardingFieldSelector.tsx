import { useId, useState } from 'react';
import { CalendarDays, ChevronDown, FileText, Hash, Paperclip, RefreshCw, Search, Type } from 'lucide-react';
import type { FormFieldConfig } from '../../services/companySettingsService';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

export type OnboardingField = Pick<FormFieldConfig, 'fieldKey' | 'label' | 'fieldType'>;

const fieldTypes = {
  alphabetical: { label: 'Alphabetic', icon: Type },
  alphanumeric: { label: 'Alphanumeric', icon: Type },
  number: { label: 'Number', icon: Hash },
  date: { label: 'Date', icon: CalendarDays },
  dropdown: { label: 'Dropdown', icon: ChevronDown },
  attachment: { label: 'Attachment', icon: Paperclip },
};

interface Props {
  fields: FormFieldConfig[];
  selected: OnboardingField[];
  onChange: (fields: OnboardingField[]) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  disabled?: boolean;
}

export default function OnboardingFieldSelector({ fields, selected, onChange, loading, error, onRetry, disabled }: Props) {
  const id = useId();
  const [query, setQuery] = useState('');
  const available = fields.filter(field => field.isVisible !== false).sort((a, b) => a.sortOrder - b.sortOrder);
  // Keep draft selections visible if settings change during a background refresh.
  const options = [...available, ...selected.filter(field => !available.some(option => option.fieldKey === field.fieldKey))];
  const searchable = options.length > 5;
  const visible = options.filter(field => !searchable || `${field.label} ${field.fieldType}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <section className="onb-fields" aria-labelledby={`${id}-heading`}>
      <div className="onb-fields__heading">
        <h3 id={`${id}-heading`}>Custom Flexi Fields</h3>
        <Badge tone={selected.length ? 'info' : 'neutral'} aria-live="polite">{selected.length} selected</Badge>
      </div>
      <p id={`${id}-help`} className="onb-fields__help">Select the additional fields for this invitation. The supplier completes them during registration.</p>

      {loading && options.length === 0 && <p className="onb-fields__notice" role="status">Loading configured fields…</p>}
      {error && (
        <div className="onb-fields__notice onb-field-error" role="alert">
          <span>Custom fields could not be loaded. Retry to see the available fields.</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}><RefreshCw size={14} /> Retry</Button>
        </div>
      )}
      {!loading && !error && options.length === 0 && (
        <p className="onb-fields__notice">No custom fields are available for this form yet.</p>
      )}
      {options.length > 0 && (
        <>
          {searchable && (
            <div className="onb-fields__search">
              <Search size={16} aria-hidden="true" />
              <Input aria-label="Search custom fields" placeholder="Search available fields…" value={query} onChange={event => setQuery(event.target.value)} />
            </div>
          )}
          <div className="onb-fields__options" role="group" aria-labelledby={`${id}-heading`} aria-describedby={`${id}-help`}>
            {visible.map(field => {
              const checked = selected.some(option => option.fieldKey === field.fieldKey);
              const type = fieldTypes[field.fieldType as keyof typeof fieldTypes] ?? { label: field.fieldType, icon: FileText };
              const Icon = type.icon;
              return (
                <label className={`onb-fields__option${checked ? ' is-selected' : ''}`} key={field.fieldKey}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    aria-label={field.label}
                    onChange={event => onChange(event.target.checked
                      ? [...selected.filter(option => option.fieldKey !== field.fieldKey), { fieldKey: field.fieldKey, label: field.label, fieldType: field.fieldType }]
                      : selected.filter(option => option.fieldKey !== field.fieldKey))}
                  />
                  <span className="onb-fields__name">{field.label}</span>
                  <span className="onb-fields__type"><Icon size={14} aria-hidden="true" />{type.label}</span>
                </label>
              );
            })}
            {visible.length === 0 && <p className="onb-fields__notice">No fields match your search.</p>}
          </div>
        </>
      )}
      <p className="onb-fields__help">Manage field names and types in <strong>Company Settings → Forms Settings → Vendor Onboarding Form.</strong></p>
    </section>
  );
}
