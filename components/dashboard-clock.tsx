"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const timezoneLabels: Record<string, string> = {
  "Europe/Moscow": "Москва",
  "Europe/Madrid": "Мадрид",
  "Europe/Berlin": "Берлин",
  "Asia/Dubai": "Дубай",
};

function formatDateTime(date: Date, timeZone: string) {
  try {
    return {
      date: new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone,
      }).format(date),
      time: new Intl.DateTimeFormat("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
      }).format(date),
    };
  } catch {
    return formatDateTime(date, "Europe/Moscow");
  }
}

export function DashboardClock({ timeZone }: { timeZone: string }) {
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
    () => (now ? formatDateTime(now, timeZone) : null),
    [now, timeZone],
  );

  return (
    <div className="dashboard-clock" aria-label={`Дата и время, ${timezoneLabels[timeZone] ?? timeZone}`}>
      <Clock3 aria-hidden="true" />
      <div>
        <time dateTime={now?.toISOString()}>{formatted?.date ?? "Сегодня"}</time>
        <span>
          {formatted?.time ?? "--:--"} · {timezoneLabels[timeZone] ?? timeZone}
        </span>
      </div>
    </div>
  );
}
