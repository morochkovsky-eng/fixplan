import { createHash } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildReceiptSpikePlan } from "./plan-lib.mjs";

const PLANNER_PATH = "scripts/receipt-spike/plan-lib.mjs";
const plannerFile = fileURLToPath(new URL("./plan-lib.mjs", import.meta.url));

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function bindReceiptSpikePlanner(plan, options = {}) {
  const plannerBytes = options.plannerBytes ?? fs.readFileSync(plannerFile);
  const plannerSha256 = sha256(plannerBytes);
  if (plan?.integrity?.sourceSha256?.[PLANNER_PATH] !== plannerSha256) {
    throw new Error("receipt_spike_planner_hash_mismatch");
  }
  const boundPlan = {
    ...plan,
    approvalBinding: {
      plannerPath: PLANNER_PATH,
      plannerSha256,
      fingerprintAlgorithm: "sha256-canonical-json-v1",
    },
  };
  return { ...boundPlan, planSha256: sha256(canonicalJson(boundPlan)) };
}

export function buildApprovedReceiptSpikePlan(options = {}) {
  return bindReceiptSpikePlanner(buildReceiptSpikePlan(options));
}
