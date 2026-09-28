import { Children, cloneElement, isValidElement, useId, type HTMLAttributes, type ReactElement } from 'react';

/** Associates the existing field label with its control, including fields in repeated rows. */
export function SettingsField({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  const id = useId();
  const elements = Children.toArray(children);
  const control = elements.find(child => isValidElement(child) && ['input', 'select', 'textarea', 'Input', 'Select', 'Textarea'].includes(typeof child.type === 'string' ? child.type : (child.type as { displayName?: string }).displayName || '')) as ReactElement<{ id?: string }> | undefined;
  const controlId = control?.props.id || id;
  return <div {...props} className={`company-settings__field ${className}`}>
    {elements.map(child => {
      if (!isValidElement(child)) return child;
      if (child.type === 'label' && control) return cloneElement(child as ReactElement<{ htmlFor?: string }>, { htmlFor: controlId });
      if (child === control) return cloneElement(control, { id: controlId });
      return child;
    })}
  </div>;
}
