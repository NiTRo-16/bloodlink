import { BLOOD_GROUPS } from '../lib/format.js';
import BloodDrop from './BloodDrop.jsx';

export default function BloodGroupPicker({ value, onChange, label = 'Blood group' }) {
  return (
    <fieldset>
      <legend className="field-label">{label}</legend>
      <div className="grid grid-cols-4 gap-2">
        {BLOOD_GROUPS.map((g) => {
          const selected = value === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => onChange(g)}
              aria-pressed={selected}
              className="choice flex justify-center py-2.5"
            >
              <BloodDrop group={g} size="sm" muted={!selected} />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
