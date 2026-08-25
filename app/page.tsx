"use client";

import { useEffect, useMemo, useState } from "react";

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
    if (typeof window === "undefined") return initialState;
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return initialState;
    try {
      return JSON.parse(saved) as AppState;
    } catch {
      return initialState;
    }
  });
  const [view, setView] = useState<View>("dashboard");
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
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  const selectedAsset =
    state.assets.find((asset) => asset.id === selectedAssetId) ??
    state.assets[0];

  const selectedEvents = useMemo(
    () =>
      state.events
        .filter((event) => event.assetId === selectedAsset.id)
        .sort((a, b) => b.id.localeCompare(a.id)),
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
          statusAfter: assetId === "w08" ? "needs_master" : "attention",
        })),
        ...current.events,
      ],
    }));
    setView("report");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Шпалерная, 34Б</strong>
          <span>квартира / обслуживание</span>
        </div>
        <nav className="nav-list" aria-label="Главная навигация">
          <NavButton active={view === "dashboard"} onClick={() => setView("dashboard")}>
            Дашборд
          </NavButton>
          <NavButton active={view === "plan"} onClick={() => setView("plan")}>
            План
          </NavButton>
          <NavButton active={view === "assets"} onClick={() => setView("assets")}>
            Узлы
          </NavButton>
          <NavButton active={view === "log"} onClick={() => setView("log")}>
            Журнал
          </NavButton>
          <NavButton active={view === "inspection"} onClick={() => setView("inspection")}>
            Обход
          </NavButton>
          <NavButton active={view === "contractor"} onClick={() => setView("contractor")}>
            Доступ мастеру
          </NavButton>
        </nav>
        <button
          className="button secondary full"
          onClick={() => setState(initialState)}
          type="button"
        >
          Сбросить демо
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewTitle(view, selectedAsset)}</h1>
            <p>{viewSubtitle(view)}</p>
          </div>
          <div className="topbar-actions">
            <button className="button secondary" onClick={() => setView("contractor")} type="button">
              Доступ мастеру
            </button>
            <button className="button primary" onClick={() => setView("inspection")} type="button">
              Начать обход
            </button>
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
    <button
      className={`nav-button ${active ? "active" : ""}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
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
    <div className="dashboard-grid">
      <StatCard label="Всего узлов" value={assets.length.toString()} />
      <StatCard label="Требуют внимания" value={issueAssets.length.toString()} tone="negative" />
      <StatCard label="В работе" value={inProgressAssets.length.toString()} tone="warning" />
      <StatCard label="Нужен мастер" value={needsMasterAssets.length.toString()} tone="violet" />

      <section className="panel span-2">
        <PanelHeader title="Что не так сейчас" action="Открыть план" onAction={goPlan} />
        <div className="asset-list compact">
          {issueAssets.map((asset) => (
            <AssetRow key={asset.id} asset={asset} onClick={() => openAsset(asset.id)} />
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeader title="Работы и мастера" />
        <div className="stack">
          {inProgressAssets.concat(needsMasterAssets).map((asset) => (
            <button className="work-item" key={asset.id} onClick={() => openAsset(asset.id)} type="button">
              <span>
                <strong>{asset.code}</strong>
                <small>{asset.master ?? "Мастер не назначен"}</small>
              </span>
              <StatusBadge status={asset.status} />
            </button>
          ))}
        </div>
      </section>

      <section className="panel span-3">
        <PanelHeader title="Здоровье квартиры" />
        <div className="health-grid">
          <div>
            <strong>82%</strong>
            <span>проверено за месяц</span>
          </div>
          <div>
            <strong>3</strong>
            <span>гарантии в календаре</span>
          </div>
          <div>
            <strong>3 500 руб.</strong>
            <span>расходы за август</span>
          </div>
          <div>
            <strong>1</strong>
            <span>отчет мастера ожидает решения</span>
          </div>
        </div>
      </section>
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
    <div className="plan-layout">
      <section className="panel plan-panel">
        <div className="filter-row">
          {(Object.keys(categoryLabels) as Category[]).map((category) => (
            <button
              className={`chip ${activeCategories.includes(category) ? "active" : ""}`}
              key={category}
              onClick={() => toggleCategory(category)}
              type="button"
            >
              {categoryLabels[category]}
            </button>
          ))}
          <button
            className={`chip ${onlyIssues ? "danger" : ""}`}
            onClick={toggleIssues}
            type="button"
          >
            Только проблемы
          </button>
        </div>
        <ApartmentPlan
          activeCategories={activeCategories}
          assets={assets}
          openAsset={openAsset}
        />
      </section>

      <section className="panel">
        <PanelHeader title="Видимые узлы" />
        <div className="asset-list compact">
          {assets.map((asset) => (
            <AssetRow key={asset.id} asset={asset} onClick={() => openAsset(asset.id)} />
          ))}
          {!assets.length && <p className="muted">По выбранным фильтрам узлов нет.</p>}
        </div>
        <div className="summary-note">
          На схеме показано {assets.length} из {allAssets.length} узлов.
        </div>
      </section>
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
    <section className="panel">
      <PanelHeader title="Все узлы" />
      <div className="table-list">
        {assets.map((asset) => (
          <div className="table-row" key={asset.id}>
            <button onClick={() => openAsset(asset.id)} type="button">
              <strong>{asset.code} · {asset.name}</strong>
              <span>{roomName(asset.roomId)} · {categoryLabels[asset.category]}</span>
            </button>
            <StatusBadge status={asset.status} />
            <select
              aria-label={`Изменить статус ${asset.code}`}
              value={asset.status}
              onChange={(event) => setAssetStatus(asset.id, event.target.value as Status)}
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </section>
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
  return (
    <div className="asset-detail">
      <section className="panel asset-hero">
        <div>
          <h2>{asset.code} · {asset.name}</h2>
          <p>{roomName(asset.roomId)} · {categoryLabels[asset.category]} · координаты: {asset.x}% / {asset.y}%</p>
          <StatusBadge status={asset.status} />
        </div>
        <div className="button-row">
          <button className="button primary" onClick={() => addEvent(asset.id)} type="button">
            Добавить событие
          </button>
          <button className="button secondary" onClick={goContractor} type="button">
            Доступ мастеру
          </button>
        </div>
      </section>

      <section className="panel timeline-panel">
        <PanelHeader title="История узла" />
        <div className="timeline">
          {events.map((event) => (
            <article className="timeline-item" key={event.id}>
              <span className={`timeline-dot ${statusTone[event.statusAfter ?? asset.status]}`} />
              <small>{event.date} · {eventLabels[event.type]}</small>
              <h3>{event.title}</h3>
              <p>{event.body}</p>
              {(event.cost || event.master) && (
                <p className="muted">
                  {event.master ? `Мастер: ${event.master}` : ""}
                  {event.master && event.cost ? " · " : ""}
                  {event.cost ? `Стоимость: ${event.cost.toLocaleString("ru-RU")} руб.` : ""}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      <aside className="panel asset-side">
        <div className="photo-box">{asset.photoNote}</div>
        <PanelHeader title="Паспорт узла" />
        <dl className="detail-list">
          <dt>ID</dt><dd>{asset.code}</dd>
          <dt>Комната</dt><dd>{roomName(asset.roomId)}</dd>
          <dt>Категория</dt><dd>{categoryLabels[asset.category]}</dd>
          <dt>Последняя проверка</dt><dd>{asset.lastChecked}</dd>
          <dt>Гарантия</dt><dd>{asset.warrantyUntil ?? "не указана"}</dd>
          <dt>Мастер</dt><dd>{asset.master ?? "не назначен"}</dd>
        </dl>

        <div className="asset-control-section">
          <span className="field-label">Статус</span>
          <div className="status-actions" role="group" aria-label="Изменить статус узла">
            <button
              className="button outline negative-action"
              onClick={() => setAssetStatus(asset.id, "attention")}
              type="button"
            >
              Требует внимания
            </button>
            <button
              className="button secondary"
              onClick={() => setAssetStatus(asset.id, "in_progress")}
              type="button"
            >
              В работу
            </button>
            <button
              className="button primary positive-action"
              onClick={() => setAssetStatus(asset.id, "ok")}
              type="button"
            >
              Исправно
            </button>
          </div>
        </div>

        <div className="asset-control-section">
          <label className="field-label" htmlFor="event-comment">
            Комментарий
          </label>
          <div className="comment-composer">
            <textarea
              id="event-comment"
              value={newEventText}
              onChange={(event) => setNewEventText(event.target.value)}
              placeholder="Что произошло, кого вызвали, что проверить позже"
            />
            <button
              aria-label="Сохранить комментарий"
              className="icon-button primary"
              onClick={() => addEvent(asset.id, { type: "comment" })}
              type="button"
            >
              ✓
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
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
    <section className="panel">
      <PanelHeader title="Лента событий" />
      <div className="timeline wide">
        {sortedEvents.map((event) => {
          const asset = assets.find((item) => item.id === event.assetId);
          return (
            <article className="timeline-item" key={event.id}>
              <span className={`timeline-dot ${statusTone[event.statusAfter ?? asset?.status ?? "ok"]}`} />
              <small>{event.date} · {asset?.code} · {asset ? roomName(asset.roomId) : ""}</small>
              <button className="link-heading" onClick={() => openAsset(event.assetId)} type="button">
                {event.title}
              </button>
              <p>{event.body}</p>
            </article>
          );
        })}
      </div>
    </section>
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
    <div className="inspection-layout">
      <section className="panel inspection-card">
        <small>{index + 1} из {total}</small>
        <h2>{asset.code} · {asset.name}</h2>
        <p>{roomName(asset.roomId)} · {categoryLabels[asset.category]}</p>
        <button className="button secondary" onClick={() => openAsset(asset.id)} type="button">
          Открыть карточку
        </button>
        <div className="inspection-actions">
          <button className="button secondary" onClick={() => completeInspection("ok")} type="button">
            Исправно
          </button>
          <button className="button secondary" onClick={() => completeInspection("attention")} type="button">
            Есть замечание
          </button>
          <button className="button primary" onClick={() => completeInspection("needs_master")} type="button">
            Нужен мастер
          </button>
        </div>
        <textarea placeholder="Комментарий обхода, фото, стоимость, материалы" />
      </section>
      <section className="panel">
        <ApartmentPlan assets={[asset]} openAsset={openAsset} />
      </section>
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
      <div className="contractor-grid">
        <section className="panel">
          <PanelHeader title="Задание мастеру" />
          <p className="muted">Шпалерная, 34Б · сантехника · доступ: {state.contractorAccess.expires}</p>
          <div className="asset-list">
            {allowedAssets.map((asset) => (
              <AssetRow key={asset.id} asset={asset} />
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelHeader title="Чек-лист узла" />
          <h2>W-08 · слив</h2>
          <p className="muted">Слив работает медленно, нужна чистка сифона.</p>
          <div className="button-grid">
            <button className="button secondary" type="button">Исправно</button>
            <button className="button secondary" type="button">Есть замечание</button>
            <button className="button primary" type="button">Нужен ремонт</button>
          </div>
          <textarea defaultValue="Слив работает медленно, нужна чистка сифона. Работа: 2 000 руб." />
          <button className="button primary full" onClick={submitContractorReport} type="button">
            Отправить отчет владельцу
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="contractor-grid">
      <section className="panel">
        <PanelHeader title="Создать доступ" />
        <p className="muted">Мастер получит ссылку только на выбранные узлы и сможет отправить отчет.</p>
        <div className="filter-row">
          {[
            ["plumbing", "Сантехника"],
            ["electric", "Электрика"],
            ["all", "Вся квартира"],
          ].map(([scope, label]) => (
            <button
              className={`chip ${state.contractorAccess.scope === scope ? "active" : ""}`}
              key={scope}
              onClick={() =>
                setState((current) => ({
                  ...current,
                  contractorAccess: {
                    ...current.contractorAccess,
                    scope: scope as ContractorAccess["scope"],
                    allowedAssetIds:
                      scope === "all"
                        ? current.assets.map((asset) => asset.id)
                        : current.assets
                            .filter((asset) => asset.category === scope)
                            .map((asset) => asset.id),
                  },
                }))
              }
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="permissions">
          <span>Смотреть историю выбранных узлов</span>
          <span>Добавлять комментарии и фото</span>
          <span>Указывать стоимость и материалы</span>
          <span>Менять статус на «сделано»</span>
        </div>
        <div className="link-box">shpalernaya.app/access/plumbing-3d8f</div>
        <button className="button primary" onClick={() => setMode("master")} type="button">
          Открыть как мастер
        </button>
      </section>
      <section className="panel">
        <PanelHeader title="Узлы в задании" />
        <div className="asset-list">
          {allowedAssets.map((asset) => (
            <AssetRow key={asset.id} asset={asset} />
          ))}
        </div>
      </section>
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
    <div className="dashboard-grid">
      <StatCard label="Проверено" value={`${assets.length} узла`} />
      <StatCard label="Замечания" value="2" tone="negative" />
      <StatCard label="Стоимость" value="2 000 руб." />
      <StatCard label="Фото" value="8 файлов" />
      <section className="panel span-2">
        <PanelHeader title="Решения по отчету" />
        <div className="asset-list">
          {assets.map((asset) => (
            <AssetRow key={asset.id} asset={asset} onClick={() => openAsset(asset.id)} />
          ))}
        </div>
      </section>
      <section className="panel">
        <PanelHeader title="Что попало в журнал" />
        <div className="timeline compact">
          {reportEvents.slice(0, 4).map((event) => (
            <article className="timeline-item" key={event.id}>
              <span className="timeline-dot violet" />
              <small>{event.date}</small>
              <h3>{event.title}</h3>
              <p>{event.body}</p>
            </article>
          ))}
        </div>
      </section>
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
  return (
    <section className="stat-card">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </section>
  );
}

function PanelHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      {action && (
        <button className="text-button" onClick={onAction} type="button">
          {action}
        </button>
      )}
    </div>
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
      <span>
        <strong>{asset.code} · {asset.name}</strong>
        <small>{roomName(asset.roomId)} · {categoryLabels[asset.category]}</small>
      </span>
      <StatusBadge status={asset.status} />
    </>
  );

  if (onClick) {
    return (
      <button className="asset-row" onClick={onClick} type="button">
        {content}
      </button>
    );
  }

  return <div className="asset-row static">{content}</div>;
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`status-badge ${statusTone[status]}`}>{statusLabels[status]}</span>;
}
