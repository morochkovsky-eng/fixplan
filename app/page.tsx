"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react";
import {
  Attachment,
  type AttachmentData,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskItemFile,
  TaskTrigger,
} from "@/components/ai-elements/task";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CleaningsView } from "@/components/cleanings-view";
import { cleaningStatusLabels, cleaningTypeLabels, type Cleaning } from "@/lib/cleanings";
import { normalizeUtilityPeriod, recentUtilityPeriods, utilityPeriodTimestamp } from "@/lib/utility-period";
import {
  createClient as createSupabaseBrowserClient,
  createClientFromConfig as createSupabaseClientFromConfig,
} from "@/lib/supabase/browser";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Bot,
  Check,
  ClipboardCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Copy,
  Droplets,
  ExternalLink,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  List,
  Map as MapIcon,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ArrowLeft,
  Pencil,
  ReceiptText,
  Save,
  Search,
  Settings,
  Square,
  Trash2,
  Unplug,
  Upload,
  UserRoundCheck,
  X,
  Zap,
} from "lucide-react";

type Category = string;

type PlanModeId =
  | "sockets"
  | "lighting"
  | "plumbing"
  | "ventilation"
  | "furniture"
  | "windows"
  | "flooring"
  | "radiators"
  | "warmFloor";

type Status = "ok" | "attention" | "in_progress" | "needs_master";

const documentTypes = [
  { id: "passport", label: "Паспорт" },
  { id: "manual", label: "Инструкция" },
  { id: "warranty", label: "Гарантия" },
  { id: "receipt", label: "Чек" },
  { id: "invoice", label: "Счёт / квитанция" },
  { id: "estimate", label: "Смета" },
  { id: "act", label: "Акт" },
  { id: "contract", label: "Договор" },
  { id: "scheme", label: "Схема" },
  { id: "other", label: "Прочее" },
] as const;

type DocumentTypeId = (typeof documentTypes)[number]["id"];

type AssetKind =
  | "socket"
  | "switch"
  | "light"
  | "plumbing_fixture"
  | "drain"
  | "appliance"
  | "furniture"
  | "window"
  | "radiator"
  | "warm_floor"
  | "ventilation"
  | "hvac";

type AssetFilter =
  | "all"
  | "issues"
  | Status
  | Category
  | AssetKind;

type AssetSort = "status" | "room" | "code" | "checked";

type AppConfig = {
  serviceName: string;
  objectName: string;
  apartmentName: string;
  address: string;
  usageMode: "living" | "rented";
  currency: "RUB" | "EUR" | "USD";
  timezone: string;
  locale: "ru";
};

type EventType =
  | "inspection"
  | "comment"
  | "repair"
  | "status"
  | "photo"
  | "master"
  | "report";

type InspectionStatus = "draft" | "sent" | "in_progress" | "completed" | "accepted";
type Workflow = "inspection" | "work_order";

type Room = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type AssetEvent = {
  id: string;
  assetId: string;
  type: EventType;
  date: string;
  title: string;
  body: string;
  cost?: number;
  master?: string;
  statusAfter?: Status;
  inspectionId?: string;
  photo?: {
    label: string;
    note: string;
  };
};

type AssetMedia = {
  id: string;
  assetId?: string;
  eventId?: string;
  inspectionId?: string;
  utilityBillId?: string;
  utilityReadingId?: string;
  url: string;
  filename: string;
  mediaType: string;
  caption?: string;
  createdBy?: string;
  createdAt?: string;
  documentType?: DocumentTypeId;
  issuedAt?: string;
  validUntil?: string;
  note?: string;
};

type Asset = {
  id: string;
  code: string;
  name: string;
  roomId: string;
  category: Category;
  kind?: AssetKind;
  status: Status;
  x: number;
  y: number;
  lastChecked: string;
  warrantyUntil?: string;
  master?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  installedAt?: string;
  purchaseCost?: number;
  photoNote: string;
};

type AssetDraft = Pick<
  Asset,
  | "code"
  | "name"
  | "roomId"
  | "category"
  | "kind"
  | "status"
  | "x"
  | "y"
  | "warrantyUntil"
  | "master"
  | "manufacturer"
  | "model"
  | "serialNumber"
  | "installedAt"
  | "purchaseCost"
  | "photoNote"
>;

type PlanMode = {
  id: PlanModeId;
  label: string;
  src: string;
  categories: Category[];
  summary: string;
};

type AssetCategory = {
  id: Category;
  label: string;
  color: string;
  prefix: string;
  planModeId: PlanModeId;
  builtin?: boolean;
};

type PlanHotspot = {
  id: string;
  code: string;
  title: string;
  room: string;
  note: string;
  x: number;
  y: number;
  tone?: "positive" | "negative" | "warning" | "violet";
  assetId?: string;
};

type ApartmentPlanFile = {
  url: string;
  mediaType: string;
  originalName: string;
};

type ContractorAccess = {
  scope: "plumbing" | "electric" | "all" | "custom";
  expires: string;
  allowedAssetIds: string[];
  assetInstructions: Record<string, string>;
  inspectionId?: string;
  contractorName: string;
  contractorPhone: string;
};

type InspectionResult = {
  id: string;
  inspectionId: string;
  assetId: string;
  assetCode?: string;
  assetName?: string;
  roomId?: string;
  category?: Category;
  statusAfter: Status;
  comment: string;
  date: string;
  author: string;
  cost?: number;
  photoCount: number;
};

type Inspection = {
  id: string;
  number: string;
  title: string;
  createdAt: string;
  completedAt?: string;
  createdBy: string;
  contractor: string;
  contractorPhone?: string;
  workflow?: Workflow;
  scope: ContractorAccess["scope"];
  status: InspectionStatus;
  allowedAssetIds: string[];
  assetInstructions?: Record<string, string>;
  summary: string;
  conclusion?: string;
  link: string;
  resultIds: string[];
};

type UtilityBillStatus = "draft" | "due" | "paid" | "overdue";
type UtilityBillAllocation = "owner" | "tenant" | "split";
type UtilityReimbursementStatus = "not_required" | "awaiting" | "received";
type UtilityMonthStatus = "not_issued" | "issued" | "payment_received";
type UtilityMeterStatus = "due" | "submitted" | "overdue";
type UtilityServiceId = "cold_water" | "hot_water" | "electricity" | "heating" | "other";

type UtilityBill = {
  id: string;
  service: string;
  period: string;
  amount: number;
  dueDate: string;
  paidAt?: string;
  status: UtilityBillStatus;
  receiptUrl?: string;
  note?: string;
  allocation: UtilityBillAllocation;
  tenantAmount: number;
  reimbursementStatus: UtilityReimbursementStatus;
  reimbursedAt?: string;
  source: "web" | "telegram_private" | "telegram_group";
  ownerConfirmedAt?: string;
  publishedAt?: string;
  createdAt: string;
};

type UtilityMeter = {
  id: string;
  service: UtilityServiceId;
  label: string;
  serial: string;
  location: string;
  unit: string;
  nextDue: string;
  status: UtilityMeterStatus;
  lastReading?: number;
  currentRate?: number;
};

type UtilityReading = {
  id: string;
  meterId: string;
  period: string;
  value: number;
  submittedAt: string;
  source: "owner" | "telegram" | "manual";
  note?: string;
  photoUrl?: string;
  previousValue?: number;
  consumption?: number;
  rate?: number;
  calculatedAmount?: number;
};

type UtilityMeterDraft = {
  service: UtilityServiceId;
  label: string;
  serial: string;
  location: string;
  unit: string;
  nextDue: string;
  lastReading: string;
  currentRate: string;
};

type AppState = {
  config: AppConfig;
  plan?: ApartmentPlanFile | null;
  categories: AssetCategory[];
  assets: Asset[];
  deletedAssetIds?: string[];
  events: AssetEvent[];
  media: AssetMedia[];
  contractorAccess: ContractorAccess;
  inspections: Inspection[];
  inspectionResults: InspectionResult[];
  utilityBills: UtilityBill[];
  utilityMeters: UtilityMeter[];
  utilityReadings: UtilityReading[];
  cleanings: Cleaning[];
};

type View =
  | "dashboard"
  | "plan"
  | "assets"
  | "asset"
  | "documents"
  | "utilities"
  | "log"
  | "inspection"
  | "inspections"
  | "work_orders"
  | "contractor"
  | "report"
  | "settings";

const rooms: Room[] = [
  { id: "living", name: "Гостиная", x: 0, y: 0, width: 270, height: 210 },
  { id: "kitchen", name: "Кухня", x: 270, y: 0, width: 180, height: 150 },
  { id: "bath", name: "Санузел", x: 450, y: 0, width: 170, height: 150 },
  { id: "bedroom", name: "Спальня", x: 0, y: 210, width: 240, height: 210 },
  { id: "hall", name: "Прихожая", x: 240, y: 150, width: 210, height: 270 },
  { id: "office", name: "Кабинет", x: 450, y: 150, width: 170, height: 270 },
  { id: "laundry", name: "Постирочная", x: 450, y: 360, width: 90, height: 60 },
];

const categoryLabels: Record<string, string> = {
  electric: "Электрика",
  plumbing: "Сантехника",
  appliance: "Техника",
  household_appliance: "Бытовая техника",
  furniture: "Мебель",
  window: "Окна",
  hvac: "Климат",
};

const defaultAssetCategories: AssetCategory[] = [
  { id: "electric", label: "Электрика", color: "#0070f3", prefix: "R-", planModeId: "sockets", builtin: true },
  { id: "plumbing", label: "Сантехника", color: "#0ea5e9", prefix: "W-", planModeId: "plumbing", builtin: true },
  { id: "appliance", label: "Техника", color: "#8b5cf6", prefix: "A-", planModeId: "sockets", builtin: true },
  { id: "household_appliance", label: "Бытовая техника", color: "#8b5cf6", prefix: "BT-", planModeId: "sockets", builtin: true },
  { id: "furniture", label: "Мебель", color: "#a16207", prefix: "F-", planModeId: "furniture", builtin: true },
  { id: "window", label: "Окна", color: "#10b981", prefix: "WIN-", planModeId: "windows", builtin: true },
  { id: "hvac", label: "Климат", color: "#f59e0b", prefix: "A-", planModeId: "radiators", builtin: true },
];

function categoryLabel(category: Category, categories: AssetCategory[] = defaultAssetCategories) {
  return categories.find((item) => item.id === category)?.label ?? categoryLabels[category] ?? category;
}

function categoryOptions(categories: AssetCategory[]) {
  const known = new Set<string>();
  return [...defaultAssetCategories, ...categories].filter((category) => {
    if (known.has(category.id)) return false;
    known.add(category.id);
    return true;
  });
}

const assetKindLabels: Record<AssetKind, string> = {
  socket: "Розетки",
  switch: "Выключатели",
  light: "Свет",
  plumbing_fixture: "Смесители",
  drain: "Сливы",
  appliance: "Техника",
  furniture: "Мебель",
  window: "Окна",
  radiator: "Радиаторы",
  warm_floor: "Теплые полы",
  ventilation: "Вентиляция",
  hvac: "Климат",
};

const assetFilterOptions: Array<{ id: AssetFilter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "attention", label: "Требует внимания" },
  { id: "in_progress", label: "В работе" },
  { id: "needs_master", label: "Нужен мастер" },
  { id: "issues", label: "Все проблемы" },
  { id: "electric", label: "Электрика" },
  { id: "socket", label: "Розетки" },
  { id: "switch", label: "Выключатели" },
  { id: "light", label: "Свет" },
  { id: "plumbing", label: "Сантехника" },
  { id: "drain", label: "Сливы" },
  { id: "household_appliance", label: "Бытовая техника" },
  { id: "appliance", label: "Техника" },
  { id: "window", label: "Окна" },
  { id: "furniture", label: "Мебель" },
  { id: "hvac", label: "Климат" },
  { id: "radiator", label: "Радиаторы" },
  { id: "warm_floor", label: "Теплые полы" },
  { id: "ventilation", label: "Вентиляция" },
];

function assetFiltersForCategories(categories: AssetCategory[]) {
  const baseIds = new Set(assetFilterOptions.map((option) => option.id));
  const categoryFilters = categoryOptions(categories)
    .filter((category) => !baseIds.has(category.id))
    .map((category) => ({ id: category.id as AssetFilter, label: category.label }));

  return [...assetFilterOptions, ...categoryFilters];
}

const assetSortLabels: Record<AssetSort, string> = {
  status: "Сначала проблемные",
  room: "По комнатам",
  code: "По коду",
  checked: "По последней проверке",
};

const statusLabels: Record<Status, string> = {
  ok: "Исправно",
  attention: "Требует внимания",
  in_progress: "В работе",
  needs_master: "Нужен мастер",
};

const eventLabels: Record<EventType, string> = {
  inspection: "Проверка",
  comment: "Комментарий",
  repair: "Ремонт",
  status: "Статус",
  photo: "Фото",
  master: "Мастер",
  report: "Отчет",
};

const inspectionStatusLabels: Record<InspectionStatus, string> = {
  draft: "Черновик",
  sent: "Отправлен",
  in_progress: "В процессе",
  completed: "Завершен",
  accepted: "Принят",
};

const planModes: PlanMode[] = [
  {
    id: "sockets",
    label: "Выключатели и розетки",
    src: "/plan/sockets-switches.png",
    categories: ["electric", "appliance"],
    summary: "Все розетки, выключатели, выводы питания и слаботочные точки.",
  },
  {
    id: "lighting",
    label: "Световые приборы",
    src: "/plan/lighting-fixtures.png",
    categories: ["electric"],
    summary: "Светильники, группы света и точки управления.",
  },
  {
    id: "plumbing",
    label: "Сантехника",
    src: "/plan/plumbing-real.png",
    categories: ["plumbing", "appliance"],
    summary: "Вода, канализация, смесители, трапы, бойлер и подключения техники.",
  },
  {
    id: "ventilation",
    label: "Вентиляция",
    src: "/plan/ventilation-real.png",
    categories: ["hvac"],
    summary: "Вытяжка, вентиляторы, решетки и технические отверстия.",
  },
  {
    id: "furniture",
    label: "Мебель",
    src: "/plan/furniture-real.png",
    categories: ["furniture", "appliance", "plumbing"],
    summary: "Мебель, встроенные элементы, техника и постоянные предметы.",
  },
  {
    id: "windows",
    label: "Окна",
    src: "/plan/windows.png",
    categories: ["window"],
    summary: "Окна, проемы, двери и привязки по помещениям.",
  },
  {
    id: "flooring",
    label: "Паркет и плитка",
    src: "/plan/flooring.png",
    categories: ["furniture"],
    summary: "Покрытия, зоны плитки, паркет, пробковый компенсатор.",
  },
  {
    id: "radiators",
    label: "Радиаторы",
    src: "/plan/radiators.png",
    categories: ["hvac"],
    summary: "Радиаторы отопления и их привязки к оконным зонам.",
  },
  {
    id: "warmFloor",
    label: "Теплые полы",
    src: "/plan/warm-floor.png",
    categories: ["hvac", "electric"],
    summary: "Контуры теплого пола и места управления.",
  },
];

const planHotspots: Record<PlanModeId, PlanHotspot[]> = {
  sockets: [
    { id: "s-r07", code: "R-07", title: "Розетка у входа", room: "Прихожая", note: "Контроль люфта корпуса и заземления.", x: 60, y: 83, tone: "negative", assetId: "r07" },
    { id: "s-tv", code: "E-TV", title: "Блок розеток ТВ", room: "Гостиная", note: "Питание, ТВ и слаботочные выводы для медиа-зоны.", x: 18, y: 13, tone: "positive" },
    { id: "s-projector", code: "E-PR", title: "Вывод под проектор", room: "Гостиная", note: "Проверить питание и высоту вывода в потолке.", x: 34, y: 36, tone: "warning" },
    { id: "s-router", code: "NET-01", title: "Роутер", room: "Коридор", note: "Питание и интернет-точка h=2000.", x: 52, y: 50, tone: "positive" },
    { id: "s-kitchen", code: "K-EL", title: "Кухонная группа", room: "Кухня", note: "Варочная панель, духовой шкаф, посудомойка, холодильник.", x: 22, y: 74, tone: "warning" },
    { id: "s-bath", code: "B-EL", title: "Полотенцесушитель", room: "Ванная", note: "Электрический полотенцесушитель, вывод h=750.", x: 38, y: 78, tone: "warning" },
    { id: "s-washer", code: "WM-EL", title: "Стиральная машина", room: "Постирочная", note: "Питание стиральной и сушильной машины в пенале.", x: 91, y: 78, tone: "positive" },
    { id: "s-boiler", code: "B-01", title: "Бойлер", room: "Санузел", note: "Питание бойлера h=1650.", x: 90, y: 89, tone: "violet" },
    { id: "s-living-window-1", code: "R-01", title: "Розетка у окна гостиной 1", room: "Гостиная", note: "Розетка h=500 у оконного простенка.", x: 12, y: 19, tone: "positive" },
    { id: "s-living-window-2", code: "R-02", title: "Розетка у окна гостиной 2", room: "Гостиная", note: "Розетка h=300 у оконного простенка.", x: 10, y: 26, tone: "positive" },
    { id: "s-living-window-3", code: "R-03", title: "Розетка у окна гостиной 3", room: "Гостиная", note: "Розетка h=300 у оконного простенка.", x: 10, y: 44, tone: "positive" },
    { id: "s-living-media-1", code: "R-04", title: "Медиа-блок гостиной", room: "Гостиная", note: "Группа для ТВ: питание, слаботочные точки, высота h=500.", x: 24, y: 12, tone: "positive" },
    { id: "s-living-ceiling", code: "E-PR-02", title: "Потолочный вывод", room: "Гостиная", note: "Вывод для проектора в потолке.", x: 35, y: 34, tone: "warning" },
    { id: "s-living-switch-wall", code: "S-05/06/07", title: "Блок выключателей гостиной", room: "Гостиная / спальня", note: "Блок управления группами света 5, 6 и 7.", x: 50, y: 18, tone: "warning" },
    { id: "s-bedroom-door", code: "R-08", title: "Розетка у входа в спальню", room: "Спальня", note: "Розетка у дверного проема, h=300.", x: 53, y: 31, tone: "positive" },
    { id: "s-bedroom-bed-left", code: "R-09", title: "Розетки у кровати слева", room: "Спальня", note: "Прикроватная группа, h=650.", x: 88, y: 23, tone: "positive" },
    { id: "s-bedroom-bed-right", code: "R-10", title: "Розетки у кровати справа", room: "Спальня", note: "Прикроватная группа, h=650.", x: 88, y: 42, tone: "positive" },
    { id: "s-bedroom-low", code: "R-11", title: "Нижняя розетка спальни", room: "Спальня", note: "Розетка h=300 у стены спальни.", x: 74, y: 54, tone: "positive" },
    { id: "s-kitchen-hood", code: "K-01", title: "Вывод для вытяжки", room: "Кухня", note: "Питание вытяжки h=1880, см. развертки.", x: 14, y: 80, tone: "warning" },
    { id: "s-kitchen-light", code: "K-02", title: "Подключение подсветки", room: "Кухня", note: "Вывод для подключения подсветки кухни.", x: 22, y: 82, tone: "warning" },
    { id: "s-kitchen-dishwasher", code: "K-03", title: "Посудомойка", room: "Кухня", note: "Розетка посудомойки h=500.", x: 27, y: 75, tone: "positive" },
    { id: "s-kitchen-fridge", code: "K-04", title: "Холодильник", room: "Кухня", note: "Розетка холодильника h=300.", x: 39, y: 73, tone: "positive" },
    { id: "s-kitchen-counter-1", code: "K-05", title: "Розетка столешницы 1", room: "Кухня", note: "Рабочая зона кухни, h=1200.", x: 30, y: 78, tone: "positive" },
    { id: "s-kitchen-counter-2", code: "K-06", title: "Розетка столешницы 2", room: "Кухня", note: "Рабочая зона кухни, h=1200.", x: 36, y: 78, tone: "positive" },
    { id: "s-kitchen-counter-3", code: "K-07", title: "Розетка столешницы 3", room: "Кухня", note: "Рабочая зона кухни, h=1200.", x: 43, y: 78, tone: "positive" },
    { id: "s-bath-mirror", code: "B-02", title: "Зона зеркала ванной", room: "Ванная", note: "Питание зеркала / подсветки у раковины.", x: 29, y: 86, tone: "positive" },
    { id: "s-bath-vent", code: "B-03", title: "Вентилятор ванной", room: "Ванная", note: "Электрический вывод под принудительную вентиляцию.", x: 19, y: 91, tone: "warning" },
    { id: "s-hall-intercom", code: "D-EL", title: "Домофон", room: "Прихожая", note: "Вывод для домофона h=1500.", x: 65, y: 88, tone: "violet" },
    { id: "s-hall-switch", code: "S-01", title: "Выключатель прихожей", room: "Прихожая", note: "Точка управления светом прихожей.", x: 62, y: 80, tone: "positive" },
    { id: "s-wc-switch", code: "S-04", title: "Выключатель санузла", room: "Санузел", note: "Точка управления светом санузла.", x: 82, y: 78, tone: "positive" },
    { id: "s-wc-vent", code: "WC-VENT", title: "Вентилятор санузла", room: "Санузел", note: "Вывод под принудительную вентиляцию в санузле.", x: 88, y: 86, tone: "warning" },
    { id: "s-wc-boiler-control", code: "B-02", title: "Бойлер / коммуникации", room: "Санузел", note: "Питание и доступ к коммуникациям бойлера.", x: 91, y: 93, tone: "violet" },
    { id: "s-kitchen-cooktop", code: "K-08", title: "Варочная панель и духовой шкаф", room: "Кухня", note: "Силовая группа для варочной панели и духовки, h=650.", x: 18, y: 76, tone: "warning" },
    { id: "s-kitchen-vent-power", code: "K-09", title: "Питание принудительной вентиляции кухни", room: "Кухня", note: "Вывод питания вентиляции, см. развертки.", x: 19, y: 84, tone: "warning" },
    { id: "s-kitchen-apron-left", code: "K-10", title: "Розетка фартука кухни левая", room: "Кухня", note: "Дополнительная розетка рабочей зоны.", x: 25, y: 78, tone: "positive" },
    { id: "s-kitchen-apron-right", code: "K-11", title: "Розетка фартука кухни правая", room: "Кухня", note: "Дополнительная розетка рабочей зоны.", x: 47, y: 78, tone: "positive" },
    { id: "s-bath-socket", code: "B-04", title: "Розетка ванной у раковины", room: "Ванная", note: "Розетка в зоне раковины, проверить влагозащиту.", x: 33, y: 84, tone: "positive" },
    { id: "s-bath-shower-control", code: "B-05", title: "Вывод в душевой зоне", room: "Ванная", note: "Точка у душевой зоны, см. техническую схему.", x: 20, y: 82, tone: "warning" },
    { id: "s-office-outlet", code: "R-12", title: "Розетка кабинета", room: "Кабинет", note: "Розетка h=300 у рабочей зоны кабинета.", x: 73, y: 52, tone: "positive" },
    { id: "s-entry-outlet", code: "R-13", title: "Розетка прихожей у входа", room: "Прихожая", note: "Нижняя розетка у входной зоны.", x: 68, y: 90, tone: "positive" },
  ],
  lighting: [
    { id: "l-plant-left", code: "L-00.1", title: "Декоративная подсветка растения", room: "Гостиная", note: "Зеленая декоративная точка на плане света.", x: 18, y: 15, tone: "positive" },
    { id: "l-living-main", code: "L-06", title: "Люстра гостиной", room: "Гостиная", note: "Основной декоративный свет, группа 6.", x: 30, y: 29, tone: "positive" },
    { id: "l-living-wall", code: "L-07", title: "Настенный свет гостиной", room: "Гостиная", note: "Вертикальный декоративный светильник, группа 7.", x: 27, y: 50, tone: "positive" },
    { id: "l-living-line-1", code: "L-05.1", title: "Линейный свет 1", room: "Кухня / гостиная", note: "Левый модуль линейного светильника, группа 5.", x: 20, y: 64, tone: "positive" },
    { id: "l-living-line-2", code: "L-05.2", title: "Линейный свет 2", room: "Кухня / гостиная", note: "Центральный модуль линейного светильника, группа 5.", x: 30, y: 64, tone: "positive" },
    { id: "l-living-line-3", code: "L-05.3", title: "Линейный свет 3", room: "Кухня / гостиная", note: "Правый модуль линейного светильника, группа 5.", x: 40, y: 64, tone: "positive" },
    { id: "l-transformer", code: "TR-L05", title: "Трансформатор подсветки", room: "Кухня", note: "Трансформатор в верхнем шкафу.", x: 14, y: 72, tone: "warning" },
    { id: "l-bath-left-1", code: "L-02.1", title: "Линейный свет ванной левый верхний", room: "Ванная", note: "Левый вертикальный светильник, группа 2.", x: 18, y: 79, tone: "positive" },
    { id: "l-bath-left-2", code: "L-02.2", title: "Линейный свет ванной левый средний", room: "Ванная", note: "Левый вертикальный светильник, группа 2.", x: 18, y: 83, tone: "positive" },
    { id: "l-bath-left-3", code: "L-02.3", title: "Линейный свет ванной левый нижний", room: "Ванная", note: "Левый вертикальный светильник, группа 2.", x: 18, y: 87, tone: "positive" },
    { id: "l-bath-main", code: "L-03", title: "Потолочный свет ванной", room: "Ванная", note: "Декоративный потолочный светильник, группа 3.", x: 30, y: 82, tone: "positive" },
    { id: "l-bath-right-1", code: "L-02.4", title: "Линейный свет ванной правый верхний", room: "Ванная", note: "Правый вертикальный светильник, группа 2.", x: 42, y: 79, tone: "positive" },
    { id: "l-bath-right-2", code: "L-02.5", title: "Линейный свет ванной правый средний", room: "Ванная", note: "Правый вертикальный светильник, группа 2.", x: 42, y: 83, tone: "positive" },
    { id: "l-bath-right-3", code: "L-02.6", title: "Линейный свет ванной правый нижний", room: "Ванная", note: "Правый вертикальный светильник, группа 2.", x: 42, y: 87, tone: "positive" },
    { id: "l-bedroom-green", code: "L-08.1", title: "Светильник спальни у окна", room: "Спальня", note: "Зеленый декоративный светильник на торшере.", x: 83, y: 18, tone: "positive" },
    { id: "l-bedroom-main", code: "L-08.2", title: "Основной свет спальни", room: "Спальня", note: "Круговой декоративный светильник, группа 8.", x: 70, y: 33, tone: "positive" },
    { id: "l-bedroom-wall", code: "L-08.3", title: "Настенный свет спальни", room: "Спальня", note: "Выключатель на светильнике / локальная точка.", x: 76, y: 70, tone: "positive" },
    { id: "l-office-main", code: "L-09", title: "Свет кабинета", room: "Кабинет", note: "Декоративный светильник, группа 9.", x: 75, y: 62, tone: "positive" },
    { id: "l-office-round", code: "L-09.1", title: "Дополнительный свет кабинета", room: "Кабинет", note: "Круглая световая точка у стены.", x: 85, y: 66, tone: "positive" },
    { id: "l-hall", code: "L-01", title: "Свет прихожей", room: "Прихожая", note: "Малый потолочный светильник у входа.", x: 62, y: 82, tone: "warning" },
    { id: "l-wc", code: "L-04", title: "Свет санузла", room: "Санузел", note: "Потолочный светильник санузла.", x: 86, y: 80, tone: "positive" },
    { id: "l-wc-wall", code: "L-04.1", title: "Локальный свет санузла", room: "Санузел", note: "Дополнительная световая точка у стены.", x: 82, y: 86, tone: "positive" },
  ],
  plumbing: [
    { id: "p-w04", code: "W-04", title: "Смеситель", room: "Ванная", note: "Проверить соединения, протечки и напор.", x: 35, y: 76, tone: "positive", assetId: "w04" },
    { id: "p-w08", code: "W-08", title: "Слив в санузле", room: "Санузел", note: "Слив работает медленно, нужна чистка сифона.", x: 81, y: 82, tone: "violet", assetId: "w08" },
    { id: "p-shower", code: "W-02", title: "Душевой трап", room: "Ванная", note: "Трап в полу, проверить уклон и запах.", x: 27, y: 78, tone: "warning" },
    { id: "p-bath", code: "W-03", title: "Ванна", room: "Ванная", note: "Отдельностоящая ванна, слив по центру.", x: 18, y: 86, tone: "positive" },
    { id: "p-kitchen-sink", code: "W-05", title: "Раковина кухни", room: "Кухня", note: "Вывод воды и канализации под раковину.", x: 36, y: 73, tone: "positive" },
    { id: "p-washer", code: "W-06", title: "Стиральная машина", room: "Постирочная", note: "Вода и канализация после выбора оборудования.", x: 90, y: 74, tone: "warning" },
    { id: "p-boiler", code: "W-07", title: "Бойлер", room: "Санузел", note: "Проточный бойлер h=1800.", x: 91, y: 90, tone: "violet" },
    { id: "p-shower-mixer", code: "W-09", title: "Смеситель душа", room: "Ванная", note: "Смеситель для душа h=850 от чистого пола.", x: 17, y: 74, tone: "warning" },
    { id: "p-upper-shower", code: "W-10", title: "Верхний душ", room: "Ванная", note: "Верхний душ h=2100, проверить крепление и подводку.", x: 28, y: 84, tone: "positive" },
    { id: "p-toilet", code: "W-11", title: "Унитаз", room: "Санузел", note: "Проверить выпуск, крепление и отсутствие протечек.", x: 85, y: 84, tone: "positive" },
    { id: "p-bath-drain", code: "W-12", title: "Слив ванны", room: "Ванная", note: "Слив ванны по центру, проверить запах и скорость ухода воды.", x: 21, y: 88, tone: "warning" },
  ],
  ventilation: [
    { id: "v-kitchen", code: "V-01", title: "Вытяжка кухни", room: "Кухня", note: "Центр отверстия уточняется у производителя кухни.", x: 21, y: 70, tone: "warning" },
    { id: "v-bath", code: "V-02", title: "Вентилятор ванной", room: "Ванная", note: "Электрический вентилятор, место уточнить на месте.", x: 22, y: 94, tone: "warning" },
    { id: "v-wc", code: "V-03", title: "Вентилятор санузла", room: "Санузел", note: "Вывод под вентиляцию на фасаде.", x: 88, y: 83, tone: "warning" },
    { id: "v-bedroom", code: "V-04", title: "Техническое отверстие", room: "Спальня", note: "Место расположения уточнить на месте.", x: 75, y: 45, tone: "violet" },
    { id: "v-grille", code: "V-05", title: "Короб с решетками", room: "Кабинет", note: "Проверить решетки и доступность обслуживания.", x: 77, y: 63, tone: "positive" },
    { id: "v-kitchen-hood-hole", code: "V-06", title: "Отверстие вытяжной системы", room: "Кухня", note: "Центр отверстия для встроенной вытяжной системы.", x: 25, y: 66, tone: "warning" },
    { id: "v-office-electric-fan", code: "V-07", title: "Принудительная вентиляция кабинета", room: "Кабинет", note: "Электрический вентилятор под вентиляцию на фасаде.", x: 88, y: 91, tone: "warning" },
  ],
  furniture: [
    { id: "f-sofa", code: "F-01", title: "Диван", room: "Гостиная", note: "Основная зона отдыха.", x: 27, y: 42, tone: "positive" },
    { id: "f-tv", code: "F-02", title: "Напольный телевизор", room: "Гостиная", note: "Проверить привязку к розеткам ТВ.", x: 33, y: 21, tone: "positive" },
    { id: "f-table", code: "F-03", title: "Обеденный стол", room: "Гостиная / кухня", note: "Контроль проходов вокруг стола.", x: 27, y: 56, tone: "positive" },
    { id: "f-bed", code: "F-04", title: "Кровать", room: "Спальня", note: "Кровать 2150 x 1900, тумбы по бокам.", x: 76, y: 35, tone: "positive" },
    { id: "f11-map", code: "F-11", title: "Шкаф", room: "Спальня", note: "Скол на фасаде, нужен мебельщик.", x: 53, y: 49, tone: "negative", assetId: "f11" },
    { id: "f-bath", code: "F-05", title: "Ванная зона", room: "Ванная", note: "Ванна, душевая с трапом, шкаф-пенал.", x: 18, y: 82, tone: "positive" },
    { id: "f-washer", code: "F-06", title: "Стиральная / сушильная", room: "Постирочная", note: "Техника в пенале, проверить доступ.", x: 91, y: 75, tone: "warning" },
    { id: "f-hooks", code: "F-07", title: "Крючки и скамья", room: "Прихожая", note: "Зона верхней одежды.", x: 47, y: 93, tone: "positive" },
    { id: "f-living-chair-1", code: "F-08", title: "Кресло гостиной левое", room: "Гостиная", note: "Кресло в зоне отдыха, проверить проходы.", x: 20, y: 20, tone: "positive" },
    { id: "f-living-chair-2", code: "F-09", title: "Кресло гостиной правое", room: "Гостиная", note: "Кресло в зоне отдыха у медиа-зоны.", x: 40, y: 22, tone: "positive" },
    { id: "f-bedroom-bedside-left", code: "F-10", title: "Прикроватная тумба левая", room: "Спальня", note: "Левая прикроватная тумба, контроль примыкания к кровати.", x: 88, y: 30, tone: "positive" },
    { id: "f-bedroom-bedside-right", code: "F-12", title: "Прикроватная тумба правая", room: "Спальня", note: "Правая прикроватная тумба, контроль прохода у стены.", x: 88, y: 42, tone: "positive" },
    { id: "f-office-desk", code: "F-13", title: "Рабочий стол кабинета", room: "Кабинет", note: "Рабочее место с техникой, проверить розетки и посадку мебели.", x: 80, y: 66, tone: "positive" },
  ],
  windows: [
    { id: "win-l1", code: "WIN-01", title: "Окно гостиной нижнее", room: "Гостиная", note: "Проверить фурнитуру, уплотнитель и откосы нижнего окна.", x: 9, y: 79, tone: "positive" },
    { id: "win-l2", code: "WIN-02", title: "Окно гостиной среднее нижнее", room: "Гостиная", note: "Проверить открывание, прижим и состояние подоконника.", x: 9, y: 65, tone: "positive" },
    { id: "win-l3", code: "WIN-03", title: "Окно гостиной среднее", room: "Гостиная", note: "Проверить створки и отсутствие продувания.", x: 9, y: 50, tone: "positive" },
    { id: "win-l4", code: "WIN-04", title: "Окно гостиной верхнее", room: "Гостиная", note: "Проверить фурнитуру, ручку и уплотнитель.", x: 9, y: 34, tone: "positive" },
    { id: "win-l5", code: "WIN-05", title: "Окно гостиной у медиа-зоны", room: "Гостиная", note: "Проверить геометрию проема и состояние откосов.", x: 9, y: 21, tone: "positive" },
    { id: "win-kitchen", code: "WIN-06", title: "Окно кухни", room: "Кухня", note: "Проверить створку возле кухонного фронта.", x: 9, y: 91, tone: "positive" },
    { id: "win-bedroom-left", code: "WIN-07", title: "Окно спальни левое", room: "Спальня", note: "Ширина проема 1068, проверить фурнитуру и прижим.", x: 58, y: 8, tone: "positive" },
    { id: "win-bedroom-center", code: "WIN-08", title: "Окно спальни центральное", room: "Спальня", note: "Центральный оконный простенок / проем спальни.", x: 72, y: 8, tone: "positive" },
    { id: "win-bedroom-right", code: "WIN-09", title: "Окно спальни правое", room: "Спальня", note: "Ширина проема 1068, проверить ручку и уплотнитель.", x: 84, y: 8, tone: "positive" },
    { id: "win03-map", code: "WIN-10", title: "Окно кабинета", room: "Кабинет", note: "Фото фурнитуры, контроль створок.", x: 76, y: 9, tone: "positive", assetId: "win03" },
    { id: "door-bedroom", code: "D-01", title: "Дверь спальни", room: "Спальня", note: "Проверить полотно, петли и зазор по коробке.", x: 51, y: 24, tone: "warning" },
    { id: "door-bath", code: "D-02", title: "Дверь ванной", room: "Ванная", note: "Проверить петли, замок и примыкание к плитке.", x: 50, y: 75, tone: "warning" },
    { id: "door-office", code: "D-03", title: "Дверь кабинета", room: "Кабинет", note: "Проверить открывание и зазор возле пола.", x: 70, y: 73, tone: "warning" },
    { id: "door-wc", code: "D-04", title: "Дверь санузла", room: "Санузел", note: "Проверить замок, петли и вентиляционный зазор.", x: 83, y: 88, tone: "warning" },
    { id: "door-entry", code: "D-05", title: "Входная дверь", room: "Прихожая", note: "Проверить петли, замок, доводчик и уплотнитель.", x: 66, y: 92, tone: "warning" },
  ],
  flooring: [
    { id: "fl-living", code: "FL-01", title: "Паркет", room: "Гостиная / спальня / кабинет", note: "Единое поле паркета 61,44 м².", x: 38, y: 43, tone: "positive" },
    { id: "fl-bath", code: "FL-02", title: "Плитка ванной", room: "Ванная", note: "Зона плитки 6,57 м².", x: 27, y: 82, tone: "positive" },
    { id: "fl-wc", code: "FL-03", title: "Плитка санузла", room: "Санузел", note: "Зона плитки 2,47 м².", x: 86, y: 82, tone: "positive" },
    { id: "fl-hall", code: "FL-04", title: "Паркет прихожей", room: "Прихожая", note: "Контроль пробкового компенсатора.", x: 58, y: 82, tone: "warning" },
    { id: "fl-comp", code: "FL-05", title: "Пробковый компенсатор", room: "Прихожая / влажные зоны", note: "Проверить стыки у плитки.", x: 64, y: 79, tone: "warning" },
    { id: "fl-kitchen-front", code: "FL-06", title: "Паркет у кухонного фронта", room: "Кухня", note: "Проверить стык покрытия вдоль кухонного фронта.", x: 30, y: 74, tone: "warning" },
  ],
  radiators: [
    { id: "rad-l1", code: "RAD-01", title: "Радиатор гостиной 1", room: "Гостиная", note: "Проверить крепление, краны и отсутствие течи.", x: 12, y: 25, tone: "positive" },
    { id: "rad-l2", code: "RAD-02", title: "Радиатор гостиной 2", room: "Гостиная", note: "Проверить прогрев и воздух.", x: 12, y: 43, tone: "positive" },
    { id: "rad-b1", code: "RAD-03", title: "Радиатор спальни левый", room: "Спальня", note: "Радиатор под окном, длина 690.", x: 59, y: 12, tone: "positive" },
    { id: "rad-b2", code: "RAD-04", title: "Радиатор спальни правый", room: "Спальня", note: "Радиатор под окном, длина 690.", x: 83, y: 12, tone: "positive" },
    { id: "rad-a02", code: "A-02", title: "Климатический узел", room: "Коридор", note: "Связан с обслуживанием кондиционирования.", x: 82, y: 55, tone: "warning", assetId: "a02" },
  ],
  warmFloor: [
    { id: "wf-bath", code: "TP-01", title: "Теплый пол ванной", room: "Ванная", note: "Контур 5,07 м², управление под выключателем.", x: 29, y: 78, tone: "warning" },
    { id: "wf-wc", code: "TP-02", title: "Теплый пол санузла", room: "Санузел", note: "Контур 1,40 м², управление под выключателем.", x: 84, y: 78, tone: "warning" },
    { id: "wf-control-bath", code: "TP-S1", title: "Регулятор ванной", room: "Ванная", note: "Терморегулятор под выключателем.", x: 44, y: 70, tone: "positive" },
    { id: "wf-control-wc", code: "TP-S2", title: "Регулятор санузла", room: "Санузел", note: "Терморегулятор под выключателем.", x: 73, y: 81, tone: "positive" },
  ],
};

function hotspotAssetId(hotspot: PlanHotspot) {
  return hotspot.assetId ?? hotspot.id;
}

function planModesForAssets(assets: Asset[]) {
  const visibleAssetIds = new Set(assets.map((asset) => asset.id));

  return planModes.filter((mode) =>
    planHotspots[mode.id].some((hotspot) => visibleAssetIds.has(hotspotAssetId(hotspot))),
  );
}

const initialState: AppState = {
  config: {
    serviceName: "FixPlan",
    objectName: "Шпалерная, 34Б",
    apartmentName: "Квартира",
    address: "Шпалерная, 34Б",
    usageMode: "living",
    currency: "RUB",
    timezone: "Europe/Moscow",
    locale: "ru",
  },
  plan: undefined,
  categories: defaultAssetCategories,
  assets: [
    {
      id: "r07",
      code: "R-07",
      name: "Розетка у входа",
      roomId: "hall",
      category: "electric",
      kind: "socket",
      status: "attention",
      x: 60,
      y: 83,
      lastChecked: "18 августа 2026",
      warrantyUntil: "12 декабря 2027",
      master: "Роман, электрик",
      photoNote: "Фото розетки до и после ремонта",
    },
    {
      id: "w04",
      code: "W-04",
      name: "Смеситель",
      roomId: "bath",
      category: "plumbing",
      kind: "plumbing_fixture",
      status: "ok",
      x: 28,
      y: 78,
      lastChecked: "22 августа 2026",
      warrantyUntil: "1 марта 2028",
      photoNote: "Фото смесителя и соединений",
    },
    {
      id: "w08",
      code: "W-08",
      name: "Слив в санузле",
      roomId: "bath",
      category: "plumbing",
      kind: "drain",
      status: "needs_master",
      x: 46,
      y: 72,
      lastChecked: "23 августа 2026",
      master: "Нужен сантехник",
      photoNote: "Фото сифона и слива",
    },
    {
      id: "a02",
      code: "A-02",
      name: "Кондиционер",
      roomId: "hall",
      category: "hvac",
      kind: "hvac",
      status: "in_progress",
      x: 82,
      y: 55,
      lastChecked: "18 августа 2026",
      master: "Сервис Климат",
      warrantyUntil: "30 мая 2027",
      photoNote: "Фото внутреннего блока",
    },
    {
      id: "f11",
      code: "F-11",
      name: "Шкаф",
      roomId: "bedroom",
      category: "furniture",
      kind: "furniture",
      status: "attention",
      x: 78,
      y: 38,
      lastChecked: "15 августа 2026",
      master: "Ищем мебельщика",
      photoNote: "Скол на фасаде",
    },
    {
      id: "win03",
      code: "WIN-03",
      name: "Окно в кабинете",
      roomId: "office",
      category: "window",
      kind: "window",
      status: "ok",
      x: 76,
      y: 9,
      lastChecked: "15 августа 2026",
      warrantyUntil: "20 сентября 2029",
      photoNote: "Фото фурнитуры",
    },
  ],
  events: [
    {
      id: "e1",
      assetId: "r07",
      type: "comment",
      date: "23 августа 2026",
      title: "Комментарий",
      body: "Корпус люфтит. Переведен в статус «требует внимания».",
      statusAfter: "attention",
    },
    {
      id: "e2",
      assetId: "r07",
      type: "repair",
      date: "22 августа 2026",
      title: "Ремонт",
      body: "Мастер Роман подтянул крепление.",
      cost: 1500,
      master: "Роман",
      statusAfter: "ok",
      photo: {
        label: "после",
        note: "Розетка закреплена",
      },
    },
    {
      id: "e3",
      assetId: "r07",
      type: "master",
      date: "20 августа 2026",
      title: "Вызван мастер",
      body: "Назначен электрик Роман, договоренность на 22 августа.",
      master: "Роман",
    },
    {
      id: "e4",
      assetId: "w08",
      type: "inspection",
      date: "23 августа 2026",
      title: "Проверка",
      body: "Слив работает медленно, нужна чистка сифона.",
      cost: 2000,
      statusAfter: "needs_master",
      inspectionId: "insp-001",
    },
    {
      id: "e5",
      assetId: "a02",
      type: "repair",
      date: "18 августа 2026",
      title: "Сервис",
      body: "Назначена замена фильтра кондиционера.",
      master: "Сервис Климат",
      statusAfter: "in_progress",
    },
  ],
  media: [],
  contractorAccess: {
    scope: "plumbing",
    expires: "3 дня",
    allowedAssetIds: ["w04", "w08"],
    assetInstructions: {
      w08: "Проверить скорость ухода воды, почистить сифон, приложить фото до и после.",
    },
    inspectionId: "insp-001",
    contractorName: "Роман",
    contractorPhone: "",
  },
  inspections: [
    {
      id: "insp-001",
      number: "Обход #1",
      title: "Сантехника перед приездом мастера",
      createdAt: "23 августа 2026",
      completedAt: "23 августа 2026",
      createdBy: "Владелец",
      contractor: "Роман, сантехник",
      contractorPhone: "",
      workflow: "inspection",
      scope: "plumbing",
      status: "completed",
      allowedAssetIds: ["w04", "w08"],
      assetInstructions: {},
      summary: "Проверены смеситель и слив. По сливу нужна чистка сифона, ориентир 2 000 руб.",
      conclusion:
        "По санузлу критичных протечек не обнаружено. Слив лучше профилактически чистить раз в 3 месяца.",
      link: "shpalernaya.app/access/plumbing-3d8f",
      resultIds: ["res-001", "res-002"],
    },
  ],
  inspectionResults: [
    {
      id: "res-001",
      inspectionId: "insp-001",
      assetId: "w04",
      statusAfter: "ok",
      comment: "Смеситель работает нормально, протечек нет.",
      date: "23 августа 2026",
      author: "Роман",
      photoCount: 2,
    },
    {
      id: "res-002",
      inspectionId: "insp-001",
      assetId: "w08",
      statusAfter: "needs_master",
      comment: "Слив работает медленно, нужна чистка сифона.",
      date: "23 августа 2026",
      author: "Роман",
      cost: 2000,
      photoCount: 3,
    },
  ],
  utilityBills: [
    {
      id: "bill-aug-electricity",
      service: "Электричество",
      period: "Август 2026",
      amount: 4860,
      dueDate: "10.09.2026",
      status: "due",
      allocation: "tenant",
      tenantAmount: 4860,
      reimbursementStatus: "awaiting",
      source: "web",
      createdAt: "2026-08-25T10:00:00.000Z",
      note: "Перед оплатой сверить показания счетчика.",
    },
    {
      id: "bill-aug-water",
      service: "Вода",
      period: "Август 2026",
      amount: 2380,
      dueDate: "05.09.2026",
      status: "paid",
      paidAt: "28.08.2026",
      allocation: "owner",
      tenantAmount: 0,
      reimbursementStatus: "not_required",
      source: "web",
      createdAt: "2026-08-24T10:00:00.000Z",
      note: "Оплачено по квитанции УК.",
    },
  ],
  utilityMeters: [
    {
      id: "meter-cold-water",
      service: "cold_water",
      label: "Холодная вода",
      serial: "210152202",
      location: "Прихожая",
      unit: "м3",
      nextDue: "25.09.2026",
      status: "overdue",
      lastReading: 128.4,
    },
    {
      id: "meter-hot-water",
      service: "hot_water",
      label: "Горячая вода",
      serial: "0049391",
      location: "Прихожая",
      unit: "м3",
      nextDue: "25.09.2026",
      status: "overdue",
      lastReading: 62.1,
    },
    {
      id: "meter-electricity",
      service: "electricity",
      label: "Электроэнергия",
      serial: "60196178",
      location: "Квартира",
      unit: "кВт·ч",
      nextDue: "25.09.2026",
      status: "due",
      lastReading: 4830,
    },
  ],
  utilityReadings: [
    {
      id: "reading-aug-cold-water",
      meterId: "meter-cold-water",
      period: "Август 2026",
      value: 128.4,
      submittedAt: "24.08.2026",
      source: "telegram",
      note: "Передано владельцем через будущий сценарий бота.",
    },
    {
      id: "reading-aug-hot-water",
      meterId: "meter-hot-water",
      period: "Август 2026",
      value: 62.1,
      submittedAt: "24.08.2026",
      source: "manual",
    },
    {
      id: "reading-aug-electricity",
      meterId: "meter-electricity",
      period: "Август 2026",
      value: 4830,
      submittedAt: "24.08.2026",
      source: "owner",
    },
  ],
  cleanings: [],
};

function todayLabel() {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function roomName(roomId: string) {
  return rooms.find((room) => room.id === roomId)?.name ?? "Без комнаты";
}

function eventId() {
  return `event-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function utilityReadingId() {
  return `reading-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function emptyUtilityBillDraft(period: string): Omit<UtilityBill, "id"> {
  return {
    service: "",
    period,
    amount: 0,
    dueDate: "",
    status: "due",
    receiptUrl: "",
    note: "",
    allocation: "owner",
    tenantAmount: 0,
    reimbursementStatus: "not_required",
    source: "web",
    createdAt: new Date().toISOString(),
  };
}

const utilityBillStatusLabels: Record<UtilityBillStatus, string> = {
  draft: "Черновик",
  due: "К оплате",
  paid: "Оплачен",
  overdue: "Просрочен",
};

const utilityBillAllocationLabels: Record<UtilityBillAllocation, string> = {
  owner: "Расход владельца",
  tenant: "Расход жильца",
  split: "Разделить",
};

const utilityReimbursementStatusLabels: Record<UtilityReimbursementStatus, string> = {
  not_required: "Оплата не требуется",
  awaiting: "Ожидаем оплату",
  received: "Оплата получена",
};

function tenantShareFor(allocation: UtilityBillAllocation, amount: number, current: number) {
  if (allocation === "owner") return 0;
  if (allocation === "tenant") return amount;
  return Math.min(current, amount);
}

function moneyLabel(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function utilityBillTone(status: UtilityBillStatus): "secondary" | "destructive" | "outline" {
  if (status === "paid") return "secondary";
  if (status === "overdue") return "destructive";
  return "outline";
}

const utilityPeriods = recentUtilityPeriods();

const utilityMonthStatusLabels: Record<UtilityMonthStatus, string> = {
  not_issued: "Счёт не выставлен",
  issued: "Счёт выставлен",
  payment_received: "Оплата получена",
};

const utilityMonthStatusDescriptions: Record<UtilityMonthStatus, string> = {
  not_issued: "Счёт жильцу за этот месяц ещё не выставлен.",
  issued: "Счёт выставлен, оплату от жильца ещё не получили.",
  payment_received: "Оплата от жильца получена.",
};

const utilityMeterStatusLabels: Record<UtilityMeterStatus, string> = {
  due: "Нужно передать",
  submitted: "Передано",
  overdue: "Просрочено",
};

const utilityReadingSourceLabels: Record<UtilityReading["source"], string> = {
  owner: "Владелец",
  telegram: "Telegram",
  manual: "Вручную",
};

const utilityServiceLabels: Record<UtilityServiceId, string> = {
  cold_water: "Холодная вода",
  hot_water: "Горячая вода",
  electricity: "Электричество",
  heating: "Отопление",
  other: "Другой",
};

const utilityServiceUnits: Record<UtilityServiceId, string> = {
  cold_water: "м3",
  hot_water: "м3",
  electricity: "кВт·ч",
  heating: "Гкал",
  other: "",
};

function emptyUtilityMeterDraft(): UtilityMeterDraft {
  return {
    service: "electricity",
    label: "Электричество",
    serial: "",
    location: "",
    unit: "кВт·ч",
    nextDue: "",
    lastReading: "",
    currentRate: "",
  };
}

function utilityMonthTone(status: UtilityMonthStatus): "secondary" | "destructive" | "outline" {
  if (status === "not_issued") return "destructive";
  if (status === "issued") return "outline";
  return "secondary";
}

function utilityMonthToneClass(status: UtilityMonthStatus) {
  if (status === "issued") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "payment_received") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "";
}

function utilityMeterIcon(service: UtilityServiceId) {
  if (service === "electricity") return <Zap size={18} />;
  if (service === "cold_water" || service === "hot_water") return <Droplets size={18} />;
  return <Gauge size={18} />;
}

function buildUtilityMonths(
  bills: UtilityBill[],
  meters: UtilityMeter[],
  readings: UtilityReading[],
) {
  const periods = Array.from(new Set([
    ...utilityPeriods,
    ...bills.map((bill) => normalizeUtilityPeriod(bill.period)),
    ...readings.map((reading) => normalizeUtilityPeriod(reading.period)),
  ].filter(Boolean))).sort((left, right) => {
    const difference = utilityPeriodTimestamp(right) - utilityPeriodTimestamp(left);
    return difference || right.localeCompare(left, "ru");
  });

  return periods.map((period) => {
    const periodBills = bills.filter((bill) => normalizeUtilityPeriod(bill.period) === period);
    const periodReadings = readings.filter((reading) => normalizeUtilityPeriod(reading.period) === period);
    const readMeterIds = new Set(periodReadings.map((reading) => reading.meterId));
    const electricityMeters = meters.filter((meter) => meter.service === "electricity");
    const hasElectricityBill = periodBills.some((bill) => /элект|свет/i.test(bill.service));
    const hasHousingBill = periodBills.some((bill) => !/элект|свет/i.test(bill.service));
    const hasAllElectricityReadings =
      electricityMeters.length > 0 && electricityMeters.every((meter) => readMeterIds.has(meter.id));
    const hasElectricityData = hasElectricityBill || hasAllElectricityReadings;
    const missing: string[] = [];
    if (!hasHousingBill) missing.push("квитанция ЖКХ");
    if (!hasElectricityData) {
      missing.push(electricityMeters.length ? "счет или показания электричества" : "счет или счетчик электричества");
    }
    const received: string[] = [];
    if (hasHousingBill) received.push("квитанция ЖКХ");
    if (hasElectricityBill) received.push("счет за электричество");
    else if (hasAllElectricityReadings) received.push("показания электричества");
    const issuedBills = periodBills.filter((bill) => bill.status !== "draft");
    const tenantBills = issuedBills.filter((bill) => bill.tenantAmount > 0);
    const pendingReimbursements = tenantBills.filter(
      (bill) => bill.tenantAmount > 0 && bill.reimbursementStatus !== "received",
    );
    const receivedReimbursements = tenantBills.filter((bill) => bill.reimbursementStatus === "received");
    const amount = periodBills.reduce((sum, bill) => sum + bill.amount, 0);
    const status: UtilityMonthStatus = !issuedBills.length
      ? "not_issued"
      : tenantBills.length > 0 && !pendingReimbursements.length
        ? "payment_received"
        : "issued";

    return {
      period,
      status,
      bills: periodBills,
      readings: periodReadings,
      amount,
      issuedAmount: tenantBills.reduce((sum, bill) => sum + bill.tenantAmount, 0),
      reimbursementAmount: pendingReimbursements.reduce((sum, bill) => sum + bill.tenantAmount, 0),
      receivedAmount: receivedReimbursements.reduce((sum, bill) => sum + bill.tenantAmount, 0),
      missing,
      received,
    };
  });
}

function assetKind(asset: Asset): AssetKind {
  if (asset.kind) return asset.kind;
  if (asset.code.startsWith("R-")) return "socket";
  if (asset.code.startsWith("S-")) return "switch";
  if (asset.code.startsWith("L-")) return "light";
  if (asset.code.startsWith("WIN-")) return "window";
  if (asset.code.startsWith("RAD-")) return "radiator";
  if (asset.code.startsWith("TP-")) return "warm_floor";
  if (asset.code.startsWith("V-")) return "ventilation";
  if (asset.category === "plumbing") return "plumbing_fixture";
  if (asset.category === "appliance" || asset.category === "household_appliance") return "appliance";
  if (asset.category === "furniture") return "furniture";
  if (asset.category === "hvac") return "hvac";
  return "socket";
}

function isCategoryFilter(filter: AssetFilter): filter is Category {
  return (
    Object.prototype.hasOwnProperty.call(categoryLabels, filter) ||
    defaultAssetCategories.some((category) => category.id === filter) ||
    filter.startsWith("category-")
  );
}

function isKindFilter(filter: AssetFilter): filter is AssetKind {
  return Object.prototype.hasOwnProperty.call(assetKindLabels, filter);
}

function matchesAssetFilter(asset: Asset, filter: AssetFilter) {
  if (filter === "all") return true;
  if (filter === "issues") return asset.status !== "ok";
  if (filter === "ok" || filter === "attention" || filter === "in_progress" || filter === "needs_master") {
    return asset.status === filter;
  }
  if (isCategoryFilter(filter)) return asset.category === filter;
  if (isKindFilter(filter)) return assetKind(asset) === filter;
  return asset.category === filter;
}

function matchesAssetSearch(asset: Asset, query: string) {
  const value = query.trim().toLowerCase();
  if (!value) return true;

  return [
    asset.code,
    asset.name,
    roomName(asset.roomId),
    categoryLabel(asset.category),
    assetKindLabels[assetKind(asset)],
    statusLabels[asset.status],
  ]
    .join(" ")
    .toLowerCase()
    .includes(value);
}

function planModeForCategory(categoryId: Category, categories: AssetCategory[]) {
  return (
    categoryOptions(categories).find((category) => category.id === categoryId)?.planModeId ??
    planModeFromAssetFilter(categoryId)
  );
}

function planModeFromAssetFilter(filter: AssetFilter): PlanModeId {
  if (filter === "light") return "lighting";
  if (filter === "plumbing" || filter === "drain") return "plumbing";
  if (filter === "furniture") return "furniture";
  if (filter === "window") return "windows";
  if (filter === "radiator" || filter === "hvac") return "radiators";
  if (filter === "warm_floor") return "warmFloor";
  if (filter === "ventilation") return "ventilation";
  return "sockets";
}

function statusWeight(status: Status) {
  const order: Record<Status, number> = {
    attention: 0,
    needs_master: 1,
    in_progress: 2,
    ok: 3,
  };
  return order[status];
}

function statusTone(status: Status): PlanHotspot["tone"] {
  if (status === "attention") return "negative";
  if (status === "in_progress") return "warning";
  if (status === "needs_master") return "violet";
  return "positive";
}

function resultId() {
  return `res-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function tempAssetId() {
  return `draft-asset-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function isTempAssetId(id: string | null | undefined) {
  return Boolean(id?.startsWith("draft-asset-"));
}

function customCategoryId() {
  return `category-${Date.now().toString(36)}-${Math.round(Math.random() * 1000)}`;
}

function defaultCategoryForNewAsset(categories: AssetCategory[], categoryId?: Category) {
  return categoryOptions(categories).find((category) => category.id === categoryId);
}

function roomIdFromPlanRoom(room: string) {
  const value = room.toLowerCase();
  if (value.includes("ванн") || value.includes("сануз")) return "bath";
  if (value.includes("спаль")) return "bedroom";
  if (value.includes("кабин")) return "office";
  if (value.includes("кух")) return "kitchen";
  if (value.includes("постир")) return "laundry";
  if (value.includes("прих") || value.includes("корид")) return "hall";
  return "living";
}

function assetKindFromPlan(modeId: PlanModeId, hotspot: PlanHotspot): AssetKind {
  if (modeId === "lighting") return "light";
  if (modeId === "sockets" && hotspot.code.startsWith("S-")) return "switch";
  if (modeId === "plumbing") {
    if (hotspot.title.toLowerCase().includes("слив") || hotspot.title.toLowerCase().includes("трап")) {
      return "drain";
    }
    return "plumbing_fixture";
  }
  if (modeId === "ventilation") return "ventilation";
  if (modeId === "furniture") return "furniture";
  if (modeId === "windows") return "window";
  if (modeId === "radiators") return "radiator";
  if (modeId === "warmFloor") return "warm_floor";
  if (hotspot.code.startsWith("R-")) return "socket";
  if (hotspot.code.startsWith("S-")) return "switch";
  if (hotspot.code.startsWith("L-")) return "light";
  if (hotspot.code.startsWith("WM") || hotspot.code.startsWith("B-")) return "appliance";
  return "socket";
}

function categoryFromPlan(mode: PlanMode, kind: AssetKind): Category {
  if (kind === "socket" || kind === "switch" || kind === "light" || kind === "warm_floor") {
    return "electric";
  }
  if (kind === "plumbing_fixture" || kind === "drain") return "plumbing";
  if (kind === "window") return "window";
  if (kind === "furniture") return "furniture";
  if (kind === "radiator" || kind === "ventilation" || kind === "hvac") return "hvac";
  if (kind === "appliance") return "household_appliance";
  return mode.categories[0] ?? "electric";
}

function catalogAssetFromHotspot(mode: PlanMode, hotspot: PlanHotspot): Asset {
  const kind = assetKindFromPlan(mode.id, hotspot);
  return {
    id: hotspot.assetId ?? hotspot.id,
    code: hotspot.code,
    name: hotspot.title,
    roomId: roomIdFromPlanRoom(hotspot.room),
    category: categoryFromPlan(mode, kind),
    kind,
    status: hotspot.tone === "negative" ? "attention" : hotspot.tone === "violet" ? "needs_master" : "ok",
    x: hotspot.x,
    y: hotspot.y,
    lastChecked: "не проверялось",
    warrantyUntil: undefined,
    master: undefined,
    manufacturer: undefined,
    model: undefined,
    serialNumber: undefined,
    installedAt: undefined,
    purchaseCost: undefined,
    photoNote: hotspot.note,
  };
}

function assetDraftFromAsset(asset: Asset): AssetDraft {
  return {
    code: asset.code,
    name: asset.name,
    roomId: asset.roomId,
    category: asset.category,
    kind: assetKind(asset),
    status: asset.status,
    x: asset.x,
    y: asset.y,
    warrantyUntil: asset.warrantyUntil ?? "",
    master: asset.master ?? "",
    manufacturer: asset.manufacturer ?? "",
    model: asset.model ?? "",
    serialNumber: asset.serialNumber ?? "",
    installedAt: asset.installedAt ?? "",
    purchaseCost: asset.purchaseCost,
    photoNote: asset.photoNote,
  };
}

function newAssetDraft(mode: PlanMode): AssetDraft {
  const kind = mode.id === "plumbing"
    ? "plumbing_fixture"
    : mode.id === "lighting"
      ? "light"
      : mode.id === "windows"
        ? "window"
        : mode.id === "radiators"
          ? "radiator"
          : mode.id === "warmFloor"
            ? "warm_floor"
            : mode.id === "ventilation"
              ? "ventilation"
              : mode.id === "furniture"
                ? "furniture"
                : "socket";
  return {
    code: "",
    name: "",
    roomId: "living",
    category: categoryFromPlan(mode, kind),
    kind,
    status: "ok",
    x: 50,
    y: 50,
    warrantyUntil: "",
    master: "",
    manufacturer: "",
    model: "",
    serialNumber: "",
    installedAt: "",
    purchaseCost: undefined,
    photoNote: "",
  };
}

function buildCatalogAssets(existingAssets: Asset[]) {
  const seen = new Set(existingAssets.map((asset) => asset.id));
  return planModes.flatMap((mode) =>
    planHotspots[mode.id]
      .filter((hotspot) => !hotspot.assetId || !seen.has(hotspot.assetId))
      .map((hotspot) => catalogAssetFromHotspot(mode, hotspot)),
  );
}

function withCatalogAssets(state: AppState, includeCatalogFallback = true): AppState {
  const deletedAssetIds = state.deletedAssetIds ?? [];
  const categories = categoryOptions(state.categories ?? initialState.categories);
  const deletedIds = new Set(deletedAssetIds);
  const activeAssets = state.assets.filter((asset) => !deletedIds.has(asset.id));
  const catalogAssets = includeCatalogFallback
    ? buildCatalogAssets(activeAssets).filter((asset) => !deletedIds.has(asset.id))
    : [];
  const knownIds = new Set(activeAssets.map((asset) => asset.id));
  return {
    ...state,
    config: state.config ?? initialState.config,
    categories,
    assets: [
      ...activeAssets,
      ...catalogAssets.filter((asset) => !knownIds.has(asset.id)),
    ],
    deletedAssetIds,
    media: state.media ?? initialState.media,
    inspections: state.inspections ?? initialState.inspections,
    inspectionResults: state.inspectionResults ?? initialState.inspectionResults,
    utilityBills: state.utilityBills ?? initialState.utilityBills,
    utilityMeters: state.utilityMeters ?? initialState.utilityMeters,
    utilityReadings: state.utilityReadings ?? initialState.utilityReadings,
    cleanings: (state.cleanings ?? initialState.cleanings).map((cleaning) => ({
      ...cleaning,
      photos: cleaning.photos ?? [],
      recurrence: cleaning.recurrence ?? "none",
      requirePhotoBefore: cleaning.requirePhotoBefore ?? false,
      requirePhotoAfter: cleaning.requirePhotoAfter ?? false,
      zoneResults: cleaning.zoneResults ?? [],
      ownerFeedback: cleaning.ownerFeedback ?? undefined,
    })),
    contractorAccess: {
      ...state.contractorAccess,
      inspectionId: state.contractorAccess.inspectionId ?? initialState.contractorAccess.inspectionId,
      contractorName:
        state.contractorAccess.contractorName ??
        initialState.contractorAccess.contractorName,
      contractorPhone:
        state.contractorAccess.contractorPhone ??
        initialState.contractorAccess.contractorPhone,
      assetInstructions:
        state.contractorAccess.assetInstructions ??
        initialState.contractorAccess.assetInstructions,
    },
  };
}

const defaultState = withCatalogAssets(initialState);

export default function Home() {
  const [state, setState] = useState<AppState>(() => {
    return defaultState;
  });
  const [authStatus, setAuthStatus] = useState<"checking" | "ready" | "signed_out">("checking");
  const [view, setView] = useState<View>("dashboard");
  const [selectedAssetId, setSelectedAssetId] = useState("r07");
  const [selectedInspectionId, setSelectedInspectionId] = useState(
    defaultState.inspections[0]?.id ?? "",
  );
  const [assetReturnView, setAssetReturnView] = useState<View>("dashboard");
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");
  const [activePlanMode, setActivePlanMode] = useState<PlanModeId>("sockets");
  const [activePlanCategory, setActivePlanCategory] = useState<Category>("electric");
  const [contractorWorkflow, setContractorWorkflow] = useState<Workflow>("inspection");
  const [taskTab, setTaskTab] = useState<"master-work" | "cleaning" | "inspection">("master-work");
  const [planFilter, setPlanFilter] = useState<AssetFilter>("all");
  const [newEventText, setNewEventText] = useState("");
  const [inspectionIndex, setInspectionIndex] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [planEditMode, setPlanEditMode] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [assetDraft, setAssetDraft] = useState<AssetDraft>(() =>
    assetDraftFromAsset(defaultState.assets[0]),
  );
  const [assetSaving, setAssetSaving] = useState(false);
  const [planEditSnapshot, setPlanEditSnapshot] = useState<AppState | null>(null);
  const [dirtyPlanAssetIds, setDirtyPlanAssetIds] = useState<string[]>([]);
  const [deletedPlanAssetIds, setDeletedPlanAssetIds] = useState<string[]>([]);

  function toggleSidebar() {
    setSidebarCollapsed((current) => !current);
  }

  useEffect(() => {
    let mounted = true;
    let unsubscribeAuth: (() => void) | undefined;

    async function syncAuth() {
      let supabase = createSupabaseBrowserClient();

      if (!supabase) {
        try {
          const response = await fetch("/api/public-config", { cache: "no-store" });
          const config = await response.json() as {
            supabaseUrl?: string;
            supabaseAnonKey?: string;
          };

          if (config.supabaseUrl && config.supabaseAnonKey) {
            supabase = createSupabaseClientFromConfig(
              config.supabaseUrl,
              config.supabaseAnonKey,
            );
          }
        } catch {
          supabase = null;
        }
      }

      if (!supabase) {
        if (mounted) setAuthStatus("ready");
        return;
      }

      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setAuthStatus(data.user ? "ready" : "signed_out");

      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        setAuthStatus(session?.user ? "ready" : "signed_out");
      });
      unsubscribeAuth = () => listener.subscription.unsubscribe();
    }

    void syncAuth();

    return () => {
      mounted = false;
      unsubscribeAuth?.();
    };
  }, []);

  useEffect(() => {
    if (authStatus !== "ready") return;

    let cancelled = false;

    async function loadRemoteData() {
      try {
        const response = await fetch("/api/app-data", { cache: "no-store" });
        const remoteState = (await response.json()) as Partial<AppState> & { error?: string };

        if (!response.ok || cancelled || remoteState.error) return;

        setState((current) =>
          withCatalogAssets({
            ...current,
            config: remoteState.config ?? current.config,
            plan: remoteState.plan !== undefined ? remoteState.plan : current.plan,
            assets: remoteState.assets ?? current.assets,
            events: remoteState.events ?? current.events,
            media: remoteState.media ?? current.media,
            inspections: remoteState.inspections ?? current.inspections,
            inspectionResults: remoteState.inspectionResults ?? current.inspectionResults,
            utilityBills: remoteState.utilityBills ?? current.utilityBills,
            utilityMeters: remoteState.utilityMeters ?? current.utilityMeters,
            utilityReadings: remoteState.utilityReadings ?? current.utilityReadings,
            cleanings: remoteState.cleanings ?? current.cleanings,
            categories: remoteState.categories ?? current.categories,
            deletedAssetIds: remoteState.deletedAssetIds ?? current.deletedAssetIds,
            contractorAccess: {
              ...current.contractorAccess,
              inspectionId:
                remoteState.inspections?.[0]?.id ??
                current.contractorAccess.inspectionId,
            },
          }, false),
        );
        if (remoteState.inspections?.[0]?.id) {
          setSelectedInspectionId(remoteState.inspections[0].id);
        }
      } catch {
        // Local demo state remains usable if the production database is unreachable.
      }
    }

    void loadRemoteData();

    return () => {
      cancelled = true;
    };
  }, [authStatus, dataRefreshKey]);

  const selectedAsset =
    state.assets.find((asset) => asset.id === selectedAssetId) ??
    state.assets[0];
  const selectedInspection =
    state.inspections.find((inspection) => inspection.id === selectedInspectionId) ??
    state.inspections[0];
  const inspectionFlows = state.inspections.filter(
    (inspection) => (inspection.workflow ?? "inspection") === "inspection",
  );
  const workOrderFlows = state.inspections.filter(
    (inspection) => inspection.workflow === "work_order",
  );

  const selectedEvents = useMemo(
    () =>
      state.events
        .filter((event) => event.assetId === selectedAsset?.id)
        .slice(),
    [selectedAsset?.id, state.events],
  );

  const activePlan =
    planModes.find((mode) => mode.id === activePlanMode) ?? planModes[0];

  const issueAssets = state.assets.filter((asset) => asset.status !== "ok");
  const dirtyPlanAssetCount =
    new Set([...dirtyPlanAssetIds, ...deletedPlanAssetIds]).size +
    (!editingAssetId && assetDraft.name.trim() ? 1 : 0);
  const currentInspectionAsset = state.assets.length
    ? state.assets[inspectionIndex % state.assets.length]
    : undefined;

  function openAsset(id: string) {
    setSelectedAssetId(id);
    setAssetReturnView(view === "asset" ? assetReturnView : view);
    setView("asset");
    setMobileMenuOpen(false);
  }

  function openReport(id: string) {
    setSelectedInspectionId(id);
    setView("report");
    setMobileMenuOpen(false);
  }

  function createContractorFlowFromAssets(assetIds: string[], workflow: Workflow) {
    if (!assetIds.length) return;
    setContractorWorkflow(workflow);
    setState((current) => ({
      ...current,
      contractorAccess: {
        ...current.contractorAccess,
        scope: contractorScopeFromIds(current.assets, assetIds),
        allowedAssetIds: assetIds,
        assetInstructions: assetIds.reduce<Record<string, string>>((instructions, assetId) => {
          instructions[assetId] = current.contractorAccess.assetInstructions[assetId] ?? "";
          return instructions;
        }, { ...current.contractorAccess.assetInstructions }),
      },
    }));
    setView("contractor");
    setMobileMenuOpen(false);
  }

  function createInspectionFromAssets(assetIds: string[]) {
    createContractorFlowFromAssets(assetIds, "inspection");
  }

  function createWorkOrderFromAssets(assetIds: string[]) {
    createContractorFlowFromAssets(assetIds, "work_order");
  }

  function createWorkOrderFromAsset(assetId: string) {
    createWorkOrderFromAssets([assetId]);
  }

  function createAssetFromAssets() {
    const category = categoryOptions(state.categories).find((item) => item.id === assetFilter);
    startNewAsset(
      category?.planModeId ?? planModeFromAssetFilter(assetFilter),
      category?.id,
    );
    setView("plan");
    setMobileMenuOpen(false);
  }

  function editAssetFromCatalog(assetId: string) {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) return;

    setActivePlanCategory(asset.category);
    setActivePlanMode(planModeForCategory(asset.category, state.categories));
    selectAssetForEditing(asset);
    setView("plan");
    setMobileMenuOpen(false);
  }

  function navigate(viewName: View) {
    setView(viewName);
    setMobileMenuOpen(false);
  }

  function rememberDirtyAsset(assetId: string) {
    setDirtyPlanAssetIds((current) =>
      current.includes(assetId) ? current : [...current, assetId],
    );
  }

  function enterPlanEditMode() {
    if (!planEditMode) {
      setPlanEditSnapshot(structuredClone(state));
      setDirtyPlanAssetIds([]);
      setDeletedPlanAssetIds([]);
    }
    setPlanEditMode(true);
  }

  function cancelPlanChanges() {
    const restoredState = planEditSnapshot ?? state;
    setState(restoredState);
    setPlanEditMode(false);
    setPlanEditSnapshot(null);
    setDirtyPlanAssetIds([]);
    setDeletedPlanAssetIds([]);
    setEditingAssetId(null);
    setAssetDraft(assetDraftFromAsset(restoredState.assets[0] ?? defaultState.assets[0]));
  }

  function selectAssetForEditing(asset: Asset) {
    enterPlanEditMode();
    setPlanEditMode(true);
    setEditingAssetId(asset.id);
    setAssetDraft(assetDraftFromAsset(asset));
  }

  function startNewAsset(modeId: PlanModeId = activePlanMode, categoryId?: Category) {
    const mode = planModes.find((item) => item.id === modeId) ?? activePlan;
    const category = defaultCategoryForNewAsset(state.categories, categoryId);
    const draft = category
      ? {
          ...newAssetDraft(mode),
          category: category.id,
        }
      : newAssetDraft(mode);
    const assetId = tempAssetId();
    const draftAsset: Asset = {
      id: assetId,
      code: draft.code,
      name: draft.name,
      roomId: draft.roomId,
      category: draft.category,
      kind: draft.kind,
      status: draft.status,
      x: draft.x,
      y: draft.y,
      lastChecked: "не проверялось",
      warrantyUntil: draft.warrantyUntil,
      master: draft.master,
      manufacturer: draft.manufacturer,
      model: draft.model,
      serialNumber: draft.serialNumber,
      installedAt: draft.installedAt,
      purchaseCost: draft.purchaseCost,
      photoNote: draft.photoNote,
    };
    setActivePlanMode(mode.id);
    setActivePlanCategory(draft.category);
    enterPlanEditMode();
    setState((current) => ({
      ...current,
      assets: [...current.assets, draftAsset],
    }));
    setDirtyPlanAssetIds((current) =>
      current.includes(assetId) ? current : [...current, assetId],
    );
    setEditingAssetId(assetId);
    setSelectedAssetId(assetId);
    setAssetDraft(draft);
  }

  function updateAssetDraft(
    updater: AssetDraft | ((current: AssetDraft) => AssetDraft),
  ) {
    const nextDraft =
      typeof updater === "function" ? updater(assetDraft) : updater;

    setAssetDraft(nextDraft);

    if (!editingAssetId) return;

    rememberDirtyAsset(editingAssetId);
    setState((current) => ({
      ...current,
      assets: current.assets.map((asset) =>
        asset.id === editingAssetId
          ? {
              ...asset,
              code: nextDraft.code,
              name: nextDraft.name,
              roomId: nextDraft.roomId,
              category: nextDraft.category,
              kind: nextDraft.kind,
              status: nextDraft.status,
              x: nextDraft.x,
              y: nextDraft.y,
              warrantyUntil: nextDraft.warrantyUntil,
              master: nextDraft.master,
              manufacturer: nextDraft.manufacturer,
              model: nextDraft.model,
              serialNumber: nextDraft.serialNumber,
              installedAt: nextDraft.installedAt,
              purchaseCost: nextDraft.purchaseCost,
              photoNote: nextDraft.photoNote,
            }
          : asset,
      ),
    }));
  }

  function moveAssetOnPlan(assetId: string, x: number, y: number) {
    rememberDirtyAsset(assetId);
    setState((current) => ({
      ...current,
      assets: current.assets.map((asset) =>
        asset.id === assetId ? { ...asset, x, y } : asset,
      ),
    }));
    if (editingAssetId === assetId) {
      setAssetDraft((current) => ({ ...current, x, y }));
    }
  }

  async function saveAssetDraft() {
    const normalizedDraft: AssetDraft = {
      ...assetDraft,
      code: assetDraft.code.trim(),
      name: assetDraft.name.trim(),
      warrantyUntil: assetDraft.warrantyUntil?.trim(),
      master: assetDraft.master?.trim(),
      manufacturer: assetDraft.manufacturer?.trim(),
      model: assetDraft.model?.trim(),
      serialNumber: assetDraft.serialNumber?.trim(),
      installedAt: assetDraft.installedAt?.trim(),
      photoNote: assetDraft.photoNote.trim(),
    };

    if (!normalizedDraft.name) {
      window.alert("Укажите название узла.");
      return;
    }

    const duplicate = normalizedDraft.code
      ? state.assets.find(
          (asset) =>
            asset.id !== editingAssetId &&
            asset.code.trim().toLowerCase() === normalizedDraft.code.toLowerCase(),
        )
      : undefined;
    if (duplicate) {
      window.alert(`Код ${normalizedDraft.code} уже занят узлом ${duplicate.name}.`);
      return;
    }

    setAssetSaving(true);
    const isNew = !editingAssetId || isTempAssetId(editingAssetId);

    try {
      const response = await fetch(isNew ? "/api/assets" : `/api/assets/${editingAssetId}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedDraft),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        asset?: Asset;
        error?: string;
      };

      if (!response.ok || !payload.asset) {
        window.alert(payload.error ?? "Не удалось сохранить узел.");
        return;
      }

      const savedAsset = payload.asset;
      setState((current) => ({
        ...current,
        assets: isNew
          ? current.assets.map((asset) => (asset.id === editingAssetId ? savedAsset : asset))
          : current.assets.map((asset) => (asset.id === savedAsset.id ? savedAsset : asset)),
        deletedAssetIds: current.deletedAssetIds?.filter((id) => id !== savedAsset.id),
      }));
      setDirtyPlanAssetIds((current) =>
        current.filter((id) => id !== savedAsset.id && id !== editingAssetId),
      );
      setEditingAssetId(savedAsset.id);
      setSelectedAssetId(savedAsset.id);
      setAssetDraft(assetDraftFromAsset(savedAsset));
    } finally {
      setAssetSaving(false);
    }
  }

  async function deleteEditingAsset() {
    if (!editingAssetId) return;
    const asset = state.assets.find((item) => item.id === editingAssetId);
    if (!asset) return;

    const confirmed = window.confirm(
      `Удалить ${asset.code} · ${asset.name} с плана? История и фото останутся в базе.`,
    );
    if (!confirmed) return;

    if (isTempAssetId(editingAssetId)) {
      setState((current) => ({
        ...current,
        assets: current.assets.filter((item) => item.id !== editingAssetId),
      }));
      setDirtyPlanAssetIds((current) => current.filter((id) => id !== editingAssetId));
      setDeletedPlanAssetIds((current) => current.filter((id) => id !== editingAssetId));
      setEditingAssetId(null);
      setAssetDraft(newAssetDraft(activePlan));
      return;
    }

    setDeletedPlanAssetIds((current) =>
      current.includes(editingAssetId) ? current : [...current, editingAssetId],
    );
    setDirtyPlanAssetIds((current) => current.filter((id) => id !== editingAssetId));
    setState((current) => ({
      ...current,
      assets: current.assets.filter((item) => item.id !== editingAssetId),
      deletedAssetIds: Array.from(new Set([...(current.deletedAssetIds ?? []), editingAssetId])),
    }));
    setEditingAssetId(null);
    setAssetDraft(newAssetDraft(activePlan));
  }

  async function savePlanChanges() {
    const changedIds = Array.from(new Set(dirtyPlanAssetIds));
    const deleteIds = Array.from(new Set(deletedPlanAssetIds)).filter((id) => !isTempAssetId(id));
    const newDraft: AssetDraft = {
      ...assetDraft,
      code: assetDraft.code.trim(),
      name: assetDraft.name.trim(),
      warrantyUntil: assetDraft.warrantyUntil?.trim(),
      master: assetDraft.master?.trim(),
      manufacturer: assetDraft.manufacturer?.trim(),
      model: assetDraft.model?.trim(),
      serialNumber: assetDraft.serialNumber?.trim(),
      installedAt: assetDraft.installedAt?.trim(),
      photoNote: assetDraft.photoNote.trim(),
    };
    const shouldCreateDraft = !editingAssetId && Boolean(newDraft.name);

    if (!changedIds.length && !deleteIds.length && !shouldCreateDraft) {
      setPlanEditMode(false);
      setPlanEditSnapshot(null);
      setDirtyPlanAssetIds([]);
      setDeletedPlanAssetIds([]);
      return;
    }

    const duplicateCodes = new Set<string>();
    const seenCodes = new Set<string>();
    const assetsToValidate = shouldCreateDraft
      ? [
          ...state.assets,
          {
            ...defaultState.assets[0],
            id: "__new_asset_draft__",
            code: newDraft.code,
          },
        ]
      : state.assets;
    for (const asset of assetsToValidate) {
      const code = asset.code.trim().toLowerCase();
      if (!code) continue;
      if (seenCodes.has(code)) duplicateCodes.add(asset.code);
      seenCodes.add(code);
    }
    if (duplicateCodes.size) {
      window.alert(`Повторяется код узла: ${Array.from(duplicateCodes).join(", ")}.`);
      return;
    }

    setAssetSaving(true);
    try {
      let createdAsset: Asset | null = null;
      if (shouldCreateDraft) {
        const response = await fetch("/api/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newDraft),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          asset?: Asset;
          error?: string;
        };
        if (!response.ok || !payload.asset) {
          window.alert(payload.error ?? "Не удалось сохранить новый узел.");
          return;
        }
        createdAsset = payload.asset;
      }

      for (const assetId of deleteIds) {
        const response = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          window.alert(payload.error ?? "Не удалось удалить узел.");
          return;
        }
      }

      for (const assetId of changedIds) {
        if (deleteIds.includes(assetId)) continue;
        const asset = state.assets.find((item) => item.id === assetId);
        if (!asset) continue;
        const normalizedAssetDraft = assetDraftFromAsset({
          ...asset,
          code: asset.code.trim(),
          name: asset.name.trim(),
          photoNote: asset.photoNote.trim(),
        });

        if (!normalizedAssetDraft.name) {
          window.alert("Укажите название узла.");
          return;
        }

        if (isTempAssetId(asset.id)) {
          const response = await fetch("/api/assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(normalizedAssetDraft),
          });
          const payload = (await response.json().catch(() => ({}))) as {
            asset?: Asset;
            error?: string;
          };
          if (!response.ok || !payload.asset) {
            window.alert(payload.error ?? `Не удалось создать ${asset.code}.`);
            return;
          }

          createdAsset = payload.asset;
          const savedAsset = payload.asset;
          setState((current) => ({
            ...current,
            assets: current.assets.map((item) =>
              item.id === asset.id ? savedAsset : item,
            ),
            deletedAssetIds: current.deletedAssetIds?.filter((id) => id !== savedAsset.id),
          }));
          continue;
        }

        const response = await fetch(`/api/assets/${asset.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalizedAssetDraft),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          window.alert(payload.error ?? `Не удалось сохранить ${asset.code}.`);
          return;
        }
      }

      if (createdAsset) {
        setState((current) => ({
          ...current,
          assets: current.assets.some((asset) => asset.id === createdAsset.id)
            ? current.assets
            : [...current.assets, createdAsset],
          deletedAssetIds: current.deletedAssetIds?.filter((id) => id !== createdAsset.id),
        }));
        setEditingAssetId(createdAsset.id);
        setSelectedAssetId(createdAsset.id);
        setAssetDraft(assetDraftFromAsset(createdAsset));
      }
      setPlanEditMode(false);
      setPlanEditSnapshot(null);
      setDirtyPlanAssetIds([]);
      setDeletedPlanAssetIds([]);
    } finally {
      setAssetSaving(false);
    }
  }

  async function addEvent(
    assetId: string,
    patch?: Partial<AssetEvent>,
    files: PromptInputMessage["files"] = [],
  ) {
    const event: AssetEvent = {
      id: eventId(),
      assetId,
      type: patch?.type ?? "comment",
      date: todayLabel(),
      title: patch?.title ?? eventLabels[patch?.type ?? "comment"],
      body: patch?.body ?? (newEventText.trim() || "Добавлен комментарий."),
      cost: patch?.cost,
      master: patch?.master,
      statusAfter: patch?.statusAfter,
      photo: patch?.photo,
    };

    if (files.length) {
      try {
        const formData = new FormData();
        formData.append("eventId", event.id);
        formData.append("type", event.type);
        formData.append("title", event.title);
        formData.append("body", event.body);

        for (const file of files) {
          if (!file.url) continue;
          const response = await fetch(file.url);
          const blob = await response.blob();
          formData.append(
            "files",
            new File([blob], file.filename ?? "photo.jpg", {
              type: file.mediaType ?? blob.type ?? "image/jpeg",
            }),
          );
        }

        const response = await fetch(`/api/assets/${assetId}/events`, {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          event?: AssetEvent;
          media?: AssetMedia[];
        };

        if (response.ok && payload.event) {
          setState((current) => ({
            ...current,
            events: [payload.event!, ...current.events],
            media: [...(payload.media ?? []), ...current.media],
          }));
          setNewEventText("");
          return;
        }
      } catch {
        // Keep a local event if upload is unavailable, so the note is not lost from the current screen.
      }
    }

    setState((current) => ({
      ...current,
      events: [event, ...current.events],
    }));
    setNewEventText("");
  }

  async function updateEvent(assetId: string, eventId: string, patch: Pick<AssetEvent, "title" | "body">) {
    const nextTitle = patch.title.trim();
    const nextBody = patch.body.trim();
    if (!nextTitle || !nextBody) {
      window.alert("У события должны быть название и комментарий.");
      return false;
    }

    try {
      const response = await fetch(`/api/assets/${assetId}/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle, body: nextBody }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        event?: AssetEvent;
        error?: string;
      };

      if (!response.ok || !payload.event) {
        window.alert(payload.error ?? "Не удалось обновить комментарий.");
        return false;
      }

      setState((current) => ({
        ...current,
        events: current.events.map((event) =>
          event.id === eventId ? { ...event, ...payload.event } : event,
        ),
      }));
      return true;
    } catch {
      window.alert("Не удалось обновить комментарий.");
      return false;
    }
  }

  async function deleteEvent(assetId: string, eventId: string) {
    const confirmed = window.confirm("Удалить эту запись истории и прикрепленные к ней файлы?");
    if (!confirmed) return false;

    try {
      const response = await fetch(`/api/assets/${assetId}/events/${eventId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        deletedEventId?: string;
        deletedMediaIds?: string[];
        error?: string;
      };

      if (!response.ok) {
        window.alert(payload.error ?? "Не удалось удалить комментарий.");
        return false;
      }

      const deletedMediaIds = new Set(payload.deletedMediaIds ?? []);
      setState((current) => ({
        ...current,
        events: current.events.filter((event) => event.id !== eventId),
        media: current.media.filter((item) => item.eventId !== eventId && !deletedMediaIds.has(item.id)),
      }));
      return true;
    } catch {
      window.alert("Не удалось удалить комментарий.");
      return false;
    }
  }

  function setAssetStatus(assetId: string, status: Status, body?: string) {
    setState((current) => ({
      ...current,
      assets: current.assets.map((asset) =>
        asset.id === assetId ? { ...asset, status, lastChecked: todayLabel() } : asset,
      ),
      events: [
        {
          id: eventId(),
          assetId,
          type: "status",
          date: todayLabel(),
          title: `Статус: ${statusLabels[status]}`,
          body: body ?? `Узел переведен в статус «${statusLabels[status]}».`,
          statusAfter: status,
        },
        ...current.events,
      ],
    }));
  }

  async function updateAssetsBulk(
    assetIds: string[],
    patch: Partial<Pick<Asset, "category" | "status">>,
  ) {
    if (!assetIds.length) return false;

    const knownIds = new Set(assetIds);
    const date = todayLabel();
    const statusEvent =
      patch.status !== undefined
        ? assetIds.map((assetId) => ({
            id: eventId(),
            assetId,
            type: "status" as EventType,
            date,
            title: `Статус: ${statusLabels[patch.status!]}`,
            body: `Массовое действие: узел переведен в статус «${statusLabels[patch.status!]}».`,
            statusAfter: patch.status,
          }))
        : [];

    setState((current) => ({
      ...current,
      assets: current.assets.map((asset) =>
        knownIds.has(asset.id)
          ? {
              ...asset,
              ...patch,
              lastChecked: patch.status ? date : asset.lastChecked,
            }
          : asset,
      ),
      events: [...statusEvent, ...current.events],
    }));

    try {
      const responses = await Promise.all(
        assetIds.map((assetId) =>
          fetch(`/api/assets/${assetId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          }),
        ),
      );

      const failed = responses.filter((response) => !response.ok);
      if (failed.length) {
        window.alert(`Не удалось сохранить ${failed.length} из ${responses.length} изменений.`);
        return false;
      }

      return true;
    } catch {
      window.alert("Не удалось сохранить массовое действие.");
      return false;
    }
  }

  function completeInspection(status: Status) {
    if (!currentInspectionAsset) return;
    setAssetStatus(
      currentInspectionAsset.id,
      status,
      `Результат обхода: ${statusLabels[status].toLowerCase()}.`,
    );
    setInspectionIndex((current) => (current + 1) % state.assets.length);
  }

  async function createContractorInspection(workflow: Workflow = "inspection") {
    const allowed = state.contractorAccess.allowedAssetIds;

    if (!state.contractorAccess.contractorName.trim()) {
      window.alert("Укажите имя мастера.");
      return;
    }

    if (!allowed.length) {
      window.alert("Выберите хотя бы один узел или категорию плана.");
      return;
    }

    const response = await fetch("/api/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflow,
        scope: contractorScopeFromIds(state.assets, allowed),
        allowedAssetIds: allowed,
        assetInstructions: workflow === "work_order" ? state.contractorAccess.assetInstructions : {},
        contractor: state.contractorAccess.contractorName,
        contractorPhone: state.contractorAccess.contractorPhone,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      inspection?: Inspection;
      error?: string;
    };

    if (!response.ok || !payload.inspection) {
      window.alert(payload.error ?? "Не удалось создать ссылку мастеру.");
      return;
    }

    const inspection = payload.inspection;

    setState((current) => ({
      ...current,
      inspections: [inspection, ...current.inspections],
      contractorAccess: {
        ...current.contractorAccess,
        inspectionId: inspection.id,
        allowedAssetIds: inspection.allowedAssetIds,
      },
    }));
    setSelectedInspectionId(inspection.id);
    setTaskTab(workflow === "work_order" ? "master-work" : "inspection");
    setView("work_orders");
  }

  async function updateInspection(inspectionId: string, patch: Partial<Inspection>) {
    const response = await fetch(`/api/inspections/${inspectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contractor: patch.contractor,
        contractorPhone: patch.contractorPhone,
        scope: patch.scope,
        status: patch.status,
        allowedAssetIds: patch.allowedAssetIds,
        assetInstructions: patch.assetInstructions,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      inspection?: Inspection;
      error?: string;
    };

    if (!response.ok || !payload.inspection) {
      window.alert(payload.error ?? "Не удалось обновить обход.");
      return false;
    }

    const updatedInspection = payload.inspection;

    setState((current) => ({
      ...current,
      inspections: current.inspections.map((inspection) =>
        inspection.id === inspectionId ? updatedInspection : inspection,
      ),
      contractorAccess:
        current.contractorAccess.inspectionId === inspectionId
          ? {
              ...current.contractorAccess,
              contractorName: updatedInspection.contractor,
              contractorPhone: updatedInspection.contractorPhone ?? "",
              scope: updatedInspection.scope,
              allowedAssetIds: updatedInspection.allowedAssetIds,
            }
          : current.contractorAccess,
    }));
    setSelectedInspectionId(inspectionId);

    if (patch.status === "accepted") {
      try {
        const refreshResponse = await fetch("/api/app-data", { cache: "no-store" });
        const remoteState = (await refreshResponse.json().catch(() => ({}))) as Partial<AppState> & {
          error?: string;
        };
        if (refreshResponse.ok && !remoteState.error) {
          setState((current) =>
            withCatalogAssets(
              {
                ...current,
                assets: remoteState.assets ?? current.assets,
                events: remoteState.events ?? current.events,
                media: remoteState.media ?? current.media,
                inspections: remoteState.inspections ?? current.inspections,
                inspectionResults: remoteState.inspectionResults ?? current.inspectionResults,
                deletedAssetIds: remoteState.deletedAssetIds ?? current.deletedAssetIds,
              },
              false,
            ),
          );
        }
      } catch {
        // The accepted status is already visible; a later refresh will load the updated node history.
      }
    }
    return true;
  }

  async function deleteInspection(inspectionId: string) {
    const inspection = state.inspections.find((item) => item.id === inspectionId);
    if (!inspection) return;

    const confirmed = window.confirm(
      `Удалить ${inspection.number}? Отчет исчезнет из списка, но уже созданные события в истории узлов останутся.`,
    );
    if (!confirmed) return;

    const response = await fetch(`/api/inspections/${inspectionId}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      window.alert(payload.error ?? "Не удалось удалить обход.");
      return;
    }

    setState((current) => {
      const nextInspections = current.inspections.filter((item) => item.id !== inspectionId);
      return {
        ...current,
        inspections: nextInspections,
        inspectionResults: current.inspectionResults.filter(
          (result) => result.inspectionId !== inspectionId,
        ),
        events: current.events.map((event) =>
          event.inspectionId === inspectionId
            ? { ...event, inspectionId: undefined }
            : event,
        ),
        contractorAccess:
          current.contractorAccess.inspectionId === inspectionId
            ? {
                ...current.contractorAccess,
                inspectionId: nextInspections[0]?.id ?? "",
              }
            : current.contractorAccess,
      };
    });

    if (selectedInspectionId === inspectionId) {
      setSelectedInspectionId(state.inspections.find((item) => item.id !== inspectionId)?.id ?? "");
      setTaskTab("inspection");
      setView("work_orders");
    }
  }

  async function createCategory(label: string) {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
      window.alert("Укажите название категории.");
      return false;
    }

    const duplicate = categoryOptions(state.categories).find(
      (category) => category.label.trim().toLowerCase() === normalizedLabel.toLowerCase(),
    );
    if (duplicate) {
      window.alert(`Категория «${normalizedLabel}» уже есть.`);
      return false;
    }

    const category: AssetCategory = {
      id: customCategoryId(),
      label: normalizedLabel,
      color: "#0070f3",
      prefix: `${normalizedLabel.slice(0, 2).toUpperCase()}-`,
      planModeId: "sockets",
    };

    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(category),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      category?: AssetCategory;
      error?: string;
    };

    if (!response.ok || !payload.category) {
      window.alert(payload.error ?? "Не удалось создать категорию.");
      return false;
    }

    setState((current) => ({
      ...current,
      categories: categoryOptions([...current.categories, payload.category!]),
    }));
    return true;
  }

  async function renameCategory(categoryId: Category, label: string) {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
      window.alert("Название категории не может быть пустым.");
      return false;
    }

    const response = await fetch(`/api/categories/${categoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: normalizedLabel }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      category?: AssetCategory;
      error?: string;
    };

    if (!response.ok || !payload.category) {
      window.alert(payload.error ?? "Не удалось переименовать категорию.");
      return false;
    }

    setState((current) => ({
      ...current,
      categories: categoryOptions(
        current.categories.map((category) =>
          category.id === categoryId ? payload.category! : category,
        ),
      ),
    }));
    return true;
  }

  async function deleteCategory(categoryId: Category) {
    const category = categoryOptions(state.categories).find((item) => item.id === categoryId);
    if (!category) return false;

    const usedAssets = state.assets.filter((asset) => asset.category === categoryId);
    if (usedAssets.length) {
      window.alert(
        `Нельзя удалить «${category.label}»: в категории ${usedAssets.length} узлов. Сначала перенесите их в другую категорию.`,
      );
      return false;
    }

    const response = await fetch(`/api/categories/${categoryId}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      window.alert(payload.error ?? "Не удалось удалить категорию.");
      return false;
    }

    setState((current) => ({
      ...current,
      categories: categoryOptions(current.categories.filter((item) => item.id !== categoryId)),
    }));
    if (assetFilter === categoryId) setAssetFilter("all");
    return true;
  }

  function submitContractorReport(conclusion?: string) {
    const activeInspection =
      state.inspections.find((inspection) => inspection.id === state.contractorAccess.inspectionId) ??
      state.inspections[0];
    if (!activeInspection) return;

    const allowed = activeInspection.allowedAssetIds;
    const results: InspectionResult[] = allowed.map((assetId, index) => {
      const asset = state.assets.find((item) => item.id === assetId);
      const needsRepair = assetId === "w08" || index === 0;
      return {
        id: resultId(),
        inspectionId: activeInspection.id,
        assetId,
        statusAfter: needsRepair ? "needs_master" : "ok",
        comment: needsRepair
          ? `${asset?.name ?? "Узел"} требует внимания. Мастер оставил комментарий и фото.`
          : `${asset?.name ?? "Узел"} проверен, замечаний нет.`,
        date: todayLabel(),
        author: activeInspection.contractor,
        cost: needsRepair ? 2000 : undefined,
        photoCount: needsRepair ? 3 : 1,
      };
    });

    const resultEvents: AssetEvent[] = results.map((result) => ({
      id: eventId(),
      assetId: result.assetId,
      type: "report",
      date: result.date,
      title: `${activeInspection.number} · результат мастера`,
      body: result.comment,
      cost: result.cost,
      master: result.author,
      statusAfter: result.statusAfter,
      inspectionId: result.inspectionId,
      photo: result.photoCount
        ? { label: "фото", note: `${result.photoCount} фото из обхода` }
        : undefined,
    }));

    setState((current) => ({
      ...current,
      assets: current.assets.map((asset) => {
        const result = results.find((item) => item.assetId === asset.id);
        return result
          ? { ...asset, status: result.statusAfter, lastChecked: todayLabel(), master: activeInspection.contractor }
          : asset;
      }),
      inspections: current.inspections.map((inspection) =>
        inspection.id === activeInspection.id
          ? {
              ...inspection,
              status: "completed",
              completedAt: todayLabel(),
              summary: `Мастер проверил ${results.length} узлов. Замечаний: ${
                results.filter((result) => result.statusAfter !== "ok").length
              }.`,
              conclusion: conclusion?.trim()
                ? conclusion.trim()
                : "Общих замечаний нет. Все комментарии привязаны к конкретным узлам.",
              resultIds: results.map((result) => result.id),
            }
          : inspection,
      ),
      inspectionResults: [
        ...results,
        ...current.inspectionResults.filter((result) => result.inspectionId !== activeInspection.id),
      ],
      events: [...resultEvents, ...current.events],
    }));
    setSelectedInspectionId(activeInspection.id);
    setView("report");
  }

  if (authStatus === "checking") {
    return <AppLoading />;
  }

  if (authStatus === "signed_out") {
    return <LockedApp />;
  }

  return (
    <TooltipProvider>
      <main className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <header className="mobile-header">
        <button
          aria-label="Открыть дашборд"
          className="mobile-brand"
          onClick={() => navigate("dashboard")}
          type="button"
        >
          <BrandMark objectName={state.config.objectName} />
        </button>
        <button
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
          className="mobile-menu-button grid h-10 w-10 place-items-center border-0 bg-transparent text-foreground"
          onClick={() => setMobileMenuOpen((value) => !value)}
          type="button"
        >
          {mobileMenuOpen ? <X size={30} strokeWidth={1.8} /> : <MenuGlyph />}
        </button>
      </header>
      {mobileMenuOpen && (
        <div className="mobile-menu">
          <ApartmentSwitcher compact />
          <nav className="nav-list" aria-label="Мобильная навигация">
            <AppNavigation activeView={view} navigate={navigate} />
          </nav>
        </div>
      )}
      <aside className="sidebar">
        <div className="sidebar-heading">
          <button
            aria-label="Открыть дашборд"
            className="brand"
            onClick={() => navigate("dashboard")}
            type="button"
          >
            {sidebarCollapsed ? (
              <Image alt="FixPlan" height={32} src="/favicon.svg" width={32} />
            ) : (
              <BrandMark objectName={state.config.objectName} />
            )}
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}
                onClick={toggleSidebar}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}</TooltipContent>
          </Tooltip>
        </div>
        {!sidebarCollapsed && <ApartmentSwitcher />}
        {!sidebarCollapsed && <SidebarSearch assets={state.assets} openAsset={openAsset} />}
        <nav className="nav-list" aria-label="Главная навигация">
          <AppNavigation activeView={view} compact={sidebarCollapsed} navigate={navigate} />
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewTitle(view, selectedAsset)}</h1>
            {!(["plan", "assets", "utilities"] as View[]).includes(view) && <p>{viewSubtitle(view)}</p>}
          </div>
        </header>

        {view === "dashboard" && (
          <Dashboard
            assets={state.assets}
            bills={state.utilityBills}
            cleanings={state.cleanings}
            events={state.events}
            inspections={inspectionFlows}
            inspectionResults={state.inspectionResults}
            issueAssets={issueAssets}
            media={state.media}
            meters={state.utilityMeters}
            readings={state.utilityReadings}
            workOrders={workOrderFlows}
            openAsset={openAsset}
            openDocuments={() => setView("documents")}
            openLog={() => setView("log")}
            openReport={openReport}
            openTasks={(tab) => {
              setTaskTab(tab);
              setView("work_orders");
            }}
            openUtilities={() => setView("utilities")}
          />
        )}

        {view === "plan" && (
          <PlanView
            allAssets={state.assets}
            activePlanCategory={activePlanCategory}
            activePlanMode={activePlanMode}
            categories={state.categories}
            createCategory={createCategory}
            filter={planFilter}
            plan={state.plan}
            setPlan={(plan) => setState((current) => ({ ...current, plan }))}
            assetDraft={assetDraft}
            assetSaving={assetSaving}
            cancelPlanChanges={cancelPlanChanges}
            deleteEditingAsset={deleteEditingAsset}
            dirtyPlanAssetCount={dirtyPlanAssetCount}
            editingAssetId={editingAssetId}
            editMode={planEditMode}
            enterPlanEditMode={enterPlanEditMode}
            moveAssetOnPlan={moveAssetOnPlan}
            setActivePlanCategory={setActivePlanCategory}
            setFilter={setPlanFilter}
            setActivePlanMode={setActivePlanMode}
            setAssetDraft={updateAssetDraft}
            savePlanChanges={savePlanChanges}
            saveAssetDraft={saveAssetDraft}
            selectAssetForEditing={selectAssetForEditing}
            startNewAsset={startNewAsset}
            openAsset={openAsset}
          />
        )}

        {view === "assets" && (
          <AssetsView
            assets={state.assets}
            filter={assetFilter}
            openAsset={openAsset}
            editAsset={editAssetFromCatalog}
            categories={state.categories}
            createAsset={createAssetFromAssets}
            createCategory={createCategory}
            deleteCategory={deleteCategory}
            renameCategory={renameCategory}
            setFilter={setAssetFilter}
            setAssetStatus={setAssetStatus}
            updateAssetsBulk={updateAssetsBulk}
            createInspectionFromAssets={createInspectionFromAssets}
            createWorkOrderFromAssets={createWorkOrderFromAssets}
          />
        )}

        {view === "asset" && selectedAsset && (
          <AssetDetail
            asset={selectedAsset}
            events={selectedEvents}
            media={state.media}
            newEventText={newEventText}
            setNewEventText={setNewEventText}
            addEvent={addEvent}
            updateEvent={updateEvent}
            deleteEvent={deleteEvent}
            setAssetStatus={setAssetStatus}
            editAsset={() => editAssetFromCatalog(selectedAsset.id)}
            createWorkOrder={() => createWorkOrderFromAsset(selectedAsset.id)}
            returnLabel={assetReturnLabel(assetReturnView)}
            goBack={() => navigate(assetReturnView)}
          />
        )}

        {view === "log" && (
          <ActivityLog
            assets={state.assets}
            bills={state.utilityBills}
            cleanings={state.cleanings}
            deleteEvent={deleteEvent}
            events={state.events}
            inspections={state.inspections}
            media={state.media}
            meters={state.utilityMeters}
            openAsset={openAsset}
            openReport={openReport}
            openSection={(nextView) => setView(nextView)}
            readings={state.utilityReadings}
            updateEvent={updateEvent}
          />
        )}

        {view === "documents" && (
          <DocumentsView
            assets={state.assets}
            deleteEvent={deleteEvent}
            events={state.events}
            media={state.media}
            openAsset={openAsset}
            setMedia={(media) => setState((current) => ({ ...current, media }))}
            updateEvent={updateEvent}
          />
        )}

        {view === "utilities" && (
          <UtilitiesView
            bills={state.utilityBills}
            media={state.media}
            meters={state.utilityMeters}
            readings={state.utilityReadings}
            setBills={(utilityBills) =>
              setState((current) => ({
                ...current,
                utilityBills,
              }))
            }
            setMeters={(utilityMeters) =>
              setState((current) => ({ ...current, utilityMeters }))
            }
            setMedia={(media) => setState((current) => ({ ...current, media }))}
            setReadings={(utilityReadings) =>
              setState((current) => ({ ...current, utilityReadings }))
            }
          />
        )}

        {view === "inspection" && currentInspectionAsset && (
          <InspectionView
            asset={currentInspectionAsset}
            index={inspectionIndex}
            total={state.assets.length}
            completeInspection={completeInspection}
            openAsset={openAsset}
          />
        )}

        {view === "inspection" && !currentInspectionAsset && (
          <Card>
            <CardHeader>
              <CardTitle>В квартире пока нет узлов</CardTitle>
              <CardDescription>
                Сначала добавьте узлы на плане или в разделе «Узлы».
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("assets")} type="button">
                <Plus /> Новый узел
              </Button>
            </CardContent>
          </Card>
        )}

        {view === "inspections" && (
          <InspectionsView
            assets={state.assets}
            deleteInspection={deleteInspection}
            inspections={inspectionFlows}
            results={state.inspectionResults}
            updateInspection={updateInspection}
            openAsset={openAsset}
            openReport={openReport}
            openContractor={() => {
              setContractorWorkflow("inspection");
              setView("contractor");
            }}
            workflow="inspection"
          />
        )}

        {view === "work_orders" && (
          <Tabs
            className="gap-4"
            onValueChange={(value) => setTaskTab(value as typeof taskTab)}
            value={taskTab}
          >
            <TabsList aria-label="Тип задания" className="w-full sm:w-fit">
              <TabsTrigger value="master-work">
                <Check /> Работы мастеров
              </TabsTrigger>
              <TabsTrigger value="cleaning">
                <ClipboardCheck /> Уборка
              </TabsTrigger>
              <TabsTrigger value="inspection">
                <History /> Обходы
              </TabsTrigger>
            </TabsList>
            <TabsContent value="master-work">
              <InspectionsView
                assets={state.assets}
                deleteInspection={deleteInspection}
                inspections={workOrderFlows}
                results={state.inspectionResults}
                updateInspection={updateInspection}
                openAsset={openAsset}
                openReport={openReport}
                openContractor={() => {
                  setContractorWorkflow("work_order");
                  setView("contractor");
                }}
                workflow="work_order"
              />
            </TabsContent>
            <TabsContent value="cleaning">
              <CleaningsView
                cleanings={state.cleanings}
                setCleanings={(cleanings) =>
                  setState((current) => ({ ...current, cleanings }))
                }
              />
            </TabsContent>
            <TabsContent value="inspection">
              <InspectionsView
                assets={state.assets}
                deleteInspection={deleteInspection}
                inspections={inspectionFlows}
                results={state.inspectionResults}
                updateInspection={updateInspection}
                openAsset={openAsset}
                openReport={openReport}
                openContractor={() => {
                  setContractorWorkflow("inspection");
                  setView("contractor");
                }}
                workflow="inspection"
              />
            </TabsContent>
          </Tabs>
        )}

        {view === "contractor" && (
          <ContractorAccessView
            state={state}
            setState={setState}
            mode="setup"
            workflow={contractorWorkflow}
            createContractorInspection={createContractorInspection}
            submitContractorReport={submitContractorReport}
          />
        )}

        {view === "report" && (
          <ContractorReport
            assets={state.assets}
            createWorkOrderFromAssets={createWorkOrderFromAssets}
            events={state.events}
            inspection={selectedInspection}
            media={state.media}
            results={state.inspectionResults}
            openAsset={openAsset}
            openInspections={() => {
              setTaskTab(selectedInspection?.workflow === "work_order" ? "master-work" : "inspection");
              setView("work_orders");
            }}
            updateInspection={updateInspection}
          />
        )}

        {view === "settings" && (
          <SettingsView
            config={state.config}
            setConfig={(config) =>
              setState((current) => ({
                ...current,
                config: { ...current.config, ...config },
              }))
            }
          />
        )}
      </section>
      <WebAssistant
        onMutation={() => setDataRefreshKey((current) => current + 1)}
        selectedAsset={selectedAsset}
        view={view}
      />
      </main>
    </TooltipProvider>
  );
}

type WebAssistantMessage = {
  id: string;
  role: "user" | "assistant";
  channel: "web" | "telegram";
  content: string;
  attachments?: Array<{ filename?: string }>;
  created_at: string;
};

function ComposerAttachments() {
  const attachments = usePromptInputAttachments();
  if (!attachments.files.length) return null;
  return (
    <Attachments className="px-2 pt-2" variant="inline">
      {attachments.files.map((file) => (
        <Attachment data={file} key={file.id} onRemove={() => attachments.remove(file.id)}>
          <AttachmentPreview />
          <AttachmentInfo />
          <AttachmentRemove label="Убрать файл" />
        </Attachment>
      ))}
    </Attachments>
  );
}

function WebAssistant({
  onMutation,
  selectedAsset,
  view,
}: {
  onMutation: () => void;
  selectedAsset?: Asset;
  view: View;
}) {
  const [messages, setMessages] = useState<WebAssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"ready" | "submitted" | "error">("ready");
  const [error, setError] = useState("");
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pendingAction, setPendingAction] = useState<Record<string, unknown> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const screenContext = selectedAsset && view === "asset"
    ? `Открыт узел ${selectedAsset.code} · ${selectedAsset.name}, ${roomName(selectedAsset.roomId)}.`
    : `Открыт раздел «${viewTitle(view, selectedAsset)}».`;

  async function loadMessages() {
    const response = await fetch("/api/assistant", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { messages?: WebAssistantMessage[]; pendingAction?: Record<string, unknown> | null };
    setMessages(payload.messages ?? []);
    setPendingAction(payload.pendingAction ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/assistant", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { messages: [] })
      .then((payload: { messages?: WebAssistantMessage[]; pendingAction?: Record<string, unknown> | null }) => {
        if (!cancelled) {
          setMessages(payload.messages ?? []);
          setPendingAction(payload.pendingAction ?? null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, mobileExpanded]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function send(text: string, file?: PromptInputMessage["files"][number]) {
    const normalizedText = text.trim();
    if (!normalizedText && !file) return;
    const optimisticMessage: WebAssistantMessage = {
      id: `optimistic-${crypto.randomUUID()}`,
      role: "user",
      channel: "web",
      content: normalizedText || file?.filename || "Вложение",
      attachments: file ? [{ filename: file.filename }] : [],
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticMessage]);
    setStatus("submitted");
    setError("");
    setMobileExpanded(true);
    setDraft("");
    const form = new FormData();
    form.set("text", normalizedText);
    form.set("context", screenContext);
    if (file) {
      const blob = await fetch(file.url).then((response) => response.blob());
      form.set("file", new File([blob], file.filename || "attachment", { type: file.mediaType }));
    }
    try {
      const response = await fetch("/api/assistant", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({ error: "Не удалось обработать ответ сервера." })) as { error?: string; pendingAction?: Record<string, unknown> | null };
      if (!response.ok) {
        setError(payload.error ?? "Не удалось отправить сообщение.");
        setStatus("error");
        return;
      }
      setPendingAction(payload.pendingAction ?? null);
      setStatus("ready");
      await loadMessages();
    } catch {
      setError("Не удалось отправить сообщение. Проверьте соединение и попробуйте ещё раз.");
      setStatus("error");
    }
  }

  async function resolvePendingAction(action: "confirm" | "cancel") {
    setStatus("submitted");
    setError("");
    try {
      const response = await fetch("/api/assistant", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({ error: "Не удалось обработать ответ сервера." })) as {
        error?: string;
        pendingAction?: Record<string, unknown> | null;
      };
      if (!response.ok) {
        setError(payload.error ?? "Не удалось выполнить действие.");
        setStatus("error");
        return;
      }
      setPendingAction(payload.pendingAction ?? null);
      setStatus("ready");
      await loadMessages();
      if (action === "confirm") onMutation();
    } catch {
      setError("Не удалось выполнить действие. Проверьте соединение и попробуйте ещё раз.");
      setStatus("error");
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Голосовой ввод не поддерживается этим браузером.");
      setMobileExpanded(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"]
        .find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) return;
        const url = URL.createObjectURL(blob);
        const extension = blob.type.startsWith("audio/mp4") ? "m4a" : blob.type.startsWith("audio/ogg") ? "ogg" : "webm";
        void send("", {
          type: "file",
          filename: `voice-${Date.now()}.${extension}`,
          mediaType: blob.type,
          url,
        }).finally(() => URL.revokeObjectURL(url));
      };
      recorderRef.current = recorder;
      recorder.start();
      setError("");
      setRecording(true);
      setMobileExpanded(true);
    } catch {
      setError("Не удалось получить доступ к микрофону.");
      setMobileExpanded(true);
    }
  }

  const hasPendingCreate = Boolean(pendingAction?.type && String(pendingAction.type).startsWith("create_"));

  return (
    <aside className={`assistant-panel${mobileExpanded ? " mobile-expanded" : ""}`}>
      <div className="assistant-desktop-header">
        <div className="flex items-center gap-2">
          <Bot className="size-4" />
          <strong className="text-sm">FixPlan</strong>
        </div>
        <span className="text-muted-foreground text-xs">Веб и Telegram</span>
      </div>
      <Button className="assistant-mobile-toggle" onClick={() => setMobileExpanded((value) => !value)} type="button" variant="ghost">
        <span className="flex items-center gap-2"><Bot className="size-4" /> FixPlan</span>
        <span className="flex items-center gap-2 text-muted-foreground">{mobileExpanded ? "Свернуть" : "Написать"}{mobileExpanded ? <ChevronDown /> : <ChevronUp />}</span>
      </Button>

      <div className="assistant-panel-body">
        <ScrollArea className="assistant-message-list">
          <div className="grid gap-3 p-3">
            {messages.map((message) => (
              <div className={message.role === "user" ? "assistant-message user" : "assistant-message"} key={message.id}>
                <div className="mb-1 flex items-center justify-between gap-3 text-muted-foreground text-xs">
                  <span>{message.role === "user" ? "Вы" : "FixPlan"}</span>
                  <span>{message.channel === "telegram" ? "Telegram" : "Веб"}</span>
                </div>
                <p className="whitespace-pre-line text-sm">{message.content}</p>
              </div>
            ))}
            {status === "submitted" && (
              <div className="assistant-message flex items-center gap-2 text-muted-foreground">
                <Spinner />
                <span className="text-sm">FixPlan обрабатывает запрос</span>
              </div>
            )}
            {!messages.length && <p className="py-8 text-center text-muted-foreground text-sm">Начните диалог с FixPlan.</p>}
            <div ref={messageEndRef} />
          </div>
        </ScrollArea>

        {error && <div className="border-t px-3 py-2 text-destructive text-sm">{error}</div>}
        {hasPendingCreate && (
          <div className="flex flex-wrap gap-2 border-t bg-background px-3 py-2">
            <Button disabled={status === "submitted"} onClick={() => void resolvePendingAction("confirm")} size="sm" type="button">Создать</Button>
            <Button disabled={status === "submitted"} onClick={() => void resolvePendingAction("cancel")} size="sm" type="button" variant="outline">Удалить черновик</Button>
          </div>
        )}
        <div className="assistant-composer">
          <PromptInput
          accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
          maxFileSize={20 * 1024 * 1024}
          maxFiles={1}
          onError={(nextError) => setError(nextError.message)}
          onSubmit={async (message) => send(message.text || draft, message.files[0])}
        >
          <ComposerAttachments />
          <PromptInputBody>
            <PromptInputTextarea
              aria-label="Сообщение ассистенту"
              onChange={(event) => setDraft(event.currentTarget.value)}
              placeholder="Напишите FixPlan или приложите квитанцию"
              value={draft}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger tooltip="Прикрепить файл" />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments label="Прикрепить файл" />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button aria-label={recording ? "Остановить запись" : "Голосовой ввод"} disabled={status === "submitted"} onClick={() => void toggleRecording()} size="icon-sm" type="button" variant={recording ? "destructive" : "ghost"}>
                    {recording ? <Square /> : <Mic />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{recording ? "Остановить запись" : "Голосовой ввод"}</TooltipContent>
              </Tooltip>
            </PromptInputTools>
            <PromptInputSubmit disabled={status === "submitted"} status={status} />
          </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </aside>
  );
}

function AppLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>FixPlan</CardTitle>
          <CardDescription>Проверяем доступ к квартире.</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

function LockedApp() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Нужен вход</CardTitle>
          <CardDescription>Квартира Шпалерная, 34Б доступна только владельцу.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            onClick={() => {
              window.location.href = "/login";
            }}
            type="button"
          >
            Войти
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function viewTitle(view: View, asset?: Asset) {
  const titles: Record<View, string> = {
    dashboard: "Дашборд квартиры",
    plan: "План квартиры",
    assets: "Список узлов",
    asset: asset ? `${asset.code} · ${asset.name}` : "Узел",
    documents: "Документы",
    utilities: "Коммуналка и счета",
    log: "Журнал квартиры",
    inspection: "Обход квартиры",
    inspections: "Обходы и отчеты",
    work_orders: "Задания",
    contractor: "Выдать доступ мастеру",
    report: "Отчет мастера",
    settings: "Настройки",
  };
  return titles[view];
}

function viewSubtitle(view: View) {
  const subtitles: Record<View, string> = {
    dashboard: "Решения, деньги и текущие работы по квартире.",
    plan: "Слои узлов поверх схемы квартиры.",
    assets: "Инвентарный список по комнатам, категориям и статусам.",
    asset: "История, фото, паспорт узла и быстрые действия.",
    documents: "Паспорта, чеки, гарантии, инструкции и акты по узлам.",
    utilities: "Начисления, сроки оплаты, квитанции и история коммунальных платежей.",
    log: "Все события квартиры в одной ленте.",
    inspection: "Пошаговая проверка узлов с телефона или ноутбука.",
    inspections: "Выдача ссылок мастерам, все созданные обходы и сводки по узлам.",
    work_orders: "Работы мастеров, уборка и обходы квартиры в одном рабочем разделе.",
    contractor: "Создание гостевой ссылки на выбранные узлы и чек-лист мастера.",
    report: "Сводка, которая вернулась после проверки по ссылке.",
    settings: "Название сервиса, объект и базовые параметры интерфейса.",
  };
  return subtitles[view];
}

function assetReturnLabel(view: View) {
  const labels: Partial<Record<View, string>> = {
    dashboard: "К дашборду",
    plan: "К схеме",
    assets: "К списку",
    documents: "К документам",
    utilities: "К счетам",
    log: "К журналу",
    inspection: "К обходу",
    inspections: "К обходам",
    work_orders: "К заданиям",
    report: "К отчету",
    contractor: "К обходам",
  };
  return labels[view] ?? "Назад";
}

function BrandMark({ objectName }: { objectName: string }) {
  return (
    <span
      className="brand-mark grid min-w-0 gap-1.5"
      aria-label={`FIXPLAN, ${objectName}`}
    >
      <Image
        alt="FIXPLAN"
        height={18}
        priority
        src="/fixplan-logo.svg"
        style={{ height: 18, width: 133 }}
        width={133}
      />
    </span>
  );
}

type ApartmentSummary = {
  id: string;
  name: string;
  address: string;
};

function ApartmentSwitcher({ compact = false }: { compact?: boolean }) {
  const nameId = useId();
  const addressId = useId();
  const [apartments, setApartments] = useState<ApartmentSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadApartments() {
      try {
        const response = await fetch("/api/apartments", { cache: "no-store" });
        const result = (await response.json()) as {
          apartments?: ApartmentSummary[];
          selectedId?: string;
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || "Не удалось загрузить объекты.");
        if (cancelled) return;
        const nextApartments = result.apartments ?? [];
        setApartments(nextApartments);
        setSelectedId(result.selectedId ?? nextApartments[0]?.id ?? "");
        setCreateOpen(nextApartments.length === 0);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить объекты.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadApartments();
    return () => {
      cancelled = true;
    };
  }, []);

  async function switchApartment(apartmentId: string) {
    if (!apartmentId || apartmentId === selectedId) return;
    setSelectedId(apartmentId);
    setError("");
    const response = await fetch("/api/apartments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apartmentId }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(result.error || "Не удалось переключить объект.");
      return;
    }
    window.location.reload();
  }

  async function createApartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() && !address.trim()) {
      setError("Укажите название или адрес объекта.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/apartments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Не удалось создать объект.");
      window.location.reload();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать объект.");
      setSaving(false);
    }
  }

  return (
    <div className={`apartment-switcher${compact ? " apartment-switcher-compact" : ""}`}>
      <Select disabled={loading || !apartments.length} onValueChange={switchApartment} value={selectedId}>
        <SelectTrigger aria-label="Выбрать объект" className="min-w-0 flex-1">
          <SelectValue placeholder={loading ? "Загрузка…" : "Нет объектов"} />
        </SelectTrigger>
        <SelectContent>
          {apartments.map((apartment) => (
            <SelectItem key={apartment.id} value={apartment.id}>
              {apartment.name || apartment.address}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button aria-label="Добавить объект" onClick={() => setCreateOpen(true)} size="icon" type="button" variant="outline">
            <Plus />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Добавить объект</TooltipContent>
      </Tooltip>
      {error && !createOpen ? <p className="apartment-switcher-error">{error}</p> : null}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (open || apartments.length) setCreateOpen(open);
        }}
      >
        <DialogContent>
          <form className="grid gap-4" onSubmit={createApartment}>
            <DialogHeader>
              <DialogTitle>Новый объект</DialogTitle>
              <DialogDescription>Достаточно заполнить название или адрес.</DialogDescription>
            </DialogHeader>
            <label className="grid gap-2 text-sm font-medium" htmlFor={nameId}>
              Название
              <Input id={nameId} autoComplete="off" onChange={(event) => setName(event.target.value)} placeholder="Квартира на Шпалерной" value={name} />
            </label>
            <label className="grid gap-2 text-sm font-medium" htmlFor={addressId}>
              Адрес
              <Input id={addressId} autoComplete="street-address" onChange={(event) => setAddress(event.target.value)} placeholder="Шпалерная, 34Б" value={address} />
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              {apartments.length ? (
                <Button onClick={() => setCreateOpen(false)} type="button" variant="outline">
                  Отмена
                </Button>
              ) : null}
              <Button disabled={saving} type="submit">
                {saving ? "Создаём…" : "Создать объект"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MenuGlyph() {
  return (
    <span className="menu-glyph grid gap-1.5" aria-hidden="true">
      <span className="block h-0.5 w-7 rounded-full bg-current" />
      <span className="block h-0.5 w-7 rounded-full bg-current" />
      <span className="block h-0.5 w-7 rounded-full bg-current" />
    </span>
  );
}

function SidebarSearch({
  assets,
  openAsset,
}: {
  assets: Asset[];
  openAsset: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () =>
      query.trim()
        ? assets
            .filter((asset) => matchesAssetSearch(asset, query))
            .slice(0, 5)
        : [],
    [assets, query],
  );

  return (
    <div className="sidebar-search">
      <div className="sidebar-search-field">
        <Search size={16} />
        <Input
          aria-label="Поиск узла"
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && results[0]) {
              openAsset(results[0].id);
              setQuery("");
            }
          }}
          placeholder="Найти узел"
          value={query}
        />
      </div>
      {results.length > 0 && (
        <div className="sidebar-search-results">
          {results.map((asset) => (
            <button
              key={asset.id}
              onClick={() => {
                openAsset(asset.id);
                setQuery("");
              }}
              type="button"
            >
              <strong>{asset.code} · {asset.name}</strong>
              <span>{roomName(asset.roomId)} · {categoryLabel(asset.category)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AppNavigation({
  activeView,
  compact = false,
  navigate,
}: {
  activeView: View;
  compact?: boolean;
  navigate: (view: View) => void;
}) {
  return (
    <>
      <NavButton active={activeView === "dashboard"} compact={compact} icon={<LayoutDashboard size={16} />} label="Дашборд" onClick={() => navigate("dashboard")} />
      <NavButton active={activeView === "plan"} compact={compact} icon={<MapIcon size={16} />} label="План" onClick={() => navigate("plan")} />
      <NavButton active={activeView === "assets"} compact={compact} icon={<List size={16} />} label="Узлы" onClick={() => navigate("assets")} />
      <NavButton
        active={["work_orders", "inspections", "contractor", "report", "inspection"].includes(activeView)}
        compact={compact}
        icon={<Check size={16} />}
        label="Задания"
        onClick={() => navigate("work_orders")}
      />
      <NavButton active={activeView === "documents"} compact={compact} icon={<FileText size={16} />} label="Документы" onClick={() => navigate("documents")} />
      <NavButton active={activeView === "utilities"} compact={compact} icon={<ReceiptText size={16} />} label="Счета" onClick={() => navigate("utilities")} />
      <NavButton active={activeView === "log"} compact={compact} icon={<History size={16} />} label="Журнал" onClick={() => navigate("log")} />
      <NavButton active={activeView === "settings"} compact={compact} icon={<Settings size={16} />} label="Настройки" onClick={() => navigate("settings")} />
    </>
  );
}

function NavButton({
  active,
  compact,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  compact: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  const button = (
    <Button className={compact ? "w-full justify-center px-0" : "w-full justify-start"} variant={active ? "secondary" : "ghost"} onClick={onClick} type="button">
      {icon}
      {!compact && <span>{label}</span>}
    </Button>
  );
  if (!compact) return button;
  return <Tooltip><TooltipTrigger asChild>{button}</TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>;
}

function StatusSelect({
  value,
  onValueChange,
  className,
  disabled,
  placeholder = "Выберите статус",
}: {
  value?: Status;
  onValueChange: (value: Status) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const triggerClassName = [
    "status-select-trigger",
    value ? `status-select-${value}` : "status-select-empty",
    className ?? "w-[240px]",
  ].join(" ");

  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as Status)}>
      <SelectTrigger
        aria-label="Текущий статус"
        className={triggerClassName}
        disabled={disabled}
        size="default"
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(statusLabels) as Status[]).map((status) => (
          <SelectItem key={status} value={status}>
            <span aria-hidden="true" className={`status-select-dot status-select-dot-${status}`} />
            {statusLabels[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Dashboard({
  assets,
  bills,
  cleanings,
  events,
  inspections,
  inspectionResults,
  issueAssets,
  media,
  meters,
  readings,
  workOrders,
  openAsset,
  openLog,
  openReport,
  openTasks,
  openUtilities,
  openDocuments,
}: {
  assets: Asset[];
  bills: UtilityBill[];
  cleanings: Cleaning[];
  events: AssetEvent[];
  inspections: Inspection[];
  inspectionResults: InspectionResult[];
  issueAssets: Asset[];
  media: AssetMedia[];
  meters: UtilityMeter[];
  readings: UtilityReading[];
  workOrders: Inspection[];
  openAsset: (id: string) => void;
  openLog: () => void;
  openReport: (id: string) => void;
  openTasks: (tab: "master-work" | "cleaning" | "inspection") => void;
  openUtilities: () => void;
  openDocuments: () => void;
}) {
  const activeInspections = inspections.filter((inspection) =>
    !["completed", "accepted"].includes(inspection.status),
  );
  const activeWorkOrders = workOrders.filter((inspection) =>
    !["completed", "accepted"].includes(inspection.status),
  );
  const reviewInspections = inspections.filter((inspection) => inspection.status === "completed");
  const reviewWorkOrders = workOrders.filter((inspection) => inspection.status === "completed");
  const reviewCleanings = cleanings.filter((cleaning) => cleaning.status === "completed");
  const activeCleanings = cleanings.filter((cleaning) =>
    !["completed", "accepted", "declined"].includes(cleaning.status),
  );
  const recentEvents = events.slice().sort((a, b) => b.id.localeCompare(a.id)).slice(0, 5);
  const currentUtilityMonth = buildUtilityMonths(bills, meters, readings)[0];
  const primaryIssues = issueAssets
    .slice()
    .sort((left, right) =>
      statusWeight(left.status) - statusWeight(right.status) ||
      left.code.localeCompare(right.code, "ru"),
    )
    .slice(0, 6);
  const activeMasterFlows = [...activeWorkOrders, ...activeInspections].slice(0, 4);
  const decisionCount = primaryIssues.length + reviewInspections.length + reviewWorkOrders.length + reviewCleanings.length + (currentUtilityMonth?.status === "not_issued" ? 1 : 0);

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button"><Plus />Создать</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuItem onSelect={() => openTasks("master-work")}><Check />Задание мастеру</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openTasks("cleaning")}><ClipboardCheck />Уборку</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openTasks("inspection")}><History />Обход</DropdownMenuItem>
            <DropdownMenuItem onSelect={openUtilities}><ReceiptText />Коммунальный счёт</DropdownMenuItem>
            <DropdownMenuItem onSelect={openDocuments}><FileText />Документ</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] items-start gap-4 max-[1080px]:grid-cols-1">
        <Card>
          <CardHeader className="grid-cols-[1fr_auto] gap-3">
            <div>
              <CardTitle>Требует решения</CardTitle>
              <CardDescription>{decisionCount ? `${decisionCount} действий ждут владельца.` : "Сейчас ничего не требует решения."}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-2">
            {currentUtilityMonth?.status === "not_issued" && (
              <Button className="h-auto justify-between py-3 text-left" onClick={openUtilities} type="button" variant="secondary">
                <span><strong className="block">Коммуналка за {currentUtilityMonth.period}</strong><span className="text-muted-foreground text-xs">Счёт жильцу ещё не выставлен</span></span>
                <ChevronRight />
              </Button>
            )}
            {[...reviewWorkOrders, ...reviewInspections].slice(0, 3).map((inspection) => (
              <Button className="h-auto justify-between py-3 text-left" key={inspection.id} onClick={() => openReport(inspection.id)} type="button" variant="secondary">
                <span><strong className="block">{inspection.title}</strong><span className="text-muted-foreground text-xs">Проверить результат и принять работу</span></span>
                <ChevronRight />
              </Button>
            ))}
            {reviewCleanings.slice(0, 2).map((cleaning) => (
              <Button className="h-auto justify-between py-3 text-left" key={cleaning.id} onClick={() => openTasks("cleaning")} type="button" variant="secondary">
                <span><strong className="block">{cleaning.title}</strong><span className="text-muted-foreground text-xs">Уборка выполнена, нужен приём</span></span>
                <ChevronRight />
              </Button>
            ))}
            {primaryIssues.map((asset) => (
              <AssetRow key={asset.id} asset={asset} onClick={() => openAsset(asset.id)} />
            ))}
            {!decisionCount && (
              <div className="rounded-lg bg-muted p-3 text-muted-foreground text-sm">
                Все текущие вопросы разобраны.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="grid-cols-[1fr_auto] gap-3">
            <div>
              <CardTitle>Коммуналка</CardTitle>
              <CardDescription>{currentUtilityMonth ? currentUtilityMonth.period : "Текущий месяц"}</CardDescription>
            </div>
            <Button variant="secondary" onClick={openUtilities} type="button">Открыть</Button>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Metric value={moneyLabel(currentUtilityMonth?.reimbursementAmount ?? 0)} label="ожидаем от жильца" />
            <Metric value={currentUtilityMonth ? utilityMonthStatusLabels[currentUtilityMonth.status] : "Нет данных"} label="статус месяца" />
            {currentUtilityMonth?.missing.length ? <p className="col-span-2 text-muted-foreground text-sm">Не хватает: {currentUtilityMonth.missing.join(", ")}.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="grid-cols-[1fr_auto] gap-3">
            <div>
              <CardTitle>Активные работы</CardTitle>
              <CardDescription>Мастера, клинеры и обходы, которые сейчас в процессе.</CardDescription>
            </div>
            <Button variant="secondary" onClick={() => openTasks("master-work")} type="button">
              Задания
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {activeMasterFlows.map((inspection) => (
              <InspectionSummaryRow
                inspection={inspection}
                key={inspection.id}
                results={inspectionResults}
                onClick={() => openReport(inspection.id)}
              />
            ))}
            {activeCleanings.slice(0, 3).map((cleaning) => (
              <Button className="h-auto justify-between py-3 text-left" key={cleaning.id} onClick={() => openTasks("cleaning")} type="button" variant="secondary">
                <span><strong className="block">{cleaning.title}</strong><span className="text-muted-foreground text-xs">{cleaning.cleaner || "Клинер не назначен"} · {cleaningStatusLabels[cleaning.status]}</span></span>
                <ChevronRight />
              </Button>
            ))}
            {!activeMasterFlows.length && !activeCleanings.length && (
              <div className="rounded-lg bg-muted p-3 text-muted-foreground text-sm">
                Сейчас нет активных работ.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="grid-cols-[1fr_auto] gap-3">
            <div>
              <CardTitle>Последние события</CardTitle>
              <CardDescription>Новые комментарии, фото, отчеты и изменения статусов.</CardDescription>
            </div>
            <Button variant="secondary" onClick={openLog} type="button">
              Журнал
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {recentEvents.map((event) => (
              <EventSummaryRow
                asset={assets.find((asset) => asset.id === event.assetId)}
                event={event}
                key={event.id}
                media={mediaForEvent(event, media)}
                onClick={() => openAsset(event.assetId)}
              />
            ))}
            {!recentEvents.length && (
              <div className="rounded-lg bg-muted p-3 text-muted-foreground text-sm">
                В журнале пока нет событий.
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

function InspectionSummaryRow({
  inspection,
  onClick,
  results,
}: {
  inspection: Inspection;
  onClick: () => void;
  results: InspectionResult[];
}) {
  const flowResults = results.filter((result) => result.inspectionId === inspection.id);
  const issueCount = flowResults.filter((result) => result.statusAfter !== "ok").length;
  const isWorkOrder = inspection.workflow === "work_order";

  return (
    <button
      className="flex w-full items-start justify-between gap-3 rounded-lg bg-muted p-3 text-left transition-colors hover:bg-secondary"
      onClick={onClick}
      type="button"
    >
      <span className="grid min-w-0 gap-1">
        <strong className="truncate font-medium">
          {isWorkOrder ? "Задание" : "Обход"} · {inspection.contractor}
        </strong>
        <small className="truncate text-muted-foreground text-sm">
          {inspection.createdAt} · {inspection.allowedAssetIds.length} узлов
        </small>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant={inspection.status === "in_progress" ? "outline" : "secondary"}>
          {inspectionStatusLabels[inspection.status]}
        </Badge>
        <small className="text-muted-foreground text-xs">{issueCount} замечаний</small>
      </span>
    </button>
  );
}

function EventSummaryRow({
  asset,
  event,
  media,
  onClick,
}: {
  asset?: Asset;
  event: AssetEvent;
  media: AssetMedia[];
  onClick: () => void;
}) {
  const photoCount = media.length || (event.photo ? 1 : 0);

  return (
    <button
      className="flex w-full items-start justify-between gap-3 rounded-lg bg-muted p-3 text-left transition-colors hover:bg-secondary"
      onClick={onClick}
      type="button"
    >
      <span className="grid min-w-0 gap-1">
        <small className="text-muted-foreground text-sm">
          {event.date} · {asset ? `${asset.code} · ${roomName(asset.roomId)}` : eventLabels[event.type]}
        </small>
        <strong className="truncate font-medium">{event.title}</strong>
        <span className="line-clamp-2 text-muted-foreground text-sm">{event.body}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {event.statusAfter && <StatusBadge status={event.statusAfter} />}
        {photoCount > 0 && <Badge variant="outline">{photoCount} фото</Badge>}
      </span>
    </button>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="grid gap-1 rounded-lg bg-muted p-3">
      <strong className="text-base font-medium leading-snug">{value}</strong>
      <span className="text-muted-foreground text-sm">{label}</span>
    </div>
  );
}

function PlanView({
  allAssets,
  activePlanCategory,
  activePlanMode,
  categories,
  createCategory,
  filter,
  plan,
  setPlan,
  assetDraft,
  assetSaving,
  cancelPlanChanges,
  deleteEditingAsset,
  dirtyPlanAssetCount,
  editingAssetId,
  editMode,
  enterPlanEditMode,
  moveAssetOnPlan,
  setActivePlanCategory,
  setFilter,
  setActivePlanMode,
  setAssetDraft,
  savePlanChanges,
  saveAssetDraft,
  selectAssetForEditing,
  startNewAsset,
  openAsset,
}: {
  allAssets: Asset[];
  activePlanCategory: Category;
  activePlanMode: PlanModeId;
  categories: AssetCategory[];
  createCategory: (label: string) => Promise<boolean>;
  filter: AssetFilter;
  plan?: ApartmentPlanFile | null;
  setPlan: (plan: ApartmentPlanFile | null) => void;
  assetDraft: AssetDraft;
  assetSaving: boolean;
  cancelPlanChanges: () => void;
  deleteEditingAsset: () => void;
  dirtyPlanAssetCount: number;
  editingAssetId: string | null;
  editMode: boolean;
  enterPlanEditMode: () => void;
  moveAssetOnPlan: (assetId: string, x: number, y: number) => void;
  setActivePlanCategory: (category: Category) => void;
  setFilter: (filter: AssetFilter) => void;
  setActivePlanMode: (mode: PlanModeId) => void;
  setAssetDraft: (draft: AssetDraft | ((current: AssetDraft) => AssetDraft)) => void;
  savePlanChanges: () => void;
  saveAssetDraft: () => void;
  selectAssetForEditing: (asset: Asset) => void;
  startNewAsset: (modeId?: PlanModeId, categoryId?: Category) => void;
  openAsset: (id: string) => void;
}) {
  const [planQuery, setPlanQuery] = useState("");
  const [sort, setSort] = useState<AssetSort>("status");
  const [planFileSaving, setPlanFileSaving] = useState(false);
  const [planFileError, setPlanFileError] = useState("");
  const activeMode = planModes.find((mode) => mode.id === activePlanMode) ?? planModes[0];
  const activeHotspots = planHotspots[activeMode.id];
  const filterOptions = useMemo(() => assetFiltersForCategories(categories), [categories]);
  const planCategories = useMemo(() => categoryOptions(categories), [categories]);
  const activeCategory =
    planCategories.find((category) => category.id === activePlanCategory) ?? planCategories[0];
  const selectedCategory = planCategories.find((category) => category.id === filter);
  const selectedFilter = filterOptions.find((option) => option.id === filter);
  const filteredAssets = useMemo(() => {
    return allAssets
      .filter((asset) => matchesAssetFilter(asset, filter))
      .filter((asset) => matchesAssetSearch(asset, planQuery))
      .slice()
      .sort((left, right) => {
        if (sort === "status") {
          return (
            statusWeight(left.status) - statusWeight(right.status) ||
            left.code.localeCompare(right.code, "ru")
          );
        }
        if (sort === "room") {
          return (
            roomName(left.roomId).localeCompare(roomName(right.roomId), "ru") ||
            left.code.localeCompare(right.code, "ru")
          );
        }
        if (sort === "checked") {
          return right.lastChecked.localeCompare(left.lastChecked, "ru");
        }
        return left.code.localeCompare(right.code, "ru");
      });
  }, [allAssets, filter, planQuery, sort]);
  const filterCounts = useMemo(() => {
    return filterOptions.reduce<Record<string, number>>((counts, option) => {
      counts[option.id] = allAssets.filter((asset) => matchesAssetFilter(asset, option.id)).length;
      return counts;
    }, {});
  }, [allAssets, filterOptions]);
  const editingAsset = editingAssetId
    ? allAssets.find((asset) => asset.id === editingAssetId) ?? null
    : null;

  function selectPlanFilter(nextFilter: AssetFilter) {
    setFilter(nextFilter);
    const category = planCategories.find((item) => item.id === nextFilter);
    if (category) {
      setActivePlanCategory(category.id);
      setActivePlanMode(category.planModeId);
      return;
    }

    setActivePlanMode(planModeFromAssetFilter(nextFilter));
  }

  async function promptCreateCategory() {
    const label = window.prompt("Название новой категории");
    if (!label?.trim()) return;
    await createCategory(label);
  }

  async function uploadPlan(file: File) {
    setPlanFileSaving(true);
    setPlanFileError("");
    const formData = new FormData();
    formData.set("file", file);
    try {
      const response = await fetch("/api/plan", { method: "POST", body: formData });
      const result = (await response.json().catch(() => ({}))) as {
        plan?: ApartmentPlanFile;
        error?: string;
      };
      if (!response.ok || !result.plan) {
        throw new Error(result.error || "Не удалось загрузить схему.");
      }
      setPlan(result.plan);
    } catch (uploadError) {
      setPlanFileError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить схему.");
    } finally {
      setPlanFileSaving(false);
    }
  }

  async function deletePlan() {
    if (!window.confirm("Удалить схему квартиры? Узлы и их данные останутся в системе.")) return;
    setPlanFileSaving(true);
    setPlanFileError("");
    try {
      const response = await fetch("/api/plan", { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Не удалось удалить схему.");
      setPlan(null);
    } catch (deleteError) {
      setPlanFileError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить схему.");
    } finally {
      setPlanFileSaving(false);
    }
  }

  return (
    <div className="plan-layout">
      <div className="plan-main-column">
        <div className="assets-view">
          <div className="asset-tools plan-header-tools">
            <div className="asset-search">
              <Search size={16} />
              <Input
                aria-label="Поиск по плану"
                className="asset-search-input"
                onChange={(event) => setPlanQuery(event.currentTarget.value)}
                placeholder="Код, комната, тип"
                value={planQuery}
              />
            </div>
            <div className="asset-primary-actions plan-primary-actions">
              <Button
                className="asset-create-button"
                onClick={() => startNewAsset(activeMode.id, activeCategory?.id)}
                type="button"
              >
                <Plus size={16} />
                Новый узел
              </Button>
              <Button
                className="asset-create-button"
                onClick={() => void promptCreateCategory()}
                type="button"
              >
                <Plus size={16} />
                Новая категория
              </Button>
            </div>
            <Select value={sort} onValueChange={(value) => setSort(value as AssetSort)}>
              <SelectTrigger className="asset-sort-trigger w-full sm:w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(assetSortLabels) as AssetSort[]).map((sortKey) => (
                  <SelectItem key={sortKey} value={sortKey}>
                    {assetSortLabels[sortKey]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="asset-filter-bar" role="list" aria-label="Фильтры плана">
            {filterOptions.map((option) => (
              <Button
                aria-pressed={filter === option.id}
                className="asset-filter-chip"
                key={option.id}
                onClick={() => selectPlanFilter(option.id)}
                size="sm"
                type="button"
                variant={filter === option.id ? "default" : "secondary"}
              >
                {option.label}
                <Badge variant="secondary">{filterCounts[option.id] ?? 0}</Badge>
              </Button>
            ))}
          </div>

          <div className="asset-current-section">
            <div>
              <h2>{selectedCategory?.label ?? selectedFilter?.label ?? "Все"}</h2>
              <p>
                {selectedCategory
                  ? `${filterCounts[selectedCategory.id] ?? 0} узлов в категории`
                  : `${filteredAssets.length} узлов по выбранному фильтру`}
              </p>
            </div>
            <div className="asset-current-actions">
              <Button asChild disabled={planFileSaving} size="sm" variant="outline">
                <label>
                  <Upload size={14} />
                  {planFileSaving ? "Загрузка…" : plan ? "Заменить схему" : "Загрузить схему"}
                  <input
                    accept="application/pdf,image/*"
                    className="sr-only"
                    disabled={planFileSaving}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (file) void uploadPlan(file);
                    }}
                    type="file"
                  />
                </label>
              </Button>
              {plan ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="Удалить схему"
                      disabled={planFileSaving}
                      onClick={() => void deletePlan()}
                      size="icon-sm"
                      type="button"
                      variant="outline"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Удалить схему</TooltipContent>
                </Tooltip>
              ) : null}
              {editMode ? (
                <>
                  <Button
                    disabled={assetSaving}
                    onClick={cancelPlanChanges}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Отменить
                  </Button>
                  <Button
                    disabled={assetSaving}
                    onClick={savePlanChanges}
                    size="sm"
                    type="button"
                  >
                    <Save size={14} />
                    {assetSaving
                      ? "Сохраняю"
                      : dirtyPlanAssetCount
                        ? `Сохранить (${dirtyPlanAssetCount})`
                        : "Сохранить"}
                  </Button>
                </>
              ) : (
                <Button onClick={enterPlanEditMode} size="sm" type="button" variant="secondary">
                  <Pencil size={14} />
                  Редактировать
                </Button>
              )}
            </div>
          </div>
          {planFileError ? <p className="text-sm text-destructive">{planFileError}</p> : null}
        </div>

        <Card className="plan-main-card">
          <CardContent className="plan-main-content">
            <ApartmentPlan
              activeMode={activeMode}
              plan={plan}
              hotspots={activeHotspots}
              assets={filteredAssets}
              editMode={editMode}
              editingAssetId={editingAssetId}
              moveAssetOnPlan={moveAssetOnPlan}
              openAsset={openAsset}
              selectAssetForEditing={selectAssetForEditing}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editMode ? "Редактор узла" : "Видимые узлы"}</CardTitle>
          <CardDescription>
            {editMode
              ? "Выберите точку на плане, перетащите ее и сохраните положение."
              : `${activeMode.label}: ${activeHotspots.length} контрольных точек, ${filteredAssets.length} из ${allAssets.length} узлов системы.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {editMode ? (
            <PlanAssetEditor
              asset={editingAsset}
              categories={categories}
              draft={assetDraft}
              isSaving={assetSaving}
              onChange={setAssetDraft}
              onDelete={deleteEditingAsset}
              onSave={saveAssetDraft}
            />
          ) : (
            <>
              {filteredAssets.map((asset) => (
                <AssetRow key={asset.id} asset={asset} onClick={() => openAsset(asset.id)} />
              ))}
              {!filteredAssets.length && (
                <p className="text-muted-foreground text-sm">По выбранным фильтрам узлов нет.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PlanAssetEditor({
  asset,
  categories,
  draft,
  isSaving,
  onChange,
  onDelete,
  onSave,
}: {
  asset: Asset | null;
  categories: AssetCategory[];
  draft: AssetDraft;
  isSaving: boolean;
  onChange: (draft: AssetDraft | ((current: AssetDraft) => AssetDraft)) => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  return (
    <div className="plan-editor">
      <div className="rounded-lg bg-muted p-3 text-muted-foreground text-sm">
        {asset
          ? `${asset.code} · ${asset.name}. Положение меняется перетаскиванием точки на плане.`
          : "Новый узел появится на активной схеме. Передвиньте точку и сохраните изменения."}
      </div>

      <div className="plan-editor-grid">
        <div className="grid gap-1.5">
          <label className="plan-editor-label" htmlFor="plan-asset-code">Номер</label>
          <Input
            id="plan-asset-code"
            onChange={(event) => {
              const code = event.currentTarget.value;
              onChange((current) => ({ ...current, code }));
            }}
            placeholder="Присвоится автоматически"
            value={draft.code}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="plan-editor-label" htmlFor="plan-asset-name">Название</label>
          <Input
            id="plan-asset-name"
            onChange={(event) => {
              const name = event.currentTarget.value;
              onChange((current) => ({ ...current, name }));
            }}
            value={draft.name}
          />
        </div>
        <div className="grid gap-1.5">
          <span className="plan-editor-label">Комната</span>
          <Select
            value={draft.roomId}
            onValueChange={(roomId) => onChange((current) => ({ ...current, roomId }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <span className="plan-editor-label">Категория</span>
          <Select
            value={draft.category}
            onValueChange={(category) =>
              onChange((current) => ({ ...current, category: category as Category }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions(categories).map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <span className="plan-editor-label">Тип</span>
          <Select
            value={draft.kind}
            onValueChange={(kind) => onChange((current) => ({ ...current, kind: kind as AssetKind }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(assetKindLabels) as AssetKind[]).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {assetKindLabels[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <span className="plan-editor-label">Статус</span>
          <StatusSelect
            className="w-full"
            value={draft.status}
            onValueChange={(status) => onChange((current) => ({ ...current, status }))}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="plan-editor-label" htmlFor="plan-asset-warranty">Гарантия</label>
          <Input
            id="plan-asset-warranty"
            onChange={(event) => {
              const warrantyUntil = event.currentTarget.value;
              onChange((current) => ({ ...current, warrantyUntil }));
            }}
            placeholder="например, до 12 декабря 2027"
            value={draft.warrantyUntil ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="plan-editor-label" htmlFor="plan-asset-master">Ответственный</label>
          <Input
            id="plan-asset-master"
            onChange={(event) => {
              const master = event.currentTarget.value;
              onChange((current) => ({ ...current, master }));
            }}
            placeholder="мастер, сервис или подрядчик"
            value={draft.master ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="plan-editor-label" htmlFor="plan-asset-manufacturer">Производитель</label>
          <Input
            id="plan-asset-manufacturer"
            onChange={(event) => {
              const manufacturer = event.currentTarget.value;
              onChange((current) => ({ ...current, manufacturer }));
            }}
            placeholder="необязательно"
            value={draft.manufacturer ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="plan-editor-label" htmlFor="plan-asset-model">Модель</label>
          <Input
            id="plan-asset-model"
            onChange={(event) => {
              const model = event.currentTarget.value;
              onChange((current) => ({ ...current, model }));
            }}
            placeholder="необязательно"
            value={draft.model ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="plan-editor-label" htmlFor="plan-asset-serial">Серийный номер</label>
          <Input
            id="plan-asset-serial"
            onChange={(event) => {
              const serialNumber = event.currentTarget.value;
              onChange((current) => ({ ...current, serialNumber }));
            }}
            placeholder="необязательно"
            value={draft.serialNumber ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="plan-editor-label" htmlFor="plan-asset-installed">Покупка или установка</label>
          <Input
            id="plan-asset-installed"
            onChange={(event) => {
              const installedAt = event.currentTarget.value;
              onChange((current) => ({ ...current, installedAt }));
            }}
            placeholder="например, август 2026"
            value={draft.installedAt ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="plan-editor-label" htmlFor="plan-asset-cost">Стоимость</label>
          <Input
            id="plan-asset-cost"
            min="0"
            onChange={(event) => {
              const value = event.currentTarget.value;
              onChange((current) => ({
                ...current,
                purchaseCost: value === "" ? undefined : Number(value),
              }));
            }}
            placeholder="необязательно"
            type="number"
            value={draft.purchaseCost ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <label className="plan-editor-label" htmlFor="plan-asset-note">Описание</label>
        <Textarea
          id="plan-asset-note"
          onChange={(event) => {
            const photoNote = event.currentTarget.value;
            onChange((current) => ({ ...current, photoNote }));
          }}
          placeholder="Что важно знать мастеру или владельцу"
          value={draft.photoNote}
        />
      </div>

      <div className="button-row">
        <Button disabled={isSaving} onClick={onSave} type="button">
          <Save size={14} />
          {isSaving ? "Сохраняю" : "Сохранить узел"}
        </Button>
        {asset && (
          <Button disabled={isSaving} onClick={onDelete} type="button" variant="destructive">
            <Trash2 size={14} />
            Удалить
          </Button>
        )}
      </div>
    </div>
  );
}

function ApartmentPlan({
  activeMode,
  plan,
  hotspots,
  assets,
  editMode,
  editingAssetId,
  moveAssetOnPlan,
  openAsset,
  selectAssetForEditing,
}: {
  activeMode: PlanMode;
  plan?: ApartmentPlanFile | null;
  hotspots: PlanHotspot[];
  assets: Asset[];
  editMode: boolean;
  editingAssetId: string | null;
  moveAssetOnPlan: (assetId: string, x: number, y: number) => void;
  openAsset: (id: string) => void;
  selectAssetForEditing: (asset: Asset) => void;
}) {
  const [planImageGeometry, setPlanImageGeometry] = useState<{ url: string; ratio: number } | null>(null);
  const visibleAssetIds = new Set(assets.map((asset) => asset.id));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const planAspectRatio = planImageGeometry && planImageGeometry.url === plan?.url
    ? planImageGeometry.ratio
    : null;

  function updateFromPointer(asset: Asset, event: PointerEvent<HTMLButtonElement>) {
    const stage = event.currentTarget.closest(".plan-stage");
    if (!(stage instanceof HTMLElement)) return;

    const rect = stage.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
    moveAssetOnPlan(asset.id, x, y);
  }

  return (
    <div className="apartment-plan" aria-label="Схема квартиры">
      <div
        className="plan-stage"
        role="img"
        style={
          plan
            ? { aspectRatio: plan.mediaType === "application/pdf" ? "210 / 297" : planAspectRatio ?? undefined }
            : undefined
        }
      >
        {plan?.mediaType === "application/pdf" ? (
          <object
            aria-label={plan.originalName}
            className="plan-image plan-document"
            data={plan.url}
            type="application/pdf"
          />
        ) : plan ? (
          <Image
            alt={plan.originalName}
            className="plan-image base"
            fill
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth && image.naturalHeight) {
                setPlanImageGeometry({
                  url: plan.url,
                  ratio: image.naturalWidth / image.naturalHeight,
                });
              }
            }}
            sizes="(max-width: 980px) 100vw, 70vw"
            src={plan.url}
            unoptimized
          />
        ) : plan === undefined ? (
          <Image
            alt={activeMode.label}
            className="plan-image base"
            fill
            sizes="(max-width: 980px) 100vw, 70vw"
            src={activeMode.src}
          />
        ) : (
          <div className="plan-empty-state">
            <MapIcon size={28} />
            <strong>Схема не загружена</strong>
            <span>Узлы доступны в каталоге. Добавить план можно в любой момент.</span>
          </div>
        )}
        {hotspots.map((hotspot) => {
          const markerAssetId = hotspot.assetId ?? hotspot.id;
          const isLinkedAsset = visibleAssetIds.has(markerAssetId);
          const asset = assetById.get(markerAssetId);
          const isHiddenByIssueFilter = !visibleAssetIds.has(markerAssetId);
          if (isHiddenByIssueFilter) return null;

          return (
            <Tooltip key={hotspot.id}>
              <TooltipTrigger asChild>
                <button
                  aria-label={`${hotspot.code}, ${hotspot.title}, ${hotspot.room}`}
                  className={`plan-hotspot ${hotspot.tone ?? "positive"}${isLinkedAsset ? " linked" : ""}${editingAssetId === markerAssetId ? " editing" : ""}`}
                  onClick={() => (editMode && asset ? selectAssetForEditing(asset) : openAsset(markerAssetId))}
                  onPointerDown={(event) => {
                    if (!editMode || !asset) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    selectAssetForEditing(asset);
                  }}
                  onPointerMove={(event) => {
                    if (!editMode || !asset || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                    updateFromPointer(asset, event);
                  }}
                  onPointerUp={(event) => {
                    if (!editMode || !asset) return;
                    updateFromPointer(asset, event);
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  style={{ left: `${asset?.x ?? hotspot.x}%`, top: `${asset?.y ?? hotspot.y}%` }}
                  type="button"
                >
                  <span className="plan-hotspot-dot" />
                  <span className="plan-hotspot-code">{asset?.code ?? hotspot.code}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent sideOffset={8}>
                <span className="grid gap-1">
                  <strong>{asset?.code ?? hotspot.code} · {asset?.name ?? hotspot.title}</strong>
                  <span>{asset ? roomName(asset.roomId) : hotspot.room}</span>
                  <span>{asset?.photoNote || hotspot.note}</span>
                </span>
              </TooltipContent>
            </Tooltip>
          );
        })}
        {assets
          .filter((asset) => !hotspots.some((hotspot) => hotspotAssetId(hotspot) === asset.id))
          .map((asset) => (
            <Tooltip key={asset.id}>
              <TooltipTrigger asChild>
                <button
                  aria-label={`${asset.code}, ${asset.name}, ${roomName(asset.roomId)}`}
                  className={`plan-hotspot ${statusTone(asset.status)} linked${editingAssetId === asset.id ? " editing" : ""}`}
                  onClick={() => (editMode ? selectAssetForEditing(asset) : openAsset(asset.id))}
                  onPointerDown={(event) => {
                    if (!editMode) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    selectAssetForEditing(asset);
                  }}
                  onPointerMove={(event) => {
                    if (!editMode || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                    updateFromPointer(asset, event);
                  }}
                  onPointerUp={(event) => {
                    if (!editMode) return;
                    updateFromPointer(asset, event);
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  style={{ left: `${asset.x}%`, top: `${asset.y}%` }}
                  type="button"
                >
                  <span className="plan-hotspot-dot" />
                  <span className="plan-hotspot-code">{asset.code}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent sideOffset={8}>
                <span className="grid gap-1">
                  <strong>{asset.code} · {asset.name}</strong>
                  <span>{roomName(asset.roomId)}</span>
                  <span>{asset.photoNote || categoryLabel(asset.category)}</span>
                </span>
              </TooltipContent>
            </Tooltip>
          ))}
      </div>
      <div className="plan-caption">
        <span>Активный лист: {activeMode.label}</span>
        <span>
          {editMode
            ? "Редактирование: выберите и перетащите точку, затем сохраните узел"
            : "Точки открывают подсказку; связанные узлы открывают карточку объекта"}
        </span>
      </div>
    </div>
  );
}

function AssetsView({
  assets,
  categories,
  filter,
  openAsset,
  editAsset,
  createAsset,
  createCategory,
  deleteCategory,
  renameCategory,
  setFilter,
  setAssetStatus,
  updateAssetsBulk,
  createInspectionFromAssets,
  createWorkOrderFromAssets,
}: {
  assets: Asset[];
  categories: AssetCategory[];
  filter: AssetFilter;
  openAsset: (id: string) => void;
  editAsset: (id: string) => void;
  createAsset: () => void;
  createCategory: (label: string) => Promise<boolean>;
  deleteCategory: (categoryId: Category) => Promise<boolean>;
  renameCategory: (categoryId: Category, label: string) => Promise<boolean>;
  setFilter: (filter: AssetFilter) => void;
  setAssetStatus: (id: string, status: Status) => void;
  updateAssetsBulk: (
    assetIds: string[],
    patch: Partial<Pick<Asset, "category" | "status">>,
  ) => Promise<boolean>;
  createInspectionFromAssets: (assetIds: string[]) => void;
  createWorkOrderFromAssets: (assetIds: string[]) => void;
}) {
  const [sort, setSort] = useState<AssetSort>("status");
  const [query, setQuery] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const filterOptions = useMemo(() => assetFiltersForCategories(categories), [categories]);
  const categoryChoices = useMemo(() => categoryOptions(categories), [categories]);
  const selectedCategory = categoryChoices.find((category) => category.id === filter);
  const selectedFilter = filterOptions.find((option) => option.id === filter);

  const filteredAssets = useMemo(() => {
    return assets
      .filter((asset) => matchesAssetFilter(asset, filter))
      .filter((asset) => matchesAssetSearch(asset, query))
      .slice()
      .sort((left, right) => {
        if (sort === "status") {
          return (
            statusWeight(left.status) - statusWeight(right.status) ||
            left.code.localeCompare(right.code, "ru")
          );
        }
        if (sort === "room") {
          return (
            roomName(left.roomId).localeCompare(roomName(right.roomId), "ru") ||
            left.code.localeCompare(right.code, "ru")
          );
        }
        if (sort === "checked") {
          return right.lastChecked.localeCompare(left.lastChecked, "ru");
        }
        return left.code.localeCompare(right.code, "ru");
      });
  }, [assets, filter, query, sort]);

  const filterCounts = useMemo(() => {
    return filterOptions.reduce<Record<string, number>>((counts, option) => {
      counts[option.id] = assets.filter((asset) => matchesAssetFilter(asset, option.id)).length;
      return counts;
    }, {});
  }, [assets, filterOptions]);

  const visibleAssetIds = useMemo(() => filteredAssets.map((asset) => asset.id), [filteredAssets]);
  const selectedVisibleCount = selectedAssetIds.filter((id) => visibleAssetIds.includes(id)).length;
  const allVisibleSelected = visibleAssetIds.length > 0 && selectedVisibleCount === visibleAssetIds.length;
  const hasPartialVisibleSelection = selectedVisibleCount > 0 && !allVisibleSelected;

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelectedAssetIds((current) => current.filter((id) => !visibleAssetIds.includes(id)));
      return;
    }

    setSelectedAssetIds((current) => Array.from(new Set([...current, ...visibleAssetIds])));
  }

  function toggleAssetSelection(assetId: string) {
    setSelectedAssetIds((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId],
    );
  }

  async function applyBulkStatus(status: Status) {
    if (!selectedAssetIds.length || bulkSaving) return;
    setBulkSaving(true);
    const ok = await updateAssetsBulk(selectedAssetIds, { status });
    if (ok) setSelectedAssetIds([]);
    setBulkSaving(false);
  }

  async function applyBulkCategory(category: Category) {
    if (!selectedAssetIds.length || bulkSaving) return;
    setBulkSaving(true);
    const ok = await updateAssetsBulk(selectedAssetIds, { category });
    if (ok) setSelectedAssetIds([]);
    setBulkSaving(false);
  }

  async function promptCreateCategory() {
    const label = window.prompt("Название новой категории");
    if (!label?.trim()) return;
    await createCategory(label);
  }

  async function promptRenameCategory() {
    if (!selectedCategory) return;
    const nextLabel = window.prompt("Новое название категории", selectedCategory.label);
    if (nextLabel === null || nextLabel.trim() === selectedCategory.label) return;
    await renameCategory(selectedCategory.id, nextLabel);
  }

  return (
    <div className="assets-view">
      <div className="asset-tools">
        <div className="asset-search">
          <Search size={16} />
          <Input
            aria-label="Поиск по узлам"
            className="asset-search-input"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Код, комната, тип"
            value={query}
          />
        </div>
        <div className="asset-primary-actions">
          <Button className="asset-create-button" onClick={createAsset} type="button">
            <Plus size={16} />
            Новый узел
          </Button>
          <Button className="asset-create-button" onClick={() => void promptCreateCategory()} type="button">
            <Plus size={16} />
            Новая категория
          </Button>
        </div>
        <Select value={sort} onValueChange={(value) => setSort(value as AssetSort)}>
          <SelectTrigger className="asset-sort-trigger w-full sm:w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(assetSortLabels) as AssetSort[]).map((sortKey) => (
              <SelectItem key={sortKey} value={sortKey}>
                {assetSortLabels[sortKey]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="asset-filter-bar" role="list" aria-label="Фильтры узлов">
        {filterOptions.map((option) => (
          <Button
            aria-pressed={filter === option.id}
            className="asset-filter-chip"
            key={option.id}
            onClick={() => setFilter(option.id)}
            size="sm"
            type="button"
            variant={filter === option.id ? "default" : "secondary"}
          >
            {option.label}
            <Badge variant="secondary">{filterCounts[option.id] ?? 0}</Badge>
          </Button>
        ))}
      </div>

      <div className="asset-current-section">
        <div>
          <h2>{selectedCategory?.label ?? selectedFilter?.label ?? "Все узлы"}</h2>
          <p>
            {selectedCategory
              ? `${filterCounts[selectedCategory.id] ?? 0} узлов в категории`
              : `${filteredAssets.length} узлов по выбранному фильтру`}
          </p>
        </div>
        {selectedCategory && (
          <div className="asset-current-actions">
            <Button
              aria-label={`Переименовать категорию ${selectedCategory.label}`}
              onClick={() => void promptRenameCategory()}
              size="icon-sm"
              type="button"
              variant="secondary"
            >
              <Pencil size={14} />
            </Button>
            <Button
              aria-label={`Удалить категорию ${selectedCategory.label}`}
              onClick={() => void deleteCategory(selectedCategory.id)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        )}
      </div>

      {selectedAssetIds.length > 0 && (
        <div className="asset-bulk-toolbar" role="region" aria-label="Массовые действия">
          <div className="asset-bulk-summary">
            <strong>{selectedAssetIds.length}</strong>
            <span>выбрано</span>
          </div>
          <StatusSelect
            className="asset-bulk-select"
            disabled={bulkSaving}
            onValueChange={applyBulkStatus}
            placeholder="Изменить статус"
          />
          <Select disabled={bulkSaving} onValueChange={(value) => applyBulkCategory(value)}>
            <SelectTrigger className="asset-bulk-select">
              <SelectValue placeholder="Переместить в категорию" />
            </SelectTrigger>
            <SelectContent>
              {categoryChoices.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={bulkSaving}
            onClick={() => createWorkOrderFromAssets(selectedAssetIds)}
            size="sm"
            type="button"
          >
            <Plus size={14} />
            Создать задание
          </Button>
          <Button
            disabled={bulkSaving}
            onClick={() => createInspectionFromAssets(selectedAssetIds)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <UserRoundCheck size={14} />
            Создать обход
          </Button>
          <Button
            disabled={bulkSaving}
            onClick={() => setSelectedAssetIds([])}
            size="sm"
            type="button"
            variant="ghost"
          >
            Снять выбор
          </Button>
        </div>
      )}

      <div className="asset-table">
        <div className="asset-table-head">
          <label className="asset-checkbox-cell" aria-label="Выбрать все видимые узлы">
            <input
              checked={allVisibleSelected}
              data-indeterminate={hasPartialVisibleSelection || undefined}
              onChange={toggleAllVisible}
              type="checkbox"
            />
          </label>
          <span>Узел</span>
          <span>Комната</span>
          <span>Тип</span>
          <span>Статус</span>
          <span>Действия</span>
        </div>
        {filteredAssets.map((asset) => (
          <div
            className={`asset-table-row${selectedAssetIds.includes(asset.id) ? " selected" : ""}`}
            key={asset.id}
          >
            <label className="asset-checkbox-cell" aria-label={`Выбрать ${asset.code}`}>
              <input
                checked={selectedAssetIds.includes(asset.id)}
                onChange={() => toggleAssetSelection(asset.id)}
                type="checkbox"
              />
            </label>
            <button className="asset-table-title" onClick={() => openAsset(asset.id)} type="button">
              <strong>{asset.code} · {asset.name}</strong>
              <span>{asset.photoNote}</span>
            </button>
            <span className="asset-table-muted">{roomName(asset.roomId)}</span>
            <span className="asset-table-muted">{assetKindLabels[assetKind(asset)]}</span>
            <StatusSelect
              className="asset-status-select w-full sm:w-[220px]"
              value={asset.status}
              onValueChange={(status) => setAssetStatus(asset.id, status)}
            />
            <div className="asset-table-actions">
              <Button
                aria-label={`Редактировать ${asset.code}`}
                onClick={() => editAsset(asset.id)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Pencil size={14} />
              </Button>
            </div>
          </div>
        ))}
        {!filteredAssets.length && (
          <div className="asset-table-empty">
            В этой группе пока нет узлов. Когда добавим реальные точки с плана, они появятся здесь.
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsView({
  config,
  setConfig,
}: {
  config: AppConfig;
  setConfig: (config: Partial<AppConfig>) => void;
}) {
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: draft.apartmentName,
        address: draft.address,
        usageMode: draft.usageMode,
        currency: draft.currency,
        timezone: draft.timezone,
        locale: draft.locale,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      config?: Partial<AppConfig>;
      error?: string;
    };
    if (!response.ok || !payload.config) {
      setError(payload.error ?? "Не удалось сохранить настройки.");
    } else {
      const nextConfig = { ...draft, ...payload.config };
      setDraft(nextConfig);
      setConfig(nextConfig);
      setMessage("Изменения сохранены.");
    }
    setSaving(false);
  }

  const hasChanges =
    draft.apartmentName !== config.apartmentName ||
    draft.address !== config.address ||
    draft.usageMode !== config.usageMode ||
    draft.currency !== config.currency ||
    draft.timezone !== config.timezone ||
    draft.locale !== config.locale;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Объект</CardTitle>
          <CardDescription>
            Основные данные квартиры и параметры, которые используются в счетах, документах и уведомлениях.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-5" onSubmit={saveSettings}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2" htmlFor="apartment-name">
                <span className="text-sm font-medium">Название объекта</span>
                <Input
                  id="apartment-name"
                  value={draft.apartmentName}
                  onChange={(event) => {
                    const apartmentName = event.currentTarget.value;
                    setDraft((current) => ({ ...current, apartmentName }));
                  }}
                  placeholder="Например, Квартира на Шпалерной"
                />
              </label>
              <label className="grid gap-2" htmlFor="apartment-address">
                <span className="text-sm font-medium">Адрес</span>
                <Input
                  id="apartment-address"
                  value={draft.address}
                  onChange={(event) => {
                    const address = event.currentTarget.value;
                    setDraft((current) => ({ ...current, address }));
                  }}
                  placeholder="Например, Шпалерная, 34Б"
                />
              </label>
              <label className="grid gap-2" htmlFor="usage-mode">
                <span className="text-sm font-medium">Как используется квартира</span>
                <Select value={draft.usageMode} onValueChange={(value: AppConfig["usageMode"]) => setDraft((current) => ({ ...current, usageMode: value }))}>
                  <SelectTrigger className="w-full" id="usage-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="living">Живу сам</SelectItem>
                    <SelectItem value="rented">Сдаю</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-2" htmlFor="currency">
                <span className="text-sm font-medium">Валюта</span>
                <Select value={draft.currency} onValueChange={(value: AppConfig["currency"]) => setDraft((current) => ({ ...current, currency: value }))}>
                  <SelectTrigger className="w-full" id="currency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RUB">Российский рубль (₽)</SelectItem>
                    <SelectItem value="EUR">Евро (€)</SelectItem>
                    <SelectItem value="USD">Доллар США ($)</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-2" htmlFor="timezone">
                <span className="text-sm font-medium">Часовой пояс</span>
                <Select value={draft.timezone} onValueChange={(timezone) => setDraft((current) => ({ ...current, timezone }))}>
                  <SelectTrigger className="w-full" id="timezone"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Europe/Moscow">Москва</SelectItem>
                    <SelectItem value="Europe/Madrid">Мадрид</SelectItem>
                    <SelectItem value="Europe/Berlin">Берлин</SelectItem>
                    <SelectItem value="Asia/Dubai">Дубай</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-2" htmlFor="locale">
                <span className="text-sm font-medium">Язык интерфейса и бота</span>
                <Select value={draft.locale} onValueChange={(locale: AppConfig["locale"]) => setDraft((current) => ({ ...current, locale }))}>
                  <SelectTrigger className="w-full" id="locale"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ru">Русский</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
            {error && <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-sm">{error}</div>}
            {message && <div className="rounded-lg bg-muted p-3 text-sm">{message}</div>}
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              <Button disabled={!hasChanges || saving} onClick={() => { setDraft(config); setError(""); setMessage(""); }} type="button" variant="secondary">Отменить</Button>
              <Button disabled={!hasChanges || saving || !draft.apartmentName.trim() || !draft.address.trim()} type="submit"><Save size={16} />{saving ? "Сохраняем…" : "Сохранить изменения"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <TelegramSettings />
    </div>
  );
}

type TelegramConnection = {
  telegramUserId: string;
  displayName: string;
  username?: string;
  active: boolean;
  createdAt: string;
};

function TelegramSettings() {
  const [accounts, setAccounts] = useState<TelegramConnection[]>([]);
  const [pairingLink, setPairingLink] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/telegram/pairing", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { accounts?: TelegramConnection[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить подключения.");
        if (!cancelled) setAccounts(payload.accounts ?? []);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить подключения.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function createPairingLink() {
    setSaving(true);
    setError("");
    const response = await fetch("/api/telegram/pairing", { method: "POST" });
    const payload = (await response.json().catch(() => ({}))) as { link?: string; code?: string; expiresAt?: string; error?: string };
    if (!response.ok) setError(payload.error ?? "Не удалось создать ссылку.");
    else if (!payload.link) setError("Укажите TELEGRAM_BOT_USERNAME в настройках окружения.");
    else {
      setPairingLink(payload.link);
      setExpiresAt(payload.expiresAt ?? "");
    }
    setSaving(false);
  }

  async function disconnect(account: TelegramConnection) {
    setError("");
    const response = await fetch("/api/telegram/pairing", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ telegramUserId: account.telegramUserId }) });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) setError(payload.error ?? "Не удалось отключить аккаунт.");
    else setAccounts((current) => current.filter((item) => item.telegramUserId !== account.telegramUserId));
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bot size={18} />Telegram-ассистент</CardTitle>
        <CardDescription>Личный бот владельца для управления квартирой текстом и голосом.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div><Button disabled={saving} onClick={() => void createPairingLink()} type="button"><Bot size={16} />Подключить мой Telegram</Button></div>

        {pairingLink && (
          <div className="grid gap-2 rounded-lg bg-muted p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0"><strong className="block text-sm">Безопасная ссылка для подключения вашего аккаунта</strong><span className="block truncate text-muted-foreground text-sm">Действует до {new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(expiresAt))}</span></div>
            <div className="flex gap-2">
              <Button aria-label="Копировать ссылку" onClick={() => void navigator.clipboard.writeText(pairingLink)} size="icon" type="button" variant="secondary"><Copy size={16} /></Button>
              <Button asChild><a href={pairingLink} rel="noreferrer" target="_blank"><ExternalLink size={16} />Открыть Telegram</a></Button>
            </div>
          </div>
        )}

        {error && <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-sm">{error}</div>}
        <div className="grid divide-y rounded-lg border">
          {accounts.map((account) => (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3" key={account.telegramUserId}>
              <div className="grid gap-0.5"><strong className="text-sm">{account.displayName || account.username || `Telegram ${account.telegramUserId}`}</strong><span className="text-muted-foreground text-sm">Владелец{account.username ? ` · @${account.username}` : ""}</span></div>
              <Button aria-label={`Отключить ${account.displayName}`} onClick={() => void disconnect(account)} size="icon-sm" type="button" variant="ghost"><Unplug size={15} /></Button>
            </div>
          ))}
          {!loading && accounts.length === 0 && <div className="p-3 text-muted-foreground text-sm">Telegram пока не подключён.</div>}
          {loading && <div className="p-3 text-muted-foreground text-sm">Проверяем подключения…</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function AssetDetail({
  asset,
  events,
  media,
  newEventText,
  setNewEventText,
  addEvent,
  updateEvent,
  deleteEvent,
  setAssetStatus,
  editAsset,
  createWorkOrder,
  returnLabel,
  goBack,
}: {
  asset: Asset;
  events: AssetEvent[];
  media: AssetMedia[];
  newEventText: string;
  setNewEventText: (value: string) => void;
  addEvent: (
    assetId: string,
    patch?: Partial<AssetEvent>,
    files?: PromptInputMessage["files"],
  ) => void;
  updateEvent: (
    assetId: string,
    eventId: string,
    patch: Pick<AssetEvent, "title" | "body">,
  ) => Promise<boolean>;
  deleteEvent: (assetId: string, eventId: string) => Promise<boolean>;
  setAssetStatus: (assetId: string, status: Status, body?: string) => void;
  editAsset: () => void;
  createWorkOrder: () => void;
  returnLabel: string;
  goBack: () => void;
}) {
  const assetMedia = media.filter((item) => item.assetId === asset.id);
  const documentEventIds = new Set(events.filter(isDocumentEvent).map((event) => event.id));
  const isDocumentMedia = (item: AssetMedia) => item.documentType !== undefined || !isImageMedia(item) || documentEventIds.has(item.eventId ?? "");
  const assetImages = assetMedia.filter((item) => isImageMedia(item) && !isDocumentMedia(item));
  const assetDocuments = assetMedia.filter(isDocumentMedia);
  const [documentNote, setDocumentNote] = useState("");
  const [documentType, setDocumentType] = useState<DocumentTypeId>("passport");
  const [documentIssuedAt, setDocumentIssuedAt] = useState("");
  const [documentValidUntil, setDocumentValidUntil] = useState("");
  const mediaEvents = events.filter((event) => event.photo || assetMedia.some((item) => item.eventId === event.id));
  const historyContent = (
    <ScrollArea className="h-[520px] pr-4 max-[980px]:h-auto max-[980px]:pr-0">
      <div className="space-y-5">
        {events.map((event) => {
          const eventMedia = mediaForEvent(event, assetMedia);

          return (
            <EditableEventTask
              assetId={asset.id}
              deleteEvent={deleteEvent}
              event={event}
              key={event.id}
              media={eventMedia}
              updateEvent={updateEvent}
            />
          );
        })}
      </div>
    </ScrollArea>
  );
  const passportContent = (
    <dl className="grid grid-cols-[128px_1fr] gap-x-3 gap-y-2 text-sm">
      <dt className="text-muted-foreground">Номер</dt><dd className="font-medium">{asset.code}</dd>
      <dt className="text-muted-foreground">Комната</dt><dd className="font-medium">{roomName(asset.roomId)}</dd>
      <dt className="text-muted-foreground">Категория</dt><dd className="font-medium">{categoryLabel(asset.category)}</dd>
      <dt className="text-muted-foreground">Тип</dt><dd className="font-medium">{assetKindLabels[assetKind(asset)]}</dd>
      <dt className="text-muted-foreground">Производитель</dt><dd className="font-medium">{asset.manufacturer || "не указан"}</dd>
      <dt className="text-muted-foreground">Модель</dt><dd className="font-medium">{asset.model || "не указана"}</dd>
      <dt className="text-muted-foreground">Серийный номер</dt><dd className="font-medium">{asset.serialNumber || "не указан"}</dd>
      <dt className="text-muted-foreground">Покупка / установка</dt><dd className="font-medium">{asset.installedAt || "не указана"}</dd>
      <dt className="text-muted-foreground">Стоимость</dt>
      <dd className="font-medium">
        {asset.purchaseCost === undefined
          ? "не указана"
          : `${asset.purchaseCost.toLocaleString("ru-RU")} ₽`}
      </dd>
      <dt className="text-muted-foreground">Последняя проверка</dt><dd className="font-medium">{asset.lastChecked}</dd>
      <dt className="text-muted-foreground">Гарантия</dt><dd className="font-medium">{asset.warrantyUntil ?? "не указана"}</dd>
      <dt className="text-muted-foreground">Мастер</dt><dd className="font-medium">{asset.master ?? "не назначен"}</dd>
    </dl>
  );
  const mediaContent = assetImages.length || mediaEvents.length ? (
    <MediaGallery
      fallbackEvents={mediaEvents.filter((event) => event.photo)}
      items={assetImages}
      variant="grid"
    />
  ) : (
    <p className="text-muted-foreground text-sm">
      Фотографии появятся после события с вложением.
    </p>
  );
  const documentContent = (
    <div className="grid gap-4">
      {assetDocuments.length ? (
        <DocumentList events={events} items={assetDocuments} />
      ) : (
        <p className="m-0 text-muted-foreground text-sm">
          Документы появятся после загрузки инструкции, чека, гарантии или акта.
        </p>
      )}
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Тип документа</span>
        <Select value={documentType} onValueChange={(value) => setDocumentType(value as DocumentTypeId)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Выберите тип" />
          </SelectTrigger>
          <SelectContent>
            {documentTypes.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium" htmlFor={`${asset.id}-document-issued-at`}>
          Дата документа
          <Input
            id={`${asset.id}-document-issued-at`}
            type="date"
            value={documentIssuedAt}
            onChange={(event) => setDocumentIssuedAt(event.currentTarget.value)}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor={`${asset.id}-document-valid-until`}>
          Действует до
          <Input
            id={`${asset.id}-document-valid-until`}
            type="date"
            value={documentValidUntil}
            onChange={(event) => setDocumentValidUntil(event.currentTarget.value)}
          />
        </label>
      </div>
      <PromptInput
        accept="application/pdf,image/*,text/*,.doc,.docx,.xls,.xlsx"
        className="w-full"
        onSubmit={(message: PromptInputMessage) => {
          const text = message.text.trim() || documentNote.trim();
          if (message.files.length === 0) return;
          void addEvent(asset.id, {
            type: "comment",
            title: documentTitle(documentType),
            body: buildDocumentBody({
              defaultBody: "Добавлен документ к паспорту узла.",
              issuedAt: documentIssuedAt,
              note: text,
              validUntil: documentValidUntil,
            }),
            photo: undefined,
          }, message.files);
          setDocumentNote("");
          setDocumentIssuedAt("");
          setDocumentValidUntil("");
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            placeholder="Комментарий к документу"
            value={documentNote}
            onChange={(event) => setDocumentNote(event.currentTarget.value)}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments label="Прикрепить файл" />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
          </PromptInputTools>
          <PromptInputSubmit aria-label="Добавить документ" />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
  const commentContent = (
    <PromptInput
      className="w-full"
      onSubmit={(message: PromptInputMessage) => {
        const text = message.text.trim() || newEventText.trim();
        if (!text && message.files.length === 0) return;
        void addEvent(asset.id, {
          type: message.files.length ? "photo" : "comment",
          title: message.files.length ? "Фотофиксация" : "Комментарий",
          body: text || "Добавлены фотографии без комментария.",
          photo: message.files.length
            ? { label: "фото", note: message.files[0]?.filename ?? "Вложение" }
            : undefined,
        }, message.files);
      }}
    >
      <PromptInputBody>
        <PromptInputTextarea
          placeholder="Комментарий по узлу"
          value={newEventText}
          onChange={(event) => setNewEventText(event.currentTarget.value)}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger />
            <PromptInputActionMenuContent>
              <PromptInputActionAddAttachments label="Прикрепить фото" />
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
        </PromptInputTools>
        <PromptInputSubmit aria-label="Отправить комментарий" />
      </PromptInputFooter>
    </PromptInput>
  );

  return (
    <div className="grid grid-cols-[minmax(560px,1fr)_384px] gap-6 max-[980px]:grid-cols-1">
      <Card className="col-span-full">
        <CardHeader className="grid-cols-[1fr_auto] gap-4 max-[720px]:grid-cols-1">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              {asset.status === "ok" ? <Check size={16} /> : <CircleAlert size={16} />}
            </div>
            <div className="min-w-0 space-y-2">
              <div>
                <CardTitle className="text-xl">{asset.code} · {asset.name}</CardTitle>
                <CardDescription>
                  {roomName(asset.roomId)} · {categoryLabel(asset.category)} · {assetKindLabels[assetKind(asset)]}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusSelect
                  className="w-full sm:w-[260px]"
                  value={asset.status}
                  onValueChange={(status) =>
                    setAssetStatus(
                      asset.id,
                      status,
                      `Текущий статус изменен на «${statusLabels[status]}».`,
                    )
                  }
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 max-[720px]:justify-start">
            <Button variant="secondary" onClick={goBack} type="button">
              <ArrowLeft size={16} />
              {returnLabel}
            </Button>
            <Button variant="secondary" onClick={editAsset} type="button">
              <Pencil size={16} />
              Редактировать
            </Button>
            <Button onClick={createWorkOrder} type="button">
              <Plus size={16} />
              Создать задание
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card className="hidden max-[980px]:block">
        <CardHeader>
          <CardTitle>Быстрый комментарий</CardTitle>
          <CardDescription>
            Комментарий и фото сразу попадут в историю этого узла.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {commentContent}
        </CardContent>
      </Card>

      <Card className="max-[980px]:hidden">
        <CardHeader>
          <CardTitle>История узла</CardTitle>
          <CardDescription>
            Комментарии, смены статуса, работы мастеров и фотографии собраны в одной ленте.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyContent}
        </CardContent>
      </Card>

      <aside className="grid content-start gap-4 max-[980px]:hidden">
        <Tabs defaultValue="passport">
          <Card>
            <CardHeader>
              <TabsList aria-label="Данные узла" className="grid w-full grid-cols-3">
                <TabsTrigger value="passport">
              Паспорт
                </TabsTrigger>
                <TabsTrigger value="media">
              Медиа
                </TabsTrigger>
                <TabsTrigger value="documents">
              Документы
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="passport" className="mt-0">
                {passportContent}
                <Button className="mt-4 w-full" onClick={editAsset} type="button" variant="secondary">
                  <Pencil size={16} />
                  Редактировать паспорт
                </Button>
              </TabsContent>
              <TabsContent value="media" className="mt-0">
                {mediaContent}
              </TabsContent>
              <TabsContent value="documents" className="mt-0">
                {documentContent}
              </TabsContent>
            </CardContent>
          </Card>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle>Быстрый комментарий</CardTitle>
            <CardDescription>
              Текст и вложения попадут в новое событие истории.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {commentContent}
          </CardContent>
        </Card>
      </aside>

      <Card className="hidden max-[980px]:block">
        <Tabs defaultValue="history">
          <CardHeader className="gap-3">
            <TabsList aria-label="Разделы карточки узла" className="grid w-full grid-cols-4">
              <TabsTrigger value="history">История</TabsTrigger>
              <TabsTrigger value="passport">Паспорт</TabsTrigger>
              <TabsTrigger value="media">Медиа</TabsTrigger>
              <TabsTrigger value="documents">Документы</TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent>
            <TabsContent value="history" className="mt-0">
              {historyContent}
            </TabsContent>
            <TabsContent value="passport" className="mt-0">
              {passportContent}
              <Button className="mt-4 w-full" onClick={editAsset} type="button" variant="secondary">
                <Pencil size={16} />
                Редактировать паспорт
              </Button>
            </TabsContent>
            <TabsContent value="media" className="mt-0">
              {mediaContent}
            </TabsContent>
            <TabsContent value="documents" className="mt-0">
              {documentContent}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}

function EditableEventTask({
  asset,
  assetId,
  deleteEvent,
  event,
  media,
  onOpen,
  updateEvent,
}: {
  asset?: Asset;
  assetId: string;
  deleteEvent: (assetId: string, eventId: string) => Promise<boolean>;
  event: AssetEvent;
  media: AssetMedia[];
  onOpen?: () => void;
  updateEvent: (
    assetId: string,
    eventId: string,
    patch: Pick<AssetEvent, "title" | "body">,
  ) => Promise<boolean>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(event.title);
  const [draftBody, setDraftBody] = useState(event.body);
  const [isSaving, setIsSaving] = useState(false);
  const documentMedia = isDocumentEvent(event) ? media : media.filter((item) => !isImageMedia(item));

  async function saveEvent() {
    setIsSaving(true);
    const ok = await updateEvent(assetId, event.id, {
      title: draftTitle,
      body: draftBody,
    });
    setIsSaving(false);
    if (ok) setIsEditing(false);
  }

  function cancelEdit() {
    setDraftTitle(event.title);
    setDraftBody(event.body);
    setIsEditing(false);
  }

  return (
    <Task defaultOpen>
      <TaskTrigger title={`${event.date} · ${event.title}`}>
        <div className="event-task-trigger">
          <button className="group flex min-w-0 flex-1 items-start gap-3 text-left" type="button">
            <span className="mt-1.5 size-2.5 rounded-full bg-primary" />
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="text-muted-foreground text-sm">
                {event.date}
                {asset ? ` · ${asset.code} · ${roomName(asset.roomId)}` : ` · ${eventLabels[event.type]}`}
              </span>
              <span className="font-medium text-base leading-snug">{event.title}</span>
            </span>
          </button>
          <div className="event-task-actions">
            <Button
              aria-label={`Редактировать ${event.title}`}
              onClick={(actionEvent) => {
                actionEvent.stopPropagation();
                setIsEditing(true);
              }}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Pencil size={14} />
            </Button>
            <Button
              aria-label={`Удалить ${event.title}`}
              onClick={(actionEvent) => {
                actionEvent.stopPropagation();
                void deleteEvent(assetId, event.id);
              }}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      </TaskTrigger>
      <TaskContent>
        {isEditing ? (
          <div className="event-edit-form">
            <Input
              aria-label="Название события"
              onChange={(inputEvent) => setDraftTitle(inputEvent.currentTarget.value)}
              value={draftTitle}
            />
            <Textarea
              aria-label="Комментарий события"
              onChange={(inputEvent) => setDraftBody(inputEvent.currentTarget.value)}
              value={draftBody}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button disabled={isSaving} onClick={cancelEdit} type="button" variant="secondary">
                Отменить
              </Button>
              <Button disabled={isSaving} onClick={() => void saveEvent()} type="button">
                {isSaving ? "Сохраняю" : "Сохранить"}
              </Button>
            </div>
          </div>
        ) : (
          <TaskItem>{event.body}</TaskItem>
        )}
        {(event.cost || event.master || event.statusAfter) && (
          <div className="flex flex-wrap gap-2">
            {event.master && <TaskItemFile>Мастер: {event.master}</TaskItemFile>}
            {event.cost && (
              <TaskItemFile>
                Стоимость: {event.cost.toLocaleString("ru-RU")} руб.
              </TaskItemFile>
            )}
            {event.statusAfter && (
              <TaskItemFile>{statusLabels[event.statusAfter]}</TaskItemFile>
            )}
          </div>
        )}
        <MediaGallery fallbackEvent={event.photo ? event : undefined} items={media} variant="list" />
        <DocumentList items={documentMedia} />
        {onOpen && (
          <Button className="mt-1" variant="ghost" size="sm" onClick={onOpen} type="button">
            Открыть узел
          </Button>
        )}
      </TaskContent>
    </Task>
  );
}

function mediaForEvent(event: AssetEvent, media: AssetMedia[]) {
  const directMedia = media.filter((item) => item.eventId === event.id);
  if (directMedia.length) return directMedia;

  if (event.inspectionId) {
    return media.filter((item) => item.inspectionId === event.inspectionId);
  }

  return [];
}

function isImageMedia(media: Pick<AssetMedia, "mediaType">) {
  return media.mediaType.startsWith("image/");
}

function isDocumentEvent(event: Pick<AssetEvent, "title">) {
  return event.title === "Документ" || event.title.startsWith("Документ:");
}

function documentTypeLabel(type: DocumentTypeId) {
  return documentTypes.find((item) => item.id === type)?.label ?? "Прочее";
}

function documentTypeFromEvent(event?: Pick<AssetEvent, "title">): DocumentTypeId {
  const label = event?.title.match(/^Документ:\s*(.+)$/)?.[1]?.trim();
  return documentTypes.find((item) => item.label === label)?.id ?? "other";
}

function documentTitle(type: DocumentTypeId) {
  return `Документ: ${documentTypeLabel(type)}`;
}

function formatDateInput(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

function dateInputFromFormatted(value?: string) {
  const match = value?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseFormattedDate(value?: string) {
  const match = value?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return undefined;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function buildDocumentBody({
  defaultBody,
  issuedAt,
  note,
  validUntil,
}: {
  defaultBody: string;
  issuedAt?: string;
  note?: string;
  validUntil?: string;
}) {
  const meta = [
    issuedAt ? `Дата документа: ${formatDateInput(issuedAt)}` : "",
    validUntil ? `Действует до: ${formatDateInput(validUntil)}` : "",
  ].filter(Boolean);
  return [...meta, note || defaultBody].join(meta.length ? "\n\n" : "");
}

function documentMetaFromEvent(event?: Pick<AssetEvent, "body">) {
  return {
    issuedAt: event?.body.match(/Дата документа:\s*([0-9.]+)/)?.[1],
    validUntil: event?.body.match(/Действует до:\s*([0-9.]+)/)?.[1],
  };
}

function documentNoteFromEvent(event?: Pick<AssetEvent, "body">) {
  return (event?.body ?? "")
    .split("\n")
    .filter((line) => !line.startsWith("Дата документа:") && !line.startsWith("Действует до:"))
    .join("\n")
    .trim();
}

function documentValidityTone(validUntil?: string) {
  const date = parseFormattedDate(validUntil);
  if (!date) return undefined;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 30) return "soon";
  return "active";
}

function documentValidityLabel(validUntil?: string) {
  const tone = documentValidityTone(validUntil);
  if (tone === "expired") return "Просрочен";
  if (tone === "soon") return "Скоро истекает";
  if (tone === "active") return "Действует";
  return undefined;
}

function documentExpiryTime(validUntil?: string) {
  return parseFormattedDate(validUntil)?.getTime() ?? Number.POSITIVE_INFINITY;
}

function mediaPhotoData(media: AssetMedia): AttachmentData {
  return {
    filename: media.caption ?? media.filename,
    id: media.id,
    mediaType: media.mediaType,
    type: "file",
    url: media.url,
  };
}

function eventPhotoData(event: AssetEvent): AttachmentData {
  return {
    filename: `${event.date} · ${event.photo?.note ?? "Фото узла"}`,
    id: event.id,
    mediaType: "image/png",
    type: "file",
    url: "/plan/base.png",
  };
}

type GalleryPhoto = AttachmentData & {
  caption?: string;
  imageUrl: string;
};

function mediaGalleryPhoto(media: AssetMedia): GalleryPhoto {
  return {
    ...mediaPhotoData(media),
    caption: media.caption ?? media.filename,
    imageUrl: media.url,
  };
}

function eventGalleryPhoto(event: AssetEvent): GalleryPhoto {
  return {
    ...eventPhotoData(event),
    caption: event.photo?.note ?? event.title,
    imageUrl: "/plan/base.png",
  };
}

function MediaGallery({
  fallbackEvent,
  fallbackEvents = [],
  items,
  variant = "grid",
}: {
  fallbackEvent?: AssetEvent;
  fallbackEvents?: AssetEvent[];
  items: AssetMedia[];
  variant?: "grid" | "list";
}) {
  const fallback = fallbackEvent ? [fallbackEvent] : fallbackEvents;
  const imageItems = items.filter(isImageMedia);
  const photos = [
    ...imageItems.map(mediaGalleryPhoto),
    ...(imageItems.length ? [] : fallback.map(eventGalleryPhoto)),
  ];
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activePhoto = activeIndex === null ? null : photos[activeIndex];
  const currentPhotoNumber = activeIndex === null ? 0 : activeIndex + 1;
  const hasManyPhotos = photos.length > 1;
  const activeSlideIndex = activeIndex ?? 0;
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!activePhoto) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveIndex(null);
      }
      if (event.key === "ArrowLeft" && hasManyPhotos) {
        setActiveIndex((current) => {
          if (current === null) return null;
          return current === 0 ? photos.length - 1 : current - 1;
        });
      }
      if (event.key === "ArrowRight" && hasManyPhotos) {
        setActiveIndex((current) => {
          if (current === null) return null;
          return current === photos.length - 1 ? 0 : current + 1;
        });
      }
    };

    document.body.classList.add("media-lightbox-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("media-lightbox-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePhoto, hasManyPhotos, photos.length]);

  if (!photos.length) {
    return null;
  }

  function showPrevious() {
    setActiveIndex((current) => {
      if (current === null) return null;
      return current === 0 ? photos.length - 1 : current - 1;
    });
  }

  function showNext() {
    setActiveIndex((current) => {
      if (current === null) return null;
      return current === photos.length - 1 ? 0 : current + 1;
    });
  }

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;

    if (!start || !touch || !hasManyPhotos) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    if (deltaX < 0) {
      showNext();
    } else {
      showPrevious();
    }
  }

  return (
    <>
      <div className={`media-gallery ${variant}`}>
        {photos.map((photo, index) => (
          <button
            aria-label={`Открыть фото ${index + 1} из ${photos.length}`}
            className="media-gallery-item"
            key={photo.id}
            onClick={() => setActiveIndex(index)}
            type="button"
          >
            <span className="media-gallery-preview">
              <img alt={photo.filename} src={photo.imageUrl} />
            </span>
            {variant === "list" && (
              <span className="media-gallery-info">
                <span>{photo.filename}</span>
                {photo.caption && <small>{photo.caption}</small>}
              </span>
            )}
          </button>
        ))}
      </div>

      {activePhoto && (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр фото"
        >
          <div className="media-lightbox-top">
            <div>
              <strong>{activePhoto.filename}</strong>
              {activePhoto.caption && <span>{activePhoto.caption}</span>}
            </div>
            <Button
              aria-label="Закрыть галерею"
              onClick={() => setActiveIndex(null)}
              size="icon-sm"
              type="button"
              variant="secondary"
            >
              <X size={16} />
            </Button>
          </div>
          <div
            className="media-lightbox-stage"
            onTouchCancel={() => { touchStart.current = null; }}
            onTouchEnd={handleTouchEnd}
            onTouchStart={handleTouchStart}
          >
            {hasManyPhotos && (
              <Button
                aria-label="Предыдущее фото"
                className="media-lightbox-nav previous"
                onClick={showPrevious}
                size="icon"
                type="button"
                variant="secondary"
              >
                <ChevronLeft size={20} />
              </Button>
            )}
            <div
              className="media-lightbox-track"
              style={{ transform: `translateX(-${activeSlideIndex * 100}%)` }}
            >
              {photos.map((photo) => (
                <div className="media-lightbox-slide" key={photo.id}>
                  <img alt={photo.filename} src={photo.imageUrl} />
                </div>
              ))}
            </div>
            {hasManyPhotos && (
              <Button
                aria-label="Следующее фото"
                className="media-lightbox-nav next"
                onClick={showNext}
                size="icon"
                type="button"
                variant="secondary"
              >
                <ChevronRight size={20} />
              </Button>
            )}
          </div>
          <div className="media-lightbox-footer">
            {hasManyPhotos && (
              <div className="media-lightbox-count">
                {currentPhotoNumber} из {photos.length}
              </div>
            )}
            {hasManyPhotos && (
              <div className="media-lightbox-thumbnails" aria-label="Все фото">
                {photos.map((photo, index) => (
                  <button
                    aria-label={`Показать фото ${index + 1}`}
                    aria-current={index === activeIndex}
                    key={photo.id}
                    onClick={() => setActiveIndex(index)}
                    type="button"
                  >
                    <img alt={photo.filename} src={photo.imageUrl} />
                  </button>
                ))}
              </div>
            )}
            {!hasManyPhotos && (
              <div className="media-lightbox-count">
              {currentPhotoNumber} из {photos.length}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function DocumentList({ events = [], items }: { events?: AssetEvent[]; items: AssetMedia[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="grid gap-2">
      {items.map((document) => {
        const event = events.find((item) => item.id === document.eventId);
        const meta = documentMetaFromEvent(event);
        const type = documentTypeFromEvent(event);
        const validityLabel = documentValidityLabel(meta.validUntil);
        const validityTone = documentValidityTone(meta.validUntil);

        return (
          <a
            className="flex min-w-0 items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm transition-colors hover:bg-secondary"
            href={document.url}
            key={document.id}
            rel="noreferrer"
            target="_blank"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <FileText size={16} />
            </span>
            <span className="grid min-w-0 gap-0.5">
              <strong className="truncate font-medium">{document.caption ?? document.filename}</strong>
              <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <Badge variant="outline">{documentTypeLabel(type)}</Badge>
                {meta.validUntil && (
                  <Badge variant={validityTone === "expired" || validityTone === "soon" ? "destructive" : "secondary"}>
                    {validityLabel}: до {meta.validUntil}
                  </Badge>
                )}
                <span className="truncate">{document.mediaType}</span>
              </span>
            </span>
          </a>
        );
      })}
    </div>
  );
}

function UtilitiesView({
  bills,
  media,
  meters,
  readings,
  setBills,
  setMedia,
  setMeters,
  setReadings,
}: {
  bills: UtilityBill[];
  media: AssetMedia[];
  meters: UtilityMeter[];
  readings: UtilityReading[];
  setBills: (bills: UtilityBill[]) => void;
  setMedia: (media: AssetMedia[]) => void;
  setMeters: (meters: UtilityMeter[]) => void;
  setReadings: (readings: UtilityReading[]) => void;
}) {
  const months = useMemo(() => buildUtilityMonths(bills, meters, readings), [bills, meters, readings]);
  const [selectedPeriod, setSelectedPeriod] = useState(months[0]?.period ?? "Сентябрь 2026");
  const selectedMonth = months.find((month) => month.period === selectedPeriod) ?? months[0];
  const selectedMonthIndex = Math.max(0, months.findIndex((month) => month.period === selectedMonth?.period));
  const selectedBills = selectedMonth?.bills ?? [];
  const selectedReadings = selectedMonth?.readings ?? [];
  const readingByMeter = new Map(selectedReadings.map((reading) => [reading.meterId, reading]));
  const [draft, setDraft] = useState<Omit<UtilityBill, "id">>(() =>
    emptyUtilityBillDraft(selectedMonth?.period ?? selectedPeriod),
  );
  const [showBillForm, setShowBillForm] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Omit<UtilityBill, "id"> | null>(null);
  const [editingMeterId, setEditingMeterId] = useState<string | null>(null);
  const [readingDraft, setReadingDraft] = useState({ value: "", note: "" });
  const [readingPhoto, setReadingPhoto] = useState<File | null>(null);
  const [billReceipt, setBillReceipt] = useState<File | null>(null);
  const [savingBill, setSavingBill] = useState(false);
  const [showMeterForm, setShowMeterForm] = useState(false);
  const [mobileMonthOpen, setMobileMonthOpen] = useState(false);
  const [meterDraft, setMeterDraft] = useState<UtilityMeterDraft>(() => emptyUtilityMeterDraft());
  const [savingMeter, setSavingMeter] = useState(false);
  const sortedBills = [...selectedBills].sort(
    (left, right) => documentExpiryTime(left.dueDate) - documentExpiryTime(right.dueDate),
  );
  const issuedTenantBills = bills.filter((bill) => bill.status !== "draft" && bill.tenantAmount > 0);
  const issuedTenantAmount = issuedTenantBills.reduce((sum, bill) => sum + bill.tenantAmount, 0);
  const receivedTenantAmount = issuedTenantBills
    .filter((bill) => bill.reimbursementStatus === "received")
    .reduce((sum, bill) => sum + bill.tenantAmount, 0);
  const pendingTenantAmount = issuedTenantBills
    .filter((bill) => bill.reimbursementStatus !== "received")
    .reduce((sum, bill) => sum + bill.tenantAmount, 0);
  const currentStatus = selectedMonth?.status ?? "not_issued";

  function selectPeriod(period: string) {
    setMobileMonthOpen((current) => period !== selectedPeriod || !current);
    setSelectedPeriod(period);
    setDraft((current) => ({ ...current, period }));
    setShowBillForm(false);
    setEditingBillId(null);
    setEditDraft(null);
    setEditingMeterId(null);
  }

  function startReading(meter: UtilityMeter, reading?: UtilityReading) {
    setEditingMeterId(meter.id);
    setReadingPhoto(null);
    setReadingDraft({
      value: reading ? String(reading.value) : "",
      note: reading?.note ?? "",
    });
  }

  async function saveReading(meter: UtilityMeter) {
    const value = Number(readingDraft.value.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      window.alert("Введите корректное показание.");
      return;
    }

    const existingReading = readingByMeter.get(meter.id);
    const nextReading: UtilityReading = {
      id: existingReading?.id ?? utilityReadingId(),
      meterId: meter.id,
      period: selectedMonth?.period ?? selectedPeriod,
      value,
      submittedAt: todayLabel(),
      source: "owner",
      note: readingDraft.note.trim() || undefined,
    };
    try {
      const formData = new FormData();
      formData.set("payload", JSON.stringify({ ...nextReading, meter }));
      if (readingPhoto) formData.set("photo", readingPhoto);
      const response = await fetch("/api/utility-readings", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reading?: UtilityReading;
        document?: AssetMedia;
        error?: string;
      };
      if (!response.ok || !payload.reading) throw new Error(payload.error ?? "Не удалось сохранить показание.");
      const savedReading = payload.reading;
      if (payload.document) {
        setMedia([payload.document, ...media.filter((item) => item.utilityReadingId !== savedReading.id)]);
      }
      setReadings([
        savedReading,
        ...readings.filter((reading) => reading.id !== savedReading.id),
      ]);
      setMeters(
        meters.map((item) =>
          item.id === meter.id
            ? { ...item, lastReading: savedReading.value, status: "submitted" }
            : item,
        ),
      );
      setEditingMeterId(null);
      setReadingDraft({ value: "", note: "" });
      setReadingPhoto(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Не удалось сохранить показание.");
    }
  }

  async function createMeter() {
    if (!meterDraft.label.trim()) {
      window.alert("Укажите название счетчика.");
      return;
    }
    setSavingMeter(true);
    try {
      const response = await fetch("/api/utility-meters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meterDraft),
      });
      const payload = (await response.json().catch(() => ({}))) as { meter?: UtilityMeter; error?: string };
      if (!response.ok || !payload.meter) throw new Error(payload.error ?? "Не удалось добавить счетчик.");
      setMeters([...meters, payload.meter]);
      setMeterDraft(emptyUtilityMeterDraft());
      setShowMeterForm(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Не удалось добавить счетчик.");
    } finally {
      setSavingMeter(false);
    }
  }

  async function deleteMeter(meter: UtilityMeter) {
    const confirmed = window.confirm(
      `Удалить счетчик «${meter.label}» и всю историю его показаний?`,
    );
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/utility-meters/${meter.id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as {
        deletedReadingIds?: string[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось удалить счетчик.");
      const deletedReadingIds = new Set(payload.deletedReadingIds ?? []);
      setMeters(meters.filter((item) => item.id !== meter.id));
      setReadings(readings.filter((reading) => reading.meterId !== meter.id));
      setMedia(media.filter((item) => !item.utilityReadingId || !deletedReadingIds.has(item.utilityReadingId)));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Не удалось удалить счетчик.");
    }
  }

  async function createBill() {
    const period = selectedMonth?.period ?? draft.period;
    if (!draft.service.trim() || !period.trim() || !Number.isFinite(draft.amount) || draft.amount <= 0) {
      window.alert("Укажите услугу, период и сумму больше нуля.");
      return;
    }
    setSavingBill(true);
    try {
      const formData = new FormData();
      formData.set("service", draft.service.trim());
      formData.set("period", period.trim());
      formData.set("amount", String(draft.amount));
      formData.set("dueDate", draft.dueDate);
      formData.set("status", "due");
      formData.set("note", draft.note?.trim() ?? "");
      formData.set("allocation", draft.allocation);
      formData.set("tenantAmount", String(draft.tenantAmount));
      if (billReceipt) formData.set("receipt", billReceipt);
      const response = await fetch("/api/utility-bills", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as { bill?: UtilityBill; document?: AssetMedia; error?: string };
      if (!response.ok || !payload.bill) throw new Error(payload.error ?? "Не удалось добавить счет.");
      setBills([payload.bill, ...bills]);
      if (payload.document) setMedia([payload.document, ...media]);
      setDraft(emptyUtilityBillDraft(period));
      setBillReceipt(null);
      setShowBillForm(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Не удалось добавить счет.");
    } finally {
      setSavingBill(false);
    }
  }

  function startEditBill(bill: UtilityBill) {
    setEditingBillId(bill.id);
    setEditDraft({
      service: bill.service,
      period: bill.period,
      amount: bill.amount,
      dueDate: bill.dueDate,
      paidAt: bill.paidAt,
      status: bill.status,
      receiptUrl: bill.receiptUrl,
      note: bill.note,
      allocation: bill.allocation,
      tenantAmount: bill.tenantAmount,
      reimbursementStatus: bill.reimbursementStatus,
      reimbursedAt: bill.reimbursedAt,
      source: bill.source,
      ownerConfirmedAt: bill.ownerConfirmedAt,
      publishedAt: bill.publishedAt,
      createdAt: bill.createdAt,
    });
  }

  async function saveBill() {
    if (!editingBillId || !editDraft) return;
    if (!editDraft.service.trim() || !editDraft.period.trim() || !Number.isFinite(editDraft.amount) || editDraft.amount <= 0) {
      window.alert("Укажите услугу, период и сумму больше нуля.");
      return;
    }
    const nextBill = {
      service: editDraft.service.trim(),
      period: editDraft.period.trim(),
      amount: editDraft.amount,
      dueDate: editDraft.dueDate,
      paidAt: editDraft.paidAt,
      status: editDraft.status,
      note: editDraft.note?.trim(),
      allocation: editDraft.allocation,
      tenantAmount: editDraft.tenantAmount,
      reimbursementStatus: editDraft.reimbursementStatus,
      reimbursedAt: editDraft.reimbursedAt,
      source: editDraft.source,
      ownerConfirmedAt: editDraft.ownerConfirmedAt,
      publishedAt: editDraft.publishedAt,
    };

    try {
      const response = await fetch(`/api/utility-bills/${editingBillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextBill),
      });
      const payload = (await response.json().catch(() => ({}))) as { bill?: UtilityBill; error?: string };
      if (!response.ok || !payload.bill) throw new Error(payload.error ?? "Не удалось сохранить счет.");
      setBills(bills.map((bill) => bill.id === editingBillId ? payload.bill! : bill));
      setEditingBillId(null);
      setEditDraft(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Не удалось сохранить счет.");
    }
  }

  async function deleteBill(billId: string) {
    const confirmed = window.confirm("Удалить этот счет?");
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/utility-bills/${billId}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось удалить счет.");
      setBills(bills.filter((bill) => bill.id !== billId));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Не удалось удалить счет.");
    }
  }

  async function markReimbursementReceived(billId: string) {
    const bill = bills.find((item) => item.id === billId);
    if (!bill || bill.tenantAmount <= 0) return;

    try {
      const response = await fetch(`/api/utility-bills/${billId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...bill,
          reimbursementStatus: "received",
          reimbursedAt: todayLabel(),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { bill?: UtilityBill; error?: string };
      if (!response.ok || !payload.bill) throw new Error(payload.error ?? "Не удалось подтвердить возмещение.");
      setBills(bills.map((item) => item.id === billId ? payload.bill! : item));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Не удалось подтвердить возмещение.");
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Выставлено жильцу" value={moneyLabel(issuedTenantAmount)} />
        <StatCard label="Получено от жильца" value={moneyLabel(receivedTenantAmount)} tone={receivedTenantAmount ? "positive" : undefined} />
        <StatCard label="Осталось получить" value={moneyLabel(pendingTenantAmount)} tone={pendingTenantAmount ? "warning" : undefined} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="max-xl:contents xl:sticky xl:top-4 xl:max-h-[calc(100dvh-12rem)] xl:self-start">
          <CardHeader className="max-xl:order-0 max-xl:rounded-lg max-xl:border max-xl:bg-card">
            <CardTitle>Коммуналка</CardTitle>
            <CardDescription>Месяцы, счета, счетчики и статусы передачи.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 max-xl:contents xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain">
            {months.map((month, index) => (
              <button
                className={`grid gap-1 rounded-lg border p-3 text-left transition hover:bg-muted ${
                  month.period === selectedMonth?.period ? "border-foreground bg-muted" : "bg-background"
                }`}
                key={month.period}
                onClick={() => selectPeriod(month.period)}
                style={{ order: index * 2 + 2 }}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <strong className="font-medium">{month.period}</strong>
                  <ChevronRight
                    className={`text-muted-foreground transition-transform xl:rotate-0 ${
                      mobileMonthOpen && month.period === selectedMonth?.period ? "rotate-90" : ""
                    }`}
                    size={16}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge className={utilityMonthToneClass(month.status)} variant={utilityMonthTone(month.status)}>
                    {utilityMonthStatusLabels[month.status]}
                  </Badge>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div
          className={`${mobileMonthOpen ? "grid" : "hidden"} content-start gap-4 self-start xl:col-start-2 xl:row-start-1 xl:grid`}
          style={{ order: selectedMonthIndex * 2 + 3 }}
        >
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Данные за {selectedMonth?.period}</CardTitle>
                  <CardDescription>
                    {utilityMonthStatusDescriptions[currentStatus]}
                  </CardDescription>
                </div>
                <Badge className={utilityMonthToneClass(currentStatus)} variant={utilityMonthTone(currentStatus)}>
                  {utilityMonthStatusLabels[currentStatus]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-muted-foreground text-sm">Выставлено жильцу</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {moneyLabel(selectedMonth?.issuedAmount ?? 0)}
                  </div>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-muted-foreground text-sm">Получено от жильца</div>
                  <div className="mt-1 text-2xl font-semibold">{moneyLabel(selectedMonth?.receivedAmount ?? 0)}</div>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-muted-foreground text-sm">Осталось получить</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {moneyLabel(selectedMonth?.reimbursementAmount ?? 0)}
                  </div>
                </div>
              </div>
              <div className="grid gap-2 border-t pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="font-medium">Начисления</strong>
                  <span className="text-muted-foreground text-sm">Осталось получить {moneyLabel(selectedMonth?.reimbursementAmount ?? 0)}</span>
                </div>
                {sortedBills.map((bill) => (
                  <div className="grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" key={bill.id}>
                    <div className="grid min-w-0 gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="font-medium">{bill.service}</strong>
                        {bill.tenantAmount > 0 && <Badge variant="outline">{utilityReimbursementStatusLabels[bill.reimbursementStatus]}</Badge>}
                      </div>
                      {bill.tenantAmount > 0 && <div className="text-sm">Выставлено жильцу: {moneyLabel(bill.tenantAmount)}</div>}
                      {bill.dueDate && <div className="text-muted-foreground text-sm">Оплатить до {bill.dueDate}</div>}
                      {bill.note && <div className="line-clamp-1 text-muted-foreground text-sm">{bill.note}</div>}
                      {bill.receiptUrl && <Button className="mt-1 w-fit" asChild size="sm" variant="secondary"><a href={bill.receiptUrl} rel="noreferrer" target="_blank"><ReceiptText size={14} />Квитанция</a></Button>}
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {bill.tenantAmount > 0 && bill.reimbursementStatus !== "received" && <Button onClick={() => void markReimbursementReceived(bill.id)} size="sm" type="button" variant="outline"><Check size={14} />Оплата получена</Button>}
                      <Button onClick={() => startEditBill(bill)} size="sm" type="button" variant="secondary"><Pencil size={14} />Редактировать</Button>
                      <Button onClick={() => deleteBill(bill.id)} size="icon-sm" type="button" variant="destructive"><Trash2 size={14} /><span className="sr-only">Удалить</span></Button>
                    </div>
                    {editingBillId === bill.id && editDraft && (
                      <div className="grid gap-3 rounded-lg bg-muted p-3 md:col-span-2">
                        <div className="grid gap-3 md:grid-cols-3">
                          <label className="grid gap-1.5 text-sm font-medium" htmlFor={`summary-${bill.id}-service`}>
                            Услуга
                            <Input id={`summary-${bill.id}-service`} value={editDraft.service} onChange={(event) => {
                              const service = event.currentTarget.value;
                              setEditDraft((current) => current ? { ...current, service } : current);
                            }} />
                          </label>
                          <label className="grid gap-1.5 text-sm font-medium" htmlFor={`summary-${bill.id}-amount`}>
                            Сумма
                            <Input id={`summary-${bill.id}-amount`} min="0.01" step="0.01" type="number" value={editDraft.amount} onChange={(event) => {
                              const amount = Number(event.currentTarget.value);
                              setEditDraft((current) => current ? { ...current, amount, tenantAmount: tenantShareFor(current.allocation, amount, current.tenantAmount) } : current);
                            }} />
                          </label>
                          <label className="grid gap-1.5 text-sm font-medium" htmlFor={`summary-${bill.id}-due-date`}>
                            Оплатить до
                            <Input id={`summary-${bill.id}-due-date`} type="date" value={dateInputFromFormatted(editDraft.dueDate)} onChange={(event) => {
                              const dueDate = formatDateInput(event.currentTarget.value);
                              setEditDraft((current) => current ? { ...current, dueDate } : current);
                            }} />
                          </label>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button onClick={() => { setEditingBillId(null); setEditDraft(null); }} size="sm" type="button" variant="secondary">Отменить</Button>
                          <Button onClick={saveBill} size="sm" type="button"><Save size={14} />Сохранить</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {!sortedBills.length && <div className="rounded-lg bg-muted p-4 text-muted-foreground text-sm">За этот месяц счетов пока нет.</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setShowBillForm(true)} type="button">
                  <ReceiptText size={16} />
                  Добавить счет
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Счетчики</CardTitle>
                  <CardDescription>Настройте реальные счетчики квартиры и сохраняйте показания по месяцам.</CardDescription>
                </div>
                <Button onClick={() => setShowMeterForm(true)} size="sm" type="button" variant="outline">
                  <Plus size={14} /> Добавить счетчик
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2">
              {showMeterForm && (
                <div className="grid gap-3 rounded-lg border bg-muted p-3">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="grid gap-1.5">
                      <span className="text-sm font-medium">Тип</span>
                      <Select
                        onValueChange={(value) => {
                          const service = value as UtilityServiceId;
                          setMeterDraft((current) => ({
                            ...current,
                            service,
                            label: utilityServiceLabels[service],
                            unit: utilityServiceUnits[service],
                          }));
                        }}
                        value={meterDraft.service}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(utilityServiceLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="grid gap-1.5 text-sm font-medium" htmlFor="new-meter-label">
                      Название
                      <Input
                        id="new-meter-label"
                        onChange={(event) => {
                          const label = event.currentTarget.value;
                          setMeterDraft((current) => ({ ...current, label }));
                        }}
                        value={meterDraft.label}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium" htmlFor="new-meter-serial">
                      Номер счетчика
                      <Input
                        id="new-meter-serial"
                        onChange={(event) => {
                          const serial = event.currentTarget.value;
                          setMeterDraft((current) => ({ ...current, serial }));
                        }}
                        placeholder="Необязательно"
                        value={meterDraft.serial}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium" htmlFor="new-meter-location">
                      Расположение
                      <Input
                        id="new-meter-location"
                        onChange={(event) => {
                          const location = event.currentTarget.value;
                          setMeterDraft((current) => ({ ...current, location }));
                        }}
                        placeholder="Например, прихожая"
                        value={meterDraft.location}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium" htmlFor="new-meter-unit">
                      Единица измерения
                      <Input
                        id="new-meter-unit"
                        onChange={(event) => {
                          const unit = event.currentTarget.value;
                          setMeterDraft((current) => ({ ...current, unit }));
                        }}
                        value={meterDraft.unit}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium" htmlFor="new-meter-reading">
                      Начальное показание
                      <Input
                        id="new-meter-reading"
                        inputMode="decimal"
                        min="0"
                        onChange={(event) => {
                          const lastReading = event.currentTarget.value;
                          setMeterDraft((current) => ({ ...current, lastReading }));
                        }}
                        placeholder="Необязательно"
                        type="number"
                        value={meterDraft.lastReading}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium" htmlFor="new-meter-rate">
                      Тариф, руб. за единицу
                      <Input
                        id="new-meter-rate"
                        inputMode="decimal"
                        min="0"
                        onChange={(event) => {
                          const currentRate = event.currentTarget.value;
                          setMeterDraft((current) => ({ ...current, currentRate }));
                        }}
                        placeholder="Необязательно"
                        type="number"
                        value={meterDraft.currentRate}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium" htmlFor="new-meter-due">
                      Передать до
                      <Input
                        id="new-meter-due"
                        onChange={(event) => {
                          const nextDue = formatDateInput(event.currentTarget.value);
                          setMeterDraft((current) => ({ ...current, nextDue }));
                        }}
                        type="date"
                        value={dateInputFromFormatted(meterDraft.nextDue)}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      onClick={() => {
                        setShowMeterForm(false);
                        setMeterDraft(emptyUtilityMeterDraft());
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Отмена
                    </Button>
                    <Button disabled={savingMeter} onClick={() => void createMeter()} size="sm" type="button">
                      <Save size={14} /> {savingMeter ? "Сохраняем..." : "Сохранить счетчик"}
                    </Button>
                  </div>
                </div>
              )}
              {meters.map((meter) => {
                const reading = readingByMeter.get(meter.id);
                const isEditingReading = editingMeterId === meter.id;
                return (
                  <div className="grid gap-3 rounded-lg border bg-background p-3" key={meter.id}>
                    <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:items-center">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                        {utilityMeterIcon(meter.service)}
                      </div>
                      <div className="grid min-w-0 gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="font-medium">{meter.label}</strong>
                          <Badge variant={reading ? "secondary" : meter.status === "overdue" ? "destructive" : "outline"}>
                            {reading ? "Передано" : utilityMeterStatusLabels[meter.status]}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground text-sm">
                          N{meter.serial} · {meter.location} · до {meter.nextDue}
                        </div>
                      </div>
                      <div className="text-left md:text-right">
                        <div className="font-medium">
                          {reading ? `${reading.value} ${meter.unit}` : meter.lastReading !== undefined ? `${meter.lastReading} ${meter.unit}` : "Нет данных"}
                        </div>
                        <div className="text-muted-foreground text-sm">
                          {reading ? `${utilityReadingSourceLabels[reading.source]} · ${reading.submittedAt}` : "Ожидаем показание"}
                        </div>
                        {reading?.consumption !== undefined && (
                          <div className="text-muted-foreground text-sm">
                            Расход {reading.consumption.toLocaleString("ru-RU")} {meter.unit}
                            {reading.calculatedAmount !== undefined
                              ? ` · ${moneyLabel(reading.calculatedAmount)} по тарифу ${reading.rate?.toLocaleString("ru-RU")} руб.`
                              : " · сумма не рассчитана, тариф не указан"}
                          </div>
                        )}
                        {reading?.photoUrl && (
                          <MediaGallery
                            items={media.filter((item) => item.utilityReadingId === reading.id)}
                            variant="list"
                          />
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <Button onClick={() => startReading(meter, reading)} size="sm" type="button" variant="outline">
                          {reading ? "Изменить" : "Передать показание"}
                        </Button>
                        <Button
                          aria-label={`Удалить счетчик ${meter.label}`}
                          onClick={() => void deleteMeter(meter)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                    {isEditingReading && (
                      <div className="grid gap-3 rounded-lg bg-muted p-3 md:grid-cols-2 md:items-end">
                        <label className="grid gap-1.5 text-sm font-medium" htmlFor={`reading-${meter.id}`}>
                          Показание, {meter.unit}
                          <Input
                            id={`reading-${meter.id}`}
                            inputMode="decimal"
                            min="0"
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setReadingDraft((current) => ({ ...current, value }));
                            }}
                            placeholder={meter.lastReading !== undefined ? String(meter.lastReading) : "0"}
                            type="number"
                            value={readingDraft.value}
                          />
                        </label>
                        <label className="grid gap-1.5 text-sm font-medium" htmlFor={`reading-${meter.id}-note`}>
                          Комментарий
                          <Input
                            id={`reading-${meter.id}-note`}
                            onChange={(event) => {
                              const note = event.currentTarget.value;
                              setReadingDraft((current) => ({ ...current, note }));
                            }}
                            placeholder="Необязательно"
                            value={readingDraft.note}
                          />
                        </label>
                        <label className="grid gap-1.5 text-sm font-medium" htmlFor={`reading-${meter.id}-photo`}>
                          Фото счетчика
                          <Input
                            accept="image/*"
                            id={`reading-${meter.id}-photo`}
                            onChange={(event) => setReadingPhoto(event.currentTarget.files?.[0] ?? null)}
                            type="file"
                          />
                        </label>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              setEditingMeterId(null);
                              setReadingPhoto(null);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Отменить
                          </Button>
                          <Button onClick={() => void saveReading(meter)} size="sm" type="button">
                            <Save size={14} />
                            Сохранить
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!meters.length && !showMeterForm && (
                <div className="rounded-lg bg-muted p-4 text-muted-foreground text-sm">
                  Счетчиков пока нет. Добавьте реальные счетчики квартиры или загрузите готовую квитанцию.
                </div>
              )}
            </CardContent>
          </Card>

          {showBillForm && (
            <Card>
              <CardHeader>
                <CardTitle>Выставление счета</CardTitle>
                <CardDescription>Добавьте начисление за {selectedMonth?.period} и сохраните исходную квитанцию в архиве.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="grid gap-1.5 text-sm font-medium" htmlFor="utility-service">
                    Услуга
                    <Input
                      id="utility-service"
                      onChange={(event) => {
                        const service = event.currentTarget.value;
                        setDraft((current) => ({ ...current, service }));
                      }}
                      placeholder="Коммунальные услуги"
                      value={draft.service}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium" htmlFor="utility-amount">
                    Сумма
                    <Input
                      id="utility-amount"
                      min="0.01"
                      step="0.01"
                      onChange={(event) => {
                        const amount = Number(event.currentTarget.value);
                        setDraft((current) => ({
                          ...current,
                          amount,
                          tenantAmount: tenantShareFor(current.allocation, amount, current.tenantAmount),
                        }));
                      }}
                      type="number"
                      value={draft.amount}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium" htmlFor="utility-due-date">
                    Оплатить до
                    <Input
                      id="utility-due-date"
                      onChange={(event) => {
                        const dueDate = formatDateInput(event.currentTarget.value);
                        setDraft((current) => ({ ...current, dueDate }));
                      }}
                      type="date"
                      value={dateInputFromFormatted(draft.dueDate)}
                    />
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <span className="text-sm font-medium">Распределение расхода</span>
                    <Select
                      value={draft.allocation}
                      onValueChange={(value) => setDraft((current) => {
                        const allocation = value as UtilityBillAllocation;
                        return {
                          ...current,
                          allocation,
                          tenantAmount: tenantShareFor(allocation, current.amount, current.tenantAmount),
                          reimbursementStatus: allocation === "owner" ? "not_required" : "awaiting",
                        };
                      })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(utilityBillAllocationLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {draft.allocation === "split" && (
                    <label className="grid gap-1.5 text-sm font-medium" htmlFor="utility-tenant-amount">
                      Доля жильца
                      <Input
                        id="utility-tenant-amount"
                        max={draft.amount}
                        min="0"
                        onChange={(event) => {
                          const tenantAmount = Number(event.currentTarget.value);
                          setDraft((current) => ({ ...current, tenantAmount }));
                        }}
                        type="number"
                        value={draft.tenantAmount}
                      />
                    </label>
                  )}
                </div>
                <label className="grid gap-1.5 text-sm font-medium" htmlFor="utility-receipt">
                  Квитанция или фото счета
                  <Input
                    accept="application/pdf,image/*"
                    id="utility-receipt"
                    onChange={(event) => setBillReceipt(event.currentTarget.files?.[0] ?? null)}
                    type="file"
                  />
                  <span className="text-muted-foreground text-xs">
                    {billReceipt ? billReceipt.name : "PDF или изображение до 15 МБ. Файл сохранится в документах."}
                  </span>
                </label>
                <label className="grid gap-1.5 text-sm font-medium" htmlFor="utility-note">
                  Комментарий
                  <Textarea
                    id="utility-note"
                    onChange={(event) => {
                      const note = event.currentTarget.value;
                      setDraft((current) => ({ ...current, note }));
                    }}
                    placeholder="Например, сверить показания перед оплатой"
                    rows={3}
                    value={draft.note}
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    onClick={() => {
                      setDraft(emptyUtilityBillDraft(selectedMonth?.period ?? selectedPeriod));
                      setBillReceipt(null);
                      setShowBillForm(false);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Отменить
                  </Button>
                  <Button disabled={savingBill} onClick={createBill} type="button">
                    <Plus size={14} />
                    {savingBill ? "Сохраняем..." : "Добавить счет"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="hidden">
            <CardContent className="grid gap-2 border-t pt-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <strong className="font-medium">Начисления за месяц</strong>
                <span className="text-muted-foreground text-sm">
                  Жилец должен {moneyLabel(selectedMonth?.reimbursementAmount ?? 0)}
                </span>
              </div>
              {sortedBills.map((bill) => {
                const isEditing = editingBillId === bill.id && editDraft;

                return (
                  <div className="grid gap-3 rounded-lg border bg-background p-3" key={bill.id}>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                      <div className="grid min-w-0 gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="font-medium">{bill.service}</strong>
                          <Badge variant={utilityBillTone(bill.status)}>{utilityBillStatusLabels[bill.status]}</Badge>
                        </div>
                        <div className="text-muted-foreground text-sm">
                          {moneyLabel(bill.amount)}
                          {bill.dueDate ? ` · оплатить до ${bill.dueDate}` : ""}
                          {bill.paidAt ? ` · оплачено ${bill.paidAt}` : ""}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                          <span>{utilityBillAllocationLabels[bill.allocation]}</span>
                          {bill.tenantAmount > 0 && (
                            <>
                              <span>· доля жильца {moneyLabel(bill.tenantAmount)}</span>
                              <Badge variant="outline">
                                {utilityReimbursementStatusLabels[bill.reimbursementStatus]}
                              </Badge>
                            </>
                          )}
                        </div>
                        {bill.note && <div className="line-clamp-1 text-muted-foreground text-sm">{bill.note}</div>}
                      </div>
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        {bill.receiptUrl && (
                          <Button asChild size="sm" variant="secondary">
                            <a href={bill.receiptUrl} rel="noreferrer" target="_blank">
                              Квитанция
                            </a>
                          </Button>
                        )}
                        {bill.tenantAmount > 0 && bill.reimbursementStatus !== "received" && (
                          <Button
                            onClick={() => void markReimbursementReceived(bill.id)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Оплата получена
                          </Button>
                        )}
                        <Button onClick={() => startEditBill(bill)} size="sm" type="button" variant="secondary">
                          <Pencil size={14} />
                          Редактировать
                        </Button>
                        <Button onClick={() => deleteBill(bill.id)} size="sm" type="button" variant="destructive">
                          <Trash2 size={14} />
                          Удалить
                        </Button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="grid gap-3 rounded-lg bg-muted p-3">
                        <div className="grid gap-3 md:grid-cols-4">
                          <label className="grid gap-1.5 text-sm font-medium" htmlFor={`edit-${bill.id}-service`}>
                            Услуга
                            <Input
                              id={`edit-${bill.id}-service`}
                              onChange={(event) => {
                                const service = event.currentTarget.value;
                                setEditDraft((current) => current ? { ...current, service } : current);
                              }}
                              value={editDraft.service}
                            />
                          </label>
                          <label className="grid gap-1.5 text-sm font-medium" htmlFor={`edit-${bill.id}-period`}>
                            Период
                            <Input
                              id={`edit-${bill.id}-period`}
                              onChange={(event) => {
                                const period = event.currentTarget.value;
                                setEditDraft((current) => current ? { ...current, period } : current);
                              }}
                              value={editDraft.period}
                            />
                          </label>
                          <label className="grid gap-1.5 text-sm font-medium" htmlFor={`edit-${bill.id}-amount`}>
                            Сумма
                            <Input
                              id={`edit-${bill.id}-amount`}
                              min="0.01"
                              step="0.01"
                              onChange={(event) => {
                                const amount = Number(event.currentTarget.value);
                                setEditDraft((current) => current ? {
                                  ...current,
                                  amount,
                                  tenantAmount: tenantShareFor(current.allocation, amount, current.tenantAmount),
                                } : current);
                              }}
                              type="number"
                              value={editDraft.amount}
                            />
                          </label>
                          <label className="grid gap-1.5 text-sm font-medium" htmlFor={`edit-${bill.id}-due-date`}>
                            Оплатить до
                            <Input
                              id={`edit-${bill.id}-due-date`}
                              onChange={(event) => {
                                const dueDate = formatDateInput(event.currentTarget.value);
                                setEditDraft((current) => current ? { ...current, dueDate } : current);
                              }}
                              type="date"
                              value={dateInputFromFormatted(editDraft.dueDate)}
                            />
                          </label>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="grid gap-1.5">
                            <span className="text-sm font-medium">Распределение расхода</span>
                            <Select
                              value={editDraft.allocation}
                              onValueChange={(value) => setEditDraft((current) => {
                                if (!current) return current;
                                const allocation = value as UtilityBillAllocation;
                                return {
                                  ...current,
                                  allocation,
                                  tenantAmount: tenantShareFor(allocation, current.amount, current.tenantAmount),
                                  reimbursementStatus: allocation === "owner" ? "not_required" : current.reimbursementStatus === "received" ? "received" : "awaiting",
                                };
                              })}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(utilityBillAllocationLabels).map(([value, label]) => (
                                  <SelectItem key={value} value={value}>{label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {editDraft.allocation === "split" && (
                            <label className="grid gap-1.5 text-sm font-medium" htmlFor={`edit-${bill.id}-tenant-amount`}>
                              Доля жильца
                              <Input
                                id={`edit-${bill.id}-tenant-amount`}
                                max={editDraft.amount}
                                min="0"
                                onChange={(event) => {
                                  const tenantAmount = Number(event.currentTarget.value);
                                  setEditDraft((current) => current ? { ...current, tenantAmount } : current);
                                }}
                                type="number"
                                value={editDraft.tenantAmount}
                              />
                            </label>
                          )}
                        </div>
                        <label className="grid gap-1.5 text-sm font-medium" htmlFor={`edit-${bill.id}-note`}>
                          Комментарий
                          <Textarea
                            id={`edit-${bill.id}-note`}
                            onChange={(event) => {
                              const note = event.currentTarget.value;
                              setEditDraft((current) => current ? { ...current, note } : current);
                            }}
                            rows={3}
                            value={editDraft.note ?? ""}
                          />
                        </label>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            onClick={() => {
                              setEditingBillId(null);
                              setEditDraft(null);
                            }}
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            Отменить
                          </Button>
                          <Button onClick={saveBill} size="sm" type="button">
                            <Save size={14} />
                            Сохранить
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!sortedBills.length && (
                <div className="rounded-lg bg-muted p-4 text-muted-foreground text-sm">
                  За этот месяц счетов пока нет. Добавьте начисление, когда появится квитанция.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

type JournalKind = "nodes" | "inspections" | "tasks" | "utilities" | "documents";

type JournalEntry = {
  id: string;
  kind: JournalKind;
  title: string;
  body: string;
  date: string;
  amount?: number;
  event?: AssetEvent;
  assetId?: string;
  inspectionId?: string;
  targetView?: View;
};

const journalKindLabels: Record<"all" | JournalKind, string> = {
  all: "Все",
  nodes: "Узлы",
  inspections: "Обходы",
  tasks: "Задания",
  utilities: "Коммуналка",
  documents: "Документы",
};

function journalTimestamp(value: string) {
  const formatted = parseFormattedDate(value)?.getTime();
  if (formatted) return formatted;
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return direct;
  const months: Record<string, number> = {
    января: 0,
    февраля: 1,
    марта: 2,
    апреля: 3,
    мая: 4,
    июня: 5,
    июля: 6,
    августа: 7,
    сентября: 8,
    октября: 9,
    ноября: 10,
    декабря: 11,
  };
  const match = value.toLowerCase().match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/);
  if (!match || months[match[2]] === undefined) return 0;
  return new Date(Number(match[3]), months[match[2]], Number(match[1])).getTime();
}

function journalDateLabel(value: string) {
  if (!value.includes("T")) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function ActivityLog({
  assets,
  bills,
  cleanings,
  deleteEvent,
  events,
  inspections,
  media,
  meters,
  openAsset,
  openReport,
  openSection,
  readings,
  updateEvent,
}: {
  assets: Asset[];
  bills: UtilityBill[];
  cleanings: Cleaning[];
  deleteEvent: (assetId: string, eventId: string) => Promise<boolean>;
  events: AssetEvent[];
  inspections: Inspection[];
  media: AssetMedia[];
  meters: UtilityMeter[];
  openAsset: (id: string) => void;
  openReport: (id: string) => void;
  openSection: (view: View) => void;
  readings: UtilityReading[];
  updateEvent: (
    assetId: string,
    eventId: string,
    patch: Pick<AssetEvent, "title" | "body">,
  ) => Promise<boolean>;
}) {
  const [filter, setFilter] = useState<"all" | JournalKind>("all");
  const [query, setQuery] = useState("");
  const entries = useMemo<JournalEntry[]>(() => {
    const assetEntries: JournalEntry[] = events.map((event) => {
      const asset = assets.find((item) => item.id === event.assetId);
      return {
        id: `event-${event.id}`,
        kind: "nodes",
        title: asset ? `${asset.code} · ${event.title}` : event.title,
        body: event.body,
        date: event.date,
        amount: event.cost,
        event,
        assetId: event.assetId,
      };
    });
    const inspectionEntries: JournalEntry[] = inspections.map((inspection) => ({
      id: `inspection-${inspection.id}`,
      kind: inspection.workflow === "work_order" ? "tasks" : "inspections",
      title: `${inspection.number} · ${inspection.title}`,
      body: `${inspection.contractor || "Исполнитель не назначен"} · ${inspectionStatusLabels[inspection.status]}`,
      date: inspection.completedAt ?? inspection.createdAt,
      inspectionId: inspection.id,
    }));
    const cleaningEntries: JournalEntry[] = cleanings.map((cleaning) => ({
      id: `cleaning-${cleaning.id}`,
      kind: "tasks",
      title: cleaning.title,
      body: `${cleaningTypeLabels[cleaning.type]} · ${cleaningStatusLabels[cleaning.status]}${cleaning.cleaner ? ` · ${cleaning.cleaner}` : ""}`,
      date: cleaning.completedAt ?? cleaning.createdAt,
      amount: cleaning.cost,
      targetView: "work_orders",
    }));
    const billEntries: JournalEntry[] = bills.map((bill) => ({
      id: `bill-${bill.id}`,
      kind: "utilities",
      title: `${bill.service} · ${bill.period}`,
      body: `${utilityBillStatusLabels[bill.status]} · ${utilityBillAllocationLabels[bill.allocation]}`,
      date: bill.paidAt ?? bill.createdAt,
      amount: bill.amount,
      targetView: "utilities",
    }));
    const readingEntries: JournalEntry[] = readings.map((reading) => {
      const meter = meters.find((item) => item.id === reading.meterId);
      return {
        id: `reading-${reading.id}`,
        kind: "utilities",
        title: `Показание · ${meter?.label ?? "Счетчик"}`,
        body: `${reading.value} ${meter?.unit ?? ""} · ${reading.period} · ${utilityReadingSourceLabels[reading.source]}`,
        date: reading.submittedAt,
        targetView: "utilities",
      };
    });
    const documentEntries: JournalEntry[] = media
      .filter((item) => item.documentType && !item.utilityBillId && !item.utilityReadingId)
      .map((item) => ({
        id: `document-${item.id}`,
        kind: "documents",
        title: item.caption ?? item.filename,
        body: `${documentTypeLabel(item.documentType!)}${item.note ? ` · ${item.note}` : ""}`,
        date: item.createdAt ?? "Дата не указана",
        assetId: item.assetId,
        targetView: "documents",
      }));
    return [...assetEntries, ...inspectionEntries, ...cleaningEntries, ...billEntries, ...readingEntries, ...documentEntries]
      .sort((left, right) => journalTimestamp(right.date) - journalTimestamp(left.date));
  }, [assets, bills, cleanings, events, inspections, media, meters, readings]);
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  const visibleEntries = entries.filter((entry) => {
    if (filter !== "all" && entry.kind !== filter) return false;
    return !normalizedQuery || `${entry.title} ${entry.body}`.toLocaleLowerCase("ru-RU").includes(normalizedQuery);
  });

  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input
            className="pl-9"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Найти событие, узел или исполнителя"
            value={query}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {Object.entries(journalKindLabels).map(([value, label]) => (
            <Button
              className="shrink-0"
              key={value}
              onClick={() => setFilter(value as "all" | JournalKind)}
              size="sm"
              type="button"
              variant={filter === value ? "default" : "secondary"}
            >
              {label}
            </Button>
          ))}
        </div>
        <ScrollArea className="h-[640px] pr-4 max-[980px]:h-auto">
          <div className="space-y-3">
            {visibleEntries.map((entry) => {
              if (entry.event && entry.assetId) {
                const asset = assets.find((item) => item.id === entry.assetId);
                return (
                  <EditableEventTask
                    asset={asset}
                    assetId={entry.assetId}
                    deleteEvent={deleteEvent}
                    event={entry.event}
                    key={entry.id}
                    media={mediaForEvent(entry.event, media.filter((item) => item.assetId === entry.assetId))}
                    onOpen={() => openAsset(entry.assetId!)}
                    updateEvent={updateEvent}
                  />
                );
              }
              return (
                <div className="grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" key={entry.id}>
                  <div className="grid min-w-0 gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="font-medium">{entry.title}</strong>
                      <Badge variant="outline">{journalKindLabels[entry.kind]}</Badge>
                    </div>
                    <div className="text-muted-foreground text-sm">{entry.body}</div>
                    <div className="text-muted-foreground text-xs">
                      {journalDateLabel(entry.date)}{entry.amount !== undefined ? ` · ${moneyLabel(entry.amount)}` : ""}
                    </div>
                  </div>
                  <Button
                    onClick={() => entry.inspectionId ? openReport(entry.inspectionId) : entry.targetView ? openSection(entry.targetView) : undefined}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Открыть
                  </Button>
                </div>
              );
            })}
            {!visibleEntries.length && (
              <div className="rounded-lg bg-muted p-4 text-muted-foreground text-sm">По этому фильтру событий нет.</div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function DocumentsView({
  assets,
  deleteEvent,
  events,
  media,
  openAsset,
  setMedia,
  updateEvent,
}: {
  assets: Asset[];
  deleteEvent: (assetId: string, eventId: string) => Promise<boolean>;
  events: AssetEvent[];
  media: AssetMedia[];
  openAsset: (id: string) => void;
  setMedia: (media: AssetMedia[]) => void;
  updateEvent: (
    assetId: string,
    eventId: string,
    patch: Pick<AssetEvent, "title" | "body">,
  ) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [documentNote, setDocumentNote] = useState("");
  const [documentType, setDocumentType] = useState<DocumentTypeId>("passport");
  const [documentTypeFilter, setDocumentTypeFilter] = useState<"all" | "attention" | DocumentTypeId>("all");
  const [documentIssuedAt, setDocumentIssuedAt] = useState("");
  const [documentValidUntil, setDocumentValidUntil] = useState("");
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [editDocumentIssuedAt, setEditDocumentIssuedAt] = useState("");
  const [editDocumentNote, setEditDocumentNote] = useState("");
  const [editDocumentType, setEditDocumentType] = useState<DocumentTypeId>("passport");
  const [editDocumentValidUntil, setEditDocumentValidUntil] = useState("");
  const [savingDocumentId, setSavingDocumentId] = useState<string | null>(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState("apartment");
  const sortedAssets = useMemo(
    () => assets.slice().sort((left, right) => left.code.localeCompare(right.code, "ru")),
    [assets],
  );
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId);

  const documentEventIds = new Set(events.filter(isDocumentEvent).map((event) => event.id));
  const documentRows = media
    .filter((item) => item.documentType !== undefined || !isImageMedia(item) || documentEventIds.has(item.eventId ?? ""))
    .map((item) => {
      const event = events.find((candidate) => candidate.id === item.eventId);
      return {
        asset: assets.find((asset) => asset.id === item.assetId),
        event,
        meta: {
          issuedAt: item.issuedAt ? formatDateInput(item.issuedAt) : documentMetaFromEvent(event).issuedAt,
          validUntil: item.validUntil ? formatDateInput(item.validUntil) : documentMetaFromEvent(event).validUntil,
        },
        media: item,
        type: item.documentType ?? documentTypeFromEvent(event),
      };
    });
  const attentionDocumentsCount = documentRows.filter((item) => {
    const tone = documentValidityTone(item.meta.validUntil);
    return tone === "expired" || tone === "soon";
  }).length;
  const expiringDocuments = documentRows
    .filter((item) => {
      const tone = documentValidityTone(item.meta.validUntil);
      return tone === "expired" || tone === "soon";
    })
    .sort((left, right) => documentExpiryTime(left.meta.validUntil) - documentExpiryTime(right.meta.validUntil))
    .slice(0, 5);
  const documentTypeCounts = new Map<"all" | DocumentTypeId, number>([["all", documentRows.length]]);
  documentRows.forEach((item) => {
    documentTypeCounts.set(item.type, (documentTypeCounts.get(item.type) ?? 0) + 1);
  });
  const documents = documentRows
    .filter((item) => {
      if (documentTypeFilter === "all") return true;
      if (documentTypeFilter === "attention") {
        const tone = documentValidityTone(item.meta.validUntil);
        return tone === "expired" || tone === "soon";
      }
      return item.type === documentTypeFilter;
    })
    .filter(({ media: item, asset, event, meta }) => {
      const haystack = [
        item.caption,
        item.filename,
        item.mediaType,
        documentTypeLabel(documentTypeFromEvent(event)),
        meta.issuedAt,
        meta.validUntil,
        asset?.code,
        asset?.name,
        asset ? roomName(asset.roomId) : "",
        asset ? categoryLabel(asset.category) : "",
        event?.title,
        event?.body,
      ].join(" ").toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    })
    .sort((left, right) => (right.media.createdAt ?? "").localeCompare(left.media.createdAt ?? ""));
  const assetCount = new Set(documents.map((item) => item.media.assetId).filter(Boolean)).size;

  function startEditDocument(document: AssetMedia, event?: AssetEvent) {
    const meta = {
      issuedAt: document.issuedAt ? formatDateInput(document.issuedAt) : documentMetaFromEvent(event).issuedAt,
      validUntil: document.validUntil ? formatDateInput(document.validUntil) : documentMetaFromEvent(event).validUntil,
    };
    setEditingDocumentId(document.id);
    setEditDocumentIssuedAt(dateInputFromFormatted(meta.issuedAt));
    setEditDocumentNote(document.note ?? documentNoteFromEvent(event));
    setEditDocumentType(document.documentType ?? documentTypeFromEvent(event));
    setEditDocumentValidUntil(dateInputFromFormatted(meta.validUntil));
  }

  function cancelEditDocument() {
    setEditingDocumentId(null);
    setEditDocumentIssuedAt("");
    setEditDocumentNote("");
    setEditDocumentType("passport");
    setEditDocumentValidUntil("");
  }

  async function saveDocumentEdit(document: AssetMedia, event?: AssetEvent) {
    setSavingDocumentId(document.id);
    let ok = false;
    if (event) {
      ok = await updateEvent(event.assetId, event.id, {
        title: documentTitle(editDocumentType),
        body: buildDocumentBody({
          defaultBody: "Добавлен документ к архиву квартиры.",
          issuedAt: editDocumentIssuedAt,
          note: editDocumentNote.trim(),
          validUntil: editDocumentValidUntil,
        }),
      });
    } else {
      const response = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType: editDocumentType, issuedAt: editDocumentIssuedAt, validUntil: editDocumentValidUntil, note: editDocumentNote.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      ok = response.ok;
      if (!ok) window.alert(payload.error ?? "Не удалось обновить документ.");
      if (ok) {
        setMedia(media.map((item) => item.id === document.id ? { ...item, documentType: editDocumentType, issuedAt: editDocumentIssuedAt || undefined, validUntil: editDocumentValidUntil || undefined, note: editDocumentNote.trim() || undefined } : item));
      }
    }
    setSavingDocumentId(null);
    if (ok) cancelEditDocument();
  }

  async function deleteDocument(document: AssetMedia, event?: AssetEvent) {
    if (!window.confirm(`Удалить «${document.caption ?? document.filename}»?`)) return;
    if (event) {
      await deleteEvent(event.assetId, event.id);
      return;
    }
    const response = await fetch(`/api/documents/${document.id}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      window.alert(payload.error ?? "Не удалось удалить документ.");
      return;
    }
    setMedia(media.filter((item) => item.id !== document.id));
  }

  async function createDocuments(message: PromptInputMessage) {
    if (!message.files.length) {
      window.alert("Прикрепите хотя бы один файл.");
      return;
    }
    setUploadingDocument(true);
    try {
      const formData = new FormData();
      if (selectedAsset) formData.set("assetId", selectedAsset.id);
      formData.set("documentType", documentType);
      formData.set("issuedAt", documentIssuedAt);
      formData.set("validUntil", documentValidUntil);
      formData.set("note", message.text.trim() || documentNote.trim());
      for (const file of message.files) {
        if (!file.url) continue;
        const response = await fetch(file.url);
        const blob = await response.blob();
        formData.append("files", new File([blob], file.filename ?? "document", { type: file.mediaType ?? blob.type ?? "application/octet-stream" }));
      }
      const response = await fetch("/api/documents", { method: "POST", body: formData });
      const payload = (await response.json().catch(() => ({}))) as { documents?: AssetMedia[]; error?: string };
      if (!response.ok || !payload.documents?.length) throw new Error(payload.error ?? "Не удалось добавить документ.");
      setMedia([...payload.documents, ...media]);
      setDocumentNote("");
      setDocumentIssuedAt("");
      setDocumentValidUntil("");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Не удалось добавить документ.");
    } finally {
      setUploadingDocument(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <label className="search-field" htmlFor="documents-search">
          <Search size={16} />
          <Input
            aria-label="Найти документ"
            id="documents-search"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Файл, узел, категория"
            value={query}
          />
        </label>
        <StatCard label="Документов" value={documents.length.toString()} />
        <StatCard label="Узлов с документами" value={assetCount.toString()} />
        <StatCard label="Требуют внимания" value={attentionDocumentsCount.toString()} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Добавить документ</CardTitle>
          <CardDescription>
            Сохраните документ для всей квартиры или привяжите его к конкретному узлу.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Относится к</span>
            <Select value={selectedAssetId} onValueChange={setSelectedAssetId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите квартиру или узел" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="apartment">Вся квартира</SelectItem>
                {sortedAssets.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.code} · {asset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Тип документа</span>
            <Select value={documentType} onValueChange={(value) => setDocumentType(value as DocumentTypeId)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите тип" />
              </SelectTrigger>
              <SelectContent>
                {documentTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="archive-document-issued-at">
              Дата документа
              <Input
                id="archive-document-issued-at"
                type="date"
                value={documentIssuedAt}
                onChange={(event) => setDocumentIssuedAt(event.currentTarget.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="archive-document-valid-until">
              Действует до
              <Input
                id="archive-document-valid-until"
                type="date"
                value={documentValidUntil}
                onChange={(event) => setDocumentValidUntil(event.currentTarget.value)}
              />
            </label>
          </div>
          <PromptInput
            accept="application/pdf,image/*,text/*,.doc,.docx,.xls,.xlsx"
            className="w-full"
            onSubmit={(message: PromptInputMessage) => {
              void createDocuments(message);
            }}
          >
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Комментарий к документу"
                value={documentNote}
                onChange={(event) => setDocumentNote(event.currentTarget.value)}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments label="Прикрепить файл" />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
              </PromptInputTools>
              <PromptInputSubmit aria-label="Добавить документ в архив" disabled={uploadingDocument} />
            </PromptInputFooter>
          </PromptInput>
        </CardContent>
      </Card>

      {expiringDocuments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ближайшие сроки</CardTitle>
            <CardDescription>
              Просроченные документы и сроки, которые заканчиваются в ближайшие 30 дней.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {expiringDocuments.map(({ asset, media: document, meta, type }) => {
              const validityLabel = documentValidityLabel(meta.validUntil);
              const validityTone = documentValidityTone(meta.validUntil);

              return (
                <div
                  className="grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                  key={`expiry-${document.id}`}
                >
                  <a
                    className="flex min-w-0 items-center gap-3 text-sm"
                    href={document.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <FileText size={17} />
                    </span>
                    <span className="grid min-w-0 gap-1">
                      <strong className="truncate font-medium">{document.caption ?? document.filename}</strong>
                      <span className="line-clamp-1 text-muted-foreground">
                        {asset
                          ? `${asset.code} · ${asset.name} · ${roomName(asset.roomId)}`
                          : "Без привязки к узлу"}
                      </span>
                    </span>
                  </a>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Badge variant="secondary">{documentTypeLabel(type)}</Badge>
                    {meta.validUntil && (
                      <Badge variant={validityTone === "expired" || validityTone === "soon" ? "destructive" : "secondary"}>
                        {validityLabel}: до {meta.validUntil}
                      </Badge>
                    )}
                    {asset && (
                      <Button onClick={() => openAsset(asset.id)} size="sm" type="button" variant="secondary">
                        Открыть узел
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Архив документов</CardTitle>
          <CardDescription>
            Файлы, прикрепленные к паспортам узлов и событиям истории.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="flex flex-wrap gap-2 pb-2">
            <Button
              className="h-8 rounded-md"
              onClick={() => setDocumentTypeFilter("all")}
              size="sm"
              type="button"
              variant={documentTypeFilter === "all" ? "default" : "secondary"}
            >
              Все <Badge className="ml-2" variant={documentTypeFilter === "all" ? "secondary" : "outline"}>{documentTypeCounts.get("all") ?? 0}</Badge>
            </Button>
            <Button
              className="h-8 rounded-md"
              onClick={() => setDocumentTypeFilter("attention")}
              size="sm"
              type="button"
              variant={documentTypeFilter === "attention" ? "default" : "secondary"}
            >
              Требуют внимания
              <Badge className="ml-2" variant={documentTypeFilter === "attention" ? "secondary" : "outline"}>
                {attentionDocumentsCount}
              </Badge>
            </Button>
            {documentTypes.map((type) => (
              <Button
                className="h-8 rounded-md"
                key={type.id}
                onClick={() => setDocumentTypeFilter(type.id)}
                size="sm"
                type="button"
                variant={documentTypeFilter === type.id ? "default" : "secondary"}
              >
                {type.label}
                <Badge className="ml-2" variant={documentTypeFilter === type.id ? "secondary" : "outline"}>
                  {documentTypeCounts.get(type.id) ?? 0}
                </Badge>
              </Button>
            ))}
          </div>
          {documents.map(({ media: document, asset, event, meta, type }) => {
            const isEditing = editingDocumentId === document.id;
            const validityLabel = documentValidityLabel(meta.validUntil);
            const validityTone = documentValidityTone(meta.validUntil);

            return (
              <div className="grid gap-3 rounded-lg border bg-background p-3" key={document.id}>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <a
                    className="flex min-w-0 items-center gap-3 text-sm"
                    href={document.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <FileText size={17} />
                    </span>
                    <span className="grid min-w-0 gap-1">
                      <strong className="truncate font-medium">{document.caption ?? document.filename}</strong>
                      <span className="line-clamp-1 text-muted-foreground">
                        {asset
                          ? `${asset.code} · ${asset.name} · ${roomName(asset.roomId)} · ${categoryLabel(asset.category)}`
                          : "Без привязки к узлу"}
                      </span>
                      {(document.note || event?.body) && <span className="line-clamp-1 text-muted-foreground">{document.note ?? event?.body}</span>}
                    </span>
                  </a>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Badge variant="secondary">{documentTypeLabel(type)}</Badge>
                    {meta.issuedAt && <Badge variant="outline">от {meta.issuedAt}</Badge>}
                    {meta.validUntil && (
                      <Badge variant={validityTone === "expired" || validityTone === "soon" ? "destructive" : "secondary"}>
                        {validityLabel}: до {meta.validUntil}
                      </Badge>
                    )}
                    <Badge variant="outline">{document.mediaType}</Badge>
                    {asset && (
                      <Button onClick={() => openAsset(asset.id)} size="sm" type="button" variant="secondary">
                        Открыть узел
                      </Button>
                    )}
                    <Button onClick={() => startEditDocument(document, event)} size="sm" type="button" variant="secondary">
                      <Pencil size={14} />
                      Редактировать
                    </Button>
                    <Button onClick={() => void deleteDocument(document, event)} size="sm" type="button" variant="destructive">
                      <Trash2 size={14} />
                      Удалить
                    </Button>
                  </div>
                </div>
                {isEditing && (
                  <div className="grid gap-3 rounded-lg bg-muted p-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="grid gap-1.5">
                        <span className="text-sm font-medium">Тип документа</span>
                        <Select value={editDocumentType} onValueChange={(value) => setEditDocumentType(value as DocumentTypeId)}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Выберите тип" />
                          </SelectTrigger>
                          <SelectContent>
                            {documentTypes.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <label className="grid gap-1.5 text-sm font-medium" htmlFor={`edit-${document.id}-issued-at`}>
                        Дата документа
                        <Input
                          id={`edit-${document.id}-issued-at`}
                          onChange={(inputEvent) => setEditDocumentIssuedAt(inputEvent.currentTarget.value)}
                          type="date"
                          value={editDocumentIssuedAt}
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium" htmlFor={`edit-${document.id}-valid-until`}>
                        Действует до
                        <Input
                          id={`edit-${document.id}-valid-until`}
                          onChange={(inputEvent) => setEditDocumentValidUntil(inputEvent.currentTarget.value)}
                          type="date"
                          value={editDocumentValidUntil}
                        />
                      </label>
                    </div>
                    <label className="grid gap-1.5 text-sm font-medium" htmlFor={`edit-${document.id}-note`}>
                      Комментарий
                      <Textarea
                        id={`edit-${document.id}-note`}
                        onChange={(inputEvent) => setEditDocumentNote(inputEvent.currentTarget.value)}
                        rows={3}
                        value={editDocumentNote}
                      />
                    </label>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button onClick={cancelEditDocument} size="sm" type="button" variant="secondary">
                        Отменить
                      </Button>
                      <Button
                        disabled={savingDocumentId === document.id}
                        onClick={() => void saveDocumentEdit(document, event)}
                        size="sm"
                        type="button"
                      >
                        <Save size={14} />
                        Сохранить
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!documents.length && (
            <div className="rounded-lg bg-muted p-4 text-muted-foreground text-sm">
              Документов пока нет. Добавьте файл во вкладке «Документы» в карточке нужного узла.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InspectionView({
  asset,
  index,
  total,
  completeInspection,
  openAsset,
}: {
  asset: Asset;
  index: number;
  total: number;
  completeInspection: (status: Status) => void;
  openAsset: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(320px,420px)_1fr] gap-6 max-[980px]:grid-cols-1">
      <Card>
        <CardHeader>
          <CardDescription>{index + 1} из {total}</CardDescription>
          <CardTitle>{asset.code} · {asset.name}</CardTitle>
          <CardDescription>{roomName(asset.roomId)} · {categoryLabel(asset.category)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Button variant="secondary" onClick={() => openAsset(asset.id)} type="button">
            Открыть карточку
          </Button>
          <div className="grid gap-2 sm:grid-cols-3">
          <Button variant="secondary" onClick={() => completeInspection("ok")} type="button">
            Исправно
          </Button>
          <Button variant="secondary" onClick={() => completeInspection("attention")} type="button">
            Есть замечание
          </Button>
          <Button onClick={() => completeInspection("needs_master")} type="button">
            Нужен мастер
          </Button>
          </div>
          <InspectionComposer placeholder="Комментарий обхода, фото, стоимость, материалы" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-0">
          <ApartmentPlan
            activeMode={planModes[0]}
            assets={[asset]}
            editMode={false}
            editingAssetId={null}
            hotspots={planHotspots[planModes[0].id].filter(
              (hotspot) => (hotspot.assetId ?? hotspot.id) === asset.id,
            )}
            moveAssetOnPlan={() => {}}
            openAsset={openAsset}
            selectAssetForEditing={() => {}}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function InspectionsView({
  assets,
  deleteInspection,
  inspections,
  results,
  updateInspection,
  openAsset,
  openReport,
  openContractor,
  workflow,
}: {
  assets: Asset[];
  deleteInspection: (inspectionId: string) => Promise<void>;
  inspections: Inspection[];
  results: InspectionResult[];
  updateInspection: (inspectionId: string, patch: Partial<Inspection>) => Promise<boolean>;
  openAsset: (id: string) => void;
  openReport: (id: string) => void;
  openContractor: () => void;
  workflow: Workflow;
}) {
  const [editingInspectionId, setEditingInspectionId] = useState("");
  const [editDraft, setEditDraft] = useState<{
    contractor: string;
    contractorPhone: string;
    scope: ContractorAccess["scope"];
    allowedAssetIds: string[];
    assetInstructions: Record<string, string>;
  } | null>(null);
  const isWorkOrder = workflow === "work_order";
  const completedCount = inspections.filter((inspection) =>
    ["completed", "accepted"].includes(inspection.status),
  ).length;
  const acceptedCount = inspections.filter((inspection) => inspection.status === "accepted").length;
  const visibleInspectionIds = new Set(inspections.map((inspection) => inspection.id));
  const issueResultCount = results.filter(
    (result) => visibleInspectionIds.has(result.inspectionId) && result.statusAfter !== "ok",
  ).length;

  function startEdit(inspection: Inspection) {
    setEditingInspectionId(inspection.id);
    setEditDraft({
      contractor: inspection.contractor,
      contractorPhone: inspection.contractorPhone ?? "",
      scope: inspection.scope,
      allowedAssetIds: inspection.allowedAssetIds,
      assetInstructions: inspection.assetInstructions ?? {},
    });
  }

  async function saveEdit(inspectionId: string) {
    if (!editDraft?.contractor.trim()) {
      window.alert("Укажите имя мастера.");
      return;
    }

    const saved = await updateInspection(inspectionId, editDraft);
    if (saved) {
      setEditingInspectionId("");
      setEditDraft(null);
    }
  }

  async function acceptInspection(inspection: Inspection) {
    const saved = await updateInspection(inspection.id, { status: "accepted" });
    if (!saved) {
      window.alert(
        isWorkOrder
          ? "Не удалось принять задание."
          : "Не удалось принять отчет.",
      );
    }
  }

  async function returnInspection(inspection: Inspection) {
    const saved = await updateInspection(inspection.id, { status: "in_progress" });
    if (!saved) {
      window.alert(
        isWorkOrder
          ? "Не удалось вернуть задание в работу."
          : "Не удалось вернуть отчет в работу.",
      );
    }
  }

  return (
    <div className="grid gap-4">
      <div className="mobile-metric-grid grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={isWorkOrder ? "Всего заданий" : "Всего обходов"} value={`${inspections.length}`} />
        <StatCard label="Завершено" value={`${completedCount}`} tone="positive" />
        <StatCard label="Принято" value={`${acceptedCount}`} tone="positive" />
        <StatCard label={isWorkOrder ? "Замечаний из заданий" : "Замечаний из отчетов"} value={`${issueResultCount}`} tone="negative" />
      </div>

      <div className="grid min-w-0 gap-6">
        <Card className="min-w-0">
          <CardHeader className="grid-cols-[1fr_auto] gap-4 max-[720px]:grid-cols-1">
            <div>
              <CardTitle>{isWorkOrder ? "Все задания" : "Все обходы"}</CardTitle>
              <CardDescription>
                {isWorkOrder
                  ? "Каждое задание хранит мастера, выбранные узлы, инструкции владельца и результат работы."
                  : "Каждый обход хранит область доступа, мастера, результаты и ссылку на события узлов."}
              </CardDescription>
            </div>
            <Button onClick={openContractor} type="button">
              <UserRoundCheck size={16} />
              {isWorkOrder ? "Создать задание" : "Выдать доступ мастеру"}
            </Button>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-3">
            {inspections.map((inspection) => {
              const inspectionResults = results.filter((result) => result.inspectionId === inspection.id);
              const issues = inspectionResults.filter((result) => result.statusAfter !== "ok");
              const cost = inspectionResults.reduce((sum, result) => sum + (result.cost ?? 0), 0);
              const canEdit = !["completed", "accepted"].includes(inspection.status);
              const isEditing = editingInspectionId === inspection.id && editDraft;
              const canAccept = inspection.status === "completed";

              return (
                <div className="inspection-flow-card grid min-w-0 gap-3 rounded-xl bg-muted p-4" key={inspection.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-1">
                      <strong className="font-medium">
                        {inspection.contractor}
                        {inspection.contractorPhone ? ` · ${inspection.contractorPhone}` : ""}
                      </strong>
                      <span className="text-muted-foreground text-sm">
                        {inspection.number} · {inspection.createdAt}
                        {inspection.completedAt ? ` · завершен ${inspection.completedAt}` : ""}
                      </span>
                    </div>
                    <Badge variant={inspection.status === "completed" ? "secondary" : "default"}>
                      {inspectionStatusLabels[inspection.status]}
                    </Badge>
                  </div>
                  <p className="m-0 text-muted-foreground text-sm">{inspection.summary}</p>
                  {isEditing && (
                    <div className="grid gap-3 rounded-xl bg-background p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5 text-sm font-medium">
                          <label htmlFor={`edit-contractor-${inspection.id}`}>Имя мастера</label>
                          <Input
                            id={`edit-contractor-${inspection.id}`}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setEditDraft((current) =>
                                current ? { ...current, contractor: value } : current,
                              );
                            }}
                            value={editDraft.contractor}
                          />
                        </div>
                        <div className="grid gap-1.5 text-sm font-medium">
                          <label htmlFor={`edit-phone-${inspection.id}`}>Телефон</label>
                          <Input
                            id={`edit-phone-${inspection.id}`}
                            inputMode="tel"
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setEditDraft((current) =>
                                current ? { ...current, contractorPhone: value } : current,
                              );
                            }}
                            value={editDraft.contractorPhone}
                          />
                        </div>
                      </div>
                      <ContractorScopePicker
                        assets={assets}
                        onChange={(allowedAssetIds) =>
                          setEditDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  scope: contractorScopeFromIds(assets, allowedAssetIds),
                                  allowedAssetIds,
                                }
                              : current,
                          )
                        }
                        selectedAssetIds={editDraft.allowedAssetIds}
                      />
                      {isWorkOrder && (
                        <AssetInstructionsEditor
                          assets={assets}
                          instructions={editDraft.assetInstructions}
                          onChange={(assetId, instruction) =>
                            setEditDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    assetInstructions: {
                                      ...current.assetInstructions,
                                      [assetId]: instruction,
                                    },
                                  }
                                : current,
                            )
                          }
                          selectedAssetIds={editDraft.allowedAssetIds}
                        />
                      )}
                      <p className="m-0 text-muted-foreground text-sm">
                        {isWorkOrder ? "В задании" : "В обходе"} будет {editDraft.allowedAssetIds.length} узлов. Уже сохраненные
                        мастером результаты останутся в истории узлов, даже если сменить область доступа.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="outline">{inspection.allowedAssetIds.length} узлов</Badge>
                    <Badge variant={issues.length ? "destructive" : "secondary"}>
                      {issues.length} замечаний
                    </Badge>
                    <Badge variant="outline">{cost.toLocaleString("ru-RU")} руб.</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="w-fit"
                      onClick={() => openReport(inspection.id)}
                      size="sm"
                      type="button"
                      variant="default"
                    >
                      {isWorkOrder ? "Открыть результат" : "Открыть отчет"}
                    </Button>
                    {canAccept && (
                      <>
                        <Button
                          className="w-fit"
                          onClick={() => void acceptInspection(inspection)}
                          size="sm"
                          type="button"
                        >
                          <Check size={14} />
                          {isWorkOrder ? "Принять задание" : "Принять отчет"}
                        </Button>
                        <Button
                          className="w-fit"
                          onClick={() => void returnInspection(inspection)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {isWorkOrder ? "Вернуть в работу" : "Вернуть отчет"}
                        </Button>
                      </>
                    )}
                    {canEdit && !isEditing && (
                      <Button
                        className="w-fit"
                        onClick={() => startEdit(inspection)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Pencil size={14} />
                        Редактировать
                      </Button>
                    )}
                    {isEditing && (
                      <>
                        <Button
                          className="w-fit"
                          onClick={() => void saveEdit(inspection.id)}
                          size="sm"
                          type="button"
                        >
                          <Save size={14} />
                          Сохранить
                        </Button>
                        <Button
                          className="w-fit"
                          onClick={() => {
                            setEditingInspectionId("");
                            setEditDraft(null);
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Отмена
                        </Button>
                      </>
                    )}
                    {!["completed", "accepted"].includes(inspection.status) && (
                      <Button asChild className="w-fit" size="sm" variant="outline">
                        <a href={inspection.link} rel="noreferrer" target="_blank">
                          Открыть ссылку мастера
                        </a>
                      </Button>
                    )}
                    <Button
                      className="w-fit"
                      onClick={() => void deleteInspection(inspection.id)}
                      size="sm"
                      type="button"
                      variant="destructive"
                    >
                      <Trash2 size={14} />
                      Удалить
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    {inspectionResults.slice(0, 4).map((result) => {
                      const asset = assets.find((item) => item.id === result.assetId);
                      if (!asset) return null;
                      return (
                        <button
                          className="flex items-center justify-between gap-3 rounded-md bg-muted p-2 text-left text-sm"
                          key={result.id}
                          onClick={() => openAsset(asset.id)}
                          type="button"
                        >
                          <span className="truncate">{asset.code} · {asset.name}</span>
                          <StatusBadge status={result.statusAfter} />
                        </button>
                      );
                    })}
                    {!inspectionResults.length && (
                      <div className="rounded-md bg-muted p-2 text-muted-foreground text-sm">
                        {isWorkOrder
                          ? "Результатов пока нет. Мастер еще не начал работу по заданию."
                          : "Результатов пока нет. Откройте отчет, чтобы увидеть состав задания."}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

function AssetInstructionsEditor({
  assets,
  instructions,
  onChange,
  selectedAssetIds,
}: {
  assets: Asset[];
  instructions: Record<string, string>;
  onChange: (assetId: string, instruction: string) => void;
  selectedAssetIds: string[];
}) {
  const selectedAssets = assets
    .filter((asset) => selectedAssetIds.includes(asset.id))
    .sort((first, second) => first.code.localeCompare(second.code, "ru"))
    .slice(0, 12);

  if (!selectedAssetIds.length) {
    return null;
  }

  return (
    <div className="grid gap-3 rounded-xl bg-background p-3">
      <div className="grid gap-1">
        <strong className="text-sm font-medium">Комментарий владельца по узлам</strong>
        <span className="text-muted-foreground text-sm">
          Мастер увидит только эти инструкции и текущее задание, без полной истории узла.
        </span>
      </div>
      <div className="grid gap-3">
        {selectedAssets.map((asset) => (
          <div className="grid gap-1.5" key={asset.id}>
            <label className="text-sm font-medium" htmlFor={`instruction-${asset.id}`}>
              {asset.code} · {asset.name}
            </label>
            <Textarea
              id={`instruction-${asset.id}`}
              onChange={(event) => onChange(asset.id, event.currentTarget.value)}
              placeholder="Что нужно сделать по этому узлу"
              value={instructions[asset.id] ?? ""}
            />
          </div>
        ))}
      </div>
      {selectedAssetIds.length > selectedAssets.length && (
        <p className="m-0 text-muted-foreground text-sm">
          Показаны первые {selectedAssets.length} узлов. Остальные можно оставить без отдельного комментария.
        </p>
      )}
    </div>
  );
}

function ContractorAccessView({
  state,
  setState,
  mode,
  workflow,
  createContractorInspection,
  submitContractorReport,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  mode: "setup" | "master";
  workflow: Workflow;
  createContractorInspection: (workflow?: Workflow) => void;
  submitContractorReport: (conclusion?: string) => void;
}) {
  const allowedAssets = state.assets.filter((asset) =>
    state.contractorAccess.allowedAssetIds.includes(asset.id),
  );
  const allowedPlanModes = planModesForAssets(allowedAssets);
  const [selectedContractorAssetId, setSelectedContractorAssetId] = useState(
    allowedAssets[0]?.id ?? "",
  );
  const [contractorPlanMode, setContractorPlanMode] = useState<PlanModeId>(
    allowedPlanModes[0]?.id ?? "sockets",
  );
  const [contractorConclusion, setContractorConclusion] = useState("");
  const activeInspection =
    state.inspections.find((inspection) => inspection.id === state.contractorAccess.inspectionId) ??
    state.inspections[0];
  const selectedContractorAsset =
    allowedAssets.find((asset) => asset.id === selectedContractorAssetId) ?? allowedAssets[0];
  const activeContractorPlanMode =
    allowedPlanModes.find((planMode) => planMode.id === contractorPlanMode) ??
    allowedPlanModes[0] ??
    planModes[0];
  const visibleContractorHotspots = planHotspots[activeContractorPlanMode.id];
  const isWorkOrder = workflow === "work_order";

  if (mode === "master") {
    return (
      <div className="grid gap-6">
        <Card size="sm">
          <CardHeader>
            <CardTitle>{activeInspection?.number ?? "Задание мастеру"}</CardTitle>
            <CardDescription>
              Шпалерная, 34Б · {activeInspection?.contractor ?? "мастер"} · доступ:{" "}
              {state.contractorAccess.expires}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-muted p-3">
              <p className="m-0 text-muted-foreground text-sm">Узлов в задании</p>
              <strong className="text-xl font-medium">{allowedAssets.length}</strong>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="m-0 text-muted-foreground text-sm">Схем доступно</p>
              <strong className="text-xl font-medium">{allowedPlanModes.length}</strong>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="m-0 text-muted-foreground text-sm">Текущий узел</p>
              <strong className="block truncate text-xl font-medium">
                {selectedContractorAsset?.code ?? "Не выбран"}
              </strong>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(320px,420px)] gap-6 max-[980px]:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>План задания</CardTitle>
              <CardDescription>
                Переключайте доступные схемы и нажимайте на узел, чтобы заполнить проверку.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="plan-mode-toolbar" role="tablist" aria-label="Схемы задания">
                {allowedPlanModes.map((planMode) => (
                  <Button
                    aria-selected={activeContractorPlanMode.id === planMode.id}
                    className="justify-start"
                    key={planMode.id}
                    onClick={() => setContractorPlanMode(planMode.id)}
                    role="tab"
                    size="sm"
                    type="button"
                    variant={activeContractorPlanMode.id === planMode.id ? "default" : "secondary"}
                  >
                    {planMode.label}
                  </Button>
                ))}
              </div>
              <ApartmentPlan
                activeMode={activeContractorPlanMode}
                assets={allowedAssets}
                editMode={false}
                editingAssetId={null}
                hotspots={visibleContractorHotspots}
                moveAssetOnPlan={() => {}}
                openAsset={setSelectedContractorAssetId}
                selectAssetForEditing={() => {}}
              />
            </CardContent>
          </Card>

          <div className="grid content-start gap-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  {selectedContractorAsset
                    ? `${selectedContractorAsset.code} · ${selectedContractorAsset.name}`
                    : "Чек-лист узла"}
                </CardTitle>
                <CardDescription>
                  {selectedContractorAsset
                    ? `${roomName(selectedContractorAsset.roomId)} · ${categoryLabel(selectedContractorAsset.category)}`
                    : "Выберите узел на плане или в списке."}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {selectedContractorAsset && <StatusBadge status={selectedContractorAsset.status} />}
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button variant="secondary" type="button">Исправно</Button>
                  <Button variant="secondary" type="button">Есть замечание</Button>
                  <Button type="button">Нужен ремонт</Button>
                </div>
                <InspectionComposer placeholder="Комментарий мастера, фото, стоимость, материалы" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Общее заключение</CardTitle>
                <CardDescription>
                  Для замечаний по квартире в целом или того, что не привязано к конкретному узлу.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <InspectionComposer
                  onChange={setContractorConclusion}
                  placeholder="Например: нужен доступ к стояку, нашли запах в санузле, есть рекомендация по профилактике"
                  value={contractorConclusion}
                />
                <Button
                  className="w-full"
                  onClick={() => submitContractorReport(contractorConclusion)}
                  type="button"
                >
                  Отправить отчет владельцу
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Узлы задания</CardTitle>
                <CardDescription>
                  Быстрый список на случай, если удобнее идти не по схеме.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {allowedAssets.map((asset) => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    onClick={() => setSelectedContractorAssetId(asset.id)}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const canCreateAccess = Boolean(
    state.contractorAccess.contractorName.trim() &&
      state.contractorAccess.allowedAssetIds.length > 0,
  );

  return (
    <div className="contractor-access-grid">
      <Card className="contractor-setup-card min-w-0">
        <CardHeader>
          <CardTitle>{isWorkOrder ? "Создать задание" : "Создать доступ"}</CardTitle>
          <CardDescription>
            {isWorkOrder
              ? "Мастер получит ссылку на конкретную работу и пройдет выбранные узлы по шагам."
              : "Мастер получит ссылку только на выбранные узлы и сможет отправить отчет."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-4">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="grid min-w-0 gap-1.5 text-sm font-medium">
              <label htmlFor="contractor-name">Имя мастера</label>
              <Input
                id="contractor-name"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setState((current) => ({
                    ...current,
                    contractorAccess: {
                      ...current.contractorAccess,
                      contractorName: value,
                    },
                  }));
                }}
                placeholder="Например, Роман"
                value={state.contractorAccess.contractorName}
              />
            </div>
            <div className="grid min-w-0 gap-1.5 text-sm font-medium">
              <label htmlFor="contractor-phone">Телефон</label>
              <Input
                id="contractor-phone"
                inputMode="tel"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setState((current) => ({
                    ...current,
                    contractorAccess: {
                      ...current.contractorAccess,
                      contractorPhone: value,
                    },
                  }));
                }}
                placeholder="+7 ..."
                value={state.contractorAccess.contractorPhone}
              />
            </div>
          </div>
          <ContractorScopePicker
            assets={state.assets}
            onChange={(allowedAssetIds) =>
              setState((current) => ({
                ...current,
                contractorAccess: {
                  ...current.contractorAccess,
                  scope: contractorScopeFromIds(current.assets, allowedAssetIds),
                  allowedAssetIds,
                },
              }))
            }
            selectedAssetIds={state.contractorAccess.allowedAssetIds}
          />
          {isWorkOrder && (
            <AssetInstructionsEditor
              assets={state.assets}
              instructions={state.contractorAccess.assetInstructions}
              onChange={(assetId, instruction) =>
                setState((current) => ({
                  ...current,
                  contractorAccess: {
                    ...current.contractorAccess,
                    assetInstructions: {
                      ...current.contractorAccess.assetInstructions,
                      [assetId]: instruction,
                    },
                  },
                }))
              }
              selectedAssetIds={state.contractorAccess.allowedAssetIds}
            />
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {(isWorkOrder
              ? [
                  "Видеть только текущее задание",
                  "Оставлять комментарии и фото",
                  "Указывать стоимость ремонта",
                  "Менять статус выполненной работы",
                ]
              : [
                  "Смотреть историю выбранных узлов",
                  "Добавлять комментарии и фото",
                  "Указывать стоимость и материалы",
                  "Менять статус на «сделано»",
                ]).map((permission) => (
              <div className="rounded-lg bg-muted p-3 text-sm" key={permission}>
                {permission}
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            {activeInspection?.link ?? "Ссылка появится после создания обхода"}
          </div>
          <Button
            disabled={!canCreateAccess}
            onClick={() => createContractorInspection(workflow)}
            size="lg"
            type="button"
          >
            {isWorkOrder ? "Создать задание и ссылку мастеру" : "Создать обход и ссылку мастеру"}
          </Button>
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Узлы в задании</CardTitle>
          <CardDescription>
            {allowedAssets.length} выбранных узлов. После создания это станет отдельным{" "}
            {isWorkOrder ? "заданием" : "обходом"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {allowedAssets.map((asset) => (
            <AssetRow key={asset.id} asset={asset} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ContractorReport({
  assets,
  createWorkOrderFromAssets,
  events,
  inspection,
  media,
  results,
  openAsset,
  openInspections,
  updateInspection,
}: {
  assets: Asset[];
  createWorkOrderFromAssets: (assetIds: string[]) => void;
  events: AssetEvent[];
  inspection?: Inspection;
  media: AssetMedia[];
  results: InspectionResult[];
  openAsset: (id: string) => void;
  openInspections: () => void;
  updateInspection: (inspectionId: string, patch: Partial<Inspection>) => Promise<boolean>;
}) {
  const reportEvents = events.filter((event) =>
    inspection ? event.inspectionId === inspection.id : event.type === "report",
  );
  const reportResults = inspection
    ? results.filter((result) => result.inspectionId === inspection.id)
    : results;
  const reportAssets = inspection
    ? assets.filter((asset) => inspection.allowedAssetIds.includes(asset.id))
    : assets;
  const reportAssetCount = inspection?.allowedAssetIds.length ?? reportAssets.length;
  const issueResults = reportResults.filter((result) => result.statusAfter !== "ok");
  const actionableIssueAssetIds = issueResults
    .map((result) => result.assetId)
    .filter((assetId) => assets.some((asset) => asset.id === assetId));
  const totalCost = reportResults.reduce((sum, result) => sum + (result.cost ?? 0), 0);
  const photoCount = reportResults.reduce((sum, result) => sum + result.photoCount, 0);
  const isWorkOrder = inspection?.workflow === "work_order";
  const isCompleted = inspection?.status === "completed";
  const isAccepted = inspection?.status === "accepted";
  const hasFinalResult = isCompleted || isAccepted;

  async function acceptCurrentInspection() {
    if (!inspection) return;
    const saved = await updateInspection(inspection.id, { status: "accepted" });
    if (!saved) {
      window.alert(isWorkOrder ? "Не удалось принять задание." : "Не удалось принять отчет.");
    }
  }

  async function returnCurrentInspection() {
    if (!inspection) return;
    const saved = await updateInspection(inspection.id, { status: "in_progress" });
    if (!saved) {
      window.alert(
        isWorkOrder
          ? "Не удалось вернуть задание в работу."
          : "Не удалось вернуть отчет в работу.",
      );
    }
  }

  return (
    <div className="grid gap-4">
      <Card size="sm">
        <CardHeader className="grid-cols-[1fr_auto] gap-4 max-[720px]:grid-cols-1">
          <div>
            <CardTitle>{inspection?.number ?? "Отчет мастера"}</CardTitle>
            <CardDescription>
              {inspection
                ? `${inspection.title} · ${inspection.contractor} · создан ${inspection.createdAt}`
                + (inspection.contractorPhone ? ` · ${inspection.contractorPhone}` : "")
                : "Сводка результатов последнего обхода."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {inspection && (
              <Badge variant={hasFinalResult ? "secondary" : "default"}>
                {inspectionStatusLabels[inspection.status]}
              </Badge>
            )}
            {isCompleted && (
              <>
                <Button onClick={() => void acceptCurrentInspection()} type="button">
                  <Check size={16} />
                  {isWorkOrder ? "Принять задание" : "Принять отчет"}
                </Button>
                <Button
                  onClick={() => void returnCurrentInspection()}
                  type="button"
                  variant="outline"
                >
                  {isWorkOrder ? "Вернуть в работу" : "Вернуть отчет"}
                </Button>
              </>
            )}
            <Button onClick={openInspections} type="button" variant="secondary">
              {isWorkOrder ? "Все задания" : "Все обходы"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="m-0 text-muted-foreground text-sm">
            {inspection?.summary ?? "Выберите обход в списке отчетов, чтобы увидеть подробности."}
          </p>
        </CardContent>
      </Card>

      <div className="mobile-metric-grid grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="В задании" value={`${reportAssetCount} узла`} />
        <StatCard label="Проверено" value={`${reportResults.length} узла`} />
        <StatCard label="Замечания" value={`${issueResults.length}`} tone="negative" />
        <StatCard label="Стоимость" value={`${totalCost.toLocaleString("ru-RU")} руб.`} />
        <StatCard label="Фото" value={`${photoCount} файлов`} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(320px,420px)] gap-6 max-[980px]:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>{hasFinalResult ? "Результаты по узлам" : "Узлы в задании"}</CardTitle>
            <CardDescription>
              {hasFinalResult
                ? "Все, что мастер написал по каждому узлу в рамках этой работы."
                : "Состав отправленного задания. Результаты появятся после отправки мастером."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {hasFinalResult && inspection?.conclusion && (
              <div className="rounded-xl bg-muted p-4">
                <strong className="block text-sm">Общее заключение мастера</strong>
                <p className="m-0 mt-2 text-muted-foreground text-sm">{inspection.conclusion}</p>
              </div>
            )}
            {hasFinalResult &&
              reportResults.map((result) => {
                const asset = assets.find((item) => item.id === result.assetId);
                const assetCode = result.assetCode || asset?.code || "Без номера";
                const assetName = result.assetName || asset?.name || "Удаленный узел";
                const assetRoom = result.roomId || asset?.roomId;
                const assetCategory = result.category || asset?.category;
                const resultMedia = media.filter(
                  (item) => item.assetId === result.assetId && item.inspectionId === result.inspectionId,
                );
                return (
                  <div className="grid gap-2 rounded-xl bg-muted/60 p-3" key={result.id}>
                    <button
                      className="grid min-w-0 gap-1 text-left disabled:cursor-default"
                      disabled={!asset}
                      onClick={() => asset && openAsset(asset.id)}
                      type="button"
                    >
                      <strong className="truncate font-medium">{assetCode} · {assetName}</strong>
                      {(assetRoom || assetCategory) && (
                        <span className="truncate text-muted-foreground text-sm">
                          {assetRoom ? roomName(assetRoom) : "Помещение не указано"}
                          {assetCategory ? ` · ${categoryLabel(assetCategory)}` : ""}
                        </span>
                      )}
                    </button>
                    <p className="m-0 text-muted-foreground text-sm">{result.comment}</p>
                    <MediaGallery items={resultMedia} variant="grid" />
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={result.statusAfter} />
                      <Badge variant="outline">{result.photoCount} фото</Badge>
                      {result.cost && (
                        <Badge variant="outline">{result.cost.toLocaleString("ru-RU")} руб.</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            {!hasFinalResult &&
              reportAssets.map((asset) => (
                <div className="grid gap-2 rounded-xl bg-muted/60 p-3" key={asset.id}>
                  <AssetRow asset={asset} onClick={() => openAsset(asset.id)} />
                  <p className="m-0 text-muted-foreground text-sm">
                    Ожидаем результат мастера по этому узлу.
                  </p>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Сводка отчета</CardTitle>
            <CardDescription>
              Короткий разбор, чтобы не проваливаться в каждый узел вручную.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="rounded-lg bg-muted p-3 text-sm">
              {hasFinalResult
                ? `Проверено ${reportResults.length} из ${reportAssetCount}. Замечаний: ${issueResults.length}.`
                : `Отправлено ${reportAssetCount} узлов. Мастер еще не прислал результаты.`}
            </div>
            {hasFinalResult && inspection?.conclusion && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <strong className="block">Комментарий мастера</strong>
                <span className="mt-1 block text-muted-foreground">{inspection.conclusion}</span>
              </div>
            )}
            {issueResults.length > 0 && (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">Требуют внимания</strong>
                  <Button
                    disabled={!actionableIssueAssetIds.length}
                    onClick={() => createWorkOrderFromAssets(actionableIssueAssetIds)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Plus size={14} />
                    Задание по всем
                  </Button>
                </div>
                {issueResults.map((result) => {
                  const asset = assets.find((item) => item.id === result.assetId);
                  const assetCode = result.assetCode || asset?.code || "Без номера";
                  const assetName = result.assetName || asset?.name || "Удаленный узел";
                  return (
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-muted p-2"
                      key={result.id}
                    >
                      <button
                        className="min-w-0 p-1 text-left"
                        disabled={!asset}
                        onClick={() => asset && openAsset(asset.id)}
                        type="button"
                      >
                        <span className="block truncate font-medium">{assetCode} · {assetName}</span>
                        <span className="block truncate text-muted-foreground text-sm">{result.comment}</span>
                      </button>
                      {asset && (
                        <Button
                          aria-label={`Создать задание по узлу ${asset.code}`}
                          onClick={() => createWorkOrderFromAssets([asset.id])}
                          size="icon-sm"
                          title="Создать задание"
                          type="button"
                          variant="outline"
                        >
                          <Plus size={14} />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {reportEvents.length > 0 && (
              <div className="space-y-5">
                {reportEvents.slice(0, 3).map((event) => {
                  const asset = assets.find((item) => item.id === event.assetId);
                  return (
                    <EventTask
                      asset={asset}
                      event={event}
                      key={event.id}
                      media={mediaForEvent(event, media.filter((item) => item.assetId === event.assetId))}
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  onClick,
  value,
  tone,
}: {
  label: string;
  onClick?: () => void;
  value: string;
  tone?: "negative" | "positive" | "warning" | "violet";
}) {
  const toneClass =
    tone === "negative"
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "violet"
          ? "text-violet-600"
          : "";

  const content = (
    <Card size="sm">
      <CardContent className="grid gap-1">
        <span className="text-muted-foreground text-sm">{label}</span>
        <strong className={`text-2xl font-medium leading-tight ${toneClass}`}>{value}</strong>
      </CardContent>
    </Card>
  );

  if (onClick) {
    return (
      <button
        className="stat-card-button"
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return content;
}

function AssetRow({
  asset,
  onClick,
}: {
  asset: Asset;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="grid min-w-0 gap-1 text-left">
        <strong className="truncate font-medium">{asset.code} · {asset.name}</strong>
        <small className="truncate text-muted-foreground text-sm">
          {roomName(asset.roomId)} · {categoryLabel(asset.category)}
        </small>
      </span>
      <StatusBadge status={asset.status} />
    </>
  );

  if (onClick) {
    return (
      <button
        className="flex w-full items-center justify-between gap-3 rounded-lg bg-muted p-3 text-left transition-colors hover:bg-secondary"
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-lg bg-muted p-3">
      {content}
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge className={`status-pill ${status}`} variant={statusBadgeVariant(status)}>
      {statusLabels[status]}
    </Badge>
  );
}

function statusBadgeVariant(status: Status): "default" | "secondary" | "destructive" | "outline" {
  if (status === "attention") return "destructive";
  if (status === "ok") return "secondary";
  if (status === "in_progress") return "outline";
  return "default";
}

function EventTask({
  asset,
  event,
  media = [],
  onOpen,
}: {
  asset?: Asset;
  event: AssetEvent;
  media?: AssetMedia[];
  onOpen?: () => void;
}) {
  return (
    <Task defaultOpen>
      <TaskTrigger title={`${event.date} · ${event.title}`}>
        <button className="group flex w-full items-start gap-3 text-left" type="button">
          <span className="mt-1.5 size-2.5 rounded-full bg-primary" />
          <span className="grid min-w-0 flex-1 gap-1">
            <span className="text-muted-foreground text-sm">
              {event.date}
              {asset ? ` · ${asset.code} · ${roomName(asset.roomId)}` : ` · ${eventLabels[event.type]}`}
            </span>
            <span className="font-medium text-base leading-snug">{event.title}</span>
          </span>
        </button>
      </TaskTrigger>
      <TaskContent>
        <TaskItem>{event.body}</TaskItem>
        <div className="flex flex-wrap gap-2">
          {asset && <TaskItemFile>{asset.code}</TaskItemFile>}
          {event.master && <TaskItemFile>Мастер: {event.master}</TaskItemFile>}
          {event.cost && (
            <TaskItemFile>{event.cost.toLocaleString("ru-RU")} руб.</TaskItemFile>
          )}
          {event.statusAfter && <TaskItemFile>{statusLabels[event.statusAfter]}</TaskItemFile>}
        </div>
        <MediaGallery fallbackEvent={event.photo ? event : undefined} items={media} variant="list" />
        {onOpen && (
          <Button className="mt-1" variant="ghost" size="sm" onClick={onOpen} type="button">
            Открыть узел
          </Button>
        )}
      </TaskContent>
    </Task>
  );
}

function InspectionComposer({
  onChange,
  placeholder,
  value,
}: {
  onChange?: (value: string) => void;
  placeholder: string;
  value?: string;
}) {
  return (
    <PromptInput className="w-full" onSubmit={() => undefined}>
      <PromptInputBody>
        <PromptInputTextarea
          onChange={(event) => onChange?.(event.currentTarget.value)}
          placeholder={placeholder}
          value={value}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger />
            <PromptInputActionMenuContent>
              <PromptInputActionAddAttachments label="Прикрепить фото" />
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
        </PromptInputTools>
        <PromptInputSubmit aria-label="Отправить" />
      </PromptInputFooter>
    </PromptInput>
  );
}

function ContractorScopePicker({
  assets,
  onChange,
  selectedAssetIds,
}: {
  assets: Asset[];
  onChange: (assetIds: string[]) => void;
  selectedAssetIds: string[];
}) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const allAssetIds = assets.map((asset) => asset.id);
  const planScopes = planModes
    .map((mode) => {
      const assetIds = planHotspots[mode.id]
        .map((hotspot) => hotspotAssetId(hotspot))
        .filter((id) => assets.some((asset) => asset.id === id));

      return {
        id: mode.id,
        label: mode.label,
        assetIds: Array.from(new Set(assetIds)),
      };
    })
    .filter((scope) => scope.assetIds.length > 0);
  const filteredAssets = assets.filter((asset) => matchesAssetSearch(asset, query)).slice(0, 18);

  function setSelected(ids: string[]) {
    const known = new Set(allAssetIds);
    onChange(Array.from(new Set(ids.filter((id) => known.has(id)))));
  }

  function toggleMany(ids: string[]) {
    const allSelected = ids.every((id) => selected.has(id));
    if (allSelected) {
      setSelected(selectedAssetIds.filter((id) => !ids.includes(id)));
      return;
    }

    setSelected([...selectedAssetIds, ...ids]);
  }

  function toggleOne(id: string) {
    if (selected.has(id)) {
      setSelected(selectedAssetIds.filter((assetId) => assetId !== id));
      return;
    }

    setSelected([...selectedAssetIds, id]);
  }

  return (
    <div className="contractor-scope-picker">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-1">
          <strong className="text-sm font-medium">Область задания</strong>
          <span className="text-muted-foreground text-sm">
            Выбрано {selectedAssetIds.length} из {assets.length} узлов.
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setSelected(allAssetIds)}
            size="sm"
            type="button"
            variant={selectedAssetIds.length === assets.length ? "default" : "secondary"}
          >
            Вся квартира
          </Button>
          <Button
            disabled={!selectedAssetIds.length}
            onClick={() => setSelected([])}
            size="sm"
            type="button"
            variant="secondary"
          >
            Очистить
          </Button>
        </div>
      </div>

      <div>
        <span className="contractor-field-caption">Категории плана</span>
        <div className="contractor-mode-grid">
          {planScopes.map((scope) => {
            const isActive = scope.assetIds.every((id) => selected.has(id));
            return (
              <Button
                aria-pressed={isActive}
                className="contractor-scope-button"
                key={scope.id}
                onClick={() => toggleMany(scope.assetIds)}
                size="sm"
                type="button"
                variant={isActive ? "default" : "secondary"}
              >
                <span className="min-w-0 truncate">{scope.label}</span>
                <Badge variant={isActive ? "secondary" : "outline"}>{scope.assetIds.length}</Badge>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="contractor-asset-select">
        <div className="contractor-asset-search">
          <Search size={16} />
          <Input
            aria-label="Найти узел для задания"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Найти конкретный узел"
            value={query}
          />
        </div>
        <div className="contractor-asset-grid" aria-label="Конкретные узлы">
          {filteredAssets.map((asset) => {
            const isActive = selected.has(asset.id);
            return (
              <button
                aria-pressed={isActive}
                className={isActive ? "contractor-asset-option active" : "contractor-asset-option"}
                key={asset.id}
                onClick={() => toggleOne(asset.id)}
                type="button"
              >
                <span className="min-w-0">
                  <strong>{asset.code} · {asset.name}</strong>
                  <small>
                    {roomName(asset.roomId)} · {assetKindLabels[assetKind(asset)]}
                  </small>
                </span>
                {isActive && <Check size={16} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function contractorScopeFromIds(
  assets: Asset[],
  selectedAssetIds: string[],
): ContractorAccess["scope"] {
  const selected = new Set(selectedAssetIds);
  if (selected.size === assets.length && assets.every((asset) => selected.has(asset.id))) {
    return "all";
  }

  const selectedAssets = assets.filter((asset) => selected.has(asset.id));
  if (
    selectedAssets.length > 0 &&
    selectedAssets.every((asset) => asset.category === "plumbing")
  ) {
    return "plumbing";
  }

  if (
    selectedAssets.length > 0 &&
    selectedAssets.every((asset) => asset.category === "electric")
  ) {
    return "electric";
  }

  return "custom";
}
