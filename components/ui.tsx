'use client';

import React from 'react';

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; hint?: string }[];
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={`inline-flex rounded-xl border border-white/10 bg-ink-950/60 p-0.5 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={`rounded-[10px] font-semibold transition ${
            size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-[12px]'
          } ${value === o.value ? 'bg-lime-400/20 text-lime-200 shadow-[inset_0_0_0_1px_rgba(198,242,78,.28)]' : 'text-slate-400 hover:text-slate-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="block">
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-400">{label}</span>
        <span className="font-mono text-[11px] text-lime-200/90">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-left transition hover:bg-white/[0.05]"
    >
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-slate-200">{label}</span>
        {desc ? <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{desc}</span> : null}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-lime-400/80' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[12px] font-bold tracking-tight text-slate-200">{children}</h3>
      {right}
    </div>
  );
}

export function Pill({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'ok' | 'warn' | 'bad' | 'info' }) {
  const map = {
    default: 'border-white/10 bg-white/[0.05] text-slate-300',
    ok: 'border-lime-400/30 bg-lime-400/10 text-lime-200',
    warn: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    bad: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
    info: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  } as const;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${map[tone]}`}>{children}</span>;
}

export function IconBtn({
  onClick,
  label,
  children,
  active,
  className = '',
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border text-[13px] transition ${
        active ? 'border-lime-400/40 bg-lime-400/15 text-lime-200' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]'
      } ${className}`}
    >
      {children}
    </button>
  );
}
