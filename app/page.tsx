"use client";

import { useEffect, useMemo, useState } from "react";
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
  ClipboardCheck,
  History,
  LayoutDashboard,
  List,
  Map,
  Menu,
  Play,
  RotateCcw,
  Settings,
  UserRoundCheck,
  X,
} from "lucide-react";

type Category =
  | "electric"
  | "plumbing"
  | "appliance"
  | "furniture"
  | "window"
  | "hvac";

type PlanModeId =
  | "sockets"
  | "lighting"
  | "switchLinks"
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

type PlanMode = {
  id: PlanModeId;
  label: string;
  src: string;
  categories: Category[];
  summary: string;
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
  inspectionId?: string;
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
  scope: ContractorAccess["scope"];
  status: InspectionStatus;
  allowedAssetIds: string[];
  summary: string;
  link: string;
  resultIds: string[];
};

type AppState = {
  config: AppConfig;
  assets: Asset[];
  events: AssetEvent[];
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

const categoryLabels: Record<Category, string> = {
  electric: "Электрика",
  plumbing: "Сантехника",
  appliance: "Техника",
  furniture: "Мебель",
  window: "Окна",
  hvac: "Климат",
};

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
  { id: "issues", label: "Требуют внимания" },
  { id: "electric", label: "Электрика" },
  { id: "socket", label: "Розетки" },
  { id: "switch", label: "Выключатели" },
  { id: "light", label: "Свет" },
  { id: "plumbing", label: "Сантехника" },
  { id: "drain", label: "Сливы" },
  { id: "appliance", label: "Техника" },
  { id: "window", label: "Окна" },
  { id: "furniture", label: "Мебель" },
  { id: "hvac", label: "Климат" },
  { id: "radiator", label: "Радиаторы" },
  { id: "warm_floor", label: "Теплые полы" },
  { id: "ventilation", label: "Вентиляция" },
];

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
    id: "switchLinks",
    label: "Выключатели с привязкой",
    src: "/plan/switches-light-links.png",
    categories: ["electric"],
    summary: "Связи выключателей с конкретными световыми приборами.",
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
  switchLinks: [
    { id: "sl-tor-left", code: "S-TOR-01", title: "Выключатель на торшере", room: "Гостиная", note: "Локальный выключатель декоративного светильника.", x: 24, y: 16, tone: "warning" },
    { id: "sl-living-6", code: "S-06", title: "Группа 6", room: "Гостиная", note: "Связь выключателя с люстрой гостиной.", x: 30, y: 30, tone: "positive" },
    { id: "sl-living-7", code: "S-07", title: "Группа 7", room: "Гостиная", note: "Связь выключателя с настенным светом.", x: 27, y: 50, tone: "positive" },
    { id: "sl-living-5-1", code: "S-05.1", title: "Линейный свет 1", room: "Кухня / гостиная", note: "Выключатель управляет левым модулем группы 5.", x: 20, y: 64, tone: "positive" },
    { id: "sl-living-5-2", code: "S-05.2", title: "Линейный свет 2", room: "Кухня / гостиная", note: "Выключатель управляет центральным модулем группы 5.", x: 30, y: 64, tone: "positive" },
    { id: "sl-living-5-3", code: "S-05.3", title: "Линейный свет 3", room: "Кухня / гостиная", note: "Выключатель управляет правым модулем группы 5.", x: 40, y: 64, tone: "positive" },
    { id: "sl-panel-567", code: "S-05/06/07", title: "Блок выключателей", room: "Гостиная / спальня", note: "Блок клавиш 5, 6 и 7 у перегородки.", x: 51, y: 54, tone: "warning" },
    { id: "sl-bedroom-8", code: "S-08", title: "Группа 8", room: "Спальня", note: "Связь выключателя с основным светом спальни.", x: 70, y: 34, tone: "positive" },
    { id: "sl-bedroom-tor", code: "S-TOR-02", title: "Выключатель на торшере", room: "Спальня", note: "Локальное управление зеленым светильником.", x: 83, y: 20, tone: "warning" },
    { id: "sl-office-9", code: "S-09", title: "Группа 9", room: "Кабинет", note: "Связь выключателя со светильником кабинета.", x: 75, y: 63, tone: "positive" },
    { id: "sl-office-tor", code: "S-TOR-03", title: "Выключатель на торшере", room: "Кабинет", note: "Локальное управление круглым светильником.", x: 86, y: 68, tone: "warning" },
    { id: "sl-hall-1", code: "S-01", title: "Группа 1", room: "Прихожая", note: "Связь выключателя со светом прихожей.", x: 62, y: 83, tone: "positive" },
    { id: "sl-bath-2", code: "S-02", title: "Группа 2", room: "Ванная", note: "Связь с линейными светильниками ванной.", x: 42, y: 76, tone: "positive" },
    { id: "sl-bath-3", code: "S-03", title: "Группа 3", room: "Ванная", note: "Связь с потолочным светом ванной.", x: 46, y: 76, tone: "positive" },
    { id: "sl-wc-4", code: "S-04", title: "Группа 4", room: "Санузел", note: "Привязка выключателя к потолочному светильнику санузла.", x: 86, y: 80, tone: "positive" },
    { id: "sl-wc-lamp", code: "S-LAMP-04", title: "Выключатель на светильнике", room: "Санузел", note: "Локальный выключатель на светильнике.", x: 80, y: 73, tone: "warning" },
    { id: "sl-b-point", code: "S-B", title: "Вывод B", room: "Санузел", note: "Дополнительная точка управления / вывод B.", x: 82, y: 86, tone: "violet" },
  ],
  plumbing: [
    { id: "p-w04", code: "W-04", title: "Смеситель", room: "Ванная", note: "Проверить соединения, протечки и напор.", x: 35, y: 76, tone: "positive", assetId: "w04" },
    { id: "p-w08", code: "W-08", title: "Слив в санузле", room: "Санузел", note: "Слив работает медленно, нужна чистка сифона.", x: 81, y: 82, tone: "violet", assetId: "w08" },
    { id: "p-shower", code: "W-02", title: "Душевой трап", room: "Ванная", note: "Трап в полу, проверить уклон и запах.", x: 27, y: 78, tone: "warning" },
    { id: "p-bath", code: "W-03", title: "Ванна", room: "Ванная", note: "Отдельностоящая ванна, слив по центру.", x: 18, y: 86, tone: "positive" },
    { id: "p-kitchen-sink", code: "W-05", title: "Раковина кухни", room: "Кухня", note: "Вывод воды и канализации под раковину.", x: 36, y: 73, tone: "positive" },
    { id: "p-washer", code: "W-06", title: "Стиральная машина", room: "Постирочная", note: "Вода и канализация после выбора оборудования.", x: 90, y: 74, tone: "warning" },
    { id: "p-boiler", code: "W-07", title: "Бойлер", room: "Санузел", note: "Проточный бойлер h=1800.", x: 91, y: 90, tone: "violet" },
  ],
  ventilation: [
    { id: "v-kitchen", code: "V-01", title: "Вытяжка кухни", room: "Кухня", note: "Центр отверстия уточняется у производителя кухни.", x: 21, y: 70, tone: "warning" },
    { id: "v-bath", code: "V-02", title: "Вентилятор ванной", room: "Ванная", note: "Электрический вентилятор, место уточнить на месте.", x: 22, y: 94, tone: "warning" },
    { id: "v-wc", code: "V-03", title: "Вентилятор санузла", room: "Санузел", note: "Вывод под вентиляцию на фасаде.", x: 88, y: 83, tone: "warning" },
    { id: "v-bedroom", code: "V-04", title: "Техническое отверстие", room: "Спальня", note: "Место расположения уточнить на месте.", x: 75, y: 45, tone: "violet" },
    { id: "v-grille", code: "V-05", title: "Короб с решетками", room: "Кабинет", note: "Проверить решетки и доступность обслуживания.", x: 77, y: 63, tone: "positive" },
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
  ],
  windows: [
    { id: "win-l1", code: "WIN-01", title: "Окно гостиной 1", room: "Гостиная", note: "Проверить фурнитуру и уплотнитель.", x: 9, y: 79, tone: "positive" },
    { id: "win-l2", code: "WIN-02", title: "Окно гостиной 2", room: "Гостиная", note: "Проверить открывание и откосы.", x: 9, y: 62, tone: "positive" },
    { id: "win03-map", code: "WIN-03", title: "Окно кабинета", room: "Кабинет", note: "Фото фурнитуры, контроль створок.", x: 76, y: 9, tone: "positive", assetId: "win03" },
    { id: "win-b1", code: "WIN-04", title: "Окно спальни левое", room: "Спальня", note: "Ширина проема 1068.", x: 58, y: 8, tone: "positive" },
    { id: "win-b2", code: "WIN-05", title: "Окно спальни правое", room: "Спальня", note: "Ширина проема 1068.", x: 84, y: 8, tone: "positive" },
    { id: "door-p1", code: "D-01", title: "Входная дверь", room: "Прихожая", note: "Проверить петли, замок, доводчик.", x: 66, y: 92, tone: "warning" },
  ],
  flooring: [
    { id: "fl-living", code: "FL-01", title: "Паркет", room: "Гостиная / спальня / кабинет", note: "Единое поле паркета 61,44 м².", x: 38, y: 43, tone: "positive" },
    { id: "fl-bath", code: "FL-02", title: "Плитка ванной", room: "Ванная", note: "Зона плитки 6,57 м².", x: 27, y: 82, tone: "positive" },
    { id: "fl-wc", code: "FL-03", title: "Плитка санузла", room: "Санузел", note: "Зона плитки 2,47 м².", x: 86, y: 82, tone: "positive" },
    { id: "fl-hall", code: "FL-04", title: "Паркет прихожей", room: "Прихожая", note: "Контроль пробкового компенсатора.", x: 58, y: 82, tone: "warning" },
    { id: "fl-comp", code: "FL-05", title: "Пробковый компенсатор", room: "Прихожая / влажные зоны", note: "Проверить стыки у плитки.", x: 64, y: 79, tone: "warning" },
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

const initialState: AppState = {
  config: {
    serviceName: "FixPlan",
    objectName: "Шпалерная, 34Б",
  },
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
  contractorAccess: {
    scope: "plumbing",
    expires: "3 дня",
    allowedAssetIds: ["w04", "w08"],
    inspectionId: "insp-001",
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
      scope: "plumbing",
      status: "completed",
      allowedAssetIds: ["w04", "w08"],
      summary: "Проверены смеситель и слив. По сливу нужна чистка сифона, ориентир 2 000 руб.",
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
  if (asset.category === "appliance") return "appliance";
  if (asset.category === "furniture") return "furniture";
  if (asset.category === "hvac") return "hvac";
  return "socket";
}

function isCategoryFilter(filter: AssetFilter): filter is Category {
  return Object.prototype.hasOwnProperty.call(categoryLabels, filter);
}

function isKindFilter(filter: AssetFilter): filter is AssetKind {
  return Object.prototype.hasOwnProperty.call(assetKindLabels, filter);
}

function matchesAssetFilter(asset: Asset, filter: AssetFilter) {
  if (filter === "all") return true;
  if (filter === "issues") return asset.status !== "ok";
  if (isCategoryFilter(filter)) return asset.category === filter;
  if (isKindFilter(filter)) return assetKind(asset) === filter;
  return true;
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

function inspectionId() {
  return `insp-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function resultId() {
  return `res-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function accessLinkFor(scope: ContractorAccess["scope"]) {
  return `shpalernaya.app/access/${scope}-${Math.random().toString(16).slice(2, 6)}`;
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
  if (modeId === "switchLinks") return "switch";
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
  if (kind === "appliance") return "appliance";
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

function buildCatalogAssets(existingAssets: Asset[]) {
  const seen = new Set(existingAssets.map((asset) => asset.id));
  return planModes.flatMap((mode) =>
    planHotspots[mode.id]
      .filter((hotspot) => !hotspot.assetId || !seen.has(hotspot.assetId))
      .map((hotspot) => catalogAssetFromHotspot(mode, hotspot)),
  );
}

function withCatalogAssets(state: AppState): AppState {
  const catalogAssets = buildCatalogAssets(state.assets);
  const knownIds = new Set(state.assets.map((asset) => asset.id));
  return {
    ...state,
    config: state.config ?? initialState.config,
    assets: [
      ...state.assets,
      ...catalogAssets.filter((asset) => !knownIds.has(asset.id)),
    ],
    inspections: state.inspections ?? initialState.inspections,
    inspectionResults: state.inspectionResults ?? initialState.inspectionResults,
    contractorAccess: {
      ...state.contractorAccess,
      inspectionId: state.contractorAccess.inspectionId ?? initialState.contractorAccess.inspectionId,
    },
  };
}

const defaultState = withCatalogAssets(initialState);

export default function Home() {
  const [state, setState] = useState<AppState>(() => {
    return defaultState;
  });
  const [storageReady, setStorageReady] = useState(false);
  const [view, setView] = useState<View>("asset");
  const [selectedAssetId, setSelectedAssetId] = useState("r07");
  const [activePlanMode, setActivePlanMode] = useState<PlanModeId>("sockets");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [newEventText, setNewEventText] = useState("");
  const [inspectionIndex, setInspectionIndex] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [contractorMode, setContractorMode] = useState<"setup" | "master">(
    "setup",
  );

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

  const selectedAsset =
    state.assets.find((asset) => asset.id === selectedAssetId) ??
    state.assets[0];

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
        const categoryVisible = activePlan.categories.includes(asset.category);
        const issueVisible =
          !onlyIssues || ["attention", "in_progress", "needs_master"].includes(asset.status);
        return categoryVisible && issueVisible;
      }),
    [activePlan.categories, onlyIssues, state.assets],
  );

  const issueAssets = state.assets.filter((asset) => asset.status !== "ok");
  const inProgressAssets = state.assets.filter(
    (asset) => asset.status === "in_progress",
  );
  const needsMasterAssets = state.assets.filter(
    (asset) => asset.status === "needs_master",
  );
  const currentInspectionAsset = state.assets[inspectionIndex % state.assets.length];

  function openAsset(id: string) {
    setSelectedAssetId(id);
    setView("asset");
    setMobileMenuOpen(false);
  }

  function navigate(viewName: View) {
    setView(viewName);
    setMobileMenuOpen(false);
  }

  function addEvent(assetId: string, patch?: Partial<AssetEvent>) {
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
    };
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

  function createContractorInspection() {
    const id = inspectionId();
    const scope = state.contractorAccess.scope;
    const allowed = state.contractorAccess.allowedAssetIds.length
      ? state.contractorAccess.allowedAssetIds
      : state.assets.slice(0, 5).map((asset) => asset.id);
    const inspection: Inspection = {
      id,
      number: `Обход #${state.inspections.length + 1}`,
      title: `Обход мастера · ${scope === "all" ? "вся квартира" : scope === "electric" ? "электрика" : scope === "plumbing" ? "сантехника" : "выбранные узлы"}`,
      createdAt: todayLabel(),
      createdBy: "Владелец",
      contractor: scope === "electric" ? "Электрик" : scope === "plumbing" ? "Сантехник" : "Мастер",
      scope,
      status: "sent",
      allowedAssetIds: allowed,
      summary: "Ссылка создана. Ожидаем отчет мастера по выбранным узлам.",
      link: accessLinkFor(scope),
      resultIds: [],
    };

    setState((current) => ({
      ...current,
      inspections: [inspection, ...current.inspections],
      contractorAccess: {
        ...current.contractorAccess,
        inspectionId: id,
        allowedAssetIds: allowed,
      },
    }));
    setContractorMode("master");
  }

  function submitContractorReport() {
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
    setView("report");
  }

  return (
    <TooltipProvider>
      <main className="app-shell">
      <header className="mobile-header">
        <div className="mobile-brand">
          <strong>{state.config.serviceName}</strong>
          <span>{state.config.objectName}</span>
        </div>
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
          <Button
            className="w-full justify-start"
            variant="secondary"
            onClick={() => {
              setState(defaultState);
              setMobileMenuOpen(false);
            }}
            type="button"
          >
            <RotateCcw size={16} />
            Сбросить демо
          </Button>
        </div>
      )}
      <aside className="sidebar">
        <div className="brand">
          <strong>{state.config.serviceName}</strong>
          <span>{state.config.objectName}</span>
        </div>
        <nav className="nav-list" aria-label="Главная навигация">
          <AppNavigation activeView={view} navigate={navigate} />
        </nav>
        <Button
          className="w-full justify-start"
          variant="secondary"
          onClick={() => setState(defaultState)}
          type="button"
        >
          <RotateCcw size={16} />
          Сбросить демо
        </Button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewTitle(view, selectedAsset)}</h1>
            <p>{viewSubtitle(view)}</p>
          </div>
          <div className="topbar-actions">
            <Button variant="secondary" onClick={() => navigate("contractor")} type="button">
              <UserRoundCheck size={16} />
              Доступ мастеру
            </Button>
            <Button onClick={() => navigate("inspection")} type="button">
              <Play size={16} />
              Начать обход
            </Button>
          </div>
        </header>

        {view === "dashboard" && (
          <Dashboard
            assets={state.assets}
            issueAssets={issueAssets}
            inProgressAssets={inProgressAssets}
            needsMasterAssets={needsMasterAssets}
            openAsset={openAsset}
            goPlan={() => setView("plan")}
          />
        )}

        {view === "plan" && (
          <PlanView
            assets={visibleAssets}
            allAssets={state.assets}
            activePlanMode={activePlanMode}
            onlyIssues={onlyIssues}
            setActivePlanMode={setActivePlanMode}
            toggleIssues={() => setOnlyIssues((value) => !value)}
            openAsset={openAsset}
          />
        )}

        {view === "assets" && (
          <AssetsView
            assets={state.assets}
            openAsset={openAsset}
            setAssetStatus={setAssetStatus}
          />
        )}

        {view === "asset" && (
          <AssetDetail
            asset={selectedAsset}
            events={selectedEvents}
            newEventText={newEventText}
            setNewEventText={setNewEventText}
            addEvent={addEvent}
            setAssetStatus={setAssetStatus}
            goContractor={() => setView("contractor")}
          />
        )}

        {view === "log" && (
          <ActivityLog assets={state.assets} events={state.events} openAsset={openAsset} />
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
            inspections={state.inspections}
            results={state.inspectionResults}
            openAsset={openAsset}
            openContractor={() => setView("contractor")}
          />
        )}

        {view === "contractor" && (
          <ContractorAccessView
            state={state}
            setState={setState}
            mode={contractorMode}
            createContractorInspection={createContractorInspection}
            submitContractorReport={submitContractorReport}
          />
        )}

        {view === "report" && (
          <ContractorReport
            assets={state.assets.filter((asset) =>
              state.contractorAccess.allowedAssetIds.includes(asset.id),
            )}
            events={state.events}
            inspections={state.inspections}
            results={state.inspectionResults}
            openAsset={openAsset}
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

function viewTitle(view: View, asset: Asset) {
  const titles: Record<View, string> = {
    dashboard: "Дашборд квартиры",
    plan: "План квартиры",
    assets: "Список узлов",
    asset: `${asset.code} · ${asset.name}`,
    log: "Журнал квартиры",
    inspection: "Обход квартиры",
    inspections: "Обходы и отчеты",
    contractor: "Доступ мастеру",
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
    inspections: "Все созданные обходы, результаты мастеров и сводки по узлам.",
    contractor: "Гостевая ссылка на выбранные узлы и чек-лист мастера.",
    report: "Сводка, которая вернулась после проверки по ссылке.",
    settings: "Название сервиса, объект и базовые параметры интерфейса.",
  };
  return subtitles[view];
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
        <Map size={16} />
        План
      </NavButton>
      <NavButton active={activeView === "assets"} onClick={() => navigate("assets")}>
        <List size={16} />
        Узлы
      </NavButton>
      <NavButton active={activeView === "inspection"} onClick={() => navigate("inspection")}>
        <ClipboardCheck size={16} />
        Обход
      </NavButton>
      <NavButton active={activeView === "inspections"} onClick={() => navigate("inspections")}>
        <History size={16} />
        Отчеты
      </NavButton>
      <NavButton active={activeView === "log"} onClick={() => navigate("log")}>
        <History size={16} />
        Журнал
      </NavButton>
      <NavButton active={activeView === "contractor"} onClick={() => navigate("contractor")}>
        <UserRoundCheck size={16} />
        Доступ мастеру
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
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as Status)}>
      <SelectTrigger
        aria-label="Текущий статус"
        className={className ?? "w-[240px]"}
        size="default"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(statusLabels) as Status[]).map((status) => (
          <SelectItem key={status} value={status}>
            {statusLabels[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Dashboard({
  assets,
  issueAssets,
  inProgressAssets,
  needsMasterAssets,
  openAsset,
  goPlan,
}: {
  assets: Asset[];
  issueAssets: Asset[];
  inProgressAssets: Asset[];
  needsMasterAssets: Asset[];
  openAsset: (id: string) => void;
  goPlan: () => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Всего узлов" value={assets.length.toString()} />
      <StatCard label="Требуют внимания" value={issueAssets.length.toString()} tone="negative" />
      <StatCard label="В работе" value={inProgressAssets.length.toString()} tone="warning" />
      <StatCard label="Нужен мастер" value={needsMasterAssets.length.toString()} tone="violet" />

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
  onlyIssues,
  setActivePlanMode,
  toggleIssues,
  openAsset,
}: {
  assets: Asset[];
  allAssets: Asset[];
  activePlanMode: PlanModeId;
  onlyIssues: boolean;
  setActivePlanMode: (mode: PlanModeId) => void;
  toggleIssues: () => void;
  openAsset: (id: string) => void;
}) {
  const activeMode = planModes.find((mode) => mode.id === activePlanMode) ?? planModes[0];
  const activeHotspots = planHotspots[activeMode.id];

  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-6 max-[980px]:grid-cols-1">
      <Card>
        <CardHeader>
          <CardTitle>Схема квартиры</CardTitle>
          <CardDescription>
            Переключайте рабочий лист плана. Одновременно активен один режим.
          </CardDescription>
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
            openAsset={openAsset}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Видимые узлы</CardTitle>
          <CardDescription>
            {activeMode.label}: {activeHotspots.length} контрольных точек, {assets.length} из{" "}
            {allAssets.length} узлов системы.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="rounded-lg bg-muted p-3 text-muted-foreground text-sm">
            {activeMode.summary}
          </div>
          {assets.map((asset) => (
            <AssetRow key={asset.id} asset={asset} onClick={() => openAsset(asset.id)} />
          ))}
          {!assets.length && (
            <p className="text-muted-foreground text-sm">По выбранным фильтрам узлов нет.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ApartmentPlan({
  activeMode,
  hotspots,
  assets,
  openAsset,
}: {
  activeMode: PlanMode;
  hotspots: PlanHotspot[];
  assets: Asset[];
  openAsset: (id: string) => void;
}) {
  const visibleAssetIds = new Set(assets.map((asset) => asset.id));

  return (
    <div className="apartment-plan" aria-label="Схема квартиры">
      <div className="plan-stage" role="img">
        <img alt={activeMode.label} className="plan-image base" src={activeMode.src} />
        {hotspots.map((hotspot) => {
          const markerAssetId = hotspot.assetId ?? hotspot.id;
          const isLinkedAsset = visibleAssetIds.has(markerAssetId);
          const isHiddenByIssueFilter = !visibleAssetIds.has(markerAssetId);
          if (isHiddenByIssueFilter) return null;

          return (
            <Tooltip key={hotspot.id}>
              <TooltipTrigger asChild>
                <button
                  aria-label={`${hotspot.code}, ${hotspot.title}, ${hotspot.room}`}
                  className={`plan-hotspot ${hotspot.tone ?? "positive"}${isLinkedAsset ? " linked" : ""}`}
                  onClick={() => openAsset(markerAssetId)}
                  style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
                  type="button"
                >
                  <span className="plan-hotspot-dot" />
                  <span className="plan-hotspot-code">{hotspot.code}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent sideOffset={8}>
                <span className="grid gap-1">
                  <strong>{hotspot.code} · {hotspot.title}</strong>
                  <span>{hotspot.room}</span>
                  <span>{hotspot.note}</span>
                </span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <div className="plan-caption">
        <span>Активный лист: {activeMode.label}</span>
        <span>Точки открывают подсказку; связанные узлы открывают карточку объекта</span>
      </div>
    </div>
  );
}

function AssetsView({
  assets,
  openAsset,
  setAssetStatus,
}: {
  assets: Asset[];
  openAsset: (id: string) => void;
  setAssetStatus: (id: string, status: Status) => void;
}) {
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [sort, setSort] = useState<AssetSort>("status");

  const filteredAssets = useMemo(() => {
    return assets
      .filter((asset) => matchesAssetFilter(asset, filter))
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
  }, [assets, filter, sort]);

  const filterCounts = useMemo(() => {
    return assetFilterOptions.reduce<Record<string, number>>((counts, option) => {
      counts[option.id] = assets.filter((asset) => matchesAssetFilter(asset, option.id)).length;
      return counts;
    }, {});
  }, [assets]);

  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto] gap-4 max-[720px]:grid-cols-1">
        <div>
          <CardTitle>Все узлы</CardTitle>
          <CardDescription>
            Инвентарный список с быстрыми фильтрами, сортировкой и сменой статуса.
          </CardDescription>
        </div>
        <Select value={sort} onValueChange={(value) => setSort(value as AssetSort)}>
          <SelectTrigger className="w-full sm:w-[240px]">
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
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {assetFilterOptions.map((option) => (
            <Button
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

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3 text-muted-foreground text-sm">
          <span>
            Показано {filteredAssets.length} из {assets.length}
          </span>
          <span>
            Фильтр: {assetFilterOptions.find((option) => option.id === filter)?.label}
          </span>
        </div>

        <div className="grid gap-2">
        {filteredAssets.map((asset) => (
          <div
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"
            key={asset.id}
          >
            <button className="grid gap-1 text-left" onClick={() => openAsset(asset.id)} type="button">
              <strong className="font-medium">{asset.code} · {asset.name}</strong>
              <span className="text-muted-foreground text-sm">
                {roomName(asset.roomId)} · {categoryLabels[asset.category]} ·{" "}
                {assetKindLabels[assetKind(asset)]}
              </span>
            </button>
            <StatusBadge status={asset.status} />
            <StatusSelect
              className="w-full sm:w-[220px]"
              value={asset.status}
              onValueChange={(status) => setAssetStatus(asset.id, status)}
            />
          </div>
        ))}
        {!filteredAssets.length && (
          <div className="rounded-lg border border-dashed p-6 text-muted-foreground text-sm">
            В этой группе пока нет узлов. Когда добавим реальные точки с плана, они появятся здесь.
          </div>
        )}
        </div>
      </CardContent>
    </Card>
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
          {["Дашборд", "План", "Узлы", "Обход", "Отчеты", "Журнал", "Доступ мастеру"].map((item) => (
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
  newEventText,
  setNewEventText,
  addEvent,
  setAssetStatus,
  goContractor,
}: {
  asset: Asset;
  events: AssetEvent[];
  newEventText: string;
  setNewEventText: (value: string) => void;
  addEvent: (assetId: string, patch?: Partial<AssetEvent>) => void;
  setAssetStatus: (assetId: string, status: Status, body?: string) => void;
  goContractor: () => void;
}) {
  const mediaEvents = events.filter((event) => event.photo);
  const currentStatusVariant = asset.status === "attention" ? "destructive" : "secondary";
  const historyContent = (
    <ScrollArea className="h-[520px] pr-4 max-[980px]:h-auto max-[980px]:pr-0">
      <div className="space-y-5">
        {events.map((event) => (
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
              {event.photo && (
                <Attachments variant="list" className="mt-2 w-full">
                  <Attachment data={eventPhotoData(event)}>
                    <AttachmentPreview />
                    <AttachmentInfo />
                  </Attachment>
                </Attachments>
              )}
            </TaskContent>
          </Task>
        ))}
      </div>
    </ScrollArea>
  );
  const passportContent = (
    <dl className="grid grid-cols-[128px_1fr] gap-x-3 gap-y-2 text-sm">
      <dt className="text-muted-foreground">ID</dt><dd className="font-medium">{asset.code}</dd>
      <dt className="text-muted-foreground">Комната</dt><dd className="font-medium">{roomName(asset.roomId)}</dd>
      <dt className="text-muted-foreground">Категория</dt><dd className="font-medium">{categoryLabels[asset.category]}</dd>
      <dt className="text-muted-foreground">Последняя проверка</dt><dd className="font-medium">{asset.lastChecked}</dd>
      <dt className="text-muted-foreground">Гарантия</dt><dd className="font-medium">{asset.warrantyUntil ?? "не указана"}</dd>
      <dt className="text-muted-foreground">Мастер</dt><dd className="font-medium">{asset.master ?? "не назначен"}</dd>
    </dl>
  );
  const mediaContent = mediaEvents.length ? (
    <Attachments variant="grid">
      {mediaEvents.map((event) => (
        <Attachment key={event.id} data={eventPhotoData(event)}>
          <AttachmentPreview />
        </Attachment>
      ))}
    </Attachments>
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
        addEvent(asset.id, {
          type: message.files.length ? "photo" : "comment",
          title: message.files.length ? "Фотофиксация" : "Комментарий",
          body: text || "Добавлены фотографии без комментария.",
          photo: message.files.length
            ? { label: "фото", note: message.files[0]?.filename ?? "Вложение" }
            : undefined,
        });
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
                  {roomName(asset.roomId)} · {categoryLabels[asset.category]} · 220 В · координаты:
                  {" "}
                  {asset.x}% / {asset.y}%
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={currentStatusVariant}>
                  Текущий статус: {statusLabels[asset.status]}
                </Badge>
                <StatusSelect
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
          <Button variant="outline" onClick={() => void goContractor()} type="button">
            <UserRoundCheck size={16} />
            Доступ мастеру
          </Button>
        </CardHeader>
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
            <TabsList aria-label="Разделы карточки узла" className="grid w-full grid-cols-4">
              <TabsTrigger value="history">История</TabsTrigger>
              <TabsTrigger value="passport">Паспорт</TabsTrigger>
              <TabsTrigger value="media">Медиа</TabsTrigger>
              <TabsTrigger value="comment">Комментарий</TabsTrigger>
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
            <TabsContent value="comment" className="mt-0">
              {commentContent}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
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

function ActivityLog({
  assets,
  events,
  openAsset,
}: {
  assets: Asset[];
  events: AssetEvent[];
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
          <CardDescription>{roomName(asset.roomId)} · {categoryLabels[asset.category]}</CardDescription>
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
        <ApartmentPlan assets={[asset]} openAsset={openAsset} />
        </CardContent>
      </Card>
    </div>
  );
}

function InspectionsView({
  assets,
  inspections,
  results,
  openAsset,
  openContractor,
}: {
  assets: Asset[];
  inspections: Inspection[];
  results: InspectionResult[];
  openAsset: (id: string) => void;
  openContractor: () => void;
}) {
  const latestInspection = inspections[0];
  const completedCount = inspections.filter((inspection) => inspection.status === "completed").length;
  const issueResultCount = results.filter((result) => result.statusAfter !== "ok").length;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Всего обходов" value={`${inspections.length}`} />
        <StatCard label="Завершено" value={`${completedCount}`} tone="positive" />
        <StatCard label="Замечаний из отчетов" value={`${issueResultCount}`} tone="negative" />
        <StatCard label="Последний" value={latestInspection?.completedAt ?? latestInspection?.createdAt ?? "нет"} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(320px,420px)] gap-6 max-[980px]:grid-cols-1">
        <Card>
          <CardHeader className="grid-cols-[1fr_auto] gap-4 max-[720px]:grid-cols-1">
            <div>
              <CardTitle>Все обходы</CardTitle>
              <CardDescription>
                Каждый обход хранит область доступа, мастера, результаты и ссылку на события узлов.
              </CardDescription>
            </div>
            <Button onClick={openContractor} type="button">
              <UserRoundCheck size={16} />
              Создать обход
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            {inspections.map((inspection) => {
              const inspectionResults = results.filter((result) => result.inspectionId === inspection.id);
              const issues = inspectionResults.filter((result) => result.statusAfter !== "ok");
              const cost = inspectionResults.reduce((sum, result) => sum + (result.cost ?? 0), 0);

              return (
                <div className="grid gap-3 rounded-lg border bg-background p-4" key={inspection.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <strong className="font-medium">{inspection.number} · {inspection.title}</strong>
                      <span className="text-muted-foreground text-sm">
                        {inspection.contractor} · {inspection.createdAt}
                        {inspection.completedAt ? ` · завершен ${inspection.completedAt}` : ""}
                      </span>
                    </div>
                    <Badge variant={inspection.status === "completed" ? "secondary" : "default"}>
                      {inspectionStatusLabels[inspection.status]}
                    </Badge>
                  </div>
                  <p className="m-0 text-muted-foreground text-sm">{inspection.summary}</p>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="outline">{inspection.allowedAssetIds.length} узлов</Badge>
                    <Badge variant={issues.length ? "destructive" : "secondary"}>
                      {issues.length} замечаний
                    </Badge>
                    <Badge variant="outline">{cost.toLocaleString("ru-RU")} руб.</Badge>
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
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Как теперь копится отчет</CardTitle>
            <CardDescription>Структура данных зафиксирована в интерфейсе.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {[
              "Создаем обход и выбираем область доступа.",
              "Мастер открывает ссылку и проходит выбранные узлы.",
              "По каждому узлу сохраняется результат: статус, комментарий, фото, стоимость.",
              "Итог попадает в список обходов и одновременно в историю каждого узла.",
            ].map((item) => (
              <div className="rounded-lg bg-muted p-3" key={item}>{item}</div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ContractorAccessView({
  state,
  setState,
  mode,
  createContractorInspection,
  submitContractorReport,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  mode: "setup" | "master";
  createContractorInspection: () => void;
  submitContractorReport: () => void;
}) {
  const allowedAssets = state.assets.filter((asset) =>
    state.contractorAccess.allowedAssetIds.includes(asset.id),
  );
  const activeInspection =
    state.inspections.find((inspection) => inspection.id === state.contractorAccess.inspectionId) ??
    state.inspections[0];

  if (mode === "master") {
    return (
      <div className="grid grid-cols-[minmax(320px,420px)_1fr] gap-6 max-[980px]:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>{activeInspection?.number ?? "Задание мастеру"}</CardTitle>
            <CardDescription>
              Шпалерная, 34Б · {activeInspection?.contractor ?? "мастер"} · доступ:{" "}
              {state.contractorAccess.expires}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {allowedAssets.map((asset) => (
              <AssetRow key={asset.id} asset={asset} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Чек-лист узла</CardTitle>
            <CardDescription>
              Отчет сохранится в обход и в историю каждого выбранного узла.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Button variant="secondary" type="button">Исправно</Button>
              <Button variant="secondary" type="button">Есть замечание</Button>
              <Button type="button">Нужен ремонт</Button>
            </div>
            <InspectionComposer placeholder="Комментарий мастера, фото, стоимость, материалы" />
            <Button className="w-full" onClick={submitContractorReport} type="button">
              Отправить отчет владельцу
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(320px,1fr)_minmax(320px,420px)] gap-6 max-[980px]:grid-cols-1">
      <Card>
        <CardHeader>
          <CardTitle>Создать доступ</CardTitle>
          <CardDescription>
            Мастер получит ссылку только на выбранные узлы и сможет отправить отчет.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2 pb-2">
          {[
            ["plumbing", "Сантехника"],
            ["electric", "Электрика"],
            ["all", "Вся квартира"],
          ].map(([scope, label]) => (
            <Button
              variant={state.contractorAccess.scope === scope ? "default" : "secondary"}
              key={scope}
              onClick={() => chooseContractorScope(setState, scope as ContractorAccess["scope"])}
              size="sm"
              type="button"
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            "Смотреть историю выбранных узлов",
            "Добавлять комментарии и фото",
            "Указывать стоимость и материалы",
            "Менять статус на «сделано»",
          ].map((permission) => (
            <div className="rounded-lg bg-muted p-3 text-sm" key={permission}>
              {permission}
            </div>
          ))}
        </div>
        <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
          {activeInspection?.link ?? "Ссылка появится после создания обхода"}
        </div>
        <Button onClick={createContractorInspection} type="button">
          Создать обход и открыть как мастер
        </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Узлы в задании</CardTitle>
          <CardDescription>
            {allowedAssets.length} выбранных узлов. После создания это станет отдельным обходом.
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
  inspections,
  results,
  openAsset,
}: {
  assets: Asset[];
  events: AssetEvent[];
  inspections: Inspection[];
  results: InspectionResult[];
  openAsset: (id: string) => void;
}) {
  const latestInspection = inspections[0];
  const reportEvents = events.filter((event) =>
    latestInspection ? event.inspectionId === latestInspection.id : event.type === "report",
  );
  const reportResults = latestInspection
    ? results.filter((result) => result.inspectionId === latestInspection.id)
    : results;
  const issueResults = reportResults.filter((result) => result.statusAfter !== "ok");
  const totalCost = reportResults.reduce((sum, result) => sum + (result.cost ?? 0), 0);
  const photoCount = reportResults.reduce((sum, result) => sum + result.photoCount, 0);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Проверено" value={`${reportResults.length || assets.length} узла`} />
      <StatCard label="Замечания" value={`${issueResults.length}`} tone="negative" />
      <StatCard label="Стоимость" value={`${totalCost.toLocaleString("ru-RU")} руб.`} />
      <StatCard label="Фото" value={`${photoCount} файлов`} />
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>{latestInspection?.number ?? "Отчет мастера"}</CardTitle>
          <CardDescription>
            {latestInspection?.summary ?? "Сводка результатов последнего обхода."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {reportResults.map((result) => {
            const asset = assets.find((item) => item.id === result.assetId);
            if (!asset) return null;
            return (
              <div className="grid gap-2 rounded-lg border p-3" key={result.id}>
                <AssetRow asset={asset} onClick={() => openAsset(asset.id)} />
                <p className="m-0 text-muted-foreground text-sm">{result.comment}</p>
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
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Что попало в журнал</CardTitle>
          <CardDescription>События из отчета мастера.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {reportEvents.slice(0, 4).map((event) => {
            const asset = assets.find((item) => item.id === event.assetId);
            return <EventTask asset={asset} event={event} key={event.id} />;
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
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

  return (
    <Card size="sm">
      <CardContent className="grid gap-1">
        <span className="text-muted-foreground text-sm">{label}</span>
        <strong className={`text-2xl font-medium leading-tight ${toneClass}`}>{value}</strong>
      </CardContent>
    </Card>
  );
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
          {roomName(asset.roomId)} · {categoryLabels[asset.category]}
        </small>
      </span>
      <StatusBadge status={asset.status} />
    </>
  );

  if (onClick) {
    return (
      <button
        className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted"
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background p-3">
      {content}
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return <Badge variant={statusBadgeVariant(status)}>{statusLabels[status]}</Badge>;
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
  onOpen,
}: {
  asset?: Asset;
  event: AssetEvent;
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
        {onOpen && (
          <Button className="mt-1" variant="ghost" size="sm" onClick={onOpen} type="button">
            Открыть узел
          </Button>
        )}
      </TaskContent>
    </Task>
  );
}

function InspectionComposer({ placeholder }: { placeholder: string }) {
  return (
    <PromptInput className="w-full" onSubmit={() => undefined}>
      <PromptInputBody>
        <PromptInputTextarea placeholder={placeholder} />
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

function chooseContractorScope(
  setState: React.Dispatch<React.SetStateAction<AppState>>,
  scope: ContractorAccess["scope"],
) {
  setState((current) => ({
    ...current,
    contractorAccess: {
      ...current.contractorAccess,
      scope,
      allowedAssetIds:
        scope === "all"
          ? current.assets.map((asset) => asset.id)
          : current.assets
              .filter((asset) => asset.category === scope)
              .map((asset) => asset.id),
    },
  }));
}
