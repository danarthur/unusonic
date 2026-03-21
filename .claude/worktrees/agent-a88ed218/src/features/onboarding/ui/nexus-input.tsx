'use client';

import { useEffect, useState, useRef } from 'react';

interface NexusInputProps {
  value: string;
  onChange: (value: string) => void;
  onDebounce: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function NexusInput({
  value,
  onChange,
  onDebounce,
  placeholder = 'your-handle',
  disabled,
}: NexusInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const onDebounceRef = useRef(onDebounce);
  onDebounceRef.current = onDebounce;

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setLocalValue(raw);
    onChange(raw);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      onDebounceRef.current(localValue);
    }, 350);
    return () => clearTimeout(timer);
  }, [localValue]);

  return (
    <div className="relative flex w-full items-center">
      <span className="text-4xl text-ceramic/30 mr-1 shrink-0 select-none font-light">@</span>
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent text-left text-4xl font-light tracking-tight text-ceramic placeholder:text-ceramic/10 outline-none caret-neon-blue border-b border-ceramic/10 focus:border-neon-blue/50 transition-colors pb-2 disabled:opacity-50"
        autoComplete="off"
        autoFocus
      />
    </div>
  );
}
