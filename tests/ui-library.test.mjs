import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("catalog uses shared primitives instead of a candidate library", () => {
  for (const file of ["app/ui-lab/page.tsx", "app/ui-lab/asset/page.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /@\/components\/ui\/button/);
    assert.match(source, /@\/components\/ui\/card/);
    assert.doesNotMatch(source, /CandidateButton|CandidateCard|styles\.(?:candidate\w+|buttonMd|successBadge|warningBadge)/);
  }
  const css = readFileSync("app/ui-lab/ui-lab.module.css", "utf8");
  assert.doesNotMatch(css, /\.(?:candidateButton|candidateBadge|candidateInput|successButton|warningButton)\s*\{/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
});

test("shared primitives preserve the approved Figma radius hierarchy", () => {
  const globals = readFileSync("app/globals.css", "utf8");
  for (const token of [
    "--radius-field: 8px",
    "--radius-textarea: 10px",
    "--radius-control: 12px",
    "--radius-card: 24px",
    "--radius-tabs: 16px",
    "--radius-tab: 6px",
    "--radius-tab-active: 12px",
    "--radius-assistant-field: 14px",
    "--radius-pill: 9999px",
  ]) {
    assert.match(globals, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const expectedBindings = new Map([
    ["components/ui/button.tsx", "rounded-[var(--radius-control)]"],
    ["components/ui/input.tsx", "rounded-[var(--radius-field)]"],
    ["components/ui/textarea.tsx", "rounded-[var(--radius-textarea)]"],
    ["components/ui/select.tsx", "rounded-[var(--radius-control)]"],
    ["components/ui/card.tsx", "rounded-[var(--radius-card)]"],
    ["components/ui/tabs.tsx", "rounded-[var(--radius-tabs)]"],
    ["components/ui/badge.tsx", "rounded-[var(--radius-pill)]"],
    ["components/ai-elements/prompt-input.tsx", "rounded-[var(--radius-assistant-field)]"],
  ]);

  for (const [file, binding] of expectedBindings) {
    assert.ok(readFileSync(file, "utf8").includes(binding), `${file} must use ${binding}`);
  }
});

test("legacy public catalog redirects only its UI routes to production", async () => {
  const { default: config } = await import("../next.config.ts");
  const redirects = await config.redirects();
  assert.deepEqual(redirects, [{
    source: "/ui-lab/:path*",
    has: [{ type: "host", value: "fixplan-ui-lab-public-20260909.vercel.app" }],
    destination: "https://fixplan-iota.vercel.app/ui-lab/:path*",
    permanent: true,
  }]);
});
