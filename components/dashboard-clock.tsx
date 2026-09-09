"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const timezoneLabels: Record<string, string> = {
  "Europe/Moscow": "Москва",
  "Europe/Madrid": "Мадрид",
  "Europe/Berlin": "Берлин",
  "Asia/Dubai": "Дубай",
};

function formatDateTime(date: Date, timeZone: string, compact = false) {
  try {
    return {
      date: new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: compact ? "short" : "long",
        year: compact ? undefined : "numeric",
        timeZone,
      }).format(date),
      time: new Intl.DateTimeFormat("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
      }).format(date),
    };
  } catch {
    return formatDateTime(date, "Europe/Moscow", compact);
  }
}

export function DashboardClock({ timeZone, compact = false }: { timeZone: string; compact?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  const formatted = useMemo(
    () => (now ? formatDateTime(now, timeZone, compact) : null),
    [now, timeZone, compact],
  );

  return (
    <div className={`dashboard-clock${compact ? " dashboard-clock-compact" : ""}`} aria-label={`Дата и время, ${timezoneLabels[timeZone] ?? timeZone}`}>
      <Clock3 aria-hidden="true" />
      <div>
        <time dateTime={now?.toISOString()}>{formatted?.date ?? "Сегодня"}</time>
        <span>
          {formatted?.time ?? "--:--"}{!compact && ` · ${timezoneLabels[timeZone] ?? timeZone}`}
        </span>
      </div>
    </div>
  );
}
