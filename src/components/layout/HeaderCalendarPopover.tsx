import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { calendarService, type CalendarEventItem } from '../../services/calendarService';
import './HeaderCalendarPopover.css';

interface AgendaItem {
  id: string;
  title: string;
  category: 'urgent' | 'warning' | 'info' | 'custom';
  subText?: string;
}

interface HeaderCalendarPopoverProps {
  onClose: () => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function HeaderCalendarPopover({ onClose }: HeaderCalendarPopoverProps) {
  const { user } = useAuth();
  const userId = user?.id || user?.email || 'guest';

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [customEvents, setCustomEvents] = useState<Record<string, CalendarEventItem[]>>({});

  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch calendar events for current user from database / service
  useEffect(() => {
    let active = true;
    const fetchUserEvents = async () => {
      const events = await calendarService.getEvents(userId);
      if (active) {
        setCustomEvents(events);
      }
    };
    fetchUserEvents();
    return () => {
      active = false;
    };
  }, [userId]);

  // Live digital clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Save custom events to localStorage
  const saveCustomEvents = (updated: Record<string, AgendaItem[]>) => {
    setCustomEvents(updated);
    try {
      localStorage.setItem('heliflow_calendar_events', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save calendar event', e);
    }
  };

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  // Navigation handlers
  const prevMonth = () => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const jumpToToday = () => {
    const now = new Date();
    setViewDate(now);
    setSelectedDate(now);
  };

  // Calendar matrix calculation (42 cells = 6 rows x 7 cols)
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  const calendarDays = [];

  // Previous month trailing days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const dateObj = new Date(currentYear, currentMonth - 1, dayNum);
    calendarDays.push({
      date: dateObj,
      dayNumber: dayNum,
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const dateObj = new Date(currentYear, currentMonth, i);
    calendarDays.push({
      date: dateObj,
      dayNumber: i,
      isCurrentMonth: true,
    });
  }

  // Next month leading days
  const remainingCells = 42 - calendarDays.length;
  for (let i = 1; i <= remainingCells; i++) {
    const dateObj = new Date(currentYear, currentMonth + 1, i);
    calendarDays.push({
      date: dateObj,
      dayNumber: i,
      isCurrentMonth: false,
    });
  }

  // Helpers to compare dates
  const formatDateKey = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const isToday = (d: Date) => {
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (d: Date) => {
    return (
      d.getDate() === selectedDate.getDate() &&
      d.getMonth() === selectedDate.getMonth() &&
      d.getFullYear() === selectedDate.getFullYear()
    );
  };

  const selectedDateKey = formatDateKey(selectedDate);

  // Events for selected date (only user added notes/events)
  const getEventsForDate = (dateKey: string) => {
    return customEvents[dateKey] || [];
  };

  const currentAgenda = getEventsForDate(selectedDateKey);

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReminderTitle.trim()) return;

    const title = newReminderTitle.trim();
    setNewReminderTitle('');
    setShowAddForm(false);

    const addedItem = await calendarService.addEvent(userId, selectedDateKey, title);
    setCustomEvents((prev) => {
      const existing = prev[selectedDateKey] || [];
      return {
        ...prev,
        [selectedDateKey]: [...existing, addedItem],
      };
    });
  };

  const handleDeleteReminder = async (id: string) => {
    setCustomEvents((prev) => {
      const existing = prev[selectedDateKey] || [];
      return {
        ...prev,
        [selectedDateKey]: existing.filter((item) => item.id !== id),
      };
    });
    await calendarService.deleteEvent(userId, selectedDateKey, id);
  };

  // Time strings
  const timeString = currentDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const parts = timeString.split(' ');
  const digits = parts[0];
  const ampm = parts[1] || '';

  const fullDateFormatted = currentDate.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const selectedDateFormatted = selectedDate.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="laptop-calendar-popover" ref={popoverRef} role="dialog" aria-label="Laptop Calendar">
      {/* OS Clock & Date Bar */}
      <div className="calendar-clock-bar">
        <div>
          <div className="calendar-clock-bar__time">
            <span className="calendar-clock-bar__digits">{digits}</span>
            <span className="calendar-clock-bar__ampm">{ampm}</span>
          </div>
          <div className="calendar-clock-bar__date">{fullDateFormatted}</div>
        </div>
        <button
          type="button"
          className="calendar-btn-today"
          onClick={jumpToToday}
          title="Jump to current date"
        >
          Today
        </button>
      </div>

      {/* Month Navigation */}
      <div className="calendar-month-nav">
        <div className="calendar-month-nav__title">
          <CalendarIcon size={16} />
          {MONTH_NAMES[currentMonth]} {currentYear}
        </div>
        <div className="calendar-month-nav__actions">
          <button
            type="button"
            className="calendar-btn-icon"
            onClick={prevMonth}
            title="Previous Month"
            aria-label="Previous Month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="calendar-btn-icon"
            onClick={nextMonth}
            title="Next Month"
            aria-label="Next Month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="calendar-grid-container">
        <div className="calendar-weekdays">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="calendar-weekday">
              {wd}
            </div>
          ))}
        </div>

        <div className="calendar-days-grid">
          {calendarDays.map((item, idx) => {
            const dateKey = formatDateKey(item.date);
            const events = getEventsForDate(dateKey);
            const hasEvent = events.length > 0;
            const todayClass = isToday(item.date) ? 'calendar-day-cell--today' : '';
            const selectedClass = isSelected(item.date) ? 'calendar-day-cell--selected' : '';
            const monthClass = item.isCurrentMonth ? '' : 'calendar-day-cell--other-month';
            const eventClass = hasEvent ? 'calendar-day-cell--has-event' : '';

            return (
              <button
                key={`${dateKey}-${idx}`}
                type="button"
                className={`calendar-day-cell ${monthClass} ${todayClass} ${selectedClass} ${eventClass}`}
                onClick={() => setSelectedDate(item.date)}
              >
                {item.dayNumber}
              </button>
            );
          })}
        </div>
      </div>

      {/* Agenda & Schedule for Selected Date */}
      <div className="calendar-agenda">
        <div className="calendar-agenda__header">
          <span className="calendar-agenda__title">
            Events · {selectedDateFormatted}
          </span>
          <button
            type="button"
            className="calendar-agenda__add-btn"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <Plus size={12} />
            {showAddForm ? 'Cancel' : 'Add Note'}
          </button>
        </div>

        {showAddForm && (
          <form className="calendar-add-input" onSubmit={handleAddReminder}>
            <input
              type="text"
              placeholder="e.g. Audit Meeting at 3 PM..."
              value={newReminderTitle}
              onChange={(e) => setNewReminderTitle(e.target.value)}
              autoFocus
            />
            <button type="submit">Add</button>
          </form>
        )}

        <div className="calendar-agenda__list">
          {currentAgenda.length === 0 ? (
            <div className="calendar-agenda__empty">
              <CalendarIcon size={22} className="calendar-agenda__empty-icon" />
              <span>No notes or events for this date</span>
            </div>
          ) : (
            currentAgenda.map((event) => (
              <div key={event.id} className="calendar-agenda__item">
                <span className={`calendar-agenda__dot calendar-agenda__dot--${event.category}`} />
                <div className="calendar-agenda__content">
                  <div className="calendar-agenda__item-title">{event.title}</div>
                  {event.subText && <div className="calendar-agenda__item-sub">{event.subText}</div>}
                </div>
                <button
                  type="button"
                  className="calendar-agenda__delete-btn"
                  onClick={() => handleDeleteReminder(event.id)}
                  title="Delete Note"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
