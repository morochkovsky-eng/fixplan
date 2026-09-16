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
