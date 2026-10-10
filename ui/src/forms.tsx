import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { code?: boolean; invalid?: boolean };

export function TextInput({ code, invalid, className, ...rest }: InputProps) {
  return <input type="text" {...rest} aria-invalid={invalid || undefined} className={cx("input", code && "code", className)} />;
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { code?: boolean; invalid?: boolean };

export function TextArea({ code, invalid, className, ...rest }: TextAreaProps) {
  return <textarea {...rest} aria-invalid={invalid || undefined} className={cx("input", "textarea", code && "code", className)} />;
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };

export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <select {...rest} aria-invalid={invalid || undefined} className={cx("input", "select", className)}>
      {children}
    </select>
  );
}

type ChoiceProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode };

export function Checkbox({ label, className, ...rest }: ChoiceProps) {
  return (
    <label className={cx("choice", className)}>
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}

export function Radio({ label, className, ...rest }: ChoiceProps) {
  return (
    <label className={cx("choice", className)}>
      <input type="radio" {...rest} />
      <span>{label}</span>
    </label>
  );
}
