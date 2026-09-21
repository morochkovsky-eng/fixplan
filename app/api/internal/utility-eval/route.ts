import {
  isUtilityEvalAuthorized,
  runUtilityBillEvaluation,
  validateUtilityEvalFile,
} from "@/lib/server/utility-eval";

export const maxDuration = 300;

const noStoreHeaders = { "cache-control": "no-store" };

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: noStoreHeaders });
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV === "production") {
    return json({ error: "not_found" }, 404);
  }

  const secret = process.env.UTILITY_EVAL_TOKEN;
  if (!secret) return json({ error: "not_configured" }, 503);
  if (!isUtilityEvalAuthorized(request.headers.get("authorization"), secret)) {
    return json({ error: "unauthorized" }, 401);
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "file_required" }, 400);
  const validationError = validateUtilityEvalFile(file.type, file.size);
  if (validationError) return json({ error: validationError }, 400);

  try {
    const result = await runUtilityBillEvaluation({
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: file.name || "utility-document",
      mimeType: file.type,
      instruction: String(form.get("instruction") ?? ""),
      insuranceIncluded: String(form.get("insuranceIncluded") ?? "true") !== "false",
      currency: String(form.get("currency") ?? "RUB"),
    });
    return json({ ok: true, ...result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Utility evaluation failed";
    const status = message === "OPENAI_API_KEY is not configured" ? 503 : 502;
    return json({ error: status === 503 ? "openai_not_configured" : "evaluation_failed" }, status);
  }
}
