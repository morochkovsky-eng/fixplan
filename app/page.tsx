"use client";

import { useEffect, useMemo, useState, type PointerEvent } from "react";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
  type AttachmentData,
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
  Check,
  CircleAlert,
  History,
  LayoutDashboard,
  List,
  Map as MapIcon,
  Menu,
  Plus,
  ArrowLeft,
  Pencil,
  Save,
  Search,
  Settings,
  Trash2,
  UserRoundCheck,
  X,
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
  assetId: string;
  eventId?: string;
  inspectionId?: string;
  url: string;
  filename: string;
  mediaType: string;
  caption?: string;
  createdBy?: string;
  createdAt?: string;
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
  photoNote: string;
};

type AssetDraft = Pick<
  Asset,
  "code" | "name" | "roomId" | "category" | "kind" | "status" | "x" | "y" | "photoNote"
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

type AppState = {
  config: AppConfig;
  categories: AssetCategory[];
  assets: Asset[];
  deletedAssetIds?: string[];
  events: AssetEvent[];
  media: AssetMedia[];
  contractorAccess: ContractorAccess;
  inspections: Inspection[];
  inspectionResults: InspectionResult[];
};

type View =
  | "dashboard"
  | "plan"
  | "assets"
  | "asset"
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
  },
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
};

const storageKey = "shpalernaya-maintenance-mvp";

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

function assetBelongsToPlanMode(asset: Asset, modeId: PlanModeId) {
  const kind = assetKind(asset);
  if (modeId === "sockets") {
    return kind === "socket" || kind === "switch" || kind === "appliance" || asset.category === "household_appliance";
  }
  if (modeId === "lighting") return kind === "light";
  if (modeId === "plumbing") {
    return kind === "plumbing_fixture" || kind === "drain" || asset.category === "plumbing";
  }
  if (modeId === "ventilation") return kind === "ventilation";
  if (modeId === "furniture") return kind === "furniture" || asset.category === "furniture";
  if (modeId === "windows") return kind === "window" || asset.category === "window";
  if (modeId === "flooring") return asset.code.startsWith("FL-");
  if (modeId === "radiators") return kind === "radiator";
  if (modeId === "warmFloor") return kind === "warm_floor";
  return false;
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
    master: undefined,
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
  const prefixByMode: Record<PlanModeId, string> = {
    sockets: "R-",
    lighting: "L-",
    plumbing: "W-",
    ventilation: "V-",
    furniture: "F-",
    windows: "WIN-",
    flooring: "FL-",
    radiators: "RAD-",
    warmFloor: "TP-",
  };

  return {
    code: prefixByMode[mode.id],
    name: "",
    roomId: "living",
    category: categoryFromPlan(mode, kind),
    kind,
    status: "ok",
    x: 50,
    y: 50,
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

function withCatalogAssets(state: AppState): AppState {
  const deletedAssetIds = state.deletedAssetIds ?? [];
  const categories = categoryOptions(state.categories ?? initialState.categories);
  const deletedIds = new Set(deletedAssetIds);
  const activeAssets = state.assets.filter((asset) => !deletedIds.has(asset.id));
  const catalogAssets = buildCatalogAssets(activeAssets).filter((asset) => !deletedIds.has(asset.id));
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
  const [storageReady, setStorageReady] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [selectedAssetId, setSelectedAssetId] = useState("r07");
  const [selectedInspectionId, setSelectedInspectionId] = useState(
    defaultState.inspections[0]?.id ?? "",
  );
  const [assetReturnView, setAssetReturnView] = useState<View>("dashboard");
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");
  const [activePlanMode, setActivePlanMode] = useState<PlanModeId>("sockets");
  const [contractorWorkflow, setContractorWorkflow] = useState<Workflow>("inspection");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [newEventText, setNewEventText] = useState("");
  const [inspectionIndex, setInspectionIndex] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [planEditMode, setPlanEditMode] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [assetDraft, setAssetDraft] = useState<AssetDraft>(() =>
    assetDraftFromAsset(defaultState.assets[0]),
  );
  const [assetSaving, setAssetSaving] = useState(false);
  const [planEditSnapshot, setPlanEditSnapshot] = useState<AppState | null>(null);
  const [dirtyPlanAssetIds, setDirtyPlanAssetIds] = useState<string[]>([]);
  const [deletedPlanAssetIds, setDeletedPlanAssetIds] = useState<string[]>([]);

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
    const id = window.setTimeout(() => {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        try {
          setState(withCatalogAssets(JSON.parse(saved) as AppState));
        } catch {
          setState(defaultState);
        }
      }
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state, storageReady]);

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
            assets: remoteState.assets ?? current.assets,
            events: remoteState.events ?? current.events,
            media: remoteState.media ?? current.media,
            inspections: remoteState.inspections ?? current.inspections,
            inspectionResults: remoteState.inspectionResults ?? current.inspectionResults,
            categories: remoteState.categories ?? current.categories,
            contractorAccess: {
              ...current.contractorAccess,
              inspectionId:
                remoteState.inspections?.[0]?.id ??
                current.contractorAccess.inspectionId,
            },
          }),
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
  }, [authStatus]);

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
        .filter((event) => event.assetId === selectedAsset.id)
        .slice(),
    [selectedAsset.id, state.events],
  );

  const activePlan =
    planModes.find((mode) => mode.id === activePlanMode) ?? planModes[0];

  const visibleAssets = useMemo(
    () =>
      state.assets.filter((asset) => {
        const categoryVisible = assetBelongsToPlanMode(asset, activePlan.id);
        const issueVisible =
          !onlyIssues || ["attention", "in_progress", "needs_master"].includes(asset.status);
        return categoryVisible && issueVisible;
      }),
    [activePlan.id, onlyIssues, state.assets],
  );

  const issueAssets = state.assets.filter((asset) => asset.status !== "ok");
  const attentionAssets = state.assets.filter((asset) => asset.status === "attention");
  const inProgressAssets = state.assets.filter(
    (asset) => asset.status === "in_progress",
  );
  const needsMasterAssets = state.assets.filter(
    (asset) => asset.status === "needs_master",
  );
  const dirtyPlanAssetCount =
    new Set([...dirtyPlanAssetIds, ...deletedPlanAssetIds]).size +
    (!editingAssetId && assetDraft.code.trim() && assetDraft.name.trim() ? 1 : 0);
  const currentInspectionAsset = state.assets[inspectionIndex % state.assets.length];

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

  function openAssets(filter: AssetFilter) {
    setAssetFilter(filter);
    setView("assets");
    setMobileMenuOpen(false);
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

    setActivePlanMode(planModeFromAssetFilter(asset.category));
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
          code: category.prefix,
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
      photoNote: draft.photoNote,
    };
    setActivePlanMode(mode.id);
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
      photoNote: assetDraft.photoNote.trim(),
    };

    if (!normalizedDraft.code || !normalizedDraft.name) {
      window.alert("Укажите код и название узла.");
      return;
    }

    const duplicate = state.assets.find(
      (asset) =>
        asset.id !== editingAssetId &&
        asset.code.trim().toLowerCase() === normalizedDraft.code.toLowerCase(),
    );
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
      photoNote: assetDraft.photoNote.trim(),
    };
    const shouldCreateDraft = !editingAssetId && Boolean(newDraft.code && newDraft.name);

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

        if (!normalizedAssetDraft.code || !normalizedAssetDraft.name) {
          window.alert("Укажите код и название узла.");
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

  function completeInspection(status: Status) {
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
    setView(workflow === "work_order" ? "work_orders" : "inspections");
  }

  async function updateInspection(inspectionId: string, patch: Partial<Inspection>) {
    const response = await fetch(`/api/inspections/${inspectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contractor: patch.contractor,
        contractorPhone: patch.contractorPhone,
        scope: patch.scope,
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
      setView("inspections");
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
      <main className="app-shell">
      <header className="mobile-header">
        <button
          aria-label="Открыть дашборд"
          className="mobile-brand"
          onClick={() => navigate("dashboard")}
          type="button"
        >
          <strong>{state.config.serviceName}</strong>
          <span>{state.config.objectName}</span>
        </button>
        <Button
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
          onClick={() => setMobileMenuOpen((value) => !value)}
          size="icon"
          type="button"
          variant="secondary"
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </Button>
      </header>
      {mobileMenuOpen && (
        <div className="mobile-menu">
          <nav className="nav-list" aria-label="Мобильная навигация">
            <AppNavigation activeView={view} navigate={navigate} />
          </nav>
        </div>
      )}
      <aside className="sidebar">
        <button
          aria-label="Открыть дашборд"
          className="brand"
          onClick={() => navigate("dashboard")}
          type="button"
        >
          <strong>{state.config.serviceName}</strong>
          <span>{state.config.objectName}</span>
        </button>
        <SidebarSearch assets={state.assets} openAsset={openAsset} />
        <nav className="nav-list" aria-label="Главная навигация">
          <AppNavigation activeView={view} navigate={navigate} />
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewTitle(view, selectedAsset)}</h1>
            <p>{viewSubtitle(view)}</p>
          </div>
        </header>

        {view === "dashboard" && (
          <Dashboard
            assets={state.assets}
            attentionAssets={attentionAssets}
            issueAssets={issueAssets}
            inProgressAssets={inProgressAssets}
            needsMasterAssets={needsMasterAssets}
            openAsset={openAsset}
            openAssets={openAssets}
            goPlan={() => setView("plan")}
          />
        )}

        {view === "plan" && (
          <PlanView
            assets={visibleAssets}
            allAssets={state.assets}
            activePlanMode={activePlanMode}
            categories={state.categories}
            assetDraft={assetDraft}
            assetSaving={assetSaving}
            cancelPlanChanges={cancelPlanChanges}
            deleteEditingAsset={deleteEditingAsset}
            dirtyPlanAssetCount={dirtyPlanAssetCount}
            editingAssetId={editingAssetId}
            editMode={planEditMode}
            enterPlanEditMode={enterPlanEditMode}
            onlyIssues={onlyIssues}
            moveAssetOnPlan={moveAssetOnPlan}
            setActivePlanMode={setActivePlanMode}
            setAssetDraft={updateAssetDraft}
            savePlanChanges={savePlanChanges}
            saveAssetDraft={saveAssetDraft}
            selectAssetForEditing={selectAssetForEditing}
            startNewAsset={startNewAsset}
            toggleIssues={() => setOnlyIssues((value) => !value)}
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
          />
        )}

        {view === "asset" && (
          <AssetDetail
            asset={selectedAsset}
            events={selectedEvents}
            media={state.media}
            newEventText={newEventText}
            setNewEventText={setNewEventText}
            addEvent={addEvent}
            setAssetStatus={setAssetStatus}
            editAsset={() => editAssetFromCatalog(selectedAsset.id)}
            returnLabel={assetReturnLabel(assetReturnView)}
            goBack={() => navigate(assetReturnView)}
          />
        )}

        {view === "log" && (
          <ActivityLog assets={state.assets} events={state.events} media={state.media} openAsset={openAsset} />
        )}

        {view === "inspection" && (
          <InspectionView
            asset={currentInspectionAsset}
            index={inspectionIndex}
            total={state.assets.length}
            completeInspection={completeInspection}
            openAsset={openAsset}
          />
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
            events={state.events}
            inspection={selectedInspection}
            media={state.media}
            results={state.inspectionResults}
            openAsset={openAsset}
            openInspections={() => setView("inspections")}
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
      </main>
    </TooltipProvider>
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

function viewTitle(view: View, asset: Asset) {
  const titles: Record<View, string> = {
    dashboard: "Дашборд квартиры",
    plan: "План квартиры",
    assets: "Список узлов",
    asset: `${asset.code} · ${asset.name}`,
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
    dashboard: "Что требует внимания, что уже в работе и где нужен мастер.",
    plan: "Слои узлов поверх схемы квартиры.",
    assets: "Инвентарный список по комнатам, категориям и статусам.",
    asset: "История, фото, паспорт узла и быстрые действия.",
    log: "Все события квартиры в одной ленте.",
    inspection: "Пошаговая проверка узлов с телефона или ноутбука.",
    inspections: "Выдача ссылок мастерам, все созданные обходы и сводки по узлам.",
    work_orders: "Работы по конкретным узлам: что сделать, кому отправлено и что вернулось.",
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
    log: "К журналу",
    inspection: "К обходу",
    inspections: "К обходам",
    work_orders: "К заданиям",
    report: "К отчету",
    contractor: "К обходам",
  };
  return labels[view] ?? "Назад";
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
  navigate,
}: {
  activeView: View;
  navigate: (view: View) => void;
}) {
  return (
    <>
      <NavButton active={activeView === "dashboard"} onClick={() => navigate("dashboard")}>
        <LayoutDashboard size={16} />
        Дашборд
      </NavButton>
      <NavButton active={activeView === "plan"} onClick={() => navigate("plan")}>
        <MapIcon size={16} />
        План
      </NavButton>
      <NavButton active={activeView === "assets"} onClick={() => navigate("assets")}>
        <List size={16} />
        Узлы
      </NavButton>
      <NavButton
        active={["inspections", "contractor", "report", "inspection"].includes(activeView)}
        onClick={() => navigate("inspections")}
      >
        <History size={16} />
        Обходы и отчеты
      </NavButton>
      <NavButton active={activeView === "work_orders"} onClick={() => navigate("work_orders")}>
        <Check size={16} />
        Задания
      </NavButton>
      <NavButton active={activeView === "log"} onClick={() => navigate("log")}>
        <History size={16} />
        Журнал
      </NavButton>
      <NavButton active={activeView === "settings"} onClick={() => navigate("settings")}>
        <Settings size={16} />
        Настройки
      </NavButton>
    </>
  );
}

function NavButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      className="w-full justify-start"
      variant={active ? "secondary" : "ghost"}
      onClick={onClick}
      type="button"
    >
      {children}
    </Button>
  );
}

function StatusSelect({
  value,
  onValueChange,
  className,
}: {
  value: Status;
  onValueChange: (value: Status) => void;
  className?: string;
}) {
  const triggerClassName = [
    "status-select-trigger",
    `status-select-${value}`,
    className ?? "w-[240px]",
  ].join(" ");

  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as Status)}>
      <SelectTrigger
        aria-label="Текущий статус"
        className={triggerClassName}
        size="default"
      >
        <SelectValue />
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
  attentionAssets,
  issueAssets,
  inProgressAssets,
  needsMasterAssets,
  openAsset,
  openAssets,
  goPlan,
}: {
  assets: Asset[];
  attentionAssets: Asset[];
  issueAssets: Asset[];
  inProgressAssets: Asset[];
  needsMasterAssets: Asset[];
  openAsset: (id: string) => void;
  openAssets: (filter: AssetFilter) => void;
  goPlan: () => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="mobile-metric-grid grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Всего узлов"
          onClick={() => openAssets("all")}
          value={assets.length.toString()}
        />
        <StatCard
          label="Требует внимания"
          onClick={() => openAssets("attention")}
          tone="negative"
          value={attentionAssets.length.toString()}
        />
        <StatCard
          label="В работе"
          onClick={() => openAssets("in_progress")}
          tone="warning"
          value={inProgressAssets.length.toString()}
        />
        <StatCard
          label="Нужен мастер"
          onClick={() => openAssets("needs_master")}
          tone="violet"
          value={needsMasterAssets.length.toString()}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="md:col-span-2">
          <CardHeader className="grid-cols-[1fr_auto] gap-3">
            <div>
              <CardTitle>Что не так сейчас</CardTitle>
              <CardDescription>Узлы, которые требуют решения или мастера.</CardDescription>
            </div>
            <Button variant="ghost" onClick={goPlan} type="button">
              Открыть план
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {issueAssets.map((asset) => (
              <AssetRow key={asset.id} asset={asset} onClick={() => openAsset(asset.id)} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Работы и мастера</CardTitle>
            <CardDescription>Что уже в процессе.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {inProgressAssets.concat(needsMasterAssets).map((asset) => (
              <AssetRow key={asset.id} asset={asset} onClick={() => openAsset(asset.id)} />
            ))}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 xl:col-span-3">
          <CardHeader>
            <CardTitle>Здоровье квартиры</CardTitle>
            <CardDescription>Контрольные показатели по обслуживанию.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric value="82%" label="проверено за месяц" />
            <Metric value="3" label="гарантии в календаре" />
            <Metric value="3 500 руб." label="расходы за август" />
            <Metric value="1" label="отчет мастера ожидает решения" />
          </CardContent>
        </Card>
      </div>
    </div>
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
  assets,
  allAssets,
  activePlanMode,
  categories,
  assetDraft,
  assetSaving,
  cancelPlanChanges,
  deleteEditingAsset,
  dirtyPlanAssetCount,
  editingAssetId,
  editMode,
  enterPlanEditMode,
  onlyIssues,
  moveAssetOnPlan,
  setActivePlanMode,
  setAssetDraft,
  savePlanChanges,
  saveAssetDraft,
  selectAssetForEditing,
  startNewAsset,
  toggleIssues,
  openAsset,
}: {
  assets: Asset[];
  allAssets: Asset[];
  activePlanMode: PlanModeId;
  categories: AssetCategory[];
  assetDraft: AssetDraft;
  assetSaving: boolean;
  cancelPlanChanges: () => void;
  deleteEditingAsset: () => void;
  dirtyPlanAssetCount: number;
  editingAssetId: string | null;
  editMode: boolean;
  enterPlanEditMode: () => void;
  onlyIssues: boolean;
  moveAssetOnPlan: (assetId: string, x: number, y: number) => void;
  setActivePlanMode: (mode: PlanModeId) => void;
  setAssetDraft: (draft: AssetDraft | ((current: AssetDraft) => AssetDraft)) => void;
  savePlanChanges: () => void;
  saveAssetDraft: () => void;
  selectAssetForEditing: (asset: Asset) => void;
  startNewAsset: () => void;
  toggleIssues: () => void;
  openAsset: (id: string) => void;
}) {
  const activeMode = planModes.find((mode) => mode.id === activePlanMode) ?? planModes[0];
  const activeHotspots = planHotspots[activeMode.id];
  const editingAsset = editingAssetId
    ? allAssets.find((asset) => asset.id === editingAssetId) ?? null
    : null;

  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-6 max-[980px]:grid-cols-1">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Схема квартиры</CardTitle>
              <CardDescription>
                Переключайте рабочий лист плана. Одновременно активен один режим.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
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
                <Button
                  onClick={enterPlanEditMode}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <Pencil size={14} />
                  Редактировать узлы
                </Button>
              )}
              <Button onClick={startNewAsset} size="sm" type="button" variant="secondary">
                <Plus size={14} />
                Новый узел
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="plan-mode-toolbar" role="tablist" aria-label="Режимы плана">
            {planModes.map((mode) => (
              <Button
                aria-selected={activePlanMode === mode.id}
                className="justify-start"
                key={mode.id}
                onClick={() => setActivePlanMode(mode.id)}
                role="tab"
                size="sm"
                type="button"
                variant={activePlanMode === mode.id ? "default" : "secondary"}
              >
                {mode.label}
              </Button>
            ))}
            <Button
              variant={onlyIssues ? "destructive" : "secondary"}
              onClick={toggleIssues}
              size="sm"
              type="button"
            >
              Только проблемы
            </Button>
          </div>
          <ApartmentPlan
            activeMode={activeMode}
            hotspots={activeHotspots}
            assets={assets}
            editMode={editMode}
            editingAssetId={editingAssetId}
            moveAssetOnPlan={moveAssetOnPlan}
            openAsset={openAsset}
            selectAssetForEditing={selectAssetForEditing}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{editMode ? "Редактор узла" : "Видимые узлы"}</CardTitle>
          <CardDescription>
            {editMode
              ? "Выберите точку на плане, перетащите ее и сохраните положение."
              : `${activeMode.label}: ${activeHotspots.length} контрольных точек, ${assets.length} из ${allAssets.length} узлов системы.`}
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
              <div className="rounded-lg bg-muted p-3 text-muted-foreground text-sm">
                {activeMode.summary}
              </div>
              {assets.map((asset) => (
                <AssetRow key={asset.id} asset={asset} onClick={() => openAsset(asset.id)} />
              ))}
              {!assets.length && (
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
          <label className="plan-editor-label" htmlFor="plan-asset-code">Код</label>
          <Input
            id="plan-asset-code"
            onChange={(event) => onChange((current) => ({ ...current, code: event.currentTarget.value }))}
            value={draft.code}
          />
        </div>
        <div className="grid gap-1.5">
          <label className="plan-editor-label" htmlFor="plan-asset-name">Название</label>
          <Input
            id="plan-asset-name"
            onChange={(event) => onChange((current) => ({ ...current, name: event.currentTarget.value }))}
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
      </div>

      <div className="grid gap-1.5">
        <label className="plan-editor-label" htmlFor="plan-asset-note">Описание</label>
        <Textarea
          id="plan-asset-note"
          onChange={(event) => onChange((current) => ({ ...current, photoNote: event.currentTarget.value }))}
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
  hotspots,
  assets,
  editMode,
  editingAssetId,
  moveAssetOnPlan,
  openAsset,
  selectAssetForEditing,
}: {
  activeMode: PlanMode;
  hotspots: PlanHotspot[];
  assets: Asset[];
  editMode: boolean;
  editingAssetId: string | null;
  moveAssetOnPlan: (assetId: string, x: number, y: number) => void;
  openAsset: (id: string) => void;
  selectAssetForEditing: (asset: Asset) => void;
}) {
  const visibleAssetIds = new Set(assets.map((asset) => asset.id));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

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
      <div className="plan-stage" role="img">
        <img alt={activeMode.label} className="plan-image base" src={activeMode.src} />
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
}) {
  const [sort, setSort] = useState<AssetSort>("status");
  const [query, setQuery] = useState("");
  const filterOptions = useMemo(() => assetFiltersForCategories(categories), [categories]);

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
        <Button className="asset-create-button" onClick={createAsset} type="button">
          <Plus size={16} />
          Новый узел
        </Button>
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

      <CategoryManager
        assets={assets}
        categories={categories}
        createCategory={createCategory}
        deleteCategory={deleteCategory}
        renameCategory={renameCategory}
        setFilter={setFilter}
      />

      <div className="asset-table">
        <div className="asset-table-head">
          <span>Узел</span>
          <span>Комната</span>
          <span>Тип</span>
          <span>Статус</span>
          <span>Действия</span>
        </div>
        {filteredAssets.map((asset) => (
          <div className="asset-table-row" key={asset.id}>
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

function CategoryManager({
  assets,
  categories,
  createCategory,
  deleteCategory,
  renameCategory,
  setFilter,
}: {
  assets: Asset[];
  categories: AssetCategory[];
  createCategory: (label: string) => Promise<boolean>;
  deleteCategory: (categoryId: Category) => Promise<boolean>;
  renameCategory: (categoryId: Category, label: string) => Promise<boolean>;
  setFilter: (filter: AssetFilter) => void;
}) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const options = categoryOptions(categories);

  async function submitCategory() {
    const created = await createCategory(newCategoryName);
    if (created) setNewCategoryName("");
  }

  async function promptRename(category: AssetCategory) {
    const nextLabel = window.prompt("Новое название категории", category.label);
    if (nextLabel === null || nextLabel.trim() === category.label) return;
    await renameCategory(category.id, nextLabel);
  }

  return (
    <div className="category-manager">
      <div className="category-manager-header">
        <div>
          <strong>Категории</strong>
          <span>Справочник групп: фильтр, цвет точки и схема по умолчанию.</span>
        </div>
        <div className="category-create-row">
          <Input
            aria-label="Название новой категории"
            onChange={(event) => setNewCategoryName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitCategory();
              }
            }}
            placeholder="Новая категория"
            value={newCategoryName}
          />
          <Button onClick={() => void submitCategory()} type="button" variant="secondary">
            <Plus size={16} />
            Добавить
          </Button>
        </div>
      </div>

      <div className="category-table" role="table" aria-label="Категории узлов">
        <div className="category-table-head" role="row">
          <span>Категория</span>
          <span>Узлов</span>
          <span>Префикс</span>
          <span>Действия</span>
        </div>
        {options.map((category) => {
          const count = assets.filter((asset) => asset.category === category.id).length;
          return (
            <div className="category-table-row" key={category.id} role="row">
              <button
                className="category-main"
                onClick={() => setFilter(category.id)}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="category-color"
                  style={{ backgroundColor: category.color }}
                />
                <strong>{category.label}</strong>
              </button>
              <span className="category-count">{count}</span>
              <span className="category-prefix">{category.prefix || "без префикса"}</span>
              <div className="category-actions">
                <Button
                  aria-label={`Переименовать ${category.label}`}
                  onClick={() => void promptRename(category)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Pencil size={14} />
                </Button>
                <Button
                  aria-label={`Удалить ${category.label}`}
                  onClick={() => void deleteCategory(category.id)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          );
        })}
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
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Основные настройки</CardTitle>
          <CardDescription>
            Эти названия используются в мобильной шапке, меню и дальнейшем интерфейсе объекта.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="grid gap-2" htmlFor="service-name">
            <span className="text-sm font-medium">Название сервиса</span>
            <Input
              id="service-name"
              value={config.serviceName}
              onChange={(event) => setConfig({ serviceName: event.currentTarget.value })}
              placeholder="Например, FixPlan"
            />
          </label>
          <label className="grid gap-2" htmlFor="object-name">
            <span className="text-sm font-medium">Название объекта</span>
            <Input
              id="object-name"
              value={config.objectName}
              onChange={(event) => setConfig({ objectName: event.currentTarget.value })}
              placeholder="Например, Шпалерная, 34Б"
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Мобильное меню</CardTitle>
          <CardDescription>В бургер-меню доступны основные рабочие разделы.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-muted-foreground text-sm">
          {["Дашборд", "План", "Узлы", "Обходы и отчеты", "Журнал", "Настройки"].map((item) => (
            <div className="rounded-lg bg-muted p-3" key={item}>{item}</div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AssetDetail({
  asset,
  events,
  media,
  newEventText,
  setNewEventText,
  addEvent,
  setAssetStatus,
  editAsset,
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
  setAssetStatus: (assetId: string, status: Status, body?: string) => void;
  editAsset: () => void;
  returnLabel: string;
  goBack: () => void;
}) {
  const assetMedia = media.filter((item) => item.assetId === asset.id);
  const mediaEvents = events.filter((event) => event.photo || assetMedia.some((item) => item.eventId === event.id));
  const historyContent = (
    <ScrollArea className="h-[520px] pr-4 max-[980px]:h-auto max-[980px]:pr-0">
      <div className="space-y-5">
        {events.map((event) => {
          const eventMedia = mediaForEvent(event, assetMedia);

          return (
            <Task key={event.id} defaultOpen>
              <TaskTrigger title={`${event.date} · ${event.title}`}>
                <button className="group flex w-full items-start gap-3 text-left" type="button">
                  <span className="mt-1.5 size-2.5 rounded-full bg-primary" />
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="text-muted-foreground text-sm">
                      {event.date} · {eventLabels[event.type]}
                    </span>
                    <span className="font-medium text-base leading-snug">
                      {event.title}
                    </span>
                  </span>
                </button>
              </TaskTrigger>
              <TaskContent>
                <TaskItem>{event.body}</TaskItem>
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
                <MediaGallery fallbackEvent={event.photo ? event : undefined} items={eventMedia} variant="list" />
              </TaskContent>
            </Task>
          );
        })}
      </div>
    </ScrollArea>
  );
  const passportContent = (
    <dl className="grid grid-cols-[128px_1fr] gap-x-3 gap-y-2 text-sm">
      <dt className="text-muted-foreground">ID</dt><dd className="font-medium">{asset.code}</dd>
      <dt className="text-muted-foreground">Комната</dt><dd className="font-medium">{roomName(asset.roomId)}</dd>
      <dt className="text-muted-foreground">Категория</dt><dd className="font-medium">{categoryLabel(asset.category)}</dd>
      <dt className="text-muted-foreground">Последняя проверка</dt><dd className="font-medium">{asset.lastChecked}</dd>
      <dt className="text-muted-foreground">Гарантия</dt><dd className="font-medium">{asset.warrantyUntil ?? "не указана"}</dd>
      <dt className="text-muted-foreground">Мастер</dt><dd className="font-medium">{asset.master ?? "не назначен"}</dd>
    </dl>
  );
  const mediaContent = assetMedia.length || mediaEvents.length ? (
    <MediaGallery
      fallbackEvents={mediaEvents.filter((event) => event.photo)}
      items={assetMedia}
      variant="grid"
    />
  ) : (
    <p className="text-muted-foreground text-sm">
      Фотографии появятся после события с вложением.
    </p>
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
                  {roomName(asset.roomId)} · {categoryLabel(asset.category)} · 220 В
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
              <TabsList aria-label="Данные узла" className="grid w-full grid-cols-2">
                <TabsTrigger value="passport">
              Паспорт
                </TabsTrigger>
                <TabsTrigger value="media">
              Медиа
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="passport" className="mt-0">
                {passportContent}
              </TabsContent>
              <TabsContent value="media" className="mt-0">
                {mediaContent}
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
            <TabsList aria-label="Разделы карточки узла" className="grid w-full grid-cols-3">
              <TabsTrigger value="history">История</TabsTrigger>
              <TabsTrigger value="passport">Паспорт</TabsTrigger>
              <TabsTrigger value="media">Медиа</TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent>
            <TabsContent value="history" className="mt-0">
              {historyContent}
            </TabsContent>
            <TabsContent value="passport" className="mt-0">
              {passportContent}
            </TabsContent>
            <TabsContent value="media" className="mt-0">
              {mediaContent}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
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

  if (!items.length && !fallback.length) {
    return null;
  }

  return (
    <Attachments className={variant === "list" ? "mt-2 w-full" : "ml-0 w-full"} variant={variant}>
      {items.map((item) => (
        <Attachment key={item.id} data={mediaPhotoData(item)}>
          <AttachmentPreview />
          {variant === "list" && <AttachmentInfo />}
        </Attachment>
      ))}
      {!items.length &&
        fallback.map((event) => (
          <Attachment key={event.id} data={eventPhotoData(event)}>
            <AttachmentPreview />
            {variant === "list" && <AttachmentInfo />}
          </Attachment>
        ))}
    </Attachments>
  );
}

function ActivityLog({
  assets,
  events,
  media,
  openAsset,
}: {
  assets: Asset[];
  events: AssetEvent[];
  media: AssetMedia[];
  openAsset: (id: string) => void;
}) {
  const sortedEvents = [...events].sort((a, b) => b.id.localeCompare(a.id));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Лента событий</CardTitle>
        <CardDescription>Все изменения по квартире в одном журнале.</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[640px] pr-4 max-[980px]:h-auto">
          <div className="space-y-5">
        {sortedEvents.map((event) => {
          const asset = assets.find((item) => item.id === event.assetId);
          return (
            <EventTask
              asset={asset}
              event={event}
              key={event.id}
              media={mediaForEvent(event, media.filter((item) => item.assetId === event.assetId))}
              onOpen={() => openAsset(event.assetId)}
            />
          );
        })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
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
  const latestInspection = inspections[0];
  const completedCount = inspections.filter((inspection) => inspection.status === "completed").length;
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

  return (
    <div className="grid gap-4">
      <div className="mobile-metric-grid grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={isWorkOrder ? "Всего заданий" : "Всего обходов"} value={`${inspections.length}`} />
        <StatCard label="Завершено" value={`${completedCount}`} tone="positive" />
        <StatCard label={isWorkOrder ? "Замечаний из заданий" : "Замечаний из отчетов"} value={`${issueResultCount}`} tone="negative" />
        <StatCard label="Последний" value={latestInspection?.completedAt ?? latestInspection?.createdAt ?? "нет"} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(320px,420px)] gap-6 max-[980px]:grid-cols-1">
        <Card>
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
          <CardContent className="grid gap-3">
            {inspections.map((inspection) => {
              const inspectionResults = results.filter((result) => result.inspectionId === inspection.id);
              const issues = inspectionResults.filter((result) => result.statusAfter !== "ok");
              const cost = inspectionResults.reduce((sum, result) => sum + (result.cost ?? 0), 0);
              const canEdit = !["completed", "accepted"].includes(inspection.status);
              const isEditing = editingInspectionId === inspection.id && editDraft;

              return (
                <div className="grid gap-3 rounded-xl bg-muted p-4" key={inspection.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid gap-1">
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
                      variant={inspection.status === "completed" ? "default" : "secondary"}
                    >
                      Открыть отчет
                    </Button>
                    {canEdit && !isEditing && (
                      <Button
                        className="w-fit"
                        onClick={() => startEdit(inspection)}
                        size="sm"
                        type="button"
                        variant="secondary"
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
                          variant="secondary"
                        >
                          Отмена
                        </Button>
                      </>
                    )}
                    {inspection.status !== "completed" && (
                      <Button asChild className="w-fit" size="sm" type="button" variant="secondary">
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

        <Card>
          <CardHeader>
            <CardTitle>{isWorkOrder ? "Как работает задание" : "Как теперь копится отчет"}</CardTitle>
            <CardDescription>Структура данных зафиксирована в интерфейсе.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {(isWorkOrder
              ? [
                  "Создаем задание и выбираем узлы или категории.",
                  "По каждому узлу можно оставить инструкцию для мастера.",
                  "Мастер открывает ссылку и проходит работу по шагам.",
                  "Результат попадает в задание и в историю каждого узла.",
                ]
              : [
                  "Создаем обход и выбираем область доступа.",
                  "Мастер открывает ссылку и проходит выбранные узлы.",
                  "По каждому узлу сохраняется результат: статус, комментарий, фото, стоимость.",
                  "Итог попадает в список обходов и одновременно в историю каждого узла.",
                ]).map((item) => (
              <div className="rounded-lg bg-muted p-3" key={item}>{item}</div>
            ))}
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
  events,
  inspection,
  media,
  results,
  openAsset,
  openInspections,
}: {
  assets: Asset[];
  events: AssetEvent[];
  inspection?: Inspection;
  media: AssetMedia[];
  results: InspectionResult[];
  openAsset: (id: string) => void;
  openInspections: () => void;
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
  const issueResults = reportResults.filter((result) => result.statusAfter !== "ok");
  const totalCost = reportResults.reduce((sum, result) => sum + (result.cost ?? 0), 0);
  const photoCount = reportResults.reduce((sum, result) => sum + result.photoCount, 0);
  const isCompleted = inspection?.status === "completed";

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
              <Badge variant={isCompleted ? "secondary" : "default"}>
                {inspectionStatusLabels[inspection.status]}
              </Badge>
            )}
            <Button onClick={openInspections} type="button" variant="secondary">
              Все обходы
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
        <StatCard label="В задании" value={`${reportAssets.length} узла`} />
        <StatCard label="Проверено" value={`${reportResults.length} узла`} />
        <StatCard label="Замечания" value={`${issueResults.length}`} tone="negative" />
        <StatCard label="Стоимость" value={`${totalCost.toLocaleString("ru-RU")} руб.`} />
        <StatCard label="Фото" value={`${photoCount} файлов`} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(320px,420px)] gap-6 max-[980px]:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>{isCompleted ? "Результаты по узлам" : "Узлы в задании"}</CardTitle>
            <CardDescription>
              {isCompleted
                ? "Все, что мастер написал по каждому узлу в рамках этого обхода."
                : "Состав отправленного задания. Результаты появятся после отправки мастером."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {isCompleted && inspection?.conclusion && (
              <div className="rounded-xl bg-muted p-4">
                <strong className="block text-sm">Общее заключение мастера</strong>
                <p className="m-0 mt-2 text-muted-foreground text-sm">{inspection.conclusion}</p>
              </div>
            )}
            {isCompleted &&
              reportResults.map((result) => {
                const asset = assets.find((item) => item.id === result.assetId);
                if (!asset) return null;
                const resultMedia = media.filter(
                  (item) => item.assetId === result.assetId && item.inspectionId === result.inspectionId,
                );
                return (
                  <div className="grid gap-2 rounded-xl bg-muted/60 p-3" key={result.id}>
                    <AssetRow asset={asset} onClick={() => openAsset(asset.id)} />
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
            {!isCompleted &&
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
              {isCompleted
                ? `Проверено ${reportResults.length} из ${reportAssets.length}. Замечаний: ${issueResults.length}.`
                : `Отправлено ${reportAssets.length} узлов. Мастер еще не прислал результаты.`}
            </div>
            {isCompleted && inspection?.conclusion && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <strong className="block">Комментарий мастера</strong>
                <span className="mt-1 block text-muted-foreground">{inspection.conclusion}</span>
              </div>
            )}
            {issueResults.length > 0 && (
              <div className="grid gap-2">
                <strong className="text-sm">Требуют внимания</strong>
                {issueResults.map((result) => {
                  const asset = assets.find((item) => item.id === result.assetId);
                  if (!asset) return null;
                  return (
                    <button
                      className="rounded-lg bg-muted p-3 text-left transition-colors hover:bg-secondary"
                      key={result.id}
                      onClick={() => openAsset(asset.id)}
                      type="button"
                    >
                      <span className="block font-medium">{asset.code} · {asset.name}</span>
                      <span className="block text-muted-foreground text-sm">{result.comment}</span>
                    </button>
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
