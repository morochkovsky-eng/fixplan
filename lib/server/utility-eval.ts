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
  description: "Сразу создать или дополнить коммунальный черновик, когда известна положительная сумма. Черновик сохраняется без подтверждения; кнопка подтверждения создаёт окончательный счёт. Если суммы нет, задай один вопрос и не вызывай инструмент.",
  parameters: {
    type: "object",
    properties: {
      service: { type: "string", description: "Название услуги или поставщика" },
      documentKind: { type: "string", enum: ["housing", "electricity", "water", "other"], description: "Тип квитанции: ЖКХ, электричество, вода или другое" },
      period: { type: "string", description: "Расчётный период в понятном пользователю виде" },
      amount: { type: "number", description: "Предварительная сумма жильца. Сервер не доверяет этому полю и пересчитывает его из periodChargeAmount и включённой добровольной услуги" },
      periodChargeAmount: { type: "number", description: "Только подтверждённая стоимость ресурсов и обязательных услуг, начисленных внутри указанного расчётного периода: значение строки «Начислено» или её смыслового аналога. Исключить входящий долг, прошлое сальдо, оплаты, пени, переплату и добровольные услуги. Если текущую часть нельзя надёжно выделить, передать 0" },
      providerBalanceAmount: { type: "number", description: "Общий итог расчётов владельца с поставщиком: «к оплате», closing balance, amount due, задолженность или сальдо; 0 если отсутствует. Никогда не является суммой жильца автоматически" },
      creditAmount: { type: "number", description: "Накопленная переплата или кредит лицевого счёта из сверки с поставщиком; 0 если отсутствует. Не вычитать из начисления жильцу" },
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
} as const;

export const utilityDocumentClassificationRules = `ЖЕЛЕЗНОЕ ПРАВИЛО КОММУНАЛЬНЫХ ДОКУМЕНТОВ ДЛЯ ЛЮБОЙ СТРАНЫ, ЯЗЫКА И ПОСТАВЩИКА: жильцу выставляется только стоимость ресурсов и обязательных услуг, начисленных за указанный расчётный период. Название поля может быть «Начислено», charges for period, current charges, new charges, billed this period или иным — определяй его по смыслу и арифметике документа, а не только по слову. Всегда отдельно классифицируй: 1) начисление текущего периода; 2) входящий/предыдущий баланс и старый долг; 3) оплаты; 4) перерасчёты текущего периода; 5) пени; 6) переплату/кредит счёта; 7) добровольные услуги; 8) конечный баланс/итого к оплате поставщику. Проверяй арифметику сверки, но никогда не переноси входящий баланс, старый долг, пени, накопленную переплату, платежи или конечное «к оплате» на жильца. Если в документе одновременно есть текущее начисление и более крупный итог к оплате, всегда используй текущее начисление. Если документ содержит только итог, его можно признать начислением текущего периода лишь когда из документа ясно, что предыдущий баланс равен нулю и итог образован только услугами этого периода. Иначе periodChargeAmount=0 и задай один короткий вопрос. Для отдельной готовой квитанции за электричество, воду или другой ресурс действует то же правило, без исключений. Сумму жильца сервер сам рассчитает из periodChargeAmount; amount и tenantAmount не пытайся подменять общим итогом. Накопленную переплату не вычитай из начисления жильцу. Добровольную страховку и другие необязательные строки отделяй от periodChargeAmount, включай по умолчанию согласно настройке, заполняй optionalChargeLabel/optionalChargeAmount/optionalChargeIncluded и не останавливай черновик вопросом.`;

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
      instructions: `Ты выполняешь изолированную проверку распознавания коммунальной квитанции в Homory. Ничего не сохраняй и не утверждай, что создал запись. Валюта объекта: ${input.currency || "RUB"}. Настройка добровольного страхования: ${input.insuranceIncluded === false ? "исключать" : "включать по умолчанию"}.\n\n${utilityDocumentClassificationRules}\n\nИзвлеки только поля инструмента prepare_utility_bill. Не включай в service, note или ответ имя плательщика, адрес, лицевой счёт, банковские реквизиты, QR-код или другие персональные данные. При любой достоверной положительной сумме вызови prepare_utility_bill. Если начисление текущего периода нельзя надёжно выделить, не вызывай инструмент и задай один короткий блокирующий вопрос. Не додумывай неразборчивые значения.`,
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
      max_output_tokens: 280,
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
