import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  SliderField,
  ToggleField,
} from "@decky/ui";
import type { ReactNode } from "react";

export function isRenderable(component: unknown): boolean {
  return typeof component === "function" || (typeof component === "object" && component !== null);
}

export function SafeSection({ title, children }: { title?: string; children?: ReactNode }) {
  if (isRenderable(PanelSection)) {
    return <PanelSection title={title}>{children}</PanelSection>;
  }
  return (
    <div style={{ marginBottom: 16 }}>
      {title && <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>}
      {children}
    </div>
  );
}

export function SafeRow({ children }: { children?: ReactNode }) {
  if (isRenderable(PanelSectionRow)) {
    return <PanelSectionRow>{children}</PanelSectionRow>;
  }
  return <div style={{ marginBottom: 8 }}>{children}</div>;
}

export function SafeToggle({
  label,
  description,
  checked,
  disabled,
  separator,
  onChange,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  separator?: "standard" | "none";
  onChange: (value: boolean) => void;
}) {
  if (isRenderable(ToggleField)) {
    return (
      <ToggleField
        label={label}
        description={description}
        checked={checked}
        disabled={disabled}
        bottomSeparator={separator}
        onChange={onChange}
      />
    );
  }
  return (
    <SafeButton disabled={disabled} onClick={() => onChange(!checked)}>
      {label}: {checked ? "ON" : "OFF"}
    </SafeButton>
  );
}

export function SafeSlider({
  label,
  description,
  value,
  min,
  max,
  showValue,
  disabled,
  onChange,
}: {
  label: string;
  description?: ReactNode;
  value: number;
  min: number;
  max: number;
  showValue?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  if (isRenderable(SliderField)) {
    return (
      <SliderField
        label={label}
        description={description}
        value={value}
        min={min}
        max={max}
        step={1}
        showValue={showValue}
        notchTicksVisible={false}
        validValues="steps"
        disabled={disabled}
        onChange={onChange}
      />
    );
  }
  return (
    <SafeButton disabled={disabled} onClick={() => onChange(value >= max ? min : value + 1)}>
      {label}: {value}
    </SafeButton>
  );
}

export function SafeActionRow({
  label,
  description,
  action,
  disabled,
  onClick,
}: {
  label: ReactNode;
  description?: ReactNode;
  action: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  if (isRenderable(ButtonItem)) {
    return (
      <ButtonItem
        label={label}
        description={description}
        layout="below"
        disabled={disabled}
        onClick={onClick}
      >
        {action}
      </ButtonItem>
    );
  }
  return (
    <SafeButton disabled={disabled} onClick={onClick}>
      {label} · {description}
    </SafeButton>
  );
}

export function SafeButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  if (isRenderable(ButtonItem)) {
    return (
      <ButtonItem layout="below" disabled={disabled} onClick={onClick}>
        {children}
      </ButtonItem>
    );
  }
  return (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
