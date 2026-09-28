import { buildApprovedReceiptSpikePlan } from "./approval-plan.mjs";

process.stdout.write(`${JSON.stringify(buildApprovedReceiptSpikePlan({ includeR2: process.argv.includes("--include-r2") }), null, 2)}\n`);
