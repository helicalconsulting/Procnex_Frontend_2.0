import { useState, useRef, useEffect, useMemo, type ChangeEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Phone, Search, ChevronDown, Check } from 'lucide-react';
import { COUNTRY_CODES } from '../../config/countryCodes';
import './PhoneInput.css';

interface PhoneInputProps {
  /** Current country dial code (e.g. '+254') */
  countryCode: string;
  /** Called when user selects a different country code */
  onCountryCodeChange: (code: string) => void;
  /** Current phone number (without country code prefix) */
  value: string;
  /** Called when user types in the phone number */
  onChange: (value: string) => void;
  /** Placeholder text for the phone input (default: '712345678') */
  placeholder?: string;
  /** Optional visual error flag */
  hasError?: boolean;
}

export default function PhoneInput({
  countryCode,
  onCountryCodeChange,
  value,
  onChange,
  placeholder = '712345678',
  hasError = false,
}: PhoneInputProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Floating coordinates for Portal
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 280 });

  useEffect(() => {
    if (!dropdownOpen || !triggerRef.current) return;

    const updateCoords = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownWidth = Math.max(280, rect.width);

      // Determine if dropdown should open downwards or upwards
      const spaceBelow = window.innerHeight - rect.bottom;
      const opensUpwards = spaceBelow < 250 && rect.top > 250;

      const top = opensUpwards
        ? Math.max(10, rect.top - 246)
        : Math.min(window.innerHeight - 250, rect.bottom + 4);

      setCoords({
        top,
        left: Math.max(10, Math.min(rect.left, window.innerWidth - dropdownWidth - 10)),
        width: dropdownWidth,
      });
    };

    updateCoords();
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [dropdownOpen]);

  // Find the currently selected country
  const selectedCountry = useMemo(
    () => COUNTRY_CODES.find((cc) => cc.dial === countryCode),
    [countryCode]
  );

  // Filter countries by search query
  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) return COUNTRY_CODES;
    const q = searchQuery.toLowerCase();
    return COUNTRY_CODES.filter(
      (cc) =>
        cc.name.toLowerCase().includes(q) ||
        cc.dial.includes(q) ||
        cc.code.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (dropdownOpen) {
      // Small delay to allow the DOM to render
      const id = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    } else {
      setSearchQuery('');
    }
  }, [dropdownOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  // Close on Escape
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    document.addEventListener('keydown', handler as EventListener);
    return () => document.removeEventListener('keydown', handler as EventListener);
  }, [dropdownOpen]);

  const handleSelect = (dial: string) => {
    onCountryCodeChange(dial);
    setDropdownOpen(false);
    setSearchQuery('');
  };

  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    // Only allow digits, spaces, hyphens, and parentheses
    const sanitized = e.target.value.replace(/[^\d\s\-\+\(\)]/g, '');
    onChange(sanitized);
  };

  const handleTriggerKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setDropdownOpen((v) => !v);
    }
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filteredCountries.length > 0) {
      handleSelect(filteredCountries[0].dial);
    }
    if (e.key === 'Escape') {
      setDropdownOpen(false);
    }
  };

  // Arrow key navigation within the dropdown list
  const handleDropdownKeyDown = (e: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = index + 1;
      const items = dropdownRef.current?.querySelectorAll<HTMLButtonElement>('.phone-country-option');
      if (items && items[next]) {
        items[next].focus();
      }
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = index - 1;
      const items = dropdownRef.current?.querySelectorAll<HTMLButtonElement>('.phone-country-option');
      if (prev >= 0 && items && items[prev]) {
        items[prev].focus();
      } else if (prev < 0) {
        // Go back to search input
        searchInputRef.current?.focus();
      }
    }
  };

  return (
    <div className={`phone-input-wrap ${dropdownOpen ? 'phone-input-wrap--open' : ''}`}>
      {/* Country code trigger button */}
      <button
        ref={triggerRef}
        type="button"
        className={`phone-input-trigger ${dropdownOpen ? 'phone-input-trigger--open' : ''}`}
        onClick={() => setDropdownOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={dropdownOpen}
        aria-label="Select country code"
      >
        <Phone size={16} className="phone-input-trigger-icon" />
        <span className="phone-input-trigger-text">
          {selectedCountry ? `${selectedCountry.flag} ${selectedCountry.dial}` : countryCode}
        </span>
        <ChevronDown size={12} className={`phone-input-trigger-arrow ${dropdownOpen ? 'phone-input-trigger-arrow--open' : ''}`} />
      </button>

      {/* Dropdown via Portal */}
      {dropdownOpen && createPortal(
        <div
          ref={dropdownRef}
          className="phone-input-dropdown"
          role="listbox"
          aria-label="Select country code"
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            zIndex: 999999,
          }}
        >
          <div className="phone-input-search-wrap">
            <Search size={14} className="phone-input-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="phone-input-search"
              placeholder="Search country..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
          <div className="phone-input-options">
            {filteredCountries.length > 0 ? (
              filteredCountries.map((cc, idx) => {
                const isSelected = cc.dial === countryCode;
                return (
                  <button
                    key={cc.code}
                    type="button"
                    className={`phone-country-option ${isSelected ? 'phone-country-option--selected' : ''}`}
                    onClick={() => handleSelect(cc.dial)}
                    onKeyDown={(e) => handleDropdownKeyDown(e, idx)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span className="phone-country-option-flag">{cc.flag}</span>
                    <span className="phone-country-option-dial">{cc.dial}</span>
                    <span className="phone-country-option-name">{cc.name}</span>
                    {isSelected && <Check size={14} className="phone-country-option-check" />}
                  </button>
                );
              })
            ) : (
              <div className="phone-input-no-results">No countries found</div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Phone number input */}
      <input
        type="tel"
        className={`phone-input-field ${hasError ? 'phone-input-field--error' : ''}`}
        value={value}
        onChange={handlePhoneChange}
        placeholder={placeholder}
      />
    </div>
  );
}
