import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pageSource = fs.readFileSync("app/page.tsx", "utf8");
const schemaSource = fs.readFileSync("supabase/schema.sql", "utf8");
const seedSource = fs.readFileSync("supabase/seed.sql", "utf8");

test("keeps the apartment catalog at 123 plan nodes", () => {
  const hotspotBlock = pageSource.slice(
    pageSource.indexOf("const planHotspots:"),
    pageSource.indexOf("\n};\n\nfunction hotspotAssetId"),
  );
  const hotspotCount = (hotspotBlock.match(/\{ id: "/g) ?? []).length;
  const linkedHotspotCount = (hotspotBlock.match(/assetId: "/g) ?? []).length;

  const initialAssetBlock = pageSource.slice(
    pageSource.indexOf("assets: [", pageSource.indexOf("const initialState")),
    pageSource.indexOf(
      "\n  ],\n  events:",
      pageSource.indexOf("const initialState"),
    ),
  );
  const initialAssetCount =
    initialAssetBlock.match(/\n\s+\{\s*id: "/g)?.length ?? 0;

  assert.equal(initialAssetCount + hotspotCount - linkedHotspotCount, 123);
});

test("contains the production Supabase model", () => {
  for (const table of [
    "apartments",
    "rooms",
    "asset_categories",
    "assets",
    "events",
    "inspections",
    "inspection_results",
  ]) {
    assert.match(schemaSource, new RegExp(`create table public\\.${table}`));
  }

  assert.match(schemaSource, /submit_guest_report/);
  assert.match(schemaSource, /asset-media/);
  assert.match(schemaSource, /category text not null/);
  assert.match(seedSource, /Шпалерная, 34Б/);
  assert.match(seedSource, /morochkovsky@gmail\.com/);
});

test("keeps new asset editing as a persisted temporary plan node", () => {
  assert.match(pageSource, /function tempAssetId\(\)/);
  assert.match(pageSource, /draft-asset-/);
  assert.match(pageSource, /isTempAssetId\(editingAssetId\)/);
  assert.match(pageSource, /method: "POST"/);
  assert.match(pageSource, /current\.assets\.map\(\(asset\) => \(asset\.id === editingAssetId \? savedAsset : asset\)\)/);
  assert.match(pageSource, /createAssetFromAssets/);
  assert.match(pageSource, /Новый узел/);
  assert.doesNotMatch(
    pageSource,
    /setAssetDraft\(\(currentDraft\) => \{[\s\S]*?setState\(\(current\) =>/m,
  );
});

test("supports custom asset categories from the UI", () => {
  assert.match(pageSource, /type Category = string/);
  assert.match(pageSource, /function createCategory/);
  assert.match(pageSource, /function renameCategory/);
  assert.match(pageSource, /function deleteCategory/);
  assert.match(pageSource, /promptCreateCategory/);
  assert.match(pageSource, /promptRenameCategory/);
  assert.match(pageSource, /Новая категория/);
  assert.match(pageSource, /categoryOptions\(categories\)\.map/);
  assert.match(pageSource, /Нельзя удалить/);
});
