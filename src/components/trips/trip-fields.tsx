import { Input } from "@/components/ui/input.tsx";
import { cn } from "@/lib/utils.ts";

/** Small labelled inputs shared by the trip forms. */

export function Field({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className="kami-label text-ink-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

export function TextInput({
  id,
  label,
  value,
  onChange,
  className,
  ...rest
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
} & Omit<React.ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  return (
    <Field id={id} label={label} className={className}>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 bg-bg/70"
        {...rest}
      />
    </Field>
  );
}

export function TextArea({
  id,
  label,
  value,
  onChange,
  rows = 3,
  maxLength,
  placeholder,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Field id={id} label={label} className={className}>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-line bg-bg/70 px-2.5 py-2 font-body text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink/30 focus-visible:ring-2 focus-visible:ring-ink/20"
      />
    </Field>
  );
}

export function SelectInput<T extends string | number>({
  id,
  label,
  value,
  options,
  onChange,
  className,
}: {
  id: string;
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <Field id={id} label={label} className={className}>
      <select
        id={id}
        value={String(value)}
        onChange={(e) => {
          const picked = options.find((o) => String(o.value) === e.target.value);
          if (picked) onChange(picked.value);
        }}
        className="h-9 rounded-lg border border-line bg-bg/70 px-2 font-sans text-sm text-ink outline-none focus-visible:border-ink/30 focus-visible:ring-2 focus-visible:ring-ink/20"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function PrimaryButton({ children, className, ...rest }: React.ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "flex h-9 items-center justify-center gap-1.5 rounded-full bg-hanko px-3 font-sans text-xs font-medium text-paper transition-colors hover:bg-shu disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function QuietButton({ children, className, ...rest }: React.ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 font-sans text-xs text-ink-soft shadow-[var(--shadow-border)] transition-colors hover:text-ink disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  title,
  children,
  className,
  ...rest
}: { title: string } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-paper-warm hover:text-ink disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
