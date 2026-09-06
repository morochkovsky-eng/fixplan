import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pageSource = fs.readFileSync("app/page.tsx", "utf8");
const guestSource = fs.readFileSync("app/guest/[token]/guest-inspection-client.tsx", "utf8");
const schemaSource = fs.readFileSync("supabase/schema.sql", "utf8");
const seedSource = fs.readFileSync("supabase/seed.sql", "utf8");
const eventRouteSource = fs.readFileSync("app/api/assets/[id]/events/[eventId]/route.ts", "utf8");
const assetsRouteSource = fs.readFileSync("app/api/assets/route.ts", "utf8");
const assetRouteSource = fs.readFileSync("app/api/assets/[id]/route.ts", "utf8");
const appDataRouteSource = fs.readFileSync("app/api/app-data/route.ts", "utf8");
const utilityBillsRouteSource = fs.readFileSync("app/api/utility-bills/route.ts", "utf8");
const utilityBillRouteSource = fs.readFileSync("app/api/utility-bills/[id]/route.ts", "utf8");
const utilityReadingsRouteSource = fs.readFileSync("app/api/utility-readings/route.ts", "utf8");
const logoSource = fs.readFileSync("public/fixplan-logo.svg", "utf8");

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
    "utility_bills",
    "utility_meters",
    "utility_readings",
  ]) {
    assert.match(schemaSource, new RegExp(`create table public\\.${table}`));
  }

  assert.match(schemaSource, /submit_guest_report/);
  assert.match(schemaSource, /asset-media/);
  assert.match(schemaSource, /utility_bill_status/);
  assert.match(schemaSource, /utility_meter_status/);
  assert.match(schemaSource, /utility_reading_source/);
  assert.match(schemaSource, /category text not null/);
  assert.match(seedSource, /Шпалерная, 34Б/);
  assert.match(seedSource, /morochkovsky@gmail\.com/);
  assert.match(seedSource, /bill-aug-electricity/);
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

test("keeps server deleted nodes authoritative over browser storage", () => {
  assert.match(appDataRouteSource, /deletedAssetIds/);
  assert.match(pageSource, /deletedAssetIds: remoteState\.deletedAssetIds \?\? current\.deletedAssetIds/);
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

test("keeps asset passport fields editable and persisted", () => {
  assert.match(pageSource, /warrantyUntil: asset\.warrantyUntil \?\? ""/);
  assert.match(pageSource, /master: asset\.master \?\? ""/);
  assert.match(pageSource, /plan-asset-warranty/);
  assert.match(pageSource, /plan-asset-master/);
  assert.match(pageSource, /Редактировать паспорт/);
  assert.match(assetsRouteSource, /warranty_until:/);
  assert.match(assetsRouteSource, /master:/);
  assert.match(assetRouteSource, /patch\.warranty_until/);
  assert.match(assetRouteSource, /patch\.master/);
});

test("keeps asset documents separate from photo galleries", () => {
  assert.match(pageSource, /function DocumentList/);
  assert.match(pageSource, /function DocumentsView/);
  assert.match(pageSource, /const documentTypes = \[/);
  assert.match(pageSource, /type DocumentTypeId/);
  assert.match(pageSource, /function buildDocumentBody/);
  assert.match(pageSource, /function dateInputFromFormatted/);
  assert.match(pageSource, /function documentMetaFromEvent/);
  assert.match(pageSource, /function documentNoteFromEvent/);
  assert.match(pageSource, /function documentValidityLabel/);
  assert.match(pageSource, /function documentValidityTone/);
  assert.match(pageSource, /function documentExpiryTime/);
  assert.match(pageSource, /function documentTypeFromEvent/);
  assert.match(pageSource, /\| "documents"/);
  assert.match(pageSource, /Документы"/);
  assert.match(pageSource, /К документам/);
  assert.match(pageSource, /Архив документов/);
  assert.match(pageSource, /Добавить документ/);
  assert.match(pageSource, /Выберите узел/);
  assert.match(pageSource, /Тип документа/);
  assert.match(pageSource, /Дата документа/);
  assert.match(pageSource, /Действует до/);
  assert.match(pageSource, /Паспорт/);
  assert.match(pageSource, /Гарантия/);
  assert.match(pageSource, /Файл, узел, категория/);
  assert.match(pageSource, /Открыть узел/);
  assert.match(pageSource, /documentTypeFilter/);
  assert.match(pageSource, /documentTypeCounts/);
  assert.match(pageSource, /attentionDocumentsCount/);
  assert.match(pageSource, /expiringDocuments/);
  assert.match(pageSource, /documentTypeFilter === "attention"/);
  assert.match(pageSource, /setDocumentTypeFilter\("attention"\)/);
  assert.match(pageSource, /Требуют внимания/);
  assert.match(pageSource, /Ближайшие сроки/);
  assert.match(pageSource, /заканчиваются в ближайшие 30 дней/);
  assert.match(pageSource, /Просрочен/);
  assert.match(pageSource, /Скоро истекает/);
  assert.match(pageSource, /Действует/);
  assert.match(pageSource, /const documentEventIds = new Set/);
  assert.match(pageSource, /events\.filter\(isDocumentEvent\)/);
  assert.match(pageSource, /const isDocumentMedia =/);
  assert.match(pageSource, /const assetDocuments = assetMedia\.filter\(isDocumentMedia\)/);
  assert.match(pageSource, /const imageItems = items\.filter\(isImageMedia\)/);
  assert.match(pageSource, /value="documents"/);
  assert.match(pageSource, /Прикрепить файл/);
  assert.match(pageSource, /Добавлен документ к паспорту узла/);
  assert.match(pageSource, /Добавлен документ к архиву квартиры/);
  assert.match(pageSource, /aria-label="Добавить документ в архив"/);
  assert.match(pageSource, /addEvent=\{addEvent\}/);
  assert.match(pageSource, /deleteEvent=\{deleteEvent\}/);
  assert.match(pageSource, /updateEvent=\{updateEvent\}/);
  assert.match(pageSource, /startEditDocument/);
  assert.match(pageSource, /saveDocumentEdit/);
  assert.match(pageSource, /editingDocumentId/);
  assert.match(pageSource, /<DocumentList events=\{events\} items=\{assetDocuments\} \/>/);
  assert.match(pageSource, /<DocumentList items=\{documentMedia\} \/>/);
});

test("supports utility bills as a first-class apartment section", () => {
  assert.match(pageSource, /type UtilityBillStatus/);
  assert.match(pageSource, /type UtilityMonthStatus/);
  assert.match(pageSource, /type UtilityMeter =/);
  assert.match(pageSource, /type UtilityReading =/);
  assert.match(pageSource, /type UtilityBill =/);
  assert.match(pageSource, /utilityBills: UtilityBill\[\]/);
  assert.match(pageSource, /utilityMeters: UtilityMeter\[\]/);
  assert.match(pageSource, /utilityReadings: UtilityReading\[\]/);
  assert.match(pageSource, /utilityBills: state\.utilityBills \?\? initialState\.utilityBills/);
  assert.match(pageSource, /buildUtilityMonths/);
  assert.match(pageSource, /source: "telegram"/);
  assert.match(pageSource, /\| "utilities"/);
  assert.match(pageSource, /function UtilitiesView/);
  assert.match(pageSource, /view === "utilities"/);
  assert.match(pageSource, /remoteState\.utilityBills \?\? current\.utilityBills/);
  assert.match(pageSource, /remoteState\.utilityMeters \?\? current\.utilityMeters/);
  assert.match(pageSource, /remoteState\.utilityReadings \?\? current\.utilityReadings/);
  assert.match(appDataRouteSource, /utilityBillsResult/);
  assert.match(appDataRouteSource, /utilityMetersResult/);
  assert.match(appDataRouteSource, /utilityReadingsResult/);
  assert.match(appDataRouteSource, /isMissingUtilityTable/);
  assert.match(utilityBillsRouteSource, /export async function POST/);
  assert.match(utilityBillsRouteSource, /\.from\("utility_bills"\)/);
  assert.match(utilityBillRouteSource, /export async function PATCH/);
  assert.match(utilityBillRouteSource, /export async function DELETE/);
  assert.match(utilityReadingsRouteSource, /export async function POST/);
  assert.match(utilityReadingsRouteSource, /\.from\("utility_meters"\)\.upsert/);
  assert.match(utilityReadingsRouteSource, /\.from\("utility_readings"\)/);
  assert.match(pageSource, /Коммуналка и счета/);
  assert.match(pageSource, /Месяцы, счета, счетчики и статусы передачи/);
  assert.match(pageSource, /Данные за/);
  assert.match(pageSource, /Счетчики/);
  assert.match(pageSource, /Ждем показания/);
  assert.match(pageSource, /Счета/);
  assert.match(pageSource, /Выставление счета/);
  assert.match(pageSource, /Добавить счет/);
  assert.match(pageSource, /Уже оплачено/);
  assert.match(pageSource, /Оплатить до/);
  assert.match(pageSource, /Квитанция/);
  assert.match(pageSource, /utilityBillStatusLabels/);
  assert.match(pageSource, /markPaid/);
  assert.match(pageSource, /deleteBill/);
  assert.match(pageSource, /saveBill/);
  assert.match(pageSource, /saveReading/);
  assert.match(pageSource, /Передать показание/);
  assert.doesNotMatch(
    pageSource,
    /set(?:ReadingDraft|Draft|EditDraft)\(\(current\) =>[^\n]*event\.currentTarget/,
  );
});

test("supports editing and deleting node comments without schema-cache fields", () => {
  assert.match(pageSource, /function EditableEventTask/);
  assert.match(pageSource, /function updateEvent/);
  assert.match(pageSource, /function deleteEvent/);
  assert.match(pageSource, /media-lightbox/);
  assert.match(pageSource, /media-lightbox-track/);
  assert.match(pageSource, /media-lightbox-thumbnails/);
  assert.match(pageSource, /media-lightbox-open/);
  assert.match(pageSource, /showPrevious/);
  assert.match(pageSource, /showNext/);

  assert.match(eventRouteSource, /export async function PATCH/);
  assert.match(eventRouteSource, /export async function DELETE/);
  assert.match(eventRouteSource, /\.from\("asset_media"\)/);
  assert.match(eventRouteSource, /\.from\("events"\)/);
  assert.doesNotMatch(eventRouteSource, /updated_at/);
});

test("uses the Figma FixPlan logo and compact menu glyph in headers", () => {
  assert.match(logoSource, /<svg width="133" height="18"/);
  assert.match(pageSource, /function BrandMark/);
  assert.match(pageSource, /src="\/fixplan-logo\.svg"/);
  assert.match(pageSource, /function MenuGlyph/);
  assert.match(pageSource, /mobile-menu-button/);
  assert.doesNotMatch(pageSource, /\bMenu,/);

  assert.match(guestSource, /guest-brand-mark/);
  assert.match(guestSource, /src="\/fixplan-logo\.svg"/);
});

test("treats work orders as a first-class master workflow", () => {
  const inspectionsRouteSource = fs.readFileSync("app/api/inspections/route.ts", "utf8");
  const inspectionRouteSource = fs.readFileSync("app/api/inspections/[id]/route.ts", "utf8");

  assert.match(inspectionsRouteSource, /workflow === "work_order" \? "Задание" : "Обход"/);
  assert.match(inspectionsRouteSource, /\.eq\("workflow", workflow\)/);
  assert.match(inspectionRouteSource, /body\.status === "accepted"/);
  assert.match(inspectionRouteSource, /Only completed results can be accepted/);
  assert.match(pageSource, /Принять задание/);
  assert.match(pageSource, /Открыть результат/);
  assert.match(pageSource, /function createContractorFlowFromAssets/);
  assert.match(pageSource, /function createInspectionFromAssets/);
  assert.match(pageSource, /createInspectionFromAssets=\{createInspectionFromAssets\}/);
  assert.match(pageSource, /onClick=\{\(\) => createInspectionFromAssets\(selectedAssetIds\)\}/);
  assert.match(pageSource, /Создать обход/);
  assert.match(pageSource, /function createWorkOrderFromAsset/);
  assert.match(pageSource, /function createWorkOrderFromAssets/);
  assert.match(pageSource, /createWorkOrderFromAssets=\{createWorkOrderFromAssets\}/);
  assert.match(pageSource, /onClick=\{\(\) => createWorkOrderFromAssets\(selectedAssetIds\)\}/);
  assert.match(pageSource, /createWorkOrder=\{\(\) => createWorkOrderFromAsset\(selectedAsset\.id\)\}/);
  assert.match(pageSource, /setContractorWorkflow\("work_order"\)/);
  assert.match(pageSource, /Создать задание/);
  assert.match(pageSource, /acceptCurrentInspection/);
  assert.match(pageSource, /updateInspection=\{updateInspection\}/);
  assert.match(pageSource, /selectedInspection\?\.workflow === "work_order" \? "work_orders" : "inspections"/);
  assert.match(pageSource, /const hasFinalResult = isCompleted \|\| isAccepted/);
  assert.match(pageSource, /!\["completed", "accepted"\]\.includes\(inspection\.status\)/);
  assert.match(guestSource, /const workOrderStatusLabels/);
  assert.match(guestSource, /Что нужно сделать/);
  assert.match(guestSource, /Результат по узлу/);
  assert.match(guestSource, /Заполните результат по каждому узлу, чтобы завершить задание/);
  assert.match(guestSource, /Задание отправлено/);
});

test("keeps inspection and work order cards compact on mobile", () => {
  assert.match(pageSource, /inspection-flow-card/);
  assert.match(pageSource, /variant="outline"[\s\S]*?Редактировать/);
  assert.match(pageSource, /variant="outline"[\s\S]*?Открыть ссылку мастера/);
  assert.match(pageSource, /variant="destructive"[\s\S]*?Удалить/);
  assert.doesNotMatch(pageSource, /Как работает задание/);
  assert.doesNotMatch(pageSource, /Как теперь копится отчет/);
  assert.match(pageSource, /response\.json\(\)\.catch\(\(\) => \(\{\}\)\)/);
});
