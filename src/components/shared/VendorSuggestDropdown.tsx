import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Building2, Mail, Users, Clock, CheckCircle2, XCircle, AlertTriangle, X, ExternalLink } from 'lucide-react';
import type { VendorSearchResult } from '../../services/procurementService';
import './VendorSuggestDropdown.css';

interface VendorSuggestDropdownProps {
  query: string;
  results: VendorSearchResult[];
  loading: boolean;
  hasSearched: boolean;
  onSelect: (vendor: VendorSearchResult) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLInputElement | null>;
  visible: boolean;
}

/** Human-readable status label for vendor search results */
function statusLabel(v: VendorSearchResult): { label: string; cls: string } {
  const st = v.status.toUpperCase();
  if (v.isActive) return { label: 'Approved', cls: 'vss-approved' };
  if (st === 'APPROVED' || st === 'ACTIVE') return { label: 'Approved', cls: 'vss-approved' };
  if (st === 'PENDING_APPROVAL' || st === 'DOCUMENTS_SUBMITTED' || st === 'INVITATION_ACCEPTED') return { label: 'Pending', cls: 'vss-pending' };
  if (st === 'REJECTED') return { label: 'Rejected', cls: 'vss-rejected' };
  if (st === 'INVITED') return { label: 'Invited', cls: 'vss-invited' };
  return { label: st.charAt(0) + st.slice(1).toLowerCase(), cls: 'vss-pending' };
}

/**
 * Compute pixel position from the anchor input's bounding rect.
 * Returns viewport-relative coordinates (suitable for position: fixed).
 */
function computeAnchorPosition(
  el: HTMLInputElement
): { top: number; left: number; width: number } {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.bottom + 4,   // 4px gap below the input
    left: rect.left,          // aligned to input's left edge
    width: rect.width,        // same width as the input
  };
}

export default function VendorSuggestDropdown({
  query,
  results,
  loading,
  hasSearched: _hasSearched,
  onSelect,
  onClose,
  anchorRef,
  visible,
}: VendorSuggestDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  // ── Position state: null means "not yet computed" → don't render the portal ──
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // A ref to track the current visible state so the position-computation callback
  // can bail out if the dropdown was closed between scheduling and running.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

  // ── useLayoutEffect: compute position synchronously BEFORE the browser paints ──
  // This eliminates the one-frame flash at (0,0) that would happen with useEffect.
  useLayoutEffect(() => {
    if (!visible) {
      setPos(null);
      return;
    }
    if (anchorRef.current) {
      setPos(computeAnchorPosition(anchorRef.current));
    }
  }, [visible, anchorRef]);

  // ── useEffect: ongoing scroll/resize/ResizeObserver re-positioning ──
  // These are async and don't need to block paint.
  useEffect(() => {
    if (!visible) return;

    // Use a stable callback that reads the latest anchor position
    const handleReposition = () => {
      if (visibleRef.current && anchorRef.current) {
        setPos(computeAnchorPosition(anchorRef.current));
      }
    };

    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);

    let ro: ResizeObserver | null = null;
    if (anchorRef.current) {
      ro = new ResizeObserver(handleReposition);
      ro.observe(anchorRef.current);
    }

    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
      if (ro) ro.disconnect();
    };
  }, [visible, anchorRef]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < results.length) {
            onSelect(results[activeIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [visible, results, activeIndex, onSelect, onClose]
  );

  // Attach keyboard listener to input
  useEffect(() => {
    if (!visible) return;
    const input = anchorRef.current;
    if (!input) return;
    input.addEventListener('keydown', handleKeyDown);
    return () => input.removeEventListener('keydown', handleKeyDown);
  }, [visible, handleKeyDown, anchorRef]);

  // Close on click outside (checks against portal content)
  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [visible, onClose, anchorRef]);

  // ── Render nothing until BOTH visible AND position is computed ──
  // Also hide when not loading and no results — don't show the empty state box
  if (!visible || !pos) return null;
  if (!loading && results.length === 0) return null;

  const renderResult = (v: VendorSearchResult, idx: number) => {
    const st = statusLabel(v);
    return (
      <button
        key={v.id}
        type="button"
        className={`vss-item ${idx === activeIndex ? 'vss-item--active' : ''}`}
        onMouseDown={(e) => {
          e.preventDefault(); // Prevent blur from firing before selection
          onSelect(v);
        }}
        onMouseEnter={() => setActiveIndex(idx)}
        role="option"
        aria-selected={idx === activeIndex}
      >
        <div className="vss-item__icon">
          <Building2 size={16} />
        </div>
        <div className="vss-item__info">
          <div className="vss-item__top">
            <span className="vss-item__name">{v.name}</span>
            <span className={`vss-item__badge vss-item__badge--${st.cls}`}>{st.label}</span>
          </div>
          <div className="vss-item__details">
            {v.email && (
              <span className="vss-item__detail">
                <Mail size={11} />
                {v.email}
              </span>
            )}
            {v.contactPerson && (
              <span className="vss-item__detail">
                <Users size={11} />
                {v.contactPerson}
              </span>
            )}
          </div>
        </div>
        <div className="vss-item__arrow">
          <ExternalLink size={13} />
        </div>
      </button>
    );
  };

  const dropdownContent = (
    <div
      className="vss-dropdown vss-dropdown--portal"
      ref={dropdownRef}
      style={{
        top: pos.top,
        left: pos.left,
        width: pos.width,
      }}
      role="listbox"
      aria-label="Vendor suggestions"
    >
      {loading ? (
        <div className="vss-loading">
          <span className="vss-spinner" />
          Searching vendors…
        </div>
      ) : results.length === 0 ? (
        <div className="vss-empty">
          <Search size={18} />
          <span>No matching vendors found</span>
          {query.length >= 2 && (
            <span className="vss-empty__hint">Continue typing or press Tab to proceed</span>
          )}
        </div>
      ) : (
        <>
          <div className="vss-header">
            <AlertTriangle size={13} />
            <span>Similar vendors found ({results.length})</span>
          </div>
          <div className="vss-list">
            {results.map((v, idx) => renderResult(v, idx))}
          </div>
          <div className="vss-footer">
            <span>Select a vendor to view details, or continue typing to create a new one</span>
          </div>
        </>
      )}
    </div>
  );

  // Portal renders into document.body — no parent overflow/transform can clip it.
  // z-index: 9999 ensures it floats above all form content.
  return createPortal(dropdownContent, document.body);
}
