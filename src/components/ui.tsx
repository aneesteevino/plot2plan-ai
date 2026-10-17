"use client";
import Link from "next/link";
import { AlertTriangle, CircleAlert, Info } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import type { Issue } from "@/lib/schema";
import { DISCLAIMER } from "@/lib/report";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-[#1b2f57] disabled:bg-[#8792a6]",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-[#f0f2f6] disabled:text-muted",
  ghost: "text-ink-2 hover:bg-[#eef1f5] disabled:text-muted",
  danger: "border border-[#f1c4be] bg-surface text-err hover:bg-err-soft",
};
const base = "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" className={cx(base, variants[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(base, variants[variant], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-lg border border-line bg-surface", className)} {...props} />;
}

export function SectionTitle({ children, hint, className }: { children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-3", className)}>
      <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (id: string, describedBy?: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint || error ? `${id}-d` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children(id, hintId)}
      {(error || hint) && (
        <p id={hintId} className={cx("mt-1 text-xs", error ? "text-err" : "text-muted")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-[#9aa4b6] focus:border-accent disabled:bg-[#f2f4f7]";

export function TextInput({ label, hint, error, value, onChange, className, ...rest }: { label: string; hint?: ReactNode; error?: string; value: string; onChange: (v: string) => void; className?: string } & Omit<ComponentProps<"input">, "value" | "onChange">) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!error} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />}
    </Field>
  );
}

export function NumberInput({
  label,
  hint,
  error,
  value,
  onChange,
  suffix,
  min,
  max,
  step,
  className,
  placeholder,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, d) => (
        <div className="relative">
          <input
            id={id}
            aria-describedby={d}
            aria-invalid={!!error}
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step ?? "any"}
            placeholder={placeholder}
            className={cx(inputCls, suffix && "pr-12")}
            value={value ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") return onChange(undefined);
              const n = Number(raw);
              onChange(Number.isFinite(n) ? n : undefined);
            }}
          />
          {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
        </div>
      )}
    </Field>
  );
}

export function Select<T extends string>({
  label,
  hint,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  hint?: ReactNode;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id, d) => (
        <select id={id} aria-describedby={d} className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function TextArea({ label, hint, value, onChange, rows = 3, className, maxLength }: { label: string; hint?: ReactNode; value: string; onChange: (v: string) => void; rows?: number; className?: string; maxLength?: number }) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id, d) => <textarea id={id} aria-describedby={d} rows={rows} maxLength={maxLength} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx("flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors", checked ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong")}>
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function Stepper({ label, value, onChange, min = 0, max = 12, hint }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; hint?: string }) {
  const id = useId();
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        <div className="flex items-center gap-1">
          <button type="button" aria-label={`Decrease ${label}`} className="h-7 w-7 rounded border border-line-strong text-ink-2 hover:bg-[#f0f2f6] disabled:opacity-40" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
            −
          </button>
          <input id={id} type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))} className="h-7 w-11 rounded border border-line-strong text-center text-sm" />
          <button type="button" aria-label={`Increase ${label}`} className="h-7 w-7 rounded border border-line-strong text-ink-2 hover:bg-[#f0f2f6] disabled:opacity-40" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
            +
          </button>
        </div>
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "accent" | "ok" | "warn" | "err"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-[#eef1f5] text-ink-2",
    accent: "bg-accent-soft text-accent",
    ok: "bg-[#e6f4ea] text-ok",
    warn: "bg-warn-soft text-warn",
    err: "bg-err-soft text-err",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium", tones[tone], className)}>{children}</span>;
}

export function DisclaimerBanner({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <div role="note" className={cx("flex items-start gap-2 rounded-md border border-[#f0d9b5] bg-warn-soft px-3 py-2 text-warn", className)}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className={cx("font-semibold tracking-wide", compact ? "text-[11px]" : "text-xs")}>{DISCLAIMER}</p>
    </div>
  );
}

export function IssueList({ issues, onSelect, empty = "No issues." }: { issues: Issue[]; onSelect?: (i: Issue) => void; empty?: string }) {
  if (!issues.length) return <p className="text-sm text-muted">{empty}</p>;
  const order = { error: 0, warning: 1, info: 2 } as const;
  return (
    <ul className="space-y-1.5">
      {[...issues]
        .sort((a, b) => order[a.severity] - order[b.severity])
        .map((i, k) => {
          const Icon = i.severity === "error" ? CircleAlert : i.severity === "warning" ? AlertTriangle : Info;
          const tone = i.severity === "error" ? "border-[#f1c4be] bg-err-soft text-err" : i.severity === "warning" ? "border-[#f0d9b5] bg-warn-soft text-warn" : "border-line bg-[#f5f7fa] text-ink-2";
          return (
            <li key={k}>
              <button type="button" disabled={!onSelect || !i.roomId} onClick={() => onSelect?.(i)} className={cx("flex w-full items-start gap-2 rounded-md border px-2.5 py-1.5 text-left text-[13px] leading-snug", tone, onSelect && i.roomId ? "cursor-pointer hover:brightness-[0.98]" : "cursor-default")}>
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  <span className="sr-only">{i.severity}: </span>
                  {i.message}
                </span>
              </button>
            </li>
          );
        })}
    </ul>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-ink" aria-hidden />
      {label}
    </span>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#f1c4be] bg-err-soft px-3 py-2 text-sm text-err">
      <span>{message}</span>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export { cx };
