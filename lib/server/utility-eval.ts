import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export const utilityEvalSupportedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const utilityEvalMaxFileBytes = 20 * 1024 * 1024;

export const utilityBillTool = {
  type: "function",
  name: "prepare_utility_bill",
  description: "Подготовить отдельный проверяемый черновик по текущему платёжному документу. Денежные значения передаются десятичными строками с точностью до копейки. Не объединять разные вложения в одну запись.",
  parameters: {
    type: "object",
    properties: {
      service: { type: "string", description: "Краткое название документа или основной услуги" },
      documentKind: { type: "string", enum: ["housing", "electricity", "water", "capital_repair", "other"], description: "Тип платёжного документа" },
      providerName: { type: "string", description: "Поставщик; пустая строка, если не подтверждён" },
      documentAddress: { type: "string", description: "Адрес с текущего документа только как справочное поле; пустая строка, если не подтверждён" },
      accountNumber: { type: "string", description: "Лицевой счёт без догадок; пустая строка, если не подтверждён" },
      periodMonth: { type: "string", description: "Расчётный месяц строго YYYY-MM; пустая строка, если отсутствует или неоднозначен" },
      period: { type: "string", description: "Печатное обозначение расчётного периода; пустая строка, если не подтверждено" },
      documentDate: { type: "string", description: "Дата документа YYYY-MM-DD; пустая строка, если не указана" },
      dueDate: { type: "string", description: "Срок оплаты YYYY-MM-DD; пустая строка, если не указан" },
      periodChargeAmount: { type: "string", description: "Начислено за период как десятичная строка; пустая строка, если не подтверждено" },
      openingDebtAmount: { type: "string", description: "Входящий долг как неотрицательная десятичная строка; пустая строка, если отсутствует" },
      openingCreditAmount: { type: "string", description: "Входящий аванс/переплата как неотрицательная десятичная строка; пустая строка, если отсутствует" },
      paidAmount: { type: "string", description: "Оплачено как неотрицательная десятичная строка; пустая строка, если отсутствует" },
      recalculationAmount: { type: "string", description: "Перерасчёт со знаком как десятичная строка; пустая строка, если отсутствует" },
      benefitAmount: { type: "string", description: "Льготы/субсидии как неотрицательная десятичная строка; пустая строка, если отсутствует" },
      penaltyAmount: { type: "string", description: "Пени как неотрицательная десятичная строка; пустая строка, если отсутствует" },
      mandatoryDueAmount: { type: "string", description: "Напечатанная обязательная сумма к оплате без добровольных услуг; пустая строка, если не подтверждена" },
      printedDueAmount: { type: "string", description: "Итог «к оплате» поставщику как напечатан; пустая строка, если отсутствует" },
      allocation: { type: "string", enum: ["owner", "tenant", "split"], description: "На кого относится расход. По умолчанию owner, если пользователь не уточнил другое" },
      lineItems: { type: "array", description: "Все подтверждённые строки услуг", items: { type: "object", properties: { name: { type: "string" }, unit: { type: "string" }, volume: { type: "string" }, tariff: { type: "string" }, chargeAmount: { type: "string" }, recalculationAmount: { type: "string" }, benefitAmount: { type: "string" }, totalAmount: { type: "string" } }, required: ["name", "unit", "volume", "tariff", "chargeAmount", "recalculationAmount", "benefitAmount", "totalAmount"], additionalProperties: false } },
      meters: { type: "array", description: "Счётчики и показания. Пустое текущее показание оставить пустым", items: { type: "object", properties: { resource: { type: "string" }, meterNumber: { type: "string" }, previousValue: { type: "string" }, currentValue: { type: "string" }, consumption: { type: "string" }, unit: { type: "string" }, tariff: { type: "string" } }, required: ["resource", "meterNumber", "previousValue", "currentValue", "consumption", "unit", "tariff"], additionalProperties: false } },
      optionalCharges: { type: "array", description: "Добровольные услуги отдельно от обязательного итога", items: { type: "object", properties: { label: { type: "string" }, kind: { type: "string" }, amount: { type: "string" }, includedInMandatory: { type: "boolean" } }, required: ["label", "kind", "amount", "includedInMandatory"], additionalProperties: false } },
      warnings: { type: "array", items: { type: "string" }, description: "Краткие предупреждения о неуверенно прочитанных или противоречивых данных" },
      note: { type: "string", description: "Короткие важные детали квитанции, пустая строка если их нет" },
    },
    required: ["service", "documentKind", "providerName", "documentAddress", "accountNumber", "periodMonth", "period", "documentDate", "dueDate", "periodChargeAmount", "openingDebtAmount", "openingCreditAmount", "paidAmount", "recalculationAmount", "benefitAmount", "penaltyAmount", "mandatoryDueAmount", "printedDueAmount", "allocation", "lineItems", "meters", "optionalCharges", "warnings", "note"],
    additionalProperties: false,
  },
  strict: true,
} as const;

export const utilityDocumentClassificationRules = `Извлекай только напечатанные данные текущего документа и не переноси сведения из истории. Все денежные поля передавай строкой с точностью до копейки. Раздельно извлекай начисление текущего периода, входящий долг, входящий аванс, оплаты, перерасчёт со знаком, льготы, пени, добровольные услуги, напечатанное «к оплате» и обязательный итог. Начисление и «к оплате» — разные величины. Добровольные услуги не включай в mandatoryDueAmount без явного указания документа. Сохраняй каждую строку услуг и каждый счётчик; пустые показания не додумывай. Расчётный месяц передавай строго YYYY-MM, а при отсутствии или противоречии оставляй пустым. Не выдумывай адрес, лицевой счёт, даты, тарифы, объёмы или показания.`;

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

export type UtilityEvalInput = {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  instruction?: string;
  insuranceIncluded?: boolean;
  currency?: string;
};

export type UtilityEvalResult = {
  responseId: string;
  model: string;
  draft: Record<string, unknown> | null;
  question: string | null;
};

function textFromResponse(response: OpenAIResponse) {
  if (response.output_text?.trim()) return response.output_text.trim();
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text ?? "")
    .join("\n")
    .trim();
}

function parseUtilityDraft(response: OpenAIResponse) {
  const call = (response.output ?? []).find(
    (item) => item.type === "function_call" && item.name === utilityBillTool.name,
  );
  if (!call?.arguments) return null;
  const parsed = JSON.parse(call.arguments) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Utility extraction returned invalid tool arguments");
  }
  return parsed as Record<string, unknown>;
}

function equalSecret(provided: string, expected: string) {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}

export function isUtilityEvalAuthorized(authorization: string | null, expectedSecret: string | undefined) {
  if (!expectedSecret) return false;
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) return false;
  return equalSecret(authorization.slice(prefix.length), expectedSecret);
}

export function validateUtilityEvalFile(mimeType: string, size: number) {
  if (!utilityEvalSupportedMimeTypes.has(mimeType)) return "unsupported_type" as const;
  if (size <= 0) return "empty_file" as const;
  if (size > utilityEvalMaxFileBytes) return "file_too_large" as const;
  return null;
}

export async function runUtilityBillEvaluation(
  input: UtilityEvalInput,
  fetchFn: typeof fetch = fetch,
): Promise<UtilityEvalResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const model = process.env.OPENAI_MODEL ?? "gpt-5.4-nano";
  const fileContent = input.mimeType.startsWith("image/")
    ? { type: "input_image", image_url: `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`, detail: "auto" }
    : { type: "input_file", filename: input.filename, file_data: `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`, detail: "auto" };
  const response = await fetchFn("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      instructions: `Ты выполняешь изолированную проверку распознавания коммунальной квитанции в Homory. Ничего не сохраняй и не утверждай, что создал запись. Валюта объекта: ${input.currency || "RUB"}. Настройка добровольного страхования: ${input.insuranceIncluded === false ? "исключать" : "включать по умолчанию"}.\n\n${utilityDocumentClassificationRules}\n\nИзвлеки только поля инструмента prepare_utility_bill. Адрес и лицевой счёт допустимы только в предназначенных для них структурированных полях; имя плательщика, банковские реквизиты и QR-код не извлекай. При любой достоверной положительной обязательной сумме вызови prepare_utility_bill, даже если месяц неясен. Не додумывай неразборчивые значения.`,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: input.instruction?.trim() || "Распознай эту коммунальную квитанцию и подготовь структурированный черновик." },
          fileContent,
        ],
      }],
      tools: [utilityBillTool],
      tool_choice: "auto",
      parallel_tool_calls: false,
      safety_identifier: createHash("sha256").update("homory-utility-eval").digest("hex"),
      max_output_tokens: 2200,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI Responses API failed with ${response.status}`);
  const payload = await response.json() as OpenAIResponse;
  return {
    responseId: payload.id,
    model,
    draft: parseUtilityDraft(payload),
    question: textFromResponse(payload) || null,
  };
}
