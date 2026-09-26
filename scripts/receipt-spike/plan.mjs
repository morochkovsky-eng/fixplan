import { buildApprovedReceiptSpikePlan } from "./approval-plan.mjs";

process.stdout.write(`${JSON.stringify(buildApprovedReceiptSpikePlan(), null, 2)}\n`);
