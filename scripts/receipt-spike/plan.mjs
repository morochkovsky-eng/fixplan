import { buildApprovedReceiptSpikePlan } from "./approval-plan.mjs";
import { loadReceiptSpikeCarryover } from "./plan-lib.mjs";

const args = process.argv.slice(2);
const priorSeries = args.flatMap((arg, index) => arg === "--prior-series" ? [args[index + 1]] : []);
process.stdout.write(`${JSON.stringify(buildApprovedReceiptSpikePlan({ includeR2: args.includes("--include-r2"), canaryOnly: args.includes("--canary-only"), carryover: loadReceiptSpikeCarryover(priorSeries) }), null, 2)}\n`);
