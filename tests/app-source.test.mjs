import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pageSource = fs.readFileSync("app/page.tsx", "utf8");
const globalCssSource = fs.readFileSync("app/globals.css", "utf8");
const guestSource = fs.readFileSync("app/guest/[token]/guest-inspection-client.tsx", "utf8");
const guestRouteSource = fs.readFileSync("app/api/guest/[token]/route.ts", "utf8");
const schemaSource = fs.readFileSync("supabase/schema.sql", "utf8");
const seedSource = fs.readFileSync("supabase/seed.sql", "utf8");
const eventRouteSource = fs.readFileSync("app/api/assets/[id]/events/[eventId]/route.ts", "utf8");
const assetsRouteSource = fs.readFileSync("app/api/assets/route.ts", "utf8");
const assetRouteSource = fs.readFileSync("app/api/assets/[id]/route.ts", "utf8");
const appDataRouteSource = fs.readFileSync("app/api/app-data/route.ts", "utf8");
const apartmentAccessSource = fs.readFileSync("app/api/assets/access.ts", "utf8");
const apartmentsRouteSource = fs.readFileSync("app/api/apartments/route.ts", "utf8");
const settingsRouteSource = fs.readFileSync("app/api/settings/route.ts", "utf8");
const planRouteSource = fs.readFileSync("app/api/plan/route.ts", "utf8");
const assetEventsRouteSource = fs.readFileSync("app/api/assets/[id]/events/route.ts", "utf8");
const inspectionsRouteSource = fs.readFileSync("app/api/inspections/route.ts", "utf8");
const inspectionRouteSource = fs.readFileSync("app/api/inspections/[id]/route.ts", "utf8");
const utilityBillsRouteSource = fs.readFileSync("app/api/utility-bills/route.ts", "utf8");
const utilityBillRouteSource = fs.readFileSync("app/api/utility-bills/[id]/route.ts", "utf8");
const utilityReadingsRouteSource = fs.readFileSync("app/api/utility-readings/route.ts", "utf8");
const utilityMetersRouteSource = fs.readFileSync("app/api/utility-meters/route.ts", "utf8");
const utilityMeterRouteSource = fs.readFileSync("app/api/utility-meters/[id]/route.ts", "utf8");
const utilityBillServiceSource = fs.readFileSync("lib/server/utility-bills.ts", "utf8");
const utilityPeriodSource = fs.readFileSync("lib/utility-period.ts", "utf8");
const documentsRouteSource = fs.readFileSync("app/api/documents/route.ts", "utf8");
const documentRouteSource = fs.readFileSync("app/api/documents/[id]/route.ts", "utf8");
const apartmentDocumentsMigrationSource = fs.readFileSync("supabase/migrations/20260907130000_add_apartment_documents.sql", "utf8");
const cleaningsViewSource = fs.readFileSync("components/cleanings-view.tsx", "utf8");
const cleaningsRouteSource = fs.readFileSync("app/api/cleanings/route.ts", "utf8");
const cleaningRouteSource = fs.readFileSync("app/api/cleanings/[id]/route.ts", "utf8");
const cleaningHelpersSource = fs.readFileSync("app/api/cleanings/helpers.ts", "utf8");
const cleaningGuestSource = fs.readFileSync("app/cleaning/[token]/cleaning-guest-client.tsx", "utf8");
const cleaningPhotoRouteSource = fs.readFileSync("app/api/cleanings/guest/[token]/photos/route.ts", "utf8");
const notificationsRouteSource = fs.readFileSync("app/api/notifications/route.ts", "utf8");
const notificationRouteSource = fs.readFileSync("app/api/notifications/[id]/route.ts", "utf8");
const notificationHelperSource = fs.readFileSync("lib/server/notifications.ts", "utf8");
const telegramNotificationBaselineSource = fs.readFileSync("supabase/migrations/20260907173000_baseline_telegram_notifications.sql", "utf8");
const telegramWebhookSource = fs.readFileSync("app/api/telegram/webhook/route.ts", "utf8");
const telegramPairingSource = fs.readFileSync("app/api/telegram/pairing/route.ts", "utf8");
const telegramAssistantSource = fs.readFileSync("lib/server/telegram-assistant.ts", "utf8");
const telegramContextSource = fs.readFileSync("lib/server/telegram-context.ts", "utf8");
const telegramClientSource = fs.readFileSync("lib/server/telegram.ts", "utf8");
const assistantRouteSource = fs.readFileSync("app/api/assistant/route.ts", "utf8");
const assistantRepliesSource = fs.readFileSync("lib/server/assistant-replies.ts", "utf8");
const assistantMessagesMigrationSource = fs.readFileSync("supabase/migrations/20260908120000_add_assistant_messages.sql", "utf8");
const workOrderEventsMigrationSource = fs.readFileSync("supabase/migrations/20260908183000_add_work_order_creation_events.sql", "utf8");
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
  assert.match(telegramWebhookSource, /claimedPairing/);
  assert.match(telegramWebhookSource, /message\.photo/);
  assert.match(telegramWebhookSource, /message\.document/);
  assert.match(telegramWebhookSource, /telegram\/inbox/);
  assert.match(telegramPairingSource, /code_hash/);
  assert.match(telegramPairingSource, /15 \* 60 \* 1000/);
  assert.match(telegramPairingSource, /export async function GET/);
  assert.match(telegramPairingSource, /export async function DELETE/);
  assert.match(telegramPairingSource, /owner_user_id/);
  assert.match(telegramPairingSource, /default_apartment_id/);
  assert.match(pageSource, /Telegram-ассистент/);
  assert.match(pageSource, /Подключить мой Telegram/);
  assert.doesNotMatch(pageSource, /Роль пользователя/);
  assert.match(telegramAssistantSource, /list_cleanings/);
  assert.match(telegramAssistantSource, /list_assets/);
  assert.match(telegramAssistantSource, /list_work_orders/);
  assert.match(telegramAssistantSource, /get_utility_state/);
  assert.match(telegramAssistantSource, /prepare_work_order/);
  assert.match(telegramAssistantSource, /prepare_utility_reading/);
  assert.match(telegramAssistantSource, /prepare_asset_event/);
  assert.match(telegramAssistantSource, /list_apartments/);
  assert.match(telegramAssistantSource, /select_apartment/);
  assert.match(telegramAssistantSource, /active_apartment_id/);
  assert.match(telegramAssistantSource, /apartment_timezone/);
  assert.match(telegramAssistantSource, /apartment_currency/);
  assert.match(telegramAssistantSource, /apartmentId: account\.apartment_id/);
  assert.match(telegramAssistantSource, /prepare_cleaning/);
  assert.match(telegramAssistantSource, /prepare_utility_bill/);
  assert.match(telegramAssistantSource, /periodChargeAmount/);
  assert.match(telegramAssistantSource, /providerBalanceAmount/);
  assert.match(telegramAssistantSource, /periodChargeAmount \+ includedOptionalAmount/);
  assert.doesNotMatch(telegramAssistantSource, /documentKind === "housing" \? periodChargeAmount/);
  assert.match(telegramAssistantSource, /status: "draft"/);
  assert.match(telegramAssistantSource, /draftBillId/);
  assert.match(telegramAssistantSource, /Черновик сохраняется без подтверждения/);
  assert.match(telegramAssistantSource, /item\.tenantAmount \?\? item\.tenant_amount/);
  assert.match(telegramAssistantSource, /creditAmount/);
  assert.match(telegramAssistantSource, /optionalChargeIncluded/);
  assert.match(telegramAssistantSource, /значение строки «Начислено»/);
  assert.match(telegramAssistantSource, /ЖЕЛЕЗНОЕ ПРАВИЛО КОММУНАЛЬНЫХ ДОКУМЕНТОВ/);
  assert.match(telegramAssistantSource, /Для отдельной готовой квитанции за электричество, воду или другой ресурс действует то же правило, без исключений/);
  assert.match(telegramAssistantSource, /никогда не переноси входящий баланс, старый долг, пени, накопленную переплату, платежи или конечное «к оплате» на жильца/);
  assert.match(telegramAssistantSource, /Страхование исключено/);
  assert.match(telegramAssistantSource, /existingItems/);
  assert.match(telegramAssistantSource, /draftCreatedAt/);
  assert.match(telegramAssistantSource, /keepsUtilityDraft/);
  assert.match(telegramAssistantSource, /confirmationWords/);
  assert.match(telegramAssistantSource, /createCleaningRecord/);
  assert.match(telegramAssistantSource, /createUtilityBillRecord/);
  assert.match(telegramAssistantSource, /type === "create_work_order"/);
  assert.match(telegramAssistantSource, /guest_token: guestToken/);
  assert.match(telegramAssistantSource, /type === "create_utility_reading"/);
  assert.match(telegramAssistantSource, /source: "telegram"/);
  assert.match(telegramAssistantSource, /type === "create_asset_event"/);
  assert.match(telegramAssistantSource, /status_after: statusAfter === "unchanged"/);
  assert.match(telegramAssistantSource, /input_image/);
  assert.match(telegramAssistantSource, /input_file/);
  assert.match(telegramAssistantSource, /removePendingAttachment/);
  assert.match(telegramAssistantSource, /api\.openai\.com\/v1\/responses/);
  assert.match(telegramAssistantSource, /личный ассистент владельца/);
  assert.match(telegramAssistantSource, /gpt-5\.4-nano/);
  assert.match(telegramAssistantSource, /max_output_tokens: 280/);
  assert.match(telegramAssistantSource, /не больше шести коротких строк/);
  assert.match(telegramAssistantSource, /Не описывай содержимое фотографии/);
  assert.match(telegramAssistantSource, /Автоматы, УЗО, щиток, провода и подписи линий считай фоном/);
  assert.match(telegramAssistantSource, /автоматы, УЗО и щиток игнорируй/);
  assert.match(telegramAssistantSource, /без Markdown, звёздочек и решёток/);
  assert.match(telegramWebhookSource, /fixplan:pending:confirm/);
  assert.match(telegramWebhookSource, /fixplan:pending:edit/);
  assert.match(telegramWebhookSource, /fixplan:pending:cancel/);
  assert.match(telegramWebhookSource, /callback_query/);
  assert.match(telegramWebhookSource, /String\(pendingAction\.type\)\.startsWith\("create_"\)/);
  assert.match(telegramWebhookSource, /hasReadyDraft \? draftKeyboard/);
  assert.match(telegramWebhookSource, /cleanTelegramDraftText\(text\)/);
  assert.match(telegramWebhookSource, /utilityDraftReply/);
  assert.match(assistantRepliesSource, /Что удалось извлечь из вложения/);
  assert.match(telegramWebhookSource, /Создать счёт/);
  assert.match(telegramWebhookSource, /Удалить черновик/);
  assert.match(assistantRepliesSource, /Чтобы добавить другие ресурсы/);
  assert.match(telegramWebhookSource, /Исключить страховку/);
  assert.match(assistantRepliesSource, /Начислено за месяц/);
  assert.match(telegramWebhookSource, /media-group-companion/);
  assert.match(telegramClientSource, /media_group_id/);
  assert.match(telegramClientSource, /cleanTelegramText/);
  assert.match(telegramClientSource, /export function cleanTelegramDraftText/);
  assert.match(telegramClientSource, /требует внимания/);
  assert.match(telegramClientSource, /RUB/);
  assert.match(telegramClientSource, /₽/);
  assert.match(telegramClientSource, /RUBS/);
  assert.match(telegramClientSource, /replace\(\/\\\*\/g, ""\)/);
  assert.match(telegramClientSource, /answerCallbackQuery/);
  assert.match(telegramClientSource, /editMessageReplyMarkup/);
  assert.match(telegramClientSource, /getFile/);
  assert.match(telegramClientSource, /downloadTelegramFile/);
  assert.match(telegramClientSource, /gpt-4o-mini-transcribe/);
  assert.match(telegramClientSource, /api\.openai\.com\/v1\/audio\/transcriptions/);
  assert.match(notificationHelperSource, /deliverPendingOwnerTelegramNotifications/);
  assert.match(notificationHelperSource, /sendTelegramMessage/);
  assert.match(notificationHelperSource, /telegram_delivered_at/);
  assert.match(notificationHelperSource, /\["cleaning\.completed", "inspection\.completed", "work_order\.completed"\]/);
  assert.match(notificationHelperSource, /Открыть FixPlan/);
  assert.match(telegramNotificationBaselineSource, /telegram_delivered_at = coalesce/);
  assert.match(guestRouteSource, /work_order\.completed/);
  assert.match(guestRouteSource, /inspection\.completed/);
  assert.match(guestRouteSource, /Задание мастера выполнено/);
  assert.match(guestRouteSource, /Обход завершён/);
  assert.match(telegramContextSource, /apartment_members/);
  assert.match(telegramContextSource, /owner_user_id/);
  assert.match(telegramContextSource, /owner_email/);
  assert.match(schemaSource, /owner_user_id uuid not null unique/);
  assert.match(schemaSource, /active_apartment_id uuid not null/);
});

test("supports cleaning as a first-class owner and guest workflow", () => {
  assert.match(pageSource, /cleanings: Cleaning\[\]/);
  assert.match(pageSource, /<TabsTrigger value="cleaning">/);
  assert.doesNotMatch(pageSource, /navigate\("cleanings"\)/);
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
  assert.doesNotMatch(cleaningsViewSource, /Field label="Статус"/);
  assert.match(cleaningsViewSource, /disabled=\{editingId !== null\}/);
  assert.match(cleaningHelpersSource, /Europe\/Moscow/);
  assert.match(cleaningRouteSource, /nextOccurrence/);
  assert.match(cleaningRouteSource, /recurs_from_id/);
  assert.match(cleaningRouteSource, /Статус уборки меняется автоматически/);
  assert.match(cleaningRouteSource, /Сценарий уборки нельзя изменить после создания/);
  assert.match(cleaningServiceSource, /normalized\.row\.mode === "record_only" \? "accepted" : "offered"/);
  assert.doesNotMatch(cleaningServiceSource, /recipient: "cleaner"/);
  assert.match(fs.readFileSync("app/api/cleanings/guest/[token]/route.ts", "utf8"), /cleaning\.revision_started/);
  assert.match(fs.readFileSync("app/api/cleanings/guest/[token]/route.ts", "utf8"), /cleaning\.completed/);
  assert.match(fs.readFileSync("app/api/cleanings/guest/[token]/route.ts", "utf8"), /channels: status === "completed" \? \["in_app", "telegram"\]/);
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

test("keeps every owner workflow scoped to the selected apartment", () => {
  assert.match(apartmentAccessSource, /fixplan_apartment_id/);
  assert.match(apartmentAccessSource, /getSelectedApartmentId/);
  assert.match(apartmentsRouteSource, /export async function GET/);
  assert.match(apartmentsRouteSource, /export async function POST/);
  assert.match(apartmentsRouteSource, /export async function PATCH/);
  assert.match(apartmentsRouteSource, /apartment_members/);
  assert.match(apartmentsRouteSource, /defaultRooms/);
  assert.match(apartmentsRouteSource, /defaultCategories/);
  assert.match(pageSource, /function ApartmentSwitcher/);
  assert.match(pageSource, /withCatalogAssets\(\{[\s\S]*?remoteState\.assets[\s\S]*?\}, false\)/);
  assert.doesNotMatch(pageSource, /shpalernaya-maintenance-mvp/);
  assert.doesNotMatch(pageSource, /window\.localStorage/);
  for (const source of [
    appDataRouteSource,
    assetsRouteSource,
    assetRouteSource,
    assetEventsRouteSource,
    eventRouteSource,
    inspectionsRouteSource,
    inspectionRouteSource,
    utilityBillsRouteSource,
    utilityBillRouteSource,
    utilityReadingsRouteSource,
    cleaningsRouteSource,
    cleaningRouteSource,
    notificationsRouteSource,
    notificationRouteSource,
  ]) {
    assert.match(source, /apartmentId/);
    assert.doesNotMatch(source, /00000000-0000-4000-8000-000000000034/);
  }
});

test("persists apartment settings through an explicit save", () => {
  assert.match(settingsRouteSource, /export async function PATCH/);
  assert.match(settingsRouteSource, /role !== "owner" && role !== "admin"/);
  assert.match(settingsRouteSource, /usage_mode: usageMode/);
  assert.match(pageSource, /onSubmit=\{saveSettings\}/);
  assert.match(pageSource, /Сохранить изменения/);
  assert.match(appDataRouteSource, /usage_mode,currency,timezone/);
});

test("supports an optional apartment plan without demo leakage", () => {
  assert.match(schemaSource, /plan_storage_path text/);
  assert.match(schemaSource, /plan_media_type text/);
  assert.match(appDataRouteSource, /plan_storage_path,plan_media_type,plan_original_name/);
  assert.match(appDataRouteSource, /plan: apartment\?\.plan_storage_path/);
  assert.match(planRouteSource, /requireApartmentAccess/);
  assert.match(planRouteSource, /application\/pdf/);
  assert.match(planRouteSource, /image\/jpeg/);
  assert.match(planRouteSource, /25 \* 1024 \* 1024/);
  assert.match(planRouteSource, /export async function POST/);
  assert.match(planRouteSource, /export async function DELETE/);
  assert.match(planRouteSource, /plan_storage_path: storagePath/);
  assert.match(pageSource, /Загрузить схему/);
  assert.match(pageSource, /Заменить схему/);
  assert.match(pageSource, /Схема не загружена/);
  assert.match(pageSource, /plan === undefined/);
  assert.match(pageSource, /remoteState\.plan !== undefined/);
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
  assert.match(pageSource, /plan-asset-manufacturer/);
  assert.match(pageSource, /plan-asset-model/);
  assert.match(pageSource, /plan-asset-serial/);
  assert.match(pageSource, /plan-asset-installed/);
  assert.match(pageSource, /plan-asset-cost/);
  assert.match(pageSource, /Присвоится автоматически/);
  assert.match(assetsRouteSource, /function nextAssetCode/);
  assert.match(assetsRouteSource, /manufacturer:/);
  assert.match(assetsRouteSource, /serial_number:/);
  assert.match(assetsRouteSource, /purchase_cost:/);
  assert.match(assetRouteSource, /patch\.manufacturer/);
  assert.match(assetRouteSource, /patch\.serial_number/);
  assert.match(assetRouteSource, /patch\.purchase_cost/);
  assert.match(appDataRouteSource, /manufacturer: asset\.manufacturer/);
  assert.match(appDataRouteSource, /serialNumber: asset\.serial_number/);
  assert.match(schemaSource, /manufacturer text/);
  assert.match(schemaSource, /purchase_cost numeric/);
  assert.doesNotMatch(assetsRouteSource, /Укажите код и название узла/);
  assert.doesNotMatch(assetRouteSource, /Укажите код и название узла/);
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
  assert.match(pageSource, /Вся квартира/);
  assert.match(pageSource, /Тип документа/);
  assert.match(pageSource, /Дата документа/);
  assert.match(pageSource, /Действует до/);
  assert.match(pageSource, /Паспорт/);
  assert.match(pageSource, /Гарантия/);
  assert.match(pageSource, /Счёт \/ квитанция/);
  assert.match(pageSource, /Смета/);
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
  assert.match(pageSource, /setMedia=\{\(media\)/);
  assert.match(pageSource, /fetch\("\/api\/documents"/);
  assert.match(pageSource, /fetch\(`\/api\/documents\/\$\{document\.id\}`/);
  assert.match(documentsRouteSource, /export async function POST/);
  assert.match(documentRouteSource, /export async function PATCH/);
  assert.match(documentRouteSource, /export async function DELETE/);
  assert.match(documentsRouteSource, /15 \* 1024 \* 1024/);
  assert.match(documentsRouteSource, /asset_id: assetId \|\| null/);
  assert.match(appDataRouteSource, /documentType: item\.document_type/);
  assert.match(apartmentDocumentsMigrationSource, /alter column asset_id drop not null/);
  assert.match(schemaSource, /document_type text check/);
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
  assert.match(utilityBillsRouteSource, /createUtilityBillRecord/);
  assert.match(utilityBillServiceSource, /\.from\("utility_bills"\)/);
  assert.match(utilityBillServiceSource, /amount <= 0/);
  assert.match(utilityBillServiceSource, /normalizeUtilityPeriod/);
  assert.match(utilityPeriodSource, /за\\s\+/);
  assert.match(pageSource, /utilityPeriodTimestamp/);
  assert.match(pageSource, /max-xl:contents/);
  assert.match(pageSource, /xl:max-h-\[calc\(100dvh-12rem\)\]/);
  assert.match(pageSource, /xl:overflow-y-auto/);
  assert.match(pageSource, /content-start gap-4 self-start/);
  assert.match(pageSource, /selectedMonthIndex \* 2 \+ 3/);
  assert.match(utilityBillServiceSource, /receipt_storage_path/);
  assert.match(schemaSource, /receipt_storage_path text/);
  assert.match(schemaSource, /utility_bill_id text/);
  assert.match(schemaSource, /allocation text not null default 'owner'/);
  assert.match(schemaSource, /tenant_amount numeric not null default 0/);
  assert.match(schemaSource, /reimbursement_status text not null default 'not_required'/);
  assert.match(schemaSource, /owner_confirmed_at timestamptz/);
  assert.match(appDataRouteSource, /createSignedUrl\(bill\.receipt_storage_path/);
  assert.match(utilityBillRouteSource, /export async function PATCH/);
  assert.match(utilityBillRouteSource, /export async function DELETE/);
  assert.match(utilityReadingsRouteSource, /export async function POST/);
  assert.match(utilityReadingsRouteSource, /\.from\("utility_meters"\)\s+\.update\(meterPatch\)/);
  assert.match(utilityReadingsRouteSource, /\.from\("utility_readings"\)/);
  assert.match(schemaSource, /photo_storage_path text/);
  assert.match(schemaSource, /utility_reading_id text/);
  assert.match(schemaSource, /current_rate numeric/);
  assert.match(schemaSource, /previous_value numeric/);
  assert.match(schemaSource, /calculated_amount numeric/);
  assert.match(utilityReadingsRouteSource, /utility_reading_id: id/);
  assert.match(utilityReadingsRouteSource, /document_type: "other"/);
  assert.match(utilityReadingsRouteSource, /15 \* 1024 \* 1024/);
  assert.match(utilityReadingsRouteSource, /value - previousValue/);
  assert.match(utilityReadingsRouteSource, /consumption \* rate/);
  assert.match(utilityMetersRouteSource, /export async function POST/);
  assert.match(utilityMeterRouteSource, /export async function DELETE/);
  assert.match(utilityMeterRouteSource, /deletedReadingIds/);
  assert.match(appDataRouteSource, /hasUtilityMetersTable/);
  assert.doesNotMatch(pageSource, /Получено частично/);
  assert.match(pageSource, /квитанция ЖКХ/);
  assert.match(pageSource, /счет или показания электричества/);
  assert.match(pageSource, /Добавить счетчик/);
  assert.match(pageSource, /Сохранить счетчик/);
  assert.match(pageSource, /Тариф, ₽ за единицу/);
  assert.match(pageSource, /по тарифу/);
  assert.match(documentRouteSource, /utility_bill_id \|\| data\.utility_reading_id/);
  assert.match(documentRouteSource, /является первоисточником/);
  assert.match(pageSource, /Коммуналка и счета/);
  assert.match(pageSource, /Месяцы, счета, счетчики и статусы передачи/);
  assert.match(pageSource, /Данные за/);
  assert.match(pageSource, /<strong className="font-medium">Начисления<\/strong>/);
  assert.match(pageSource, /<Card className="hidden">/);
  assert.match(pageSource, /Счетчики/);
  assert.doesNotMatch(pageSource, /Ждем показания/);
  assert.match(pageSource, /Счета/);
  assert.match(pageSource, /Выставление счета/);
  assert.match(pageSource, /Добавить счет/);
  assert.doesNotMatch(pageSource, /Уже оплачено/);
  assert.match(pageSource, /Оплатить до/);
  assert.match(pageSource, /Квитанция/);
  assert.match(pageSource, /accept="application\/pdf,image\/\*"/);
  assert.match(pageSource, /Файл сохранится в документах/);
  assert.doesNotMatch(pageSource, /Пока укажите ссылку ниже/);
  assert.match(utilityBillsRouteSource, /document_type: "invoice"/);
  assert.match(utilityBillsRouteSource, /utility_bill_id: result\.row\.id/);
  assert.match(utilityBillRouteSource, /update\(\{ utility_bill_id: null \}\)/);
  assert.match(pageSource, /utilityBillStatusLabels/);
  assert.match(pageSource, /utilityBillAllocationLabels/);
  assert.match(pageSource, /utilityReimbursementStatusLabels/);
  assert.match(pageSource, /markReimbursementReceived/);
  assert.match(pageSource, /type UtilityMonthStatus = "not_issued" \| "issued" \| "payment_received"/);
  assert.match(pageSource, /Счёт не выставлен/);
  assert.match(pageSource, /Счёт выставлен/);
  assert.match(pageSource, /Оплата получена/);
  assert.match(pageSource, /Выставлено жильцу/);
  assert.match(pageSource, /Получено от жильца/);
  assert.match(pageSource, /Осталось получить/);
  assert.doesNotMatch(pageSource, /Ждем возмещение/);
  assert.match(utilityBillServiceSource, /tenant_amount: tenantAmount/);
  assert.match(utilityBillRouteSource, /allowedStatusTransitions/);
  assert.match(telegramAssistantSource, /source: "telegram_private"/);
  assert.match(telegramAssistantSource, /utility_bill_id: String\(resultRow\.id\)/);
  assert.doesNotMatch(pageSource, /markPaid/);
  assert.match(pageSource, /deleteBill/);
  assert.match(pageSource, /saveBill/);
  assert.match(pageSource, /saveReading/);
  assert.match(pageSource, /Передать показание/);
  assert.match(pageSource, /Фото счетчика/);
  assert.match(pageSource, /utilityReadingId === reading\.id/);
  assert.doesNotMatch(
    pageSource,
    /(?:set[A-Za-z]+|onChange)\(\(current\) =>[^\n]*event\.currentTarget/,
  );
  assert.match(pageSource, /setDraft\(emptyUtilityBillDraft\(selectedMonth\?\.period \?\? selectedPeriod\)\)/);
  assert.match(pageSource, /Язык интерфейса и бота/);
  assert.match(pageSource, /<SelectItem value="ru">Русский<\/SelectItem>/);
  assert.match(settingsRouteSource, /const locales = new Set\(\["ru"\]\)/);
  assert.match(schemaSource, /locale text not null default 'ru'/);
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
  assert.match(pageSource, /event\.key === "ArrowLeft"/);
  assert.match(pageSource, /event\.key === "ArrowRight"/);
  assert.match(pageSource, /onTouchStart=\{handleTouchStart\}/);
  assert.match(pageSource, /onTouchEnd=\{handleTouchEnd\}/);
  assert.match(globalCssSource, /\.media-lightbox[\s\S]*height: 100dvh;/);
  assert.match(globalCssSource, /\.media-lightbox-slide img[\s\S]*object-fit: contain;/);
  assert.doesNotMatch(globalCssSource, /\.media-lightbox-stage\s*\{[^}]*min-height:\s*60vh/);

  assert.match(eventRouteSource, /export async function PATCH/);
  assert.match(eventRouteSource, /export async function DELETE/);
  assert.match(eventRouteSource, /\.from\("asset_media"\)/);
  assert.match(eventRouteSource, /\.from\("events"\)/);
  assert.doesNotMatch(eventRouteSource, /updated_at/);
});

test("shows one searchable journal across apartment workflows", () => {
  assert.match(pageSource, /type JournalKind/);
  assert.match(pageSource, /journalKindLabels/);
  assert.match(pageSource, /bills=\{state\.utilityBills\}/);
  assert.match(pageSource, /cleanings=\{state\.cleanings\}/);
  assert.match(pageSource, /inspections=\{state\.inspections\}/);
  assert.match(pageSource, /readings=\{state\.utilityReadings\}/);
  assert.match(pageSource, /Найти событие, узел или исполнителя/);
  assert.doesNotMatch(pageSource, /Подтвержденные изменения, работы, документы и расчеты/);
  assert.match(pageSource, /utilityBillStatusLabels\[bill\.status\]/);
  assert.match(pageSource, /cleaningStatusLabels\[cleaning\.status\]/);
  assert.match(pageSource, /documentTypeLabel\(item\.documentType!\)/);
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
  assert.match(inspectionRouteSource, /function applyAcceptedResults/);
  assert.match(inspectionRouteSource, /Нельзя принять неполный отчет/);
  assert.match(inspectionRouteSource, /body\.status === "in_progress"/);
  assert.doesNotMatch(guestRouteSource, /\.from\("events"\)/);
  assert.match(pageSource, /status: patch\.status/);
  assert.match(pageSource, /patch\.status === "accepted"/);
  assert.match(pageSource, /Вернуть в работу/);
  assert.match(guestRouteSource, /Заполните результат по каждому узлу перед отправкой/);
  assert.match(guestRouteSource, /inspection\.status === "completed" \|\| inspection\.status === "accepted"/);
  assert.match(guestRouteSource, /\.is\("deleted_at", null\)/);
  assert.match(guestRouteSource, /function validateResult/);
  assert.match(guestRouteSource, /asset_code: asset\.code/);
  assert.match(appDataRouteSource, /assetCode: result\.asset_code/);
  assert.match(schemaSource, /asset_code text/);
  assert.match(pageSource, /result\.assetCode \|\| asset\?\.code/);
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
  assert.match(pageSource, /Задание по всем/);
  assert.match(pageSource, /Создать задание по узлу/);
  assert.match(pageSource, /event\.id\.startsWith\("evt-work-order-created-"\)/);
  assert.match(workOrderEventsMigrationSource, /record_work_order_creation_events/);
  assert.match(workOrderEventsMigrationSource, /after insert on public\.inspections/);
  assert.match(workOrderEventsMigrationSource, /from public\.inspections as inspection/);
  assert.match(workOrderEventsMigrationSource, /Создано задание мастеру/);
  assert.match(pageSource, /acceptCurrentInspection/);
  assert.match(pageSource, /updateInspection=\{updateInspection\}/);
  assert.match(pageSource, /setTaskTab\(selectedInspection\?\.workflow === "work_order" \? "master-work" : "inspection"\)/);
  assert.match(pageSource, /<TabsTrigger value="inspection">/);
  assert.doesNotMatch(pageSource, />\s*Обходы и отчеты\s*<\/NavButton>/);
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

test("keeps the owner assistant persistent across web and Telegram", () => {
  assert.match(pageSource, /<WebAssistant[\s\S]*?onMutation=\{\(\) => setDataRefreshKey/);
  assert.match(pageSource, /<PromptInput/);
  assert.match(pageSource, /assistant-message-list/);
  assert.match(pageSource, /optimistic-\$\{crypto\.randomUUID\(\)\}/);
  assert.match(pageSource, /FixPlan обрабатывает запрос/);
  assert.match(pageSource, /method: "PATCH"/);
  assert.doesNotMatch(pageSource, /send\("создавай"\)/);
  assert.match(pageSource, /MediaRecorder/);
  assert.match(pageSource, /Голосовой ввод/);
  assert.match(pageSource, /sidebar-collapsed/);
  assert.match(pageSource, /Требует решения/);
  assert.match(pageSource, /Активные работы/);
  assert.doesNotMatch(pageSource, /label="Всего узлов"/);
  assert.match(assistantRouteSource, /runTelegramAssistant/);
  assert.match(assistantRouteSource, /transcribeAudioFile/);
  assert.match(assistantRouteSource, /pendingAction/);
  assert.match(assistantRouteSource, /export async function PATCH/);
  assert.match(assistantRouteSource, /body\.action === "confirm" \? "создавай" : "отмена"/);
  assert.match(telegramWebhookSource, /recordAssistantMessage/);
  assert.match(assistantMessagesMigrationSource, /channel in \('web', 'telegram'\)/);
  assert.match(assistantMessagesMigrationSource, /owners can read their assistant messages/);
});

test("uses app dialogs and stable deep links instead of browser popups", () => {
  const cleaningSource = fs.readFileSync("components/cleanings-view.tsx", "utf8");
  const dialogSource = fs.readFileSync("components/system-dialog.tsx", "utf8");
  const catchAllSource = fs.readFileSync("app/[...path]/page.tsx", "utf8");

  assert.doesNotMatch(pageSource, /window\.(alert|confirm|prompt)/);
  assert.doesNotMatch(cleaningSource, /window\.(alert|confirm|prompt)/);
  assert.match(dialogSource, /AlertDialogContent/);
  assert.match(dialogSource, /DialogContent/);
  assert.match(dialogSource, /Отмена/);
  assert.match(pageSource, /function parseAppRoute/);
  assert.match(pageSource, /window\.history\.pushState/);
  assert.match(pageSource, /window\.addEventListener\("popstate"/);
  assert.match(pageSource, /\/assets\/\$\{encodeURIComponent/);
  assert.match(pageSource, /\/utilities\?month=/);
  assert.match(pageSource, /\/tasks\?tab=/);
  assert.match(catchAllSource, /export \{ default \} from "\.\.\/page"/);
});
