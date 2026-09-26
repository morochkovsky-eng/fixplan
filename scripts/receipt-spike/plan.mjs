import { buildReceiptSpikePlan } from "./plan-lib.mjs";

process.stdout.write(`${JSON.stringify(buildReceiptSpikePlan(), null, 2)}\n`);
