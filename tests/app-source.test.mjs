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
const cleaningsViewSource = fs.readFileSync("components/cleanings-view.tsx", "utf8");
const cleaningsRouteSource = fs.readFileSync("app/api/cleanings/route.ts", "utf8");
const cleaningRouteSource = fs.readFileSync("app/api/cleanings/[id]/route.ts", "utf8");
const cleaningHelpersSource = fs.readFileSync("app/api/cleanings/helpers.ts", "utf8");
const cleaningGuestSource = fs.readFileSync("app/cleaning/[token]/cleaning-guest-client.tsx", "utf8");
const cleaningPhotoRouteSource = fs.readFileSync("app/api/cleanings/guest/[token]/photos/route.ts", "utf8");
const notificationsRouteSource = fs.readFileSync("app/api/notifications/route.ts", "utf8");
const notificationRouteSource = fs.readFileSync("app/api/notifications/[id]/route.ts", "utf8");
const notificationHelperSource = fs.readFileSync("lib/server/notifications.ts", "utf8");
const telegramWebhookSource = fs.readFileSync("app/api/telegram/webhook/route.ts", "utf8");
const telegramPairingSource = fs.readFileSync("app/api/telegram/pairing/route.ts", "utf8");
const telegramAssistantSource = fs.readFileSync("lib/server/telegram-assistant.ts", "utf8");
const telegramClientSource = fs.readFileSync("lib/server/telegram.ts", "utf8");
const cleaningServiceSource = fs.readFileSync("lib/server/cleanings.ts", "utf8");
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
    "cleanings",
    "cleaning_media",
    "notification_events",
    "telegram_pairing_codes",
    "telegram_accounts",
    "telegram_conversations",
    "telegram_updates",
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

test("keeps Telegram actions behind pairing, idempotency, and confirmation", () => {
  assert.match(telegramWebhookSource, /x-telegram-bot-api-secret-token/);
  assert.match(telegramWebhookSource, /telegram_updates/);
  assert.match(telegramWebhookSource, /23505/);
  assert.match(telegramPairingSource, /code_hash/);
  assert.match(telegramPairingSource, /15 \* 60 \* 1000/);
  assert.match(telegramPairingSource, /export async function GET/);
  assert.match(telegramPairingSource, /export async function DELETE/);
  assert.match(pageSource, /Telegram-ассистент/);
  assert.match(pageSource, /Создать ссылку/);
  assert.match(telegramAssistantSource, /list_cleanings/);
  assert.match(telegramAssistantSource, /prepare_cleaning/);
  assert.match(telegramAssistantSource, /confirmationWords/);
  assert.match(telegramAssistantSource, /createCleaningRecord/);
  assert.match(telegramAssistantSource, /api\.openai\.com\/v1\/responses/);
  assert.match(telegramClientSource, /getFile/);
  assert.match(telegramClientSource, /gpt-4o-mini-transcribe/);
  assert.match(telegramClientSource, /api\.openai\.com\/v1\/audio\/transcriptions/);
});

test("supports cleaning as a first-class owner and guest workflow", () => {
  assert.match(pageSource, /cleanings: Cleaning\[\]/);
  assert.match(pageSource, /view === "cleanings"/);
  assert.match(pageSource, /remoteState\.cleanings \?\? current\.cleanings/);
  assert.match(appDataRouteSource, /cleaningsResult/);
  assert.match(appDataRouteSource, /cleaningMediaResult/);
  assert.match(schemaSource, /cleaning_type/);
  assert.match(schemaSource, /cleaning_photo_phase/);
  assert.match(schemaSource, /cleaning_recurrence/);
  assert.match(schemaSource, /create table public\.cleanings/);
  assert.match(schemaSource, /create table public\.cleaning_media/);
  assert.match(schemaSource, /phase public\.cleaning_photo_phase not null,\s+zone text,/);
  assert.match(schemaSource, /require_photo_before boolean not null default false/);
  assert.match(schemaSource, /require_photo_after boolean not null default false/);
  assert.match(schemaSource, /zone_results jsonb not null default '\[\]'::jsonb/);
  assert.match(schemaSource, /owner_feedback text/);
  assert.match(schemaSource, /revision_requested/);
  assert.match(schemaSource, /offered/);
  assert.match(schemaSource, /declined/);
  assert.match(cleaningsRouteSource, /export async function POST/);
  assert.match(cleaningRouteSource, /export async function PATCH/);
  assert.match(cleaningRouteSource, /export async function DELETE/);
  assert.match(cleaningsViewSource, /Новая уборка/);
  assert.match(cleaningsViewSource, /Ссылка клинеру/);
  assert.match(cleaningsViewSource, /draftFromRecentCleaning/);
  assert.doesNotMatch(cleaningsViewSource, /Шаблоны уборки/);
  assert.match(cleaningsViewSource, /Нужно фото до/);
  assert.match(cleaningsViewSource, /Нужно фото после/);
  assert.match(cleaningsViewSource, /type="datetime-local"/);
  assert.match(cleaningsViewSource, /cleaningRecurrenceLabels/);
  assert.match(cleaningHelpersSource, /Europe\/Moscow/);
  assert.match(cleaningRouteSource, /nextOccurrence/);
  assert.match(cleaningRouteSource, /recurs_from_id/);
  assert.match(cleaningServiceSource, /cleaning\.offered/);
  assert.match(cleaningRouteSource, /cleaning\.revision_requested/);
  assert.match(fs.readFileSync("app/api/cleanings/guest/[token]/route.ts", "utf8"), /cleaning\.completed/);
  assert.match(notificationHelperSource, /telegram/);
  assert.match(notificationsRouteSource, /export async function GET/);
  assert.match(notificationsRouteSource, /export async function PATCH/);
  assert.match(notificationRouteSource, /export async function PATCH/);
  assert.match(cleaningsViewSource, /События уборок/);
  assert.match(cleaningsViewSource, /Прочитать все/);
  assert.match(cleaningGuestSource, /Чек-лист/);
  assert.match(cleaningGuestSource, /Фото до/);
  assert.match(cleaningGuestSource, /Фото после/);
  assert.match(cleaningGuestSource, /accept="image\/\*"/);
  assert.match(cleaningGuestSource, /\/photos/);
  assert.match(cleaningGuestSource, /Завершить уборку/);
  assert.match(cleaningGuestSource, /missingRequiredPhoto/);
  assert.match(cleaningGuestSource, /Обязательно/);
  assert.match(cleaningGuestSource, /Результат по зонам/);
  assert.match(cleaningGuestSource, /Есть проблема/);
  assert.match(cleaningGuestSource, /Сохранить комментарии/);
  assert.match(cleaningGuestSource, /Нужно доработать/);
  assert.match(cleaningGuestSource, /Принять задание/);
  assert.match(cleaningGuestSource, /Отказаться/);
  assert.match(cleaningGuestSource, /Что нужно убрать/);
  assert.match(fs.readFileSync("app/api/cleanings/guest/[token]/route.ts", "utf8"), /Добавьте обязательное фото до по каждой зоне/);
  assert.match(fs.readFileSync("app/api/cleanings/guest/[token]/route.ts", "utf8"), /Укажите результат по каждой зоне уборки/);
  assert.match(cleaningsViewSource, /Проблемы:/);
  assert.match(cleaningsViewSource, /Вернуть на доработку/);
  assert.match(cleaningsViewSource, /Комментарий владельца/);
  assert.match(cleaningsViewSource, /Галерея фотографий уборки/);
  assert.match(cleaningGuestSource, /Ранее загруженные общие фотографии/);
  assert.match(cleaningGuestSource, /formData\.set\("zone", zone\)/);
  assert.match(cleaningPhotoRouteSource, /export async function POST/);
  assert.match(cleaningPhotoRouteSource, /15 \* 1024 \* 1024/);
  assert.match(cleaningPhotoRouteSource, /file\.type\.startsWith\("image\/"\)/);
  assert.match(cleaningPhotoRouteSource, /formData\.get\("zone"\)/);
  assert.match(cleaningPhotoRouteSource, /cleaning\.zones\.includes\(zone\)/);
  assert.doesNotMatch(
    cleaningsViewSource,
    /setDraft\(\(current\) => \(\{[^}]*event\.currentTarget/,
  );
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
    /(?:set[A-Za-z]+|onChange)\(\(current\) =>[^\n]*event\.currentTarget/,
  );
  assert.match(pageSource, /setDraft\(emptyUtilityBillDraft\(selectedMonth\?\.period \?\? selectedPeriod\)\)/);
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
