import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Tag, Package, Boxes, Check } from 'lucide-react';
import type { ItemMaster } from '../../services/itemMasterService';
import './InventoryItemCombobox.css';

export interface InventoryItemComboboxProps {
  mode: 'code' | 'name';
  value: string;
  items: ItemMaster[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  onChange: (value: string) => void;
  onSelect: (item: ItemMaster) => void;
}

/**
 * Compute viewport-relative position for fixed portal positioning.
 * Determines whether to open downwards or upwards based on viewport space.
 */
function computeAnchorPosition(
  el: HTMLElement,
  dropdownHeight = 280
): { top: number; left: number; width: number; placeAbove: boolean } {
  const rect = el.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const placeAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

  // Minimum dropdown widths for comfortable readability
  const minDropdownWidth = 340;
  const width = Math.max(rect.width, minDropdownWidth);

  // Keep dropdown inside viewport horizontally
  let left = rect.left;
  if (left + width > window.innerWidth - 12) {
    left = Math.max(8, window.innerWidth - width - 12);
  }

  return {
    top: placeAbove ? rect.top - 4 : rect.bottom + 4,
    left,
    width,
    placeAbove,
  };
}

export default function InventoryItemCombobox({
  mode,
  value,
  items,
  placeholder,
  disabled = false,
  required = false,
  className = '',
  onChange,
  onSelect,
}: InventoryItemComboboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; placeAbove: boolean } | null>(null);

  // Filter items in real time as user types
  const filteredItems = useMemo(() => {
    if (!items || items.length === 0) return [];
    const query = (value || '').trim().toLowerCase();
    if (!query) return items.slice(0, 80);

    // Score and rank matches
    const scored = items.map((item) => {
      const code = (item.itemCode || '').toLowerCase();
      const name = (item.itemName || '').toLowerCase();
      let score = 0;

      if (mode === 'code') {
        if (code === query) score = 100;
        else if (code.startsWith(query)) score = 80;
        else if (code.includes(query)) score = 60;
        else if (name.startsWith(query)) score = 40;
        else if (name.includes(query)) score = 20;
      } else {
        if (name === query) score = 100;
        else if (name.startsWith(query)) score = 80;
        else if (name.includes(query)) score = 60;
        else if (code.startsWith(query)) score = 40;
        else if (code.includes(query)) score = 20;
      }
      return { item, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 80)
      .map((s) => s.item);
  }, [items, value, mode]);

  // Synchronous layout calculation to eliminate frame flash
  useLayoutEffect(() => {
    if (!isOpen || !inputRef.current) {
      setPos(null);
      return;
    }
    setPos(computeAnchorPosition(inputRef.current));
  }, [isOpen]);

  // Recalculate position on scroll or resize
  useEffect(() => {
    if (!isOpen) return;

    const handleReposition = () => {
      if (inputRef.current) {
        setPos(computeAnchorPosition(inputRef.current));
      }
    };

    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);

    let ro: ResizeObserver | null = null;
    if (inputRef.current) {
      ro = new ResizeObserver(handleReposition);
      ro.observe(inputRef.current);
    }

    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
      if (ro) ro.disconnect();
    };
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < filteredItems.length) {
            const selected = filteredItems[activeIndex];
            onSelect(selected);
            onChange(mode === 'code' ? selected.itemCode : selected.itemName);
            setIsOpen(false);
          } else {
            setIsOpen(false);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
      }
    },
    [isOpen, filteredItems, activeIndex, onSelect, onChange, mode]
  );

  // Auto scroll into view for active item in list
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  const handleItemClick = (item: ItemMaster) => {
    onSelect(item);
    onChange(mode === 'code' ? item.itemCode : item.itemName);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const toggleDropdown = () => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      inputRef.current?.focus();
    }
  };

  return (
    <div className={`iic-container ${className}`} ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        className="iic-input"
        placeholder={placeholder || (mode === 'code' ? 'Select or enter item code...' : 'Select or enter item name...')}
        value={value}
        disabled={disabled}
        required={required}
        autoComplete="off"
        onClick={() => {
          if (!disabled) setIsOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setIsOpen(true);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          if (!isOpen) setIsOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
      />

      <div className="iic-actions">
        {value && !disabled && (
          <button
            type="button"
            className="iic-btn-icon"
            onClick={handleClear}
            title="Clear"
            tabIndex={-1}
          >
            <X size={13} />
          </button>
        )}
        <button
          type="button"
          className="iic-btn-icon"
          onClick={toggleDropdown}
          disabled={disabled}
          title={isOpen ? 'Close' : 'Open dropdown'}
          tabIndex={-1}
        >
          <ChevronDown size={14} className={`iic-chevron ${isOpen ? 'iic-chevron--open' : ''}`} />
        </button>
      </div>

      {isOpen &&
        pos &&
        createPortal(
          <div
            ref={dropdownRef}
            className="iic-dropdown"
            style={{
              top: pos.placeAbove ? undefined : pos.top,
              bottom: pos.placeAbove ? window.innerHeight - pos.top : undefined,
              left: pos.left,
              width: pos.width,
            }}
          >
            <div className="iic-header">
              <span className="iic-header__title">
                {mode === 'code' ? <Tag size={12} /> : <Package size={12} />}
                <span>{mode === 'code' ? 'Inventory Item Codes' : 'Inventory Item Names'}</span>
              </span>
              <span className="iic-header__count">
                {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            <div className="iic-list" ref={listRef}>
              {filteredItems.length > 0 ? (
                filteredItems.map((item, idx) => {
                  const isSelected =
                    mode === 'code'
                      ? item.itemCode?.toLowerCase() === value.trim().toLowerCase()
                      : item.itemName?.toLowerCase() === value.trim().toLowerCase();
                  const isActive = idx === activeIndex;

                  return (
                    <button
                      key={item.id || `${item.itemCode}-${idx}`}
                      type="button"
                      className={`iic-item ${isActive ? 'iic-item--active' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleItemClick(item);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleItemClick(item);
                      }}
                    >
                      {mode === 'code' ? (
                        <>
                          <div className="iic-code-top">
                            <span className="iic-code-badge">{item.itemCode}</span>
                            {isSelected && <Check size={13} className="text-emerald-500" />}
                            {item.itemType && !isSelected && (
                              <span className="iic-type-tag">{item.itemType}</span>
                            )}
                          </div>
                          <div className="iic-name-text" title={item.itemName}>
                            {item.itemName}
                          </div>
                          <div className="iic-meta-row">
                            {item.uom && <span>Unit: {item.uom}</span>}
                            {typeof item.currentStock === 'number' && (
                              <span className="iic-stock-tag">Stock: {item.currentStock}</span>
                            )}
                            {item.productClass && <span>Class: {item.productClass}</span>}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="iic-code-top">
                            <span className="iic-name-title" title={item.itemName}>
                              {item.itemName}
                            </span>
                            {isSelected && <Check size={13} className="text-emerald-500 shrink-0" />}
                            {item.uom && !isSelected && (
                              <span className="iic-type-tag shrink-0">{item.uom}</span>
                            )}
                          </div>
                          <div className="iic-meta-row">
                            <span className="iic-meta-badge">{item.itemCode}</span>
                            {typeof item.currentStock === 'number' && (
                              <span className="iic-stock-tag">Stock: {item.currentStock}</span>
                            )}
                            {(item.productClass || item.itemType) && (
                              <span>{item.productClass || item.itemType}</span>
                            )}
                          </div>
                        </>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="iic-empty">
                  <Boxes size={24} style={{ opacity: 0.3 }} />
                  <div>No inventory items matching <strong>"{value}"</strong></div>
                  <div className="iic-empty-hint">
                    Press Enter or click outside to use this custom {mode === 'code' ? 'item code' : 'item name'}
                  </div>
                </div>
              )}
            </div>

            <div className="iic-footer">
              <span>💡 Selecting an item auto-fills code, name, unit & description</span>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
