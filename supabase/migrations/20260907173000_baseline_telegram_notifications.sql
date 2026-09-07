update public.notification_events
set telegram_delivered_at = coalesce(telegram_delivered_at, now())
where telegram_delivered_at is null
  and 'telegram' = any(channels);
