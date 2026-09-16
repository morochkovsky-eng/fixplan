import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildTenantStatement,
  type StatementBill,
} from "@/lib/server/tenant-statement";
import {
  listTelegramApartments,
  type TelegramOwnerAccount,
} from "@/lib/server/telegram-context";
import { sendTelegramMessage, TelegramSendError } from "@/lib/server/telegram";
import { normalizeUtilityPeriod } from "@/lib/utility-period";

export async function prepareTenantStatement(
  admin: SupabaseClient,
  account: TelegramOwnerAccount,
  apartmentId: string,
  requestedPeriod: string,
) {
  const access = await listTelegramApartments(admin, account);
  if ("error" in access) throw new Error(access.error);
  const apartment = access.apartments.find((item) => item.id === apartmentId);
  if (!apartment) return { reply: "Квартира больше недоступна." };
  const period = normalizeUtilityPeriod(requestedPeriod);
  if (!period) return { reply: "За какой месяц сформировать счёт?" };
  const { data: bills, error } = await admin
    .from("utility_bills")
    .select(
      "id,service,period,tenant_amount,reimbursement_status,due_date_label,status",
    )
    .eq("apartment_id", apartmentId);
  if (error) throw new Error(error.message);
  const rows = (bills ?? []).filter(
    (bill) => normalizeUtilityPeriod(bill.period) === period,
  ) as StatementBill[];
  if (rows.some((bill) => bill.status === "draft"))
    return {
      reply:
        "За этот месяц есть неподтверждённые начисления. Сначала подтвердите черновик счёта, затем сформируем сообщение арендатору.",
    };
  const statement = buildTenantStatement(
    apartment.name,
    period,
    apartment.currency,
    rows,
  );
  if (!statement)
    return {
      reply: `За ${period} нет неоплаченных начислений жильцу. Добавьте счёт или выберите другой месяц.`,
    };
  const { data: group, error: groupError } = await admin
    .from("telegram_apartment_groups")
    .select("chat_id,title,version")
    .eq("apartment_id", apartmentId)
    .maybeSingle();
  if (groupError) throw new Error(groupError.message);
  // Old approval buttons cannot send an earlier statement after a new preview.
  const { error: cancelError } = await admin
    .from("telegram_statement_deliveries")
    .update({ status: "cancelled" })
    .eq("telegram_user_id", account.telegram_user_id)
    .eq("status", "prepared");
  if (cancelError) throw new Error(cancelError.message);
  const { data: delivery, error: insertError } = await admin
    .from("telegram_statement_deliveries")
    .insert({
      apartment_id: apartmentId,
      owner_user_id: account.owner_user_id,
      telegram_user_id: account.telegram_user_id,
      group_version: group?.version ?? null,
      chat_id: group?.chat_id ?? null,
      group_title: group?.title ?? null,
      period,
      ...statement,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);
  const { error: conversationError } = await admin
    .from("telegram_conversations")
    .upsert(
      {
        telegram_user_id: account.telegram_user_id,
        active_apartment_id: apartmentId,
        pending_action: {
          type: "send_utility_statement",
          apartmentId,
          deliveryId: delivery.id,
        },
        previous_response_id: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "telegram_user_id" },
    );
  if (conversationError) throw new Error(conversationError.message);
  return { reply: statement.body, deliveryId: delivery.id };
}

export async function handleStatementDecision(
  admin: SupabaseClient,
  account: TelegramOwnerAccount,
  id: string,
  decision: "send" | "cancel" | "copy",
) {
  const { data: delivery, error } = await admin
    .from("telegram_statement_deliveries")
    .select("*")
    .eq("id", id)
    .eq("owner_user_id", account.owner_user_id)
    .eq("telegram_user_id", account.telegram_user_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!delivery) return "Этот счёт недоступен.";
  const access = await listTelegramApartments(admin, account);
  if ("error" in access) throw new Error(access.error);
  const apartment = access.apartments.find(
    (item) => item.id === delivery.apartment_id,
  );
  if (!apartment) return "Нет доступа к квартире этого счёта.";
  const { error: clearError } = await admin
    .from("telegram_conversations")
    .update({ pending_action: null })
    .eq("telegram_user_id", account.telegram_user_id)
    .eq("pending_action->>deliveryId", id);
  if (clearError) throw new Error(clearError.message);
  if (decision === "copy") return delivery.body as string;
  if (decision === "cancel") {
    await admin
      .from("telegram_statement_deliveries")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", "prepared");
    return "Счёт оставлен в личном чате. Можно скопировать текст и отправить самостоятельно.";
  }
  if (delivery.status === "sent")
    return `Этот счёт уже отправлен в группу «${delivery.group_title}».`;
  if (delivery.status === "unknown" || delivery.status === "sending")
    return "Отправка уже запущена, но подтверждение доставки пока не получено. Проверьте группу: автоматически повторять сообщение не буду.";
  if (
    !["prepared", "failed"].includes(delivery.status) ||
    Date.parse(delivery.expires_at) < Date.now()
  )
    return "Предложение отправки устарело. Попросите заново сформировать счёт.";
  const { data: group, error: groupError } = await admin
    .from("telegram_apartment_groups")
    .select("chat_id,version,title")
    .eq("apartment_id", delivery.apartment_id)
    .maybeSingle();
  if (groupError) throw new Error(groupError.message);
  if (
    !group ||
    group.version !== delivery.group_version ||
    String(group.chat_id) !== String(delivery.chat_id)
  )
    return "Группа отключена или изменена. Подключите её в настройках и заново сформируйте счёт.";
  const { data: bills, error: billError } = await admin
    .from("utility_bills")
    .select(
      "id,service,period,tenant_amount,reimbursement_status,due_date_label,status",
    )
    .eq("apartment_id", delivery.apartment_id);
  if (billError) throw new Error(billError.message);
  const rows = (bills ?? []).filter(
    (bill) => normalizeUtilityPeriod(bill.period) === delivery.period,
  ) as StatementBill[];
  const fresh = buildTenantStatement(
    apartment.name,
    delivery.period,
    apartment.currency,
    rows,
  );
  if (
    rows.some((bill) => bill.status === "draft") ||
    !fresh ||
    fresh.fingerprint !== delivery.fingerprint
  )
    return "Начисления изменились после предпросмотра. Заново сформируйте счёт и проверьте сумму перед отправкой.";
  const { data: claimed, error: claimError } = await admin
    .from("telegram_statement_deliveries")
    .update({ status: "sending" })
    .eq("id", id)
    .in("status", ["prepared", "failed"])
    .select("id")
    .maybeSingle();
  if (claimError?.code === "23505")
    return "Такой счёт уже отправлен или отправляется в эту группу. Повтор не отправлен.";
  if (claimError) throw new Error(claimError.message);
  if (!claimed) return "Этот счёт уже обрабатывается. Повтор не отправлен.";
  try {
    const sent = await sendTelegramMessage(delivery.chat_id, delivery.body);
    const { error: saveError } = await admin
      .from("telegram_statement_deliveries")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        telegram_message_id: sent.message_id,
      })
      .eq("id", id);
    if (saveError) throw new Error(saveError.message);
    return `Счёт за ${delivery.period} отправлен в группу «${group.title}».`;
  } catch (error) {
    const rejected =
      error instanceof TelegramSendError &&
      error.code >= 400 &&
      error.code < 500;
    await admin
      .from("telegram_statement_deliveries")
      .update({ status: rejected ? "failed" : "unknown" })
      .eq("id", id);
    return rejected
      ? "Telegram не принял сообщение. Проверьте, что бот состоит в группе и может писать сообщения, затем нажмите «Отправить» ещё раз."
      : "Не удалось подтвердить доставку. Проверьте группу перед новой отправкой: сообщение могло дойти.";
  }
}
