"use client";

import { useEffect, useRef, useState } from "react";
import { calendarDateForMonth, todayInCalendarTimeZone } from "../lib/google-calendar/calendar-date";

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const YEAR_WINDOW_SIZE = 9;

export const CALENDAR_MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
] as const;

export function calendarYearWindow(year: number) {
  const boundedYear = Math.min(MAX_YEAR, Math.max(MIN_YEAR, year));
  const rawStart = MIN_YEAR + Math.floor((boundedYear - MIN_YEAR) / YEAR_WINDOW_SIZE) * YEAR_WINDOW_SIZE;
  const start = Math.min(rawStart, MAX_YEAR - YEAR_WINDOW_SIZE + 1);
  return Array.from({ length: YEAR_WINDOW_SIZE }, (_, index) => start + index);
}

type CalendarPeriodPickerProps = {
  currentDate: string;
  isOpen: boolean;
  label: string;
  onClose: () => void;
  onOpen: () => void;
  onSelect: (date: string) => void;
};

export function CalendarPeriodPicker({ currentDate, isOpen, label, onClose, onOpen, onSelect }: CalendarPeriodPickerProps) {
  const currentYear = Number(currentDate.slice(0, 4));
  const currentMonth = Number(currentDate.slice(5, 7));
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [yearWindow, setYearWindow] = useState(() => calendarYearWindow(currentYear));
  const [isYearGridOpen, setIsYearGridOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedMonthRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedYear(currentYear);
    setYearWindow(calendarYearWindow(currentYear));
    setIsYearGridOpen(false);
    const focusTimer = window.setTimeout(() => selectedMonthRef.current?.focus(), 0);

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentYear, isOpen, onClose]);

  function chooseMonth(month: number) {
    onSelect(calendarDateForMonth(selectedYear, month));
    onClose();
  }

  function chooseToday() {
    onSelect(todayInCalendarTimeZone());
    onClose();
  }

  function moveYear(direction: -1 | 1) {
    setSelectedYear((year) => Math.min(MAX_YEAR, Math.max(MIN_YEAR, year + direction)));
  }

  function moveYearWindow(direction: -1 | 1) {
    setYearWindow((years) => calendarYearWindow(years[0] + direction * YEAR_WINDOW_SIZE));
  }

  return (
    <div className="calendar-period-picker-anchor" ref={rootRef}>
      <button
        aria-controls="calendar-period-picker"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="calendar-period-picker-trigger"
        onClick={isOpen ? onClose : onOpen}
        type="button"
      >
        <span>{label}</span>
        <span aria-hidden="true" className="calendar-period-picker-chevron">⌄</span>
      </button>

      {isOpen && (
        <section
          aria-labelledby="calendar-period-picker-heading"
          className="calendar-period-picker"
          id="calendar-period-picker"
          role="dialog"
        >
          <header className="calendar-period-picker-heading">
            <div>
              <span>Navigation</span>
              <h2 id="calendar-period-picker-heading">Choisir une date</h2>
            </div>
            <button aria-label="Fermer le sélecteur" onClick={onClose} type="button">×</button>
          </header>

          <div className="calendar-period-picker-content">
            <span className="calendar-period-picker-label">Année</span>
            <div className="calendar-period-year-control">
              <button aria-label="Année précédente" disabled={selectedYear === MIN_YEAR} onClick={() => moveYear(-1)} type="button">←</button>
              <button
                aria-expanded={isYearGridOpen}
                className="calendar-period-year-trigger"
                onClick={() => {
                  setYearWindow(calendarYearWindow(selectedYear));
                  setIsYearGridOpen((open) => !open);
                }}
                type="button"
              >
                {selectedYear}
                <span aria-hidden="true">⌄</span>
              </button>
              <button aria-label="Année suivante" disabled={selectedYear === MAX_YEAR} onClick={() => moveYear(1)} type="button">→</button>
            </div>

            {isYearGridOpen && (
              <div className="calendar-period-year-panel">
                <div className="calendar-period-year-window-control">
                  <button aria-label="Années précédentes" disabled={yearWindow[0] === MIN_YEAR} onClick={() => moveYearWindow(-1)} type="button">←</button>
                  <span>{yearWindow[0]} — {yearWindow.at(-1)}</span>
                  <button aria-label="Années suivantes" disabled={yearWindow.at(-1) === MAX_YEAR} onClick={() => moveYearWindow(1)} type="button">→</button>
                </div>
                <div className="calendar-period-year-grid">
                  {yearWindow.map((year) => (
                    <button
                      aria-pressed={selectedYear === year}
                      className={selectedYear === year ? "is-selected" : undefined}
                      key={year}
                      onClick={() => {
                        setSelectedYear(year);
                        setIsYearGridOpen(false);
                      }}
                      type="button"
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <span className="calendar-period-picker-label">Mois</span>
            <div className="calendar-period-month-grid">
              {CALENDAR_MONTHS.map((month, index) => {
                const monthNumber = index + 1;
                const isCurrentSelection = selectedYear === currentYear && monthNumber === currentMonth;
                return (
                  <button
                    aria-pressed={isCurrentSelection}
                    className={`calendar-period-month${isCurrentSelection ? " is-selected" : ""}`}
                    key={month}
                    onClick={() => chooseMonth(monthNumber)}
                    ref={isCurrentSelection ? selectedMonthRef : undefined}
                    type="button"
                  >
                    {month}
                  </button>
                );
              })}
            </div>

            <button className="calendar-period-today" onClick={chooseToday} type="button">Aujourd’hui</button>
          </div>
        </section>
      )}
    </div>
  );
}
