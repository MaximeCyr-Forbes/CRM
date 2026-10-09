"use client";
import { useEffect, useRef } from "react";
import { ShellIcon } from "../components/shell-icons";
import { MONTHS, adjacentYear } from "../lib/accounting/period";
import { todayToronto, type Filters } from "../lib/accounting/model";
export function PeriodNavigation({filters,onChange}:{filters:Filters;onChange:(next:Filters)=>void}) {
  const strip=useRef<HTMLDivElement>(null),today=todayToronto();
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const centerSelectedMonth = () => {
      const active = el.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (active && el.scrollWidth > el.clientWidth) {
        el.scrollLeft = active.offsetLeft - el.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
      }
    };
    centerSelectedMonth();
    const observer = new ResizeObserver(centerSelectedMonth);
    observer.observe(el);
    return () => observer.disconnect();
  }, [filters.month, filters.period, filters.year]);
  function selectToday() {
    const now = new Date();
    onChange({...filters, year: String(now.getFullYear()), month: String(now.getMonth() + 1).padStart(2, "0"), period: "month"});
  }
  return <section className="accounting-period-nav" aria-label="Période comptable">
    <div className="accounting-year"><button type="button" className="accounting-today" onClick={selectToday}><ShellIcon name="Calendrier"/>Aujourd’hui</button><button type="button" aria-label="Année précédente" disabled={Number(filters.year)<=1} onClick={()=>onChange(adjacentYear(filters,-1))}>‹</button><span aria-live="polite">{filters.year}</span><button type="button" aria-label="Année suivante" disabled={Number(filters.year)>=9999} onClick={()=>onChange(adjacentYear(filters,1))}>›</button><button type="button" className="accounting-full-year" aria-pressed={filters.period==="year"} onClick={()=>onChange({...filters,period:"year"})}>Année complète</button></div>
    <div className="accounting-months" ref={strip} role="group" aria-label="Mois">{MONTHS.map((label,i)=>{const month=String(i+1).padStart(2,"0");return <button type="button" key={month} aria-pressed={filters.period==="month"&&filters.month===month} aria-label={`${label} ${filters.year}`} aria-current={filters.year===today.slice(0,4)&&month===today.slice(5,7)?"date":undefined} onClick={()=>onChange({...filters,period:"month",month})}>{label}</button>;})}</div>
  </section>;
}
