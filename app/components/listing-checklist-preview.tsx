"use client";

import { useEffect, useRef, useState } from "react";
import { getListingChecklistStats } from "../lib/listings/checklist";
import { useListingReport } from "../lib/listings/use-listing-report";

function ChecklistValue({ listingId }: { listingId: string }) {
  const report = useListingReport(listingId);
  if (report.isLoading) return <span>Checklist · Chargement…</span>;
  if (!report.data?.tracking || report.error) return <span>Checklist · Indisponible</span>;
  const stats = getListingChecklistStats(report.data.tracking.tasks, report.data.listing.propertyType);
  return <><span>Checklist <strong>{stats.completed} / {stats.total}</strong></span><progress aria-label="Progression checklist" max={stats.total || 1} value={stats.completed} /></>;
}

/** Read the existing report only when a card enters the viewport. */
export function ListingChecklistPreview({ listingId }: { listingId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <div className="listing-checklist-preview" ref={ref}>{visible ? <ChecklistValue listingId={listingId} /> : <span>Checklist · —</span>}</div>;
}
