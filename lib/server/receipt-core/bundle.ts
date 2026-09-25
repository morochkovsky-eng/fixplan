import { buildCanonicalReceipt } from "./core";
import { reconcileReceipt } from "./reconcile";
import { validateRoleClassification } from "./roles";
import type { IndexedLiteralDocument, ReceiptBundleResult } from "./types";

export function processReceiptBundle(indexed: IndexedLiteralDocument, classification: unknown): ReceiptBundleResult {
  const validated = validateRoleClassification(indexed.document, classification);
  const documents = validated.documents.map((document) => ({
    docId: document.docId,
    result: reconcileReceipt(buildCanonicalReceipt(indexed, document)),
  }));
  return { documents, diagnostics: validated.diagnostics };
}
