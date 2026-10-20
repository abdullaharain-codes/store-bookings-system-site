import { useEffect, useRef, useState } from "react";
import { Button } from "../Button";
import { Input } from "../Input";

interface QuantityInputProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  id?: string;
  label?: string;
}

/**
 * The shared quantity control (TASK B4-1c), extracted from ProductDetail so the
 * product page and the cart line edit the same way.
 *
 * The field keeps a STRING draft, so a shopper can clear it and retype without
 * it snapping mid-edit. Committed values (blur, +/-) clamp to [min, max]; an
 * empty or invalid draft resets to min on blur. max < min is treated as min, so
 * a zero-stock product can never commit 0.
 *
 * The parent owns the committed number; the draft resyncs only when the parent
 * pushes a NEW value (e.g. the server rejects a quantity and the page resets
 * the line), never while the shopper is typing.
 */
export function QuantityInput({
  value,
  onChange,
  min = 1,
  max,
  disabled,
  id,
  label = "Quantity",
}: QuantityInputProps) {
  const effectiveMax = Math.max(min, max ?? min);
  const [draft, setDraft] = useState(String(value));
  const lastValue = useRef(value);

  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      setDraft(String(value));
    }
  }, [value]);

  function clamp(raw: string): number {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < min) return min;
    return Math.min(Math.trunc(numeric), effectiveMax);
  }

  function commit(raw: string) {
    const next = clamp(raw);
    lastValue.current = next;
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  function bump(delta: number) {
    const next = clamp(String(clamp(draft) + delta));
    lastValue.current = next;
    setDraft(String(next));
    onChange(next);
  }

  return (
    <div className="flex items-end gap-[var(--space-2)]">
      <Button
        type="button"
        variant="secondary"
        aria-label="Decrease quantity"
        disabled={disabled}
        onClick={() => bump(-1)}
      >
        &minus;
      </Button>
      <Input
        id={id}
        label={label}
        type="number"
        min={min}
        max={effectiveMax}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit(draft)}
      />
      <Button
        type="button"
        variant="secondary"
        aria-label="Increase quantity"
        disabled={disabled}
        onClick={() => bump(1)}
      >
        +
      </Button>
    </div>
  );
}
