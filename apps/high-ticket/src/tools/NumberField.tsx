export function NumberField({
  label,
  value,
  onChange,
  suffix,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-suffix">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        />
        {suffix && <em>{suffix}</em>}
      </div>
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
