import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleaningPayload } from "@/app/api/cleanings/helpers";
import { createCleaningRecord } from "@/lib/server/cleanings";

type TelegramAccount = {
  telegram_user_id: number | string;
  apartment_id: string;
  display_name: string;
};

type Conversation = {
  previous_response_id: string | null;
  pending_action: Record<string, unknown> | null;
};

type ResponseItem = {
  type: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  content?: Array<{ type: string; text?: string }>;
};

type OpenAIResponse = {
  id: string;
  output?: ResponseItem[];
  output_text?: string;
};

const confirmationWords = new Set(["да", "подтверждаю", "создавай", "создать", "да, создавай", "ок, создавай"]);
const cancellationWords = new Set(["нет", "отмена", "отмени", "не создавай"]);

const tools = [
  {
    type: "function",
    name: "list_cleanings",
    description: "Получить актуальный список уборок квартиры. Используй для вопросов о расписании и статусах.",
    parameters: {
      type: "object",
      properties: { status: { type: "string", enum: ["all", "offered", "scheduled", "in_progress", "completed", "revision_requested", "accepted", "declined"] } },
      required: ["status"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "prepare_cleaning",
    description: "Подготовить черновик уборки. Это не создаёт уборку: после вызова обязательно попроси явное подтверждение.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        zones: { type: "array", items: { type: "string" } },
        scheduledAt: { type: "string", description: "Дата и время ISO 8601 с часовым поясом" },
        cleaner: { type: "string" },
        cleanerPhone: { type: "string" },
        checklist: { type: "array", items: { type: "string" } },
        recurrence: { type: "string", enum: ["none", "weekly", "biweekly", "monthly"] },
        requirePhotoBefore: { type: "boolean" },
        requirePhotoAfter: { type: "boolean" },
        notes: { type: "string" },
      },
      required: ["title", "zones", "scheduledAt", "cleaner", "cleanerPhone", "checklist", "recurrence", "requirePhotoBefore", "requirePhotoAfter", "notes"],
      additionalProperties: false,
    },
    strict: true,
  },
];

function plainText(response: OpenAIResponse) {
  if (response.output_text?.trim()) return response.output_text.trim();
  return (response.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("\n").trim();
}

async function createResponse(input: unknown, previousResponseId: string | null, account: TelegramAccount) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const today = new Intl.DateTimeFormat("ru-RU", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Moscow" }).format(new Date());
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
      instructions: `Ты личный ассистент владельца квартиры в сервисе FixPlan. Отвечай кратко и по-русски. Сейчас ${today}, часовой пояс квартиры Europe/Moscow. Данные о квартире получай только через инструменты. Не утверждай, что действие выполнено, пока инструмент не вернул успех. Для новой уборки собери дату, зоны, клинера, чек-лист и требования к фото, затем вызови prepare_cleaning. После подготовки попроси владельца написать «Создавай». Никогда не создавай и не изменяй данные без явного подтверждения. Мастера и клинеры не общаются с тобой: они работают по гостевым ссылкам конкретных заданий.`,
      input,
      tools,
      tool_choice: "auto",
      parallel_tool_calls: false,
      previous_response_id: previousResponseId ?? undefined,
      safety_identifier: createHash("sha256").update(String(account.telegram_user_id)).digest("hex").slice(0, 64),
      max_output_tokens: 700,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI Responses API failed with ${response.status}`);
  return response.json() as Promise<OpenAIResponse>;
}

async function saveConversation(admin: SupabaseClient, account: TelegramAccount, patch: Partial<Conversation>) {
  const { error } = await admin.from("telegram_conversations").upsert({
    telegram_user_id: account.telegram_user_id,
    apartment_id: account.apartment_id,
    ...patch,
    updated_at: new Date().toISOString(),
  }, { onConflict: "telegram_user_id" });
  if (error) throw new Error(error.message);
}

async function executeTool(admin: SupabaseClient, account: TelegramAccount, call: ResponseItem) {
  const args = JSON.parse(call.arguments ?? "{}") as Record<string, unknown>;
  if (call.name === "list_cleanings") {
    let query = admin.from("cleanings").select("id,title,status,scheduled_for_label,cleaner,zones").eq("apartment_id", account.apartment_id).order("scheduled_for_at", { ascending: true, nullsFirst: false }).limit(20);
    if (args.status && args.status !== "all") query = query.eq("status", String(args.status));
    const { data, error } = await query;
    if (error) return { ok: false, error: error.message };
    return { ok: true, cleanings: data ?? [] };
  }

  if (call.name === "prepare_cleaning") {
    if (!String(args.scheduledAt ?? "").trim() || !String(args.cleaner ?? "").trim() || !Array.isArray(args.zones) || !args.zones.length) {
      return { ok: false, error: "Для черновика нужны дата и время, клинер и хотя бы одна зона." };
    }
    const payload = { ...args, type: "standard", mode: "managed", status: "offered" };
    const validation = cleaningPayload(payload);
    if ("error" in validation) return { ok: false, error: validation.error };
    await saveConversation(admin, account, { pending_action: { type: "create_cleaning", payload } });
    return { ok: true, draft: payload, instruction: "Покажи понятное резюме и попроси написать «Создавай»." };
  }

  return { ok: false, error: "Неизвестный инструмент." };
}

export async function runTelegramAssistant(admin: SupabaseClient, account: TelegramAccount, message: string, appOrigin: string) {
  const { data } = await admin.from("telegram_conversations").select("previous_response_id,pending_action").eq("telegram_user_id", account.telegram_user_id).maybeSingle();
  const conversation = (data ?? { previous_response_id: null, pending_action: null }) as Conversation;
  const normalized = message.trim().toLocaleLowerCase("ru-RU");

  if (conversation.pending_action && confirmationWords.has(normalized)) {
    const pending = conversation.pending_action;
    if (pending.type !== "create_cleaning" || !pending.payload || typeof pending.payload !== "object") return "Черновик повреждён. Давайте соберём уборку заново.";
    const result = await createCleaningRecord(admin, { apartmentId: account.apartment_id, createdBy: `telegram:${account.telegram_user_id}`, appOrigin, payload: pending.payload as Record<string, unknown> });
    if ("error" in result) return `Не удалось создать уборку: ${result.error}`;
    await saveConversation(admin, account, { previous_response_id: null, pending_action: null });
    return `Уборка «${result.row.title}» создана. ${result.row.scheduled_for_label}${result.cleaning.link ? `\n${result.cleaning.link}` : ""}`;
  }

  if (conversation.pending_action && cancellationWords.has(normalized)) {
    await saveConversation(admin, account, { previous_response_id: null, pending_action: null });
    return "Черновик отменён.";
  }

  const contextualMessage = conversation.pending_action ? `${message}\n\nТекущий неподтверждённый черновик: ${JSON.stringify(conversation.pending_action)}` : message;
  let response = await createResponse(contextualMessage, conversation.previous_response_id, account);
  for (let turn = 0; turn < 3; turn += 1) {
    const calls = (response.output ?? []).filter((item) => item.type === "function_call" && item.call_id);
    if (!calls.length) break;
    const outputs = [];
    for (const call of calls) outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(await executeTool(admin, account, call)) });
    response = await createResponse(outputs, response.id, account);
  }
  await saveConversation(admin, account, { previous_response_id: response.id });
  return plainText(response) || "Не получилось сформировать ответ. Попробуйте переформулировать запрос.";
}
