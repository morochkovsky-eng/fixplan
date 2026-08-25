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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Check,
  CircleAlert,
  ClipboardCheck,
  History,
  LayoutDashboard,
  List,
  Map,
  Play,
  RotateCcw,
  UserRoundCheck,
} from "lucide-react";

type Category =
  | "electric"
  | "plumbing"
  | "appliance"
  | "furniture"
  | "window"
  | "hvac";

type Status = "ok" | "attention" | "in_progress" | "needs_master";

type EventType =
  | "inspection"
  | "comment"
  | "repair"
  | "status"
  | "photo"
  | "master";

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
  status: Status;
  x: number;
  y: number;
  lastChecked: string;
  warrantyUntil?: string;
  master?: string;
  photoNote: string;
};

type ContractorAccess = {
  scope: "plumbing" | "electric" | "all" | "custom";
  expires: string;
  allowedAssetIds: string[];
};

type AppState = {
  assets: Asset[];
  events: AssetEvent[];
  contractorAccess: ContractorAccess;
};

type View =
  | "dashboard"
  | "plan"
  | "assets"
  | "asset"
  | "log"
  | "inspection"
  | "contractor"
  | "report";

const rooms: Room[] = [
  { id: "living", name: "Гостиная", x: 0, y: 0, width: 270, height: 210 },
  { id: "kitchen", name: "Кухня", x: 270, y: 0, width: 180, height: 150 },
  { id: "bath", name: "Санузел", x: 450, y: 0, width: 170, height: 150 },
  { id: "bedroom", name: "Спальня", x: 0, y: 210, width: 240, height: 210 },
  { id: "hall", name: "Прихожая", x: 240, y: 150, width: 210, height: 270 },
  { id: "office", name: "Кабинет", x: 450, y: 150, width: 170, height: 270 },
];

const categoryLabels: Record<Category, string> = {
  electric: "Электрика",
  plumbing: "Сантехника",
  appliance: "Техника",
  furniture: "Мебель",
  window: "Окна",
  hvac: "Климат",
};

const statusLabels: Record<Status, string> = {
  ok: "Исправно",
  attention: "Требует внимания",
  in_progress: "В работе",
  needs_master: "Нужен мастер",
};

const statusTone: Record<Status, string> = {
  ok: "positive",
  attention: "negative",
  in_progress: "warning",
  needs_master: "violet",
};

const eventLabels: Record<EventType, string> = {
  inspection: "Проверка",
  comment: "Комментарий",
  repair: "Ремонт",
  status: "Статус",
  photo: "Фото",
  master: "Мастер",
};

const planLayerSrc: Partial<Record<Category, string[]>> = {
  electric: ["/plan/lighting.png", "/plan/electric.png"],
  plumbing: ["/plan/plumbing.png"],
  appliance: ["/plan/furniture.png"],
  furniture: ["/plan/furniture.png"],
  hvac: ["/plan/ventilation.png"],
};

const initialState: AppState = {
  assets: [
    {
      id: "r07",
      code: "R-07",
      name: "Розетка у входа",
      roomId: "hall",
      category: "electric",
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
  },
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

export default function Home() {
  const [state, setState] = useState<AppState>(() => {
    return initialState;
  });
  const [storageReady, setStorageReady] = useState(false);
  const [view, setView] = useState<View>("asset");
  const [selectedAssetId, setSelectedAssetId] = useState("r07");
  const [activeCategories, setActiveCategories] = useState<Category[]>([
    "electric",
    "plumbing",
    "hvac",
  ]);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [newEventText, setNewEventText] = useState("");
  const [inspectionIndex, setInspectionIndex] = useState(0);
  const [contractorMode, setContractorMode] = useState<"setup" | "master">(
    "setup",
  );

  useEffect(() => {
    const id = window.setTimeout(() => {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        try {
          setState(JSON.parse(saved) as AppState);
        } catch {
          setState(initialState);
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

  const visibleAssets = useMemo(
    () =>
      state.assets.filter((asset) => {
        const categoryVisible = activeCategories.includes(asset.category);
        const issueVisible =
          !onlyIssues || ["attention", "in_progress", "needs_master"].includes(asset.status);
        return categoryVisible && issueVisible;
      }),
    [activeCategories, onlyIssues, state.assets],
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

  function toggleCategory(category: Category) {
    setActiveCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  }

  function completeInspection(status: Status) {
    setAssetStatus(
      currentInspectionAsset.id,
      status,
      `Результат обхода: ${statusLabels[status].toLowerCase()}.`,
    );
    setInspectionIndex((current) => (current + 1) % state.assets.length);
  }

function submitContractorReport() {
    const allowed = state.contractorAccess.allowedAssetIds;
    setState((current) => ({
      ...current,
      assets: current.assets.map((asset) =>
        allowed.includes(asset.id) && asset.status === "ok"
          ? { ...asset, status: "attention", lastChecked: todayLabel() }
          : asset,
      ),
      events: [
        ...allowed.map((assetId) => ({
          id: eventId(),
          assetId,
          type: "inspection" as const,
          date: todayLabel(),
          title: "Отчет мастера",
          body: "Мастер проверил узел по гостевой ссылке. Добавлены комментарии, фото и стоимость.",
          cost: assetId === "w08" ? 2000 : undefined,
          master: "Роман",
          statusAfter: (assetId === "w08" ? "needs_master" : "attention") as Status,
        })),
        ...current.events,
      ],
    }));
    setView("report");
  }

  return (
    <TooltipProvider>
      <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Шпалерная, 34Б</strong>
          <span>квартира / обслуживание</span>
        </div>
        <nav className="nav-list" aria-label="Главная навигация">
          <NavButton active={view === "dashboard"} onClick={() => setView("dashboard")}>
            <LayoutDashboard size={16} />
            Дашборд
          </NavButton>
          <NavButton active={view === "plan"} onClick={() => setView("plan")}>
            <Map size={16} />
            План
          </NavButton>
          <NavButton active={view === "assets"} onClick={() => setView("assets")}>
            <List size={16} />
            Узлы
          </NavButton>
          <NavButton active={view === "log"} onClick={() => setView("log")}>
            <History size={16} />
            Журнал
          </NavButton>
          <NavButton active={view === "inspection"} onClick={() => setView("inspection")}>
            <ClipboardCheck size={16} />
            Обход
          </NavButton>
          <NavButton active={view === "contractor"} onClick={() => setView("contractor")}>
            <UserRoundCheck size={16} />
            Доступ мастеру
          </NavButton>
        </nav>
        <Button
          className="w-full justify-start"
          variant="secondary"
          onClick={() => setState(initialState)}
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
            <Button variant="secondary" onClick={() => setView("contractor")} type="button">
              <UserRoundCheck size={16} />
              Доступ мастеру
            </Button>
            <Button onClick={() => setView("inspection")} type="button">
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
            activeCategories={activeCategories}
            onlyIssues={onlyIssues}
            toggleCategory={toggleCategory}
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

        {view === "contractor" && (
          <ContractorAccessView
            state={state}
            setState={setState}
            mode={contractorMode}
            setMode={setContractorMode}
            submitContractorReport={submitContractorReport}
          />
        )}

        {view === "report" && (
          <ContractorReport
            assets={state.assets.filter((asset) =>
              state.contractorAccess.allowedAssetIds.includes(asset.id),
            )}
            events={state.events}
            openAsset={openAsset}
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
    contractor: "Доступ мастеру",
    report: "Отчет мастера",
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
    contractor: "Гостевая ссылка на выбранные узлы и чек-лист мастера.",
    report: "Сводка, которая вернулась после проверки по ссылке.",
  };
  return subtitles[view];
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
  activeCategories,
  onlyIssues,
  toggleCategory,
  toggleIssues,
  openAsset,
}: {
  assets: Asset[];
  allAssets: Asset[];
  activeCategories: Category[];
  onlyIssues: boolean;
  toggleCategory: (category: Category) => void;
  toggleIssues: () => void;
  openAsset: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-6 max-[980px]:grid-cols-1">
      <Card>
        <CardHeader>
          <CardTitle>Схема квартиры</CardTitle>
          <CardDescription>Включайте слои и открывайте узлы прямо с плана.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 overflow-x-auto pb-2">
          {(Object.keys(categoryLabels) as Category[]).map((category) => (
            <Button
              variant={activeCategories.includes(category) ? "default" : "secondary"}
              key={category}
              onClick={() => toggleCategory(category)}
              type="button"
            >
              {categoryLabels[category]}
            </Button>
          ))}
          <Button
            variant={onlyIssues ? "destructive" : "secondary"}
            onClick={toggleIssues}
            type="button"
          >
            Только проблемы
          </Button>
          </div>
          <ApartmentPlan
            activeCategories={activeCategories}
            assets={assets}
            openAsset={openAsset}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Видимые узлы</CardTitle>
          <CardDescription>
            На схеме показано {assets.length} из {allAssets.length} узлов.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
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
  activeCategories = [],
  assets,
  openAsset,
}: {
  activeCategories?: Category[];
  assets: Asset[];
  openAsset: (id: string) => void;
}) {
  const layerCategories = activeCategories.length
    ? activeCategories
    : assets.map((asset) => asset.category);
  const visibleLayers = Array.from(
    new Set(layerCategories.flatMap((category) => planLayerSrc[category] ?? [])),
  );

  return (
    <div className="apartment-plan" aria-label="Схема квартиры">
      <div className="plan-stage" role="img">
        <img alt="План перепланировки квартиры" className="plan-image base" src="/plan/base.png" />
        {visibleLayers.map((src) => (
          <img alt="" aria-hidden="true" className="plan-image layer" key={src} src={src} />
        ))}
        {assets.map((asset) => (
          <button
            aria-label={`${asset.code}, ${asset.name}, ${statusLabels[asset.status]}`}
            className={`asset-marker ${statusTone[asset.status]}`}
            key={asset.id}
            onClick={() => openAsset(asset.id)}
            style={{ left: `${asset.x}%`, top: `${asset.y}%` }}
            type="button"
          >
            <span className="asset-dot" />
            <span className="asset-code">{asset.code}</span>
          </button>
        ))}
      </div>
      <div className="plan-caption">
        <span>Источник: дизайн-проект, листы 31-42</span>
        <span>Координаты узлов заданы в процентах от общей подложки</span>
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Все узлы</CardTitle>
        <CardDescription>Инвентарный список с быстрым изменением статуса.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {assets.map((asset) => (
          <div
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"
            key={asset.id}
          >
            <button className="grid gap-1 text-left" onClick={() => openAsset(asset.id)} type="button">
              <strong className="font-medium">{asset.code} · {asset.name}</strong>
              <span className="text-muted-foreground text-sm">
                {roomName(asset.roomId)} · {categoryLabels[asset.category]}
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
      </CardContent>
    </Card>
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

      <Card>
        <CardHeader>
          <CardTitle>История узла</CardTitle>
          <CardDescription>
            Комментарии, смены статуса, работы мастеров и фотографии собраны в одной ленте.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[520px] pr-4 max-[980px]:h-auto">
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
        </CardContent>
      </Card>

      <aside className="grid content-start gap-4">
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
                <dl className="grid grid-cols-[128px_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">ID</dt><dd className="font-medium">{asset.code}</dd>
                  <dt className="text-muted-foreground">Комната</dt><dd className="font-medium">{roomName(asset.roomId)}</dd>
                  <dt className="text-muted-foreground">Категория</dt><dd className="font-medium">{categoryLabels[asset.category]}</dd>
                  <dt className="text-muted-foreground">Последняя проверка</dt><dd className="font-medium">{asset.lastChecked}</dd>
                  <dt className="text-muted-foreground">Гарантия</dt><dd className="font-medium">{asset.warrantyUntil ?? "не указана"}</dd>
                  <dt className="text-muted-foreground">Мастер</dt><dd className="font-medium">{asset.master ?? "не назначен"}</dd>
                </dl>
              </TabsContent>
              <TabsContent value="media" className="mt-0">
                {mediaEvents.length ? (
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
                )}
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
          </CardContent>
        </Card>
      </aside>
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

function ContractorAccessView({
  state,
  setState,
  mode,
  setMode,
  submitContractorReport,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  mode: "setup" | "master";
  setMode: (mode: "setup" | "master") => void;
  submitContractorReport: () => void;
}) {
  const allowedAssets = state.assets.filter((asset) =>
    state.contractorAccess.allowedAssetIds.includes(asset.id),
  );

  if (mode === "master") {
    return (
      <div className="grid grid-cols-[minmax(320px,420px)_1fr] gap-6 max-[980px]:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Задание мастеру</CardTitle>
            <CardDescription>
              Шпалерная, 34Б · сантехника · доступ: {state.contractorAccess.expires}
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
            <CardDescription>W-08 · слив · слив работает медленно, нужна чистка сифона.</CardDescription>
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
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[
            ["plumbing", "Сантехника"],
            ["electric", "Электрика"],
            ["all", "Вся квартира"],
          ].map(([scope, label]) => (
            <Button
              variant={state.contractorAccess.scope === scope ? "default" : "secondary"}
              key={scope}
              onClick={() => chooseContractorScope(setState, scope as ContractorAccess["scope"])}
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
          shpalernaya.app/access/plumbing-3d8f
        </div>
        <Button onClick={() => setMode("master")} type="button">
          Открыть как мастер
        </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Узлы в задании</CardTitle>
          <CardDescription>{allowedAssets.length} выбранных узла.</CardDescription>
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
  openAsset,
}: {
  assets: Asset[];
  events: AssetEvent[];
  openAsset: (id: string) => void;
}) {
  const reportEvents = events.filter(
    (event) => event.type === "inspection" || event.title === "Отчет мастера",
  );
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Проверено" value={`${assets.length} узла`} />
      <StatCard label="Замечания" value="2" tone="negative" />
      <StatCard label="Стоимость" value="2 000 руб." />
      <StatCard label="Фото" value="8 файлов" />
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Решения по отчету</CardTitle>
          <CardDescription>Узлы, по которым нужно принять решение владельцу.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {assets.map((asset) => (
            <AssetRow key={asset.id} asset={asset} onClick={() => openAsset(asset.id)} />
          ))}
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
