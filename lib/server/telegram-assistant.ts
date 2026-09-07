import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleaningPayload } from "@/app/api/cleanings/helpers";
import { createCleaningRecord } from "@/lib/server/cleanings";
import {
  listTelegramApartments,
  resolveTelegramApartment,
  type TelegramOwnerAccount,
} from "@/lib/server/telegram-context";
import { createUtilityBillRecord, normalizeBillPayload } from "@/lib/server/utility-bills";

type ActiveTelegramAccount = TelegramOwnerAccount & {
  apartment_id: string;
  apartment_name: string;
  apartment_address: string;
};

type Conversation = {
  active_apartment_id: string | null;
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

export type TelegramAssistantAttachment = {
  dataUrl: string;
  filename: string;
  mimeType: string;
  storagePath: string;
};

const confirmationWords = new Set(["да", "подтверждаю", "создавай", "создать", "да, создавай", "ок, создавай"]);
const cancellationWords = new Set(["нет", "отмена", "отмени", "не создавай"]);

const tools = [
  {
    type: "function",
    name: "list_apartments",
    description: "Получить список объектов владельца и увидеть, какой объект сейчас выбран в диалоге.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "select_apartment",
    description: "Выбрать объект, с которым продолжится диалог. Используй только идентификатор из list_apartments.",
    parameters: {
      type: "object",
      properties: { apartmentId: { type: "string" } },
      required: ["apartmentId"],
      additionalProperties: false,
    },
    strict: true,
  },
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
  {
    type: "function",
    name: "prepare_utility_bill",
    description: "Подготовить черновик коммунального счёта по сообщению или приложенной квитанции. Это не создаёт счёт: после вызова обязательно попроси явное подтверждение.",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string", description: "Название услуги или поставщика" },
        period: { type: "string", description: "Расчётный период в понятном пользователю виде" },
        amount: { type: "number", description: "Сумма к оплате" },
        dueDate: { type: "string", description: "Срок оплаты в понятном пользователю виде, пустая строка если не указан" },
        allocation: { type: "string", enum: ["owner", "tenant", "split"], description: "На кого относится расход. По умолчанию owner, если пользователь не уточнил другое" },
        tenantAmount: { type: "number", description: "Доля жильца: 0 для owner, полная сумма для tenant, указанная доля для split" },
        note: { type: "string", description: "Короткие важные детали квитанции, пустая строка если их нет" },
      },
      required: ["service", "period", "amount", "dueDate", "allocation", "tenantAmount", "note"],
      additionalProperties: false,
    },
    strict: true,
  },
];

function plainText(response: OpenAIResponse) {
  if (response.output_text?.trim()) return response.output_text.trim();
  return (response.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("\n").trim();
}

async function createResponse(input: unknown, previousResponseId: string | null, account: ActiveTelegramAccount) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const today = new Intl.DateTimeFormat("ru-RU", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Moscow" }).format(new Date());
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
      instructions: `Ты личный ассистент владельца объектов в сервисе FixPlan. Отвечай кратко и по-русски. Сейчас ${today}, часовой пояс Europe/Moscow. Текущий объект: «${account.apartment_name}», адрес: ${account.apartment_address || "не указан"}, id: ${account.apartment_id}. Если владелец спрашивает о другом объекте или объект неясен, используй list_apartments и предложи короткий выбор; после однозначного выбора используй select_apartment. Данные получай только через инструменты. Не утверждай, что действие выполнено, пока инструмент не вернул успех. Для новой уборки собери дату, зоны, клинера, чек-лист и требования к фото, затем вызови prepare_cleaning. Для счёта или квитанции внимательно извлеки услугу, период, сумму и срок оплаты, затем вызови prepare_utility_bill. Не додумывай неразборчивые значения: попроси владельца уточнить их. После подготовки покажи краткое резюме с названием объекта и попроси написать «Создавай». Никогда не создавай и не изменяй данные без явного подтверждения. Мастера и клинеры не общаются с тобой: они работают по гостевым ссылкам конкретных заданий.`,
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

async function saveConversation(admin: SupabaseClient, account: ActiveTelegramAccount, patch: Partial<Conversation>) {
  const { error } = await admin.from("telegram_conversations").upsert({
    telegram_user_id: account.telegram_user_id,
    active_apartment_id: patch.active_apartment_id ?? account.apartment_id,
    ...patch,
    updated_at: new Date().toISOString(),
  }, { onConflict: "telegram_user_id" });
  if (error) throw new Error(error.message);
}

async function executeTool(
  admin: SupabaseClient,
  account: ActiveTelegramAccount,
  call: ResponseItem,
  attachment?: TelegramAssistantAttachment,
  existingReceiptStoragePath?: string,
) {
  const args = JSON.parse(call.arguments ?? "{}") as Record<string, unknown>;
  if (call.name === "list_apartments") {
    const result = await listTelegramApartments(admin, account);
    if ("error" in result) return { ok: false, error: result.error };
    return {
      ok: true,
      apartments: result.apartments.map((apartment) => ({
        ...apartment,
        current: apartment.id === account.apartment_id,
      })),
    };
  }

  if (call.name === "select_apartment") {
    const result = await listTelegramApartments(admin, account);
    if ("error" in result) return { ok: false, error: result.error };
    const apartment = result.apartments.find((item) => item.id === String(args.apartmentId ?? ""));
    if (!apartment) return { ok: false, error: "Объект не найден или недоступен владельцу." };
    account.apartment_id = apartment.id;
    account.apartment_name = apartment.name;
    account.apartment_address = apartment.address;
    await saveConversation(admin, account, { active_apartment_id: apartment.id });
    return {
      ok: true,
      apartment,
      pendingDraftPreserved: true,
      instruction: "Подтверди выбор объекта. Если есть черновик, поясни, что он остался привязан к исходному объекту.",
    };
  }

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
    if (existingReceiptStoragePath) {
      await admin.storage.from("asset-media").remove([existingReceiptStoragePath]);
    }
    await saveConversation(admin, account, { pending_action: { type: "create_cleaning", apartmentId: account.apartment_id, payload } });
    return { ok: true, draft: payload, instruction: "Покажи понятное резюме и попроси написать «Создавай»." };
  }

  if (call.name === "prepare_utility_bill") {
    const payload = {
      ...args,
      status: "due",
      source: "telegram_private",
      receiptStoragePath: attachment?.storagePath ?? existingReceiptStoragePath,
      receiptFilename: attachment?.filename,
      receiptMediaType: attachment?.mimeType,
    };
    const validation = normalizeBillPayload(payload);
    if ("error" in validation) return { ok: false, error: validation.error };
    await saveConversation(admin, account, {
      pending_action: { type: "create_utility_bill", apartmentId: account.apartment_id, payload },
    });
    return {
      ok: true,
      draft: payload,
      attachmentClaimed: Boolean(attachment),
      instruction: "Покажи услугу, период, сумму, срок оплаты и распределение расхода, затем попроси написать «Создавай».",
    };
  }

  return { ok: false, error: "Неизвестный инструмент." };
}

async function removePendingAttachment(
  admin: SupabaseClient,
  pending: Record<string, unknown> | null,
) {
  const payload = pending?.payload;
  if (!payload || typeof payload !== "object") return;
  const storagePath = (payload as Record<string, unknown>).receiptStoragePath;
  if (typeof storagePath === "string" && storagePath) {
    await admin.storage.from("asset-media").remove([storagePath]);
  }
}

function attachmentInput(message: string, attachment: TelegramAssistantAttachment) {
  const fileContent = attachment.mimeType.startsWith("image/")
    ? { type: "input_image", image_url: attachment.dataUrl, detail: "auto" }
    : {
        type: "input_file",
        filename: attachment.filename,
        file_data: attachment.dataUrl,
        detail: "auto",
      };
  return [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: message || "Это коммунальный счёт. Распознай его и подготовь черновик.",
        },
        fileContent,
      ],
    },
  ];
}

export async function runTelegramAssistant(
  admin: SupabaseClient,
  ownerAccount: TelegramOwnerAccount,
  message: string,
  appOrigin: string,
  attachment?: TelegramAssistantAttachment,
) {
  const { data, error: conversationError } = await admin.from("telegram_conversations").select("active_apartment_id,previous_response_id,pending_action").eq("telegram_user_id", ownerAccount.telegram_user_id).maybeSingle();
  if (conversationError) throw new Error(conversationError.message);
  const conversation = (data ?? { active_apartment_id: null, previous_response_id: null, pending_action: null }) as Conversation;
  const context = await resolveTelegramApartment(admin, ownerAccount, conversation.active_apartment_id);
  if ("error" in context) return context.error;
  const account: ActiveTelegramAccount = {
    ...ownerAccount,
    apartment_id: context.apartment.id,
    apartment_name: context.apartment.name,
    apartment_address: context.apartment.address,
  };
  const normalized = message.trim().toLocaleLowerCase("ru-RU");

  if (!attachment && conversation.pending_action && confirmationWords.has(normalized)) {
    const pending = conversation.pending_action;
    if (!pending.payload || typeof pending.payload !== "object") {
      return "Черновик повреждён. Давайте соберём его заново.";
    }
    const apartmentId = typeof pending.apartmentId === "string" ? pending.apartmentId : "";
    const apartmentResult = await listTelegramApartments(admin, account);
    if ("error" in apartmentResult) return `Не удалось проверить объект: ${apartmentResult.error}`;
    const draftApartment = apartmentResult.apartments.find((item) => item.id === apartmentId);
    if (!draftApartment) return "Объект черновика больше недоступен. Отмените черновик и создайте новый.";
    if (pending.type === "create_cleaning") {
      const result = await createCleaningRecord(admin, { apartmentId: draftApartment.id, createdBy: `telegram:${account.telegram_user_id}`, appOrigin, payload: pending.payload as Record<string, unknown> });
      if ("error" in result) return `Не удалось создать уборку: ${result.error}`;
      await saveConversation(admin, account, { previous_response_id: null, pending_action: null });
      return `Уборка «${result.row.title}» создана для объекта «${draftApartment.name}». ${result.row.scheduled_for_label}${result.cleaning.link ? `\n${result.cleaning.link}` : ""}`;
    }
    if (pending.type === "create_utility_bill") {
      const billPayload = pending.payload as Record<string, unknown>;
      const result = await createUtilityBillRecord(admin, {
        apartmentId: draftApartment.id,
        payload: {
          ...billPayload,
          ownerConfirmedAt: new Date().toISOString(),
        },
      });
      if ("error" in result || !result.row) return `Не удалось создать счёт: ${result.error ?? "неизвестная ошибка"}`;
      const receiptStoragePath = String(billPayload.receiptStoragePath ?? "").trim();
      if (receiptStoragePath) {
        const { error: mediaError } = await admin.from("asset_media").insert({
          apartment_id: draftApartment.id,
          asset_id: null,
          event_id: null,
          inspection_id: null,
          utility_bill_id: result.row.id,
          storage_path: receiptStoragePath,
          media_type: String(billPayload.receiptMediaType ?? "application/octet-stream"),
          caption: String(billPayload.receiptFilename ?? "Квитанция из Telegram"),
          created_by: `telegram:${account.telegram_user_id}`,
          document_type: "invoice",
          document_note: `Квитанция: ${result.row.service}, ${result.row.period}`,
        });
        if (mediaError) {
          await admin.from("utility_bills").delete().eq("apartment_id", draftApartment.id).eq("id", result.row.id);
          return `Не удалось сохранить квитанцию в архиве: ${mediaError.message}`;
        }
      }
      await saveConversation(admin, account, { previous_response_id: null, pending_action: null });
      return `Счёт «${result.row.service}» за ${result.row.period} создан для объекта «${draftApartment.name}». Сумма: ${Number(result.row.amount).toLocaleString("ru-RU")} ₽.`;
    }
    return "Черновик повреждён. Давайте соберём его заново.";
  }

  if (!attachment && conversation.pending_action && cancellationWords.has(normalized)) {
    await removePendingAttachment(admin, conversation.pending_action);
    await saveConversation(admin, account, { previous_response_id: null, pending_action: null });
    return "Черновик отменён.";
  }

  if (attachment && conversation.pending_action) {
    await removePendingAttachment(admin, conversation.pending_action);
    await saveConversation(admin, account, { previous_response_id: null, pending_action: null });
  }

  const contextualMessage = !attachment && conversation.pending_action
    ? `${message}\n\nТекущий неподтверждённый черновик: ${JSON.stringify(conversation.pending_action)}`
    : message;
  let attachmentClaimed = false;
  const pendingPayload = conversation.pending_action?.payload;
  const existingReceiptStoragePath =
    pendingPayload && typeof pendingPayload === "object"
      ? (pendingPayload as Record<string, unknown>).receiptStoragePath
      : undefined;
  try {
    let response = await createResponse(
      attachment ? attachmentInput(contextualMessage, attachment) : contextualMessage,
      attachment ? null : conversation.previous_response_id,
      account,
    );
    for (let turn = 0; turn < 3; turn += 1) {
      const calls = (response.output ?? []).filter((item) => item.type === "function_call" && item.call_id);
      if (!calls.length) break;
      const outputs = [];
      for (const call of calls) {
        const result = await executeTool(
          admin,
          account,
          call,
          attachment,
          typeof existingReceiptStoragePath === "string" ? existingReceiptStoragePath : undefined,
        );
        if (call.name === "prepare_utility_bill" && result.ok && attachment) {
          attachmentClaimed = true;
        }
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
      }
      response = await createResponse(outputs, response.id, account);
    }
    await saveConversation(admin, account, { previous_response_id: response.id });
    if (attachment && !attachmentClaimed) {
      await admin.storage.from("asset-media").remove([attachment.storagePath]);
    }
    return plainText(response) || "Не получилось сформировать ответ. Попробуйте переформулировать запрос.";
  } catch (error) {
    if (attachment && !attachmentClaimed) {
      await admin.storage.from("asset-media").remove([attachment.storagePath]);
    }
    throw error;
  }
}
