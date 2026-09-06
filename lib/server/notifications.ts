import type { SupabaseClient } from "@supabase/supabase-js";

type NotificationEvent = {
  apartmentId: string;
  kind: string;
  recipient: "owner" | "cleaner";
  entityId: string;
  title: string;
  body?: string;
  actionUrl?: string;
  payload?: Record<string, unknown>;
  channels?: Array<"in_app" | "telegram">;
  dedupeKey: string;
};

export async function enqueueNotification(admin: SupabaseClient, event: NotificationEvent) {
  const { error } = await admin.from("notification_events").upsert({
    apartment_id: event.apartmentId,
    kind: event.kind,
    recipient: event.recipient,
    entity_type: "cleaning",
    entity_id: event.entityId,
    title: event.title,
    body: event.body ?? "",
    action_url: event.actionUrl ?? null,
    payload: event.payload ?? {},
    channels: event.channels ?? ["in_app", "telegram"],
    dedupe_key: event.dedupeKey,
  }, { onConflict: "apartment_id,dedupe_key", ignoreDuplicates: true });
  if (error) console.error("Unable to enqueue notification", error.message);
}
