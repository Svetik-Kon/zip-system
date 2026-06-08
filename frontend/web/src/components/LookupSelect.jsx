import { useEffect, useMemo, useRef, useState } from "react";

function matchesOption(option, text) {
  if (!text) return true;
  const value = text.toLowerCase();
  return [option.label, option.meta, option.searchText]
    .filter(Boolean)
    .some((part) => String(part).toLowerCase().includes(value));
}

export default function LookupSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Начните вводить",
  emptyText = "Ничего не найдено",
  disabled = false,
  required = false,
  limit = 8,
  onQueryChange,
  displayValue,
}) {
  const wrapperRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value);
  const [query, setQuery] = useState(selectedOption?.label || "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(displayValue ?? selectedOption?.label ?? "");
  }, [displayValue, selectedOption?.label]);

  useEffect(() => {
    const handleClick = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredOptions = useMemo(() => {
    return options.filter((option) => !option.disabled && matchesOption(option, query.trim())).slice(0, limit);
  }, [options, query, limit]);

  const handleSelect = (option) => {
    onChange(option.value, option);
    setQuery(option.label);
    setOpen(false);
  };

  return (
    <label className="lookup-field lookup-select" ref={wrapperRef}>
      {label}
      <input
        value={query}
        disabled={disabled}
        required={required && !value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("", null);
          onQueryChange?.(event.target.value);
          setOpen(true);
        }}
      />
      {open ? (
        <div className="lookup-list compact-lookup-list">
          {filteredOptions.map((option) => (
            <button key={option.value} type="button" onClick={() => handleSelect(option)}>
              <strong>{option.label}</strong>
              {option.meta ? <span>{option.meta}</span> : null}
            </button>
          ))}
          {!filteredOptions.length ? <span className="lookup-empty">{emptyText}</span> : null}
        </div>
      ) : null}
    </label>
  );
}
