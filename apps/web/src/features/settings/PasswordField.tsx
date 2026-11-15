import { Field, controlClass } from '../../ui/Field';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string | undefined;
  error?: string | null | undefined;
  autoComplete?: 'new-password' | 'current-password';
}

/** A password in a field that hides it; the kit has no such field, so it is built from `Field`. */
export function PasswordField({
  label,
  value,
  onChange,
  hint,
  error,
  autoComplete = 'new-password',
}: PasswordFieldProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => (
        <input
          {...control}
          type="password"
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className={controlClass(error !== undefined && error !== null && error !== '')}
        />
      )}
    </Field>
  );
}
