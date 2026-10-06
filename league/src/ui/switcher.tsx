import { UI_LABEL, UI_NAMES, type UiName } from "../view/url";

export function UiSwitcher({ value, onChange }: { value: UiName; onChange: (ui: UiName) => void }) {
  return (
    <div className="seg" role="radiogroup" aria-label="Prototype">
      <span className="hint">Prototype</span>
      {UI_NAMES.map(u => <button key={u} type="button" role="radio" aria-checked={value === u} className={value === u ? "on" : ""} onClick={() => onChange(u)}>{UI_LABEL[u]}</button>)}
    </div>
  );
}
