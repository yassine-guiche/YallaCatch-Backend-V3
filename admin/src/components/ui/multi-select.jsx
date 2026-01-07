import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function MultiSelect({ options = [], value = [], onChange, placeholder = 'Sélectionner' }) {
  const [open, setOpen] = useState(false);

  const toggleValue = (val) => {
    const exists = value.includes(val);
    const next = exists ? value.filter((v) => v !== val) : [...value, val];
    onChange?.(next);
  };

  const label = useMemo(() => {
    if (!value.length) return placeholder;
    const labels = options
      .filter((opt) => value.includes(opt.value))
      .map((opt) => opt.label || opt.value);
    return labels.join(', ');
  }, [value, options, placeholder]);

  return (
    <div className="relative w-full">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 border rounded-md text-left hover:border-gray-400"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={value.length ? '' : 'text-gray-500'}>
          {label || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-500" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border rounded-md shadow-lg">
          {options.map((opt) => {
            const checked = value.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="rounded"
                  checked={checked}
                  onChange={() => toggleValue(opt.value)}
                />
                <span>{opt.label || opt.value}</span>
              </label>
            );
          })}
          {!options.length && (
            <div className="px-3 py-2 text-sm text-gray-500">Aucune option</div>
          )}
        </div>
      )}
    </div>
  );
}

export default MultiSelect;
