import { useEffect, useState } from 'react';
import { Input, Label, NumberField, RadioButton, RadioField, RadioGroup, SwitchButton, SwitchField } from 'react-aria-components';

/** One of a few values, by name; only the values it offers come back, so no cast is needed. */
export function RadioSetting<T extends string>({
  label,
  value,
  options,
  onChange,
  className = 'field',
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <RadioGroup
      className={className}
      value={value}
      onChange={(picked) => {
        const option = options.find(([each]) => each === picked);
        if (option) onChange(option[0]);
      }}
      orientation="horizontal"
    >
      <Label>{label}</Label>
      {options.map(([each, name]) => (
        <RadioField key={each} value={each}>
          <RadioButton>{name}</RadioButton>
        </RadioField>
      ))}
    </RadioGroup>
  );
}

/** A number within bounds; a half-typed or unchanged value isn't written. */
export function NumberSetting({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return (
    <NumberField className="field" value={value} minValue={min} maxValue={max} {...(step === undefined ? {} : { step })} onChange={(next) => !Number.isNaN(next) && next !== value && onChange(next)}>
      <Label>{label}</Label>
      <Input />
    </NumberField>
  );
}

export function SwitchSetting({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <SwitchField className="switch" isSelected={value} onChange={onChange}>
      <SwitchButton>
        <span className="switch-track" aria-hidden="true" />
        {label}
      </SwitchButton>
    </SwitchField>
  );
}

/** What the reader is typing, back to the setting's value whenever that changes. */
export function useDraft<T>(value: T) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return [draft, setDraft] as const;
}
