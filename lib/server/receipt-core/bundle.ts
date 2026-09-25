import { buildCanonicalReceipt } from "./core";
import { reconcileReceipt } from "./reconcile";
import { validateRoleClassification } from "./roles";
import type { ClassificationValidity, IndexedLiteralDocument, ReceiptBundleResult, ReceiptCoreResult } from "./types";

function combineValidity(bundle: ClassificationValidity, document: ClassificationValidity): ClassificationValidity {
  return {
    status: bundle.status === "needs_review" || document.status === "needs_review" ? "needs_review" : "valid",
    reasons: [...new Set([...bundle.reasons, ...document.reasons])].sort(),
    sourceIds: [...new Set([...bundle.sourceIds, ...document.sourceIds])].sort(),
  };
}

function applyClassificationSafety(result: ReceiptCoreResult, validity: ClassificationValidity): ReceiptCoreResult {
  if (validity.status === "valid") return result;
  const reasons = [...new Set(["classification_needs_review", ...validity.reasons])];
  const mandatoryDue = result.mandatoryDue.status === "confirmed"
    ? { ...result.mandatoryDue, status: "needs_review" as const, reasons: [...new Set([...result.mandatoryDue.reasons, ...reasons])] }
    : result.mandatoryDue;
  const draft = result.draft.decision === "reject"
    ? { ...result.draft, reasons: [...new Set([...result.draft.reasons, ...reasons])] }
    : { decision: "partial_draft" as const, needsReview: true, includeInMonthlyTotal: false, reasons: [...new Set([...result.draft.reasons, ...reasons])] };
  return { ...result, mandatoryDue, draft };
}

export function processReceiptBundle(indexed: IndexedLiteralDocument, classification: unknown): ReceiptBundleResult {
  const validated = validateRoleClassification(indexed.document, classification);
  const documents = validated.documents.map((document) => {
    const classificationValidity = combineValidity(validated.validity, document.validity);
    const result = applyClassificationSafety(reconcileReceipt(buildCanonicalReceipt(indexed, document)), classificationValidity);
    return { docId: document.docId, result, classificationValidity };
  });
  return { documents, diagnostics: validated.diagnostics, segmentationValidity: validated.validity };
}
