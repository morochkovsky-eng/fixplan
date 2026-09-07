import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/lib/server/telegram";

type NotificationEvent = {
  apartmentId: string;
  kind: string;
  recipient: "owner" | "cleaner";
  entityType?: "cleaning" | "inspection" | "work_order";
  entityId: string;
  title: string;
  body?: string;
  actionUrl?: string;
  payload?: Record<string, unknown>;
  channels?: Array<"in_app" | "telegram">;
  dedupeKey: string;
};

function notificationActionUrl(actionUrl: unknown) {
  if (typeof actionUrl !== "string" || !actionUrl.trim()) return undefined;
  if (/^https?:\/\//i.test(actionUrl)) return actionUrl;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return appUrl ? new URL(actionUrl, `${appUrl}/`).toString() : undefined;
}

async function deliverPendingOwnerTelegramNotifications(
  admin: SupabaseClient,
  apartmentId: string,
) {
  const { data: pending, error: pendingError } = await admin
    .from("notification_events")
    .select("id,apartment_id,title,body,action_url")
    .eq("apartment_id", apartmentId)
    .eq("recipient", "owner")
    .in("kind", ["cleaning.completed", "inspection.completed", "work_order.completed"])
    .contains("channels", ["telegram"])
    .is("telegram_delivered_at", null)
    .order("created_at", { ascending: true })
    .limit(20);

  if (pendingError || !pending?.length) {
    if (pendingError) console.error("Unable to read pending Telegram notifications", pendingError.message);
    return;
  }

  const [{ data: apartment }, { data: members, error: membersError }] = await Promise.all([
    admin.from("apartments").select("name").eq("id", apartmentId).maybeSingle(),
    admin
      .from("apartment_members")
      .select("user_id")
      .eq("apartment_id", apartmentId)
      .in("role", ["owner", "admin"])
      .not("user_id", "is", null),
  ]);

  if (membersError) {
    console.error("Unable to find Telegram notification recipients", membersError.message);
    return;
  }

  const ownerIds = (members ?? []).map((member) => member.user_id).filter(Boolean);
  const { data: accounts, error: accountsError } = ownerIds.length
    ? await admin
        .from("telegram_accounts")
        .select("chat_id")
        .in("owner_user_id", ownerIds)
        .eq("active", true)
    : { data: [], error: null };

  if (accountsError) {
    console.error("Unable to load Telegram notification recipients", accountsError.message);
    return;
  }

  for (const notification of pending) {
    try {
      for (const account of accounts ?? []) {
        const lines = [notification.title, apartment?.name, notification.body].filter(Boolean);
        const actionUrl = notificationActionUrl(notification.action_url);
        await sendTelegramMessage(account.chat_id, lines.join("\n"), {
          inlineKeyboard: actionUrl ? [[{ text: "Открыть FixPlan", url: actionUrl }]] : undefined,
        });
      }
      await admin
        .from("notification_events")
        .update({ telegram_delivered_at: new Date().toISOString() })
        .eq("id", notification.id)
        .is("telegram_delivered_at", null);
    } catch (error) {
      console.error(
        "Unable to deliver Telegram notification",
        error instanceof Error ? error.message : error,
      );
      return;
    }
  }
}

export async function enqueueNotification(admin: SupabaseClient, event: NotificationEvent) {
  const { error } = await admin.from("notification_events").upsert({
    apartment_id: event.apartmentId,
    kind: event.kind,
    recipient: event.recipient,
    entity_type: event.entityType ?? "cleaning",
    entity_id: event.entityId,
    title: event.title,
    body: event.body ?? "",
    action_url: event.actionUrl ?? null,
    payload: event.payload ?? {},
    channels: event.channels ?? ["in_app", "telegram"],
    dedupe_key: event.dedupeKey,
  }, { onConflict: "apartment_id,dedupe_key", ignoreDuplicates: true });
  if (error) {
    console.error("Unable to enqueue notification", error.message);
    return;
  }
  if ((event.channels ?? ["in_app", "telegram"]).includes("telegram") && event.recipient === "owner") {
    await deliverPendingOwnerTelegramNotifications(admin, event.apartmentId);
  }
}
