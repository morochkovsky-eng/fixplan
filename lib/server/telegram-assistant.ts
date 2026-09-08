import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleaningPayload } from "@/app/api/cleanings/helpers";
import { createCleaningRecord } from "@/lib/server/cleanings";
import {
  listTelegramApartments,
  resolveTelegramApartment,
  type TelegramOwnerAccount,
} from "@/lib/server/telegram-context";
import { createUtilityBillRecord, normalizeBillPayload } from "@/lib/server/utility-bills";
import { normalizeUtilityPeriod } from "@/lib/utility-period";

type ActiveTelegramAccount = TelegramOwnerAccount & {
  apartment_id: string;
  apartment_name: string;
  apartment_address: string;
  apartment_currency: string;
  apartment_timezone: string;
  apartment_utility_insurance_included: boolean | null;
  apartment_locale: "ru";
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
const assetStatusLabels: Record<string, string> = {
  ok: "Исправно",
  attention: "Требует внимания",
  in_progress: "В работе",
  needs_master: "Нужен мастер",
};

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
    name: "list_assets",
    description: "Получить узлы текущей квартиры. Используй для поиска узла и вопросов о состоянии, комнате или категории.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Код, название, комната или категория; пустая строка для всех узлов" },
        status: { type: "string", enum: ["all", "ok", "attention", "in_progress", "needs_master"] },
      },
      required: ["query", "status"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "list_work_orders",
    description: "Получить задания мастерам по текущей квартире и их актуальные статусы.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["all", "draft", "sent", "in_progress", "completed", "accepted"] },
      },
      required: ["status"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_utility_state",
    description: "Получить счётчики, последние показания и открытые коммунальные счета текущей квартиры.",
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
    name: "prepare_work_order",
    description: "Подготовить задание мастеру по одному или нескольким найденным узлам. Ничего не создаёт до явного подтверждения владельца.",
    parameters: {
      type: "object",
      properties: {
        contractor: { type: "string", description: "Имя мастера или название компании" },
        contractorPhone: { type: "string", description: "Телефон мастера, пустая строка если не указан" },
        assets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              assetId: { type: "string", description: "Точный id из list_assets" },
              instruction: { type: "string", description: "Что нужно сделать с этим узлом" },
            },
            required: ["assetId", "instruction"],
            additionalProperties: false,
          },
        },
      },
      required: ["contractor", "contractorPhone", "assets"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "prepare_utility_reading",
    description: "Подготовить показание существующего счётчика. Ничего не сохраняет до явного подтверждения владельца.",
    parameters: {
      type: "object",
      properties: {
        meterId: { type: "string", description: "Точный id счётчика из get_utility_state" },
        period: { type: "string", description: "Расчётный период в понятном пользователю виде" },
        value: { type: "number", description: "Новое показание счётчика" },
        note: { type: "string", description: "Комментарий, пустая строка если его нет" },
      },
      required: ["meterId", "period", "value", "note"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "prepare_asset_event",
    description: "Подготовить запись в истории конкретного узла, при необходимости со сменой статуса и фотографией. Ничего не сохраняет до подтверждения.",
    parameters: {
      type: "object",
      properties: {
        assetId: { type: "string", description: "Точный id узла из list_assets" },
        eventType: { type: "string", enum: ["comment", "status", "repair"] },
        title: { type: "string" },
        body: { type: "string" },
        statusAfter: { type: "string", enum: ["unchanged", "ok", "attention", "in_progress", "needs_master"] },
      },
      required: ["assetId", "eventType", "title", "body", "statusAfter"],
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
    description: "Сразу создать или дополнить коммунальный черновик, когда известна положительная сумма. Черновик сохраняется без подтверждения; кнопка подтверждения создаёт окончательный счёт. Если суммы нет, задай один вопрос и не вызывай инструмент.",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string", description: "Название услуги или поставщика" },
        documentKind: { type: "string", enum: ["housing", "electricity", "water", "other"], description: "Тип квитанции: ЖКХ, электричество, вода или другое" },
        period: { type: "string", description: "Расчётный период в понятном пользователю виде" },
        amount: { type: "number", description: "Сумма, которую сохраняем жильцу. Для ЖКХ строго строка «Начислено»; для электричества итог документа плюс отдельно указанная добровольная услуга, если она включена по умолчанию" },
        periodChargeAmount: { type: "number", description: "Начисление строго за расчётный период. Для ЖКХ только значение рядом со словом «Начислено», никогда строка «К оплате» или общий долг" },
        providerBalanceAmount: { type: "number", description: "Баланс владельца перед поставщиком из строки «К оплате», долг или сальдо; 0 если отсутствует. Не является долгом жильца" },
        creditAmount: { type: "number", description: "Переплата, скидка или вычет, уменьшающие долг; 0 если отсутствуют" },
        dueDate: { type: "string", description: "Срок оплаты в понятном пользователю виде, пустая строка если не указан" },
        allocation: { type: "string", enum: ["owner", "tenant", "split"], description: "На кого относится расход. По умолчанию owner, если пользователь не уточнил другое" },
        tenantAmount: { type: "number", description: "Итоговый долг жильца; при allocation tenant равен amount и включает добровольную строку, если optionalChargeIncluded=true" },
        optionalChargeLabel: { type: "string", description: "Название добровольной дополнительной услуги, например страхования; пустая строка если её нет" },
        optionalChargeAmount: { type: "number", description: "Сумма добровольной дополнительной услуги; 0 если её нет" },
        optionalChargeIncluded: { type: "boolean", description: "Добровольная услуга включена в сумму по умолчанию; false если её нет или пользователь ранее отказался" },
        note: { type: "string", description: "Короткие важные детали квитанции, пустая строка если их нет" },
      },
      required: ["service", "documentKind", "period", "amount", "periodChargeAmount", "providerBalanceAmount", "creditAmount", "dueDate", "allocation", "tenantAmount", "optionalChargeLabel", "optionalChargeAmount", "optionalChargeIncluded", "note"],
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
  const today = new Intl.DateTimeFormat("ru-RU", { dateStyle: "full", timeStyle: "short", timeZone: account.apartment_timezone }).format(new Date());
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.4-nano",
      instructions: `Ты личный ассистент владельца объектов в сервисе FixPlan. Отвечай сухо, по делу и по-русски: не больше шести коротких строк. Точная текущая локальная дата и время: ${today}; часовой пояс: ${account.apartment_timezone}. Текущий объект: «${account.apartment_name}», адрес: ${account.apartment_address || "не указан"}, id: ${account.apartment_id}, валюта: ${account.apartment_currency}. Настройка добровольного страхования: ${account.apartment_utility_insurance_included === false ? "исключать" : "включать по умолчанию"}. Если владелец спрашивает о другом объекте или объект неясен, используй list_apartments и предложи короткий выбор; после однозначного выбора используй select_apartment. Данные о квартире получай только через инструменты: не отвечай по памяти диалога, если актуальное состояние можно проверить. Не утверждай, что действие выполнено, пока инструмент не вернул успех. Для новой уборки собери дату, зоны, клинера, чек-лист и требования к фото, затем вызови prepare_cleaning. Для счёта или квитанции извлеки только услугу, расчётный период, сумму жильца и срок оплаты. Критическое правило для квитанций ЖКХ: сумма жильца и amount — значение строки «Начислено» за этот расчётный период. «К оплате», общий долг, сальдо, задолженность и переплата лицевого счёта относятся к расчётам владельца с поставщиком и никогда не заменяют начисление жильцу. Не вычитай накопленную переплату из строки «Начислено». Для готовой квитанции за электричество amount равен итоговой сумме документа. Добровольную страховку и другие необязательные строки включай по умолчанию, заполняй optionalChargeLabel/optionalChargeAmount/optionalChargeIncluded и не останавливай черновик вопросом. При любой достоверной положительной сумме сразу вызывай prepare_utility_bill; если суммы нет или она не читается, задай один блокирующий вопрос. Для показания сначала найди точный счётчик через get_utility_state, затем вызови prepare_utility_reading. Коммунальные данные могут приходить частями: отдельно квитанция ЖКХ, готовый счёт за электричество или только показания. Новая квитанция того же периода обязательно дополняет текущий черновик или уже созданный месячный счёт. Не рассчитывай стоимость по одним показаниям без предыдущего значения и действующего тарифа; прямо сообщи, что сумма пока не рассчитана. Если на коммунальной фотографии виден счётчик с показаниями, анализируй только сам счётчик и цифры на табло. Автоматы, УЗО, щиток, провода и подписи линий считай фоном: никогда не упоминай их и не предлагай ремонт или осмотр, если владелец прямо не сообщил о неисправности. Не описывай содержимое фотографии, адрес, поставщика, лицевой счёт, ЕРЦ/СПБ и прочие реквизиты. Для сообщения о проблеме или ремонте сначала найди точный узел через list_assets, затем вызови prepare_asset_event. Для задания мастеру сначала найди точные узлы через list_assets, собери мастера и отдельное поручение по каждому узлу, затем вызови prepare_work_order. Не додумывай неразборчивые значения. Как только обязательных данных достаточно, обязательно вызови соответствующий prepare-инструмент. Интерфейс сам сформирует краткое резюме коммунального черновика и кнопки: никогда не проси подтверждать текстом. Никогда не создавай окончательную запись без явного подтверждения. Мастера и клинеры работают по гостевым ссылкам. Форматируй ответ как обычный текст Telegram без Markdown, звёздочек и решёток. Денежные суммы обозначай только знаком валюты, для рублей только «₽», никогда RUB, rub., rubs или «руб.». Не показывай технические идентификаторы и английские статусы. Не повторяй просьбу или вывод.`,
      input,
      tools,
      tool_choice: "auto",
      parallel_tool_calls: false,
      previous_response_id: previousResponseId ?? undefined,
      safety_identifier: createHash("sha256").update(String(account.telegram_user_id)).digest("hex").slice(0, 64),
      max_output_tokens: 280,
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
  existingPendingAction?: Record<string, unknown> | null,
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
    account.apartment_currency = apartment.currency;
    account.apartment_timezone = apartment.timezone;
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

  if (call.name === "list_assets") {
    let query = admin
      .from("assets")
      .select("id,code,name,room_id,category,status,last_checked")
      .eq("apartment_id", account.apartment_id)
      .is("deleted_at", null)
      .order("code")
      .limit(250);
    if (args.status && args.status !== "all") query = query.eq("status", String(args.status));
    const { data, error } = await query;
    if (error) return { ok: false, error: error.message };
    const search = String(args.query ?? "").trim().toLocaleLowerCase("ru-RU");
    const assets = search
      ? (data ?? []).filter((asset) => [asset.code, asset.name, asset.room_id, asset.category].some((value) => String(value ?? "").toLocaleLowerCase("ru-RU").includes(search)))
      : data ?? [];
    return { ok: true, assets: assets.slice(0, 40), total: assets.length, truncated: assets.length > 40 };
  }

  if (call.name === "list_work_orders") {
    let query = admin
      .from("inspections")
      .select("id,number,title,contractor,contractor_phone,status,allowed_asset_ids,created_at_label,completed_at_label")
      .eq("apartment_id", account.apartment_id)
      .eq("workflow", "work_order")
      .order("created_at", { ascending: false })
      .limit(30);
    if (args.status && args.status !== "all") query = query.eq("status", String(args.status));
    const { data, error } = await query;
    if (error) return { ok: false, error: error.message };
    return { ok: true, workOrders: data ?? [] };
  }

  if (call.name === "get_utility_state") {
    const [metersResult, readingsResult, billsResult] = await Promise.all([
      admin.from("utility_meters").select("id,service,label,serial,location,unit,next_due_label,status,last_reading,current_rate").eq("apartment_id", account.apartment_id).order("created_at"),
      admin.from("utility_readings").select("id,meter_id,period,value,previous_value,consumption,rate,calculated_amount,submitted_at_label,source").eq("apartment_id", account.apartment_id).order("created_at", { ascending: false }).limit(30),
      admin.from("utility_bills").select("id,service,period,amount,due_date_label,status,allocation,tenant_amount,reimbursement_status").eq("apartment_id", account.apartment_id).neq("status", "paid").order("created_at", { ascending: false }).limit(20),
    ]);
    const error = metersResult.error ?? readingsResult.error ?? billsResult.error;
    if (error) return { ok: false, error: error.message };
    return { ok: true, meters: metersResult.data ?? [], readings: readingsResult.data ?? [], openBills: billsResult.data ?? [] };
  }

  if (call.name === "prepare_work_order") {
    const contractor = String(args.contractor ?? "").trim();
    const requestedAssets = Array.isArray(args.assets)
      ? args.assets.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      : [];
    const assetIds = [...new Set(requestedAssets.map((item) => String(item.assetId ?? "").trim()).filter(Boolean))];
    if (!contractor || !assetIds.length) {
      return { ok: false, error: "Для задания нужны мастер и хотя бы один узел." };
    }
    const { data: assets, error } = await admin
      .from("assets")
      .select("id,code,name")
      .eq("apartment_id", account.apartment_id)
      .is("deleted_at", null)
      .in("id", assetIds);
    if (error) return { ok: false, error: error.message };
    if ((assets ?? []).length !== assetIds.length) {
      return { ok: false, error: "Один или несколько узлов не найдены в текущей квартире. Обновите список узлов." };
    }
    const assetInstructions = Object.fromEntries(requestedAssets.map((item) => [String(item.assetId), String(item.instruction ?? "").trim()]));
    const payload = {
      contractor,
      contractorPhone: String(args.contractorPhone ?? "").trim(),
      allowedAssetIds: assetIds,
      assetInstructions,
    };
    await saveConversation(admin, account, {
      pending_action: { type: "create_work_order", apartmentId: account.apartment_id, payload },
    });
    return {
      ok: true,
      draft: { ...payload, assets },
      instruction: "Покажи кратко мастера, выбранные узлы и поручения. Не проси вводить команду: интерфейс добавит кнопки.",
    };
  }

  if (call.name === "prepare_utility_reading") {
    const meterId = String(args.meterId ?? "").trim();
    const period = normalizeUtilityPeriod(args.period);
    const value = Number(args.value);
    const { data: meter, error } = await admin
      .from("utility_meters")
      .select("id,service,label,serial,location,unit,last_reading,current_rate")
      .eq("apartment_id", account.apartment_id)
      .eq("id", meterId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!meter || !period || !Number.isFinite(value) || value < 0) {
      return { ok: false, error: "Проверьте счётчик, период и значение показания." };
    }
    const payload = {
      meterId,
      period,
      value,
      note: String(args.note ?? "").trim(),
      photoStoragePath: attachment?.storagePath ?? existingReceiptStoragePath,
      photoFilename: attachment?.filename,
      photoMediaType: attachment?.mimeType,
    };
    await saveConversation(admin, account, {
      pending_action: { type: "create_utility_reading", apartmentId: account.apartment_id, payload },
    });
    return {
      ok: true,
      draft: { ...payload, meter },
      attachmentClaimed: Boolean(attachment),
      instruction: "Покажи кратко счётчик, период, значение и наличие фото. Не проси вводить команду: интерфейс добавит кнопки.",
    };
  }

  if (call.name === "prepare_asset_event") {
    const assetId = String(args.assetId ?? "").trim();
    const title = String(args.title ?? "").trim();
    const body = String(args.body ?? "").trim();
    const eventType = String(args.eventType ?? "comment");
    const statusAfter = String(args.statusAfter ?? "unchanged");
    const eventTypes = new Set(["comment", "status", "repair"]);
    const statuses = new Set(["unchanged", "ok", "attention", "in_progress", "needs_master"]);
    if (!assetId || !title || !body || !eventTypes.has(eventType) || !statuses.has(statusAfter)) {
      return { ok: false, error: "Проверьте узел, описание события и новый статус." };
    }
    if (attachment && !attachment.mimeType.startsWith("image/")) {
      return { ok: false, error: "К событию узла можно приложить только фотографию." };
    }
    const { data: asset, error } = await admin
      .from("assets")
      .select("id,code,name,room_id,category,status")
      .eq("apartment_id", account.apartment_id)
      .eq("id", assetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!asset) return { ok: false, error: "Узел не найден в текущей квартире." };
    const payload = {
      assetId,
      eventType,
      title,
      body,
      statusAfter,
      photoStoragePath: attachment?.storagePath ?? existingReceiptStoragePath,
      photoFilename: attachment?.filename,
      photoMediaType: attachment?.mimeType,
    };
    await saveConversation(admin, account, {
      pending_action: { type: "create_asset_event", apartmentId: account.apartment_id, payload },
    });
    return {
      ok: true,
      draft: { ...payload, asset },
      attachmentClaimed: Boolean(attachment),
      instruction: "Покажи кратко узел, запись, изменение статуса и наличие фото. Не проси вводить команду: интерфейс добавит кнопки.",
    };
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
    return { ok: true, draft: payload, instruction: "Покажи понятное краткое резюме. Не проси вводить команду: интерфейс добавит кнопки." };
  }

  if (call.name === "prepare_utility_bill") {
    const documentKind = String(args.documentKind ?? "other");
    const periodChargeAmount = Number(args.periodChargeAmount ?? 0);
    const requestedOptionalAmount = Number(args.optionalChargeAmount ?? 0);
    const requestedOptionalIncluded = Boolean(args.optionalChargeIncluded && requestedOptionalAmount > 0);
    const excludesOptionalCharge = account.apartment_utility_insurance_included === false && requestedOptionalIncluded;
    const extractedAmount = documentKind === "housing" ? periodChargeAmount : Number(args.amount ?? 0);
    const storedAmount = Math.max(0, extractedAmount - (excludesOptionalCharge ? requestedOptionalAmount : 0));
    const tenantReceipt = Boolean(attachment && ["housing", "electricity", "water"].includes(documentKind));
    const item: Record<string, unknown> = {
      ...args,
      amount: storedAmount,
      allocation: tenantReceipt ? "tenant" : args.allocation,
      tenantAmount: tenantReceipt ? storedAmount : Math.max(0, Number(args.tenantAmount ?? 0) - (excludesOptionalCharge ? requestedOptionalAmount : 0)),
      optionalChargeIncluded: requestedOptionalIncluded && !excludesOptionalCharge,
      status: "draft",
      source: "telegram_private",
      receiptStoragePath: attachment?.storagePath ?? existingReceiptStoragePath,
      receiptFilename: attachment?.filename,
      receiptMediaType: attachment?.mimeType,
    };
    const validation = normalizeBillPayload(item);
    if ("error" in validation) {
      await saveConversation(admin, account, {
        pending_action: { type: "collect_utility_bill", apartmentId: account.apartment_id, payload: item },
      });
      return {
        ok: false,
        error: validation.error,
        attachmentClaimed: Boolean(attachment),
        instruction: "Черновик неполный. Кнопки подтверждения не показывать; попросить только недостающие данные.",
      };
    }
    const period = normalizeUtilityPeriod(item.period);
    const previousPayload = existingPendingAction?.type === "create_utility_bill" && existingPendingAction.payload && typeof existingPendingAction.payload === "object"
      ? existingPendingAction.payload as Record<string, unknown>
      : null;
    const previousItems = previousPayload && normalizeUtilityPeriod(previousPayload.period) === period
      ? (Array.isArray(previousPayload.items) ? previousPayload.items : [previousPayload]).filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
      : [];
    const serviceKey = String(item.service ?? "").trim().toLocaleLowerCase("ru-RU");
    const previousSameService = previousItems.find((entry) => String(entry.service ?? "").trim().toLocaleLowerCase("ru-RU") === serviceKey);
    const { data: existingBills, error: existingBillsError } = await admin
      .from("utility_bills")
      .select("id,service,period,amount,tenant_amount,due_date_label,status")
      .eq("apartment_id", account.apartment_id)
      .eq("period", period)
      .neq("status", "paid");
    if (existingBillsError) return { ok: false, error: existingBillsError.message };
    const previousDraftId = String(previousSameService?.draftBillId ?? "").trim();
    const matchingConfirmed = (existingBills ?? []).find((bill) => bill.status !== "draft" && String(bill.service).trim().toLocaleLowerCase("ru-RU") === serviceKey);
    let draftBillId = previousDraftId;
    if (previousDraftId) {
      const { error: updateDraftError } = await admin
        .from("utility_bills")
        .update({ ...validation.bill, updated_at: new Date().toISOString() })
        .eq("apartment_id", account.apartment_id)
        .eq("id", previousDraftId);
      if (updateDraftError) return { ok: false, error: updateDraftError.message };
    } else {
      const draftResult = await createUtilityBillRecord(admin, { apartmentId: account.apartment_id, payload: item });
      if ("error" in draftResult || !draftResult.row) return { ok: false, error: draftResult.error ?? "Не удалось сохранить черновик." };
      draftBillId = String(draftResult.row.id);
    }
    const savedItem: Record<string, unknown> = {
      ...item,
      draftBillId,
      replaceBillId: matchingConfirmed?.id,
    };
    const items = [
      ...previousItems.filter((entry) => String(entry.service ?? "").trim().toLocaleLowerCase("ru-RU") !== serviceKey),
      savedItem,
    ];
    const pendingServiceKeys = new Set(items.map((entry) => String(entry.service ?? "").trim().toLocaleLowerCase("ru-RU")));
    const payload = {
      ...savedItem,
      period,
      items,
      existingItems: (existingBills ?? []).filter((bill) => bill.status !== "draft" && !pendingServiceKeys.has(String(bill.service).trim().toLocaleLowerCase("ru-RU"))),
      draftCreatedAt: previousPayload?.draftCreatedAt ?? new Date().toISOString(),
    };
    await saveConversation(admin, account, {
      pending_action: { type: "create_utility_bill", apartmentId: account.apartment_id, payload },
    });
    return {
      ok: true,
      draft: { ...payload, latestItem: savedItem },
      attachmentClaimed: Boolean(attachment),
      instruction: "Черновик уже сохранён. Покажи кратко услугу, период, сумму жильца и срок оплаты. Не проси подтверждать словами: интерфейс добавит кнопки создания счёта и удаления черновика.",
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
  const record = payload as Record<string, unknown>;
  const entries = Array.isArray(record.items)
    ? record.items.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    : [record];
  const paths = entries.flatMap((entry) => [entry.receiptStoragePath, entry.photoStoragePath])
    .filter((path): path is string => typeof path === "string" && Boolean(path));
  if (paths.length) await admin.storage.from("asset-media").remove([...new Set(paths)]);
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
          text: message || "Определи намерение по контексту диалога и подготовь подходящий черновик. Коммунальный черновик сохраняй сразу, а окончательный счёт — только по кнопке. Если на фото есть коммунальный счётчик, работай только с показанием на табло; автоматы, УЗО и щиток игнорируй, если пользователь не сообщил о неисправности.",
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
    apartment_currency: context.apartment.currency,
    apartment_timezone: context.apartment.timezone,
    apartment_utility_insurance_included: context.apartment.utility_insurance_included,
    apartment_locale: context.apartment.locale,
  };
  const normalized = message.trim().toLocaleLowerCase("ru-RU");

  if (!attachment && conversation.pending_action?.type === "create_utility_bill" && /страховк/u.test(normalized)) {
    const excludesInsurance = /(?:не\s+включ|исключ|убер|отказ)/u.test(normalized);
    const keepsInsurance = /(?:включ|остав)/u.test(normalized) && !excludesInsurance;
    if (excludesInsurance || keepsInsurance) {
      const pendingPayload = conversation.pending_action.payload;
      if (!pendingPayload || typeof pendingPayload !== "object") return "Черновик повреждён. Давайте соберём его заново.";
      const payload = pendingPayload as Record<string, unknown>;
      const sourceItems = Array.isArray(payload.items) ? payload.items : [payload];
      let changed = false;
      const items = sourceItems.map((entry) => {
        if (!entry || typeof entry !== "object") return entry;
        const item = entry as Record<string, unknown>;
        const optionalAmount = Number(item.optionalChargeAmount ?? 0);
        if (!(optionalAmount > 0) || !String(item.optionalChargeLabel ?? "").toLocaleLowerCase("ru-RU").includes("страх")) return item;
        const wasIncluded = Boolean(item.optionalChargeIncluded);
        if (wasIncluded === !excludesInsurance) return item;
        changed = true;
        const direction = excludesInsurance ? -1 : 1;
        return {
          ...item,
          amount: Math.max(0, Number(item.amount ?? 0) + direction * optionalAmount),
          tenantAmount: Math.max(0, Number(item.tenantAmount ?? 0) + direction * optionalAmount),
          optionalChargeIncluded: !excludesInsurance,
          note: `Добровольное страхование ${excludesInsurance ? "исключено" : "включено"} по выбору владельца.`,
        };
      });
      if (!changed) return excludesInsurance ? "Страхование уже исключено из черновика." : "Страхование уже включено в черновик.";
      for (const entry of items) {
        if (!entry || typeof entry !== "object") continue;
        const changedItem = entry as Record<string, unknown>;
        const draftBillId = String(changedItem.draftBillId ?? "").trim();
        if (!draftBillId || !String(changedItem.optionalChargeLabel ?? "").toLocaleLowerCase("ru-RU").includes("страх")) continue;
        const normalizedDraft = normalizeBillPayload({ ...changedItem, status: "draft" });
        if ("error" in normalizedDraft) throw new Error(normalizedDraft.error);
        const { error: draftUpdateError } = await admin
          .from("utility_bills")
          .update({ ...normalizedDraft.bill, updated_at: new Date().toISOString() })
          .eq("apartment_id", account.apartment_id)
          .eq("id", draftBillId);
        if (draftUpdateError) throw new Error(draftUpdateError.message);
      }
      const latest = [...items].reverse().find((entry) => entry && typeof entry === "object") as Record<string, unknown>;
      await saveConversation(admin, account, {
        previous_response_id: null,
        pending_action: {
          ...conversation.pending_action,
          payload: { ...payload, ...latest, items },
        },
      });
      const { error: preferenceError } = await admin
        .from("apartments")
        .update({ utility_insurance_included: !excludesInsurance })
        .eq("id", account.apartment_id);
      if (preferenceError) throw new Error(preferenceError.message);
      return excludesInsurance ? "Страхование исключено. Черновик пересчитан." : "Страхование включено. Черновик пересчитан.";
    }
  }

  if (!attachment && !conversation.pending_action && /страховк/u.test(normalized)) {
    const excludesInsurance = /(?:не\s+включ|исключ|убер|отказ)/u.test(normalized);
    const keepsInsurance = /(?:включ|остав)/u.test(normalized) && !excludesInsurance;
    if (excludesInsurance || keepsInsurance) {
      const { error: preferenceError } = await admin
        .from("apartments")
        .update({ utility_insurance_included: !excludesInsurance })
        .eq("id", account.apartment_id);
      if (preferenceError) throw new Error(preferenceError.message);
      const { data: bill, error: billError } = await admin
        .from("utility_bills")
        .select("id,period,amount,tenant_amount,optional_charge_amount,optional_charge_included")
        .eq("apartment_id", account.apartment_id)
        .gt("optional_charge_amount", 0)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (billError) throw new Error(billError.message);
      if (!bill || Boolean(bill.optional_charge_included) === !excludesInsurance) {
        return excludesInsurance ? "Запомнил: добровольное страхование не включаем." : "Запомнил: добровольное страхование включаем.";
      }
      const optionalAmount = Number(bill.optional_charge_amount ?? 0);
      const direction = excludesInsurance ? -1 : 1;
      const amount = Math.max(0, Number(bill.amount) + direction * optionalAmount);
      const tenantAmount = Math.max(0, Number(bill.tenant_amount) + direction * optionalAmount);
      const { error: updateError } = await admin.from("utility_bills").update({
        amount,
        tenant_amount: tenantAmount,
        optional_charge_included: !excludesInsurance,
        updated_at: new Date().toISOString(),
      }).eq("apartment_id", account.apartment_id).eq("id", bill.id);
      if (updateError) throw new Error(updateError.message);
      const formatted = new Intl.NumberFormat("ru-RU", { style: "currency", currency: account.apartment_currency }).format(tenantAmount);
      return `Страхование ${excludesInsurance ? "исключено из" : "добавлено в"} счёт за ${bill.period}. Жилец должен: ${formatted}. Выбор запомнен.`;
    }
  }

  if (!attachment && conversation.pending_action && confirmationWords.has(normalized)) {
    const pending = conversation.pending_action;
    if (!pending.payload || typeof pending.payload !== "object") {
      return "Черновик повреждён. Давайте соберём его заново.";
    }
    if (pending.type === "collect_utility_bill") {
      return "Счёт пока нельзя создать: не хватает положительной суммы или других обязательных данных. Пришлите недостающие сведения.";
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
      const items = (Array.isArray(billPayload.items) ? billPayload.items : [billPayload])
        .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
      const createdBillIds: string[] = [];
      for (const item of items) {
        const confirmedPayload = { ...item, status: "due", ownerConfirmedAt: new Date().toISOString() };
        const draftBillId = String(item.draftBillId ?? "").trim();
        const replaceBillId = String(item.replaceBillId ?? "").trim();
        let resultRow: Record<string, unknown> | null = null;
        if (draftBillId) {
          const normalized = normalizeBillPayload(confirmedPayload);
          if ("error" in normalized) return `Не удалось обновить счёт: ${normalized.error}`;
          const { data: updated, error: updateError } = await admin
            .from("utility_bills")
            .update({ ...normalized.bill, updated_at: new Date().toISOString() })
            .eq("apartment_id", draftApartment.id)
            .eq("id", draftBillId)
            .select("*")
            .single();
          if (updateError || !updated) return `Не удалось обновить счёт: ${updateError?.message ?? "неизвестная ошибка"}`;
          resultRow = updated as Record<string, unknown>;
          if (replaceBillId && replaceBillId !== draftBillId) {
            const { error: replaceError } = await admin.from("utility_bills").delete().eq("apartment_id", draftApartment.id).eq("id", replaceBillId);
            if (replaceError) return `Не удалось заменить прежний счёт: ${replaceError.message}`;
          }
        } else if (replaceBillId) {
          const normalized = normalizeBillPayload(confirmedPayload);
          if ("error" in normalized) return `Не удалось обновить счёт: ${normalized.error}`;
          const { data: updated, error: updateError } = await admin
            .from("utility_bills")
            .update({ ...normalized.bill, updated_at: new Date().toISOString() })
            .eq("apartment_id", draftApartment.id)
            .eq("id", replaceBillId)
            .select("*")
            .single();
          if (updateError || !updated) return `Не удалось обновить счёт: ${updateError?.message ?? "неизвестная ошибка"}`;
          resultRow = updated as Record<string, unknown>;
        } else {
          const result = await createUtilityBillRecord(admin, {
            apartmentId: draftApartment.id,
            payload: confirmedPayload,
          });
          if ("error" in result || !result.row) {
            if (createdBillIds.length) await admin.from("utility_bills").delete().eq("apartment_id", draftApartment.id).in("id", createdBillIds);
            return `Не удалось создать счёт: ${result.error ?? "неизвестная ошибка"}`;
          }
          resultRow = result.row as unknown as Record<string, unknown>;
          createdBillIds.push(String(result.row.id));
        }
        const receiptStoragePath = String(item.receiptStoragePath ?? "").trim();
        if (receiptStoragePath) {
          const { error: mediaError } = await admin.from("asset_media").insert({
            apartment_id: draftApartment.id,
            asset_id: null,
            event_id: null,
            inspection_id: null,
            utility_bill_id: String(resultRow.id),
            storage_path: receiptStoragePath,
            media_type: String(item.receiptMediaType ?? "application/octet-stream"),
            caption: String(item.receiptFilename ?? "Квитанция из Telegram"),
            created_by: `telegram:${account.telegram_user_id}`,
            document_type: "invoice",
            document_note: `Квитанция: ${String(resultRow.service)}, ${String(resultRow.period)}`,
          });
          if (mediaError) {
            await admin.from("utility_bills").delete().eq("apartment_id", draftApartment.id).in("id", createdBillIds);
            return `Не удалось сохранить квитанцию в архиве: ${mediaError.message}`;
          }
        }
      }
      await saveConversation(admin, account, { previous_response_id: null, pending_action: null });
      const tenantTotal = items.reduce((sum, item) => sum + Number(item.tenantAmount ?? 0), 0);
      return `Счёт за ${normalizeUtilityPeriod(billPayload.period)} создан. Жилец должен: ${new Intl.NumberFormat("ru-RU", { style: "currency", currency: draftApartment.currency }).format(tenantTotal)}.`;
    }
    if (pending.type === "create_work_order") {
      const payload = pending.payload as Record<string, unknown>;
      const requestedIds = Array.isArray(payload.allowedAssetIds)
        ? payload.allowedAssetIds.map(String).filter(Boolean)
        : [];
      const { data: assets, error: assetsError } = await admin
        .from("assets")
        .select("id,code,name")
        .eq("apartment_id", draftApartment.id)
        .is("deleted_at", null)
        .in("id", requestedIds);
      if (assetsError) return `Не удалось проверить узлы задания: ${assetsError.message}`;
      if (!requestedIds.length || (assets ?? []).length !== requestedIds.length) {
        return "Состав узлов изменился. Отмените черновик и соберите задание заново.";
      }
      const { count } = await admin
        .from("inspections")
        .select("id", { count: "exact", head: true })
        .eq("apartment_id", draftApartment.id)
        .eq("workflow", "work_order");
      const contractor = String(payload.contractor ?? "").trim();
      const contractorPhone = String(payload.contractorPhone ?? "").trim();
      const guestToken = randomBytes(24).toString("hex");
      const id = `work-${Date.now()}-${Math.round(Math.random() * 1000)}`;
      const createdAt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: draftApartment.timezone }).format(new Date());
      const { error: insertError } = await admin.from("inspections").insert({
        apartment_id: draftApartment.id,
        id,
        number: `Задание #${(count ?? 0) + 1}`,
        title: contractorPhone ? `${contractor} · ${contractorPhone}` : contractor,
        created_at_label: createdAt,
        created_by: `telegram:${account.telegram_user_id}`,
        contractor,
        contractor_phone: contractorPhone || null,
        workflow: "work_order",
        scope: "custom",
        status: "sent",
        allowed_asset_ids: requestedIds,
        asset_instructions: payload.assetInstructions ?? {},
        summary: "Задание создано. Ожидаем результат работы мастера по выбранным узлам.",
        guest_token: guestToken,
        result_ids: [],
      });
      if (insertError) return `Не удалось создать задание: ${insertError.message}`;
      await saveConversation(admin, account, { previous_response_id: null, pending_action: null });
      const link = `${appOrigin.replace(/\/$/, "")}/guest/${guestToken}`;
      return `Задание #${(count ?? 0) + 1} создано для объекта «${draftApartment.name}». Мастер: ${contractor}. Узлов: ${requestedIds.length}.\n${link}`;
    }
    if (pending.type === "create_utility_reading") {
      const payload = pending.payload as Record<string, unknown>;
      const meterId = String(payload.meterId ?? "").trim();
      const value = Number(payload.value);
      const period = normalizeUtilityPeriod(payload.period);
      const { data: meter, error: meterError } = await admin
        .from("utility_meters")
        .select("id,label,last_reading,current_rate,status")
        .eq("apartment_id", draftApartment.id)
        .eq("id", meterId)
        .maybeSingle();
      if (meterError) return `Не удалось проверить счётчик: ${meterError.message}`;
      if (!meter || !period || !Number.isFinite(value) || value < 0) {
        return "Счётчик или данные черновика изменились. Отмените черновик и соберите показание заново.";
      }
      const readingId = `reading-${randomUUID().slice(0, 8)}`;
      const previousValue = meter.last_reading === null ? null : Number(meter.last_reading);
      if (previousValue !== null && value < previousValue) {
        return "Новое показание меньше предыдущего. Проверьте значение или исправьте начальное показание счётчика.";
      }
      const rate = meter.current_rate === null ? null : Number(meter.current_rate);
      const consumption = previousValue === null ? null : value - previousValue;
      const calculatedAmount = consumption === null || rate === null ? null : consumption * rate;
      const photoStoragePath = String(payload.photoStoragePath ?? "").trim();
      const submittedAt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: draftApartment.timezone }).format(new Date());
      const { error: readingError } = await admin.from("utility_readings").insert({
        apartment_id: draftApartment.id,
        id: readingId,
        meter_id: meterId,
        period,
        value,
        previous_value: previousValue,
        consumption,
        rate,
        calculated_amount: calculatedAmount,
        submitted_at_label: submittedAt,
        source: "telegram",
        note: String(payload.note ?? "").trim() || null,
        photo_storage_path: photoStoragePath || null,
      });
      if (readingError) return `Не удалось сохранить показание: ${readingError.message}`;
      if (photoStoragePath) {
        const { error: mediaError } = await admin.from("asset_media").insert({
          apartment_id: draftApartment.id,
          asset_id: null,
          event_id: null,
          inspection_id: null,
          utility_reading_id: readingId,
          storage_path: photoStoragePath,
          media_type: String(payload.photoMediaType ?? "image/jpeg"),
          caption: String(payload.photoFilename ?? "Фото счётчика из Telegram"),
          created_by: `telegram:${account.telegram_user_id}`,
          document_type: "other",
          document_note: `Показание: ${meter.label}, ${period}`,
        });
        if (mediaError) {
          await admin.from("utility_readings").delete().eq("apartment_id", draftApartment.id).eq("id", readingId);
          return `Не удалось сохранить фото показания: ${mediaError.message}`;
        }
      }
      const { error: updateMeterError } = await admin.from("utility_meters").update({
        status: "submitted",
        last_reading: value,
        updated_at: new Date().toISOString(),
      }).eq("apartment_id", draftApartment.id).eq("id", meterId);
      if (updateMeterError) {
        if (photoStoragePath) await admin.from("asset_media").delete().eq("apartment_id", draftApartment.id).eq("utility_reading_id", readingId);
        await admin.from("utility_readings").delete().eq("apartment_id", draftApartment.id).eq("id", readingId);
        return `Не удалось обновить счётчик: ${updateMeterError.message}`;
      }
      await saveConversation(admin, account, { previous_response_id: null, pending_action: null });
      const calculation = calculatedAmount === null
        ? " Сумма пока не рассчитана: нет предыдущего показания или тарифа."
        : ` Расход: ${consumption?.toLocaleString("ru-RU")}; расчет: ${calculatedAmount.toLocaleString("ru-RU")} руб. по тарифу ${rate?.toLocaleString("ru-RU")}.`;
      return `Показание «${meter.label}» за ${period} сохранено: ${value.toLocaleString("ru-RU")}.${calculation}`;
    }
    if (pending.type === "create_asset_event") {
      const payload = pending.payload as Record<string, unknown>;
      const assetId = String(payload.assetId ?? "").trim();
      const statusAfter = String(payload.statusAfter ?? "unchanged");
      const { data: asset, error: assetError } = await admin
        .from("assets")
        .select("id,code,name,status")
        .eq("apartment_id", draftApartment.id)
        .eq("id", assetId)
        .is("deleted_at", null)
        .maybeSingle();
      if (assetError) return `Не удалось проверить узел: ${assetError.message}`;
      if (!asset) return "Узел больше не существует. Отмените черновик и выберите другой.";
      const eventId = `evt-${Date.now()}-${randomUUID()}`;
      const photoStoragePath = String(payload.photoStoragePath ?? "").trim();
      const eventType = String(payload.eventType ?? "comment");
      const dateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: draftApartment.timezone }).format(new Date());
      const { error: eventError } = await admin.from("events").insert({
        apartment_id: draftApartment.id,
        id: eventId,
        asset_id: assetId,
        inspection_id: null,
        type: eventType,
        date_label: dateLabel,
        title: String(payload.title ?? "Комментарий"),
        body: String(payload.body ?? ""),
        master: `telegram:${account.telegram_user_id}`,
        status_after: statusAfter === "unchanged" ? null : statusAfter,
        photo: photoStoragePath ? { label: "фото", note: "Фото из Telegram" } : null,
      });
      if (eventError) return `Не удалось сохранить запись: ${eventError.message}`;
      if (photoStoragePath) {
        const { error: mediaError } = await admin.from("asset_media").insert({
          apartment_id: draftApartment.id,
          asset_id: assetId,
          event_id: eventId,
          inspection_id: null,
          storage_path: photoStoragePath,
          media_type: String(payload.photoMediaType ?? "image/jpeg"),
          caption: String(payload.photoFilename ?? "Фото узла из Telegram"),
          created_by: `telegram:${account.telegram_user_id}`,
        });
        if (mediaError) {
          await admin.from("events").delete().eq("apartment_id", draftApartment.id).eq("id", eventId);
          return `Не удалось сохранить фотографию: ${mediaError.message}`;
        }
      }
      if (statusAfter !== "unchanged" && statusAfter !== asset.status) {
        const { error: statusError } = await admin.from("assets").update({ status: statusAfter, updated_at: new Date().toISOString() }).eq("apartment_id", draftApartment.id).eq("id", assetId);
        if (statusError) {
          if (photoStoragePath) await admin.from("asset_media").delete().eq("apartment_id", draftApartment.id).eq("event_id", eventId);
          await admin.from("events").delete().eq("apartment_id", draftApartment.id).eq("id", eventId);
          return `Не удалось изменить статус узла: ${statusError.message}`;
        }
      }
      await saveConversation(admin, account, { previous_response_id: null, pending_action: null });
      const statusNote = statusAfter === "unchanged" ? "Статус не изменён." : `Новый статус: ${assetStatusLabels[statusAfter] ?? statusAfter}.`;
      return `Запись добавлена в узел ${asset.code} · ${asset.name}. ${statusNote}`;
    }
    return "Черновик повреждён. Давайте соберём его заново.";
  }

  if (!attachment && conversation.pending_action && cancellationWords.has(normalized)) {
    if (conversation.pending_action.type === "create_utility_bill") {
      const payload = conversation.pending_action.payload;
      const items = payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).items)
        ? (payload as Record<string, unknown>).items as Array<Record<string, unknown>>
        : payload && typeof payload === "object" ? [payload as Record<string, unknown>] : [];
      const draftBillIds = items.map((item) => String(item.draftBillId ?? "").trim()).filter(Boolean);
      if (draftBillIds.length) {
        const { error: deleteDraftError } = await admin
          .from("utility_bills")
          .delete()
          .eq("apartment_id", account.apartment_id)
          .in("id", draftBillIds);
        if (deleteDraftError) throw new Error(deleteDraftError.message);
      }
    }
    await removePendingAttachment(admin, conversation.pending_action);
    await saveConversation(admin, account, { previous_response_id: null, pending_action: null });
    return "Черновик отменён.";
  }

  const keepsUtilityDraft = attachment && conversation.pending_action?.type === "create_utility_bill";
  if (attachment && conversation.pending_action && !keepsUtilityDraft) {
    await removePendingAttachment(admin, conversation.pending_action);
    await saveConversation(admin, account, { previous_response_id: null, pending_action: null });
  }

  const contextualMessage = conversation.pending_action
    ? `${message}\n\nТекущий неподтверждённый черновик: ${JSON.stringify(conversation.pending_action)}`
    : message;
  let attachmentClaimed = false;
  const pendingPayload = conversation.pending_action?.payload;
  const existingAttachmentStoragePath =
    pendingPayload && typeof pendingPayload === "object"
      ? (pendingPayload as Record<string, unknown>).receiptStoragePath ??
        (pendingPayload as Record<string, unknown>).photoStoragePath
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
          typeof existingAttachmentStoragePath === "string" ? existingAttachmentStoragePath : undefined,
          conversation.pending_action,
        );
        if (
          (call.name === "prepare_utility_bill" || call.name === "prepare_utility_reading" || call.name === "prepare_asset_event") &&
          attachment &&
          "attachmentClaimed" in result &&
          result.attachmentClaimed
        ) {
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
