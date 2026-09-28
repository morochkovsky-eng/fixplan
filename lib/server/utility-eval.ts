import "server-only";

import { timingSafeEqual } from "node:crypto";
import { runReceiptPipeline } from "@/lib/server/receipt-pipeline";

export const utilityEvalSupportedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const utilityEvalMaxFileBytes = 20 * 1024 * 1024;

const nullableString = { type: ["string", "null"] } as const;
const criticalEvidence = {
  type: "object",
  properties: {
    field: { type: "string", enum: ["document_kind", "billing_period", "period_charge", "mandatory_due", "due_date", "provider"] },
    confidence: { type: "string", enum: ["high", "medium", "low", "unreadable", "absent"] },
    evidence: nullableString,
  },
  required: ["field", "confidence", "evidence"],
  additionalProperties: false,
} as const;

export const utilityBillTool = {
  type: "function",
  name: "prepare_utility_bill",
  description: "Подготовить отдельный проверяемый черновик по текущему платёжному документу. Денежные значения передаются десятичными строками с точностью до копейки. Не объединять разные вложения в одну запись.",
  parameters: {
    type: "object",
    properties: {
      service: { ...nullableString, description: "Краткое название документа или основной услуги; null, если не читается" },
      documentKind: { type: ["string", "null"], enum: ["housing", "electricity", "water", "capital_repair", "other", null], description: "Тип платёжного документа; null, если не читается" },
      providerName: { ...nullableString, description: "Поставщик; null, если не подтверждён" },
      documentAddress: { ...nullableString, description: "Адрес с текущего документа только как справочное поле; null, если не подтверждён" },
      accountNumber: { ...nullableString, description: "Лицевой счёт без догадок; null, если не подтверждён" },
      periodMonth: { ...nullableString, description: "Расчётный месяц строго YYYY-MM; null, если отсутствует или неоднозначен" },
      period: { ...nullableString, description: "Печатное обозначение расчётного периода; null, если не подтверждено" },
      documentDate: { ...nullableString, description: "Дата документа YYYY-MM-DD; null, если не указана" },
      dueDate: { ...nullableString, description: "Срок оплаты YYYY-MM-DD; null, если не указан или не читается" },
      periodChargeAmount: { ...nullableString, description: "Начислено за период как десятичная строка; null, если не подтверждено" },
      openingDebtAmount: nullableString,
      openingCreditAmount: nullableString,
      paidAmount: nullableString,
      recalculationAmount: nullableString,
      benefitAmount: nullableString,
      penaltyAmount: nullableString,
      mandatoryDueAmount: { ...nullableString, description: "Напечатанная обязательная сумма к оплате без добровольных услуг; null, если не подтверждена" },
      printedDueAmount: nullableString,
      allocation: { type: "string", enum: ["owner", "tenant", "split"], description: "На кого относится расход. По умолчанию owner, если пользователь не уточнил другое" },
      lineItems: { type: "array", description: "Все подтверждённые строки услуг", items: { type: "object", properties: { name: { type: "string" }, unit: { type: "string" }, volume: { type: "string" }, tariff: { type: "string" }, calculationMode: { type: "string", enum: ["simple", "composite", "printed_total"], description: "simple только когда одна напечатанная формула объём × тариф применима ко всей строке" }, chargeAmount: { type: "string" }, recalculationAmount: { type: "string" }, benefitAmount: { type: "string" }, totalAmount: { type: "string" } }, required: ["name", "unit", "volume", "tariff", "calculationMode", "chargeAmount", "recalculationAmount", "benefitAmount", "totalAmount"], additionalProperties: false } },
      meters: { type: "array", description: "Счётчики и показания. Пустое текущее показание оставить пустым", items: { type: "object", properties: { resource: { type: "string" }, meterNumber: { type: "string" }, previousValue: { type: "string" }, currentValue: { type: "string" }, consumption: { type: "string" }, unit: { type: "string" }, tariff: { type: "string" } }, required: ["resource", "meterNumber", "previousValue", "currentValue", "consumption", "unit", "tariff"], additionalProperties: false } },
      optionalCharges: { type: "array", description: "Добровольные услуги отдельно от обязательного итога", items: { type: "object", properties: { label: { type: "string" }, kind: { type: "string" }, amount: { type: "string" }, includedInMandatory: { type: "boolean" } }, required: ["label", "kind", "amount", "includedInMandatory"], additionalProperties: false } },
      warnings: { type: "array", items: { type: "string" }, description: "Краткие предупреждения о неуверенно прочитанных или противоречивых данных" },
      note: nullableString,
      quality: {
        type: "object",
        properties: {
          readable: { type: "boolean" },
          issues: { type: "array", items: { type: "string", enum: ["blur", "compression", "small_text", "cropped_edges", "glare", "perspective", "darkness", "other"] } },
          criticalFields: { type: "array", items: criticalEvidence },
        },
        required: ["readable", "issues", "criticalFields"],
        additionalProperties: false,
      },
    },
    required: ["service", "documentKind", "providerName", "documentAddress", "accountNumber", "periodMonth", "period", "documentDate", "dueDate", "periodChargeAmount", "openingDebtAmount", "openingCreditAmount", "paidAmount", "recalculationAmount", "benefitAmount", "penaltyAmount", "mandatoryDueAmount", "printedDueAmount", "allocation", "lineItems", "meters", "optionalCharges", "warnings", "note", "quality"],
    additionalProperties: false,
  },
  strict: true,
} as const;

export const utilityDocumentClassificationRules = `Извлекай только напечатанные данные текущего документа и не переноси сведения из истории. Неразборчивое или неподтверждённое значение всегда возвращай как null: не восстанавливай поставщика, адрес, лицевой счёт, услуги, период, суммы, тарифы, объёмы или показания по виду шаблона и не подставляй типичные значения. Уверенно выглядящий ответ без читаемого фрагмента-основания считается ошибкой. В quality оцени размытие, сжатие, мелкий текст, обрезанные края, блики, перспективу и затемнение; для каждого критического поля верни confidence и короткий видимый фрагмент evidence, либо absent/unreadable и null. Все подтверждённые денежные поля передавай строкой с точностью до копейки. Раздельно извлекай начисление текущего периода, входящий долг, входящий аванс, оплаты, перерасчёт со знаком, льготы, пени, добровольные услуги, напечатанное «к оплате» и обязательный итог. Начисление и «к оплате» — разные величины. Добровольные услуги не включай в mandatoryDueAmount без прямого указания документа. Для строки услуги ставь calculationMode=simple только при одной явно напечатанной формуле объём × тариф; для зонного, ступенчатого или составного расчёта ставь composite, а при одном напечатанном итоге без применимой формулы — printed_total. Сохраняй каждую подтверждённую строку услуг и каждый счётчик; пустые показания оставляй null.`;

export type UtilityEvalInput = {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  instruction?: string;
  insuranceIncluded?: boolean;
  currency?: string;
};

export type UtilityEvalResult = {
  responseId: string | null;
  models: string[];
  draft: Record<string, unknown> | null;
  question: string | null;
  attempts: Array<Record<string, unknown>>;
};

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
  const result = await runReceiptPipeline({
    dataUrl: `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`,
    filename: input.filename,
    mimeType: input.mimeType,
  }, { fetchFn });
  return {
    responseId: null,
    models: [...new Set(result.attempts.map((item) => item.model))],
    draft: result.billPayload,
    question: result.ok ? null : `Требуется проверка: ${result.validation?.blockers.join(", ") || result.failureCode || "document_unrecognized"}`,
    attempts: result.attempts,
  };
}
