"use client";

import { useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight, Check, ChevronRight, Droplets, FileText, Flame, History, House, MapPin, MessageSquare, Plus, ShieldCheck, SlidersHorizontal, Wrench, X, CalendarDays, CircleAlert } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogOverlay, DialogPortal, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import s from "./ios.module.css";

const passport = [["Производитель", "Ariston"], ["Модель", "ABS VLS EVO INOX PW 80 D"], ["Объём", "80 литров"], ["Установлен", "18 ноября 2021"], ["Серийный номер", "982620300419758214"]];
const initialHistory = [
  { title: "Создано задание мастеру", text: "Диагностика блока управления и нагревательных элементов.", time: "8 сентября · 18:42", kind: "work" },
  { title: "Бойлер не нагревает воду", text: "Индикатор питания работает. Следов протечки нет.", time: "8 сентября · 18:37", kind: "alert" },
  { title: "Плановая проверка", text: "Корпус и соединения без повреждений. Нагрев в норме.", time: "16 августа · 12:15", kind: "ok" },
];

export default function IosAsset() {
  const [tab, setTab] = useState("overview");
  const [modal, setPanel] = useState<"task" | "note" | "status" | "plan" | null>(null);
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const gesture = useRef({ y: 0, time: 0 });
  const wasDragged = useRef(false);
  const swipe = useRef({ x: 0, y: 0, ignore: false });
  const opener = useRef<HTMLElement | null>(null);
  function setModal(panel: typeof modal) {
    if (panel) { opener.current = document.activeElement as HTMLElement; setInteracted(false); setPanel(panel); setDrag(0); setOpen(true); }
    else { setOpen(false); setDragging(false); }
  }
  const [status, setStatus] = useState("Требует внимания");
  const [events, setEvents] = useState(initialHistory);
  const [feedback, setFeedback] = useState("");
  const [task, setTask] = useState("Диагностика бойлера");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("2026-09-12");
  const [taskDate, setTaskDate] = useState("12 сентября");
  const isOk = status === "Исправно";
  function addEvent(title: string, text: string, kind = "work") {
    setEvents(items => [{ title, text, time: "Только что", kind }, ...items]);
  }
  return (
    <div className={s.scene}>
      <a href="#asset-content" className={s.skip}>К содержимому</a>
      <div className={s.app}>
        <header className={s.topbar}>
          <Link href="/ui-lab" className={s.brand}><span className={s.brandIcon}><House size={20} /></span>fixplan<span className={s.concept}>Concept</span></Link>
          <span className={s.apartment}><MapPin size={15} /> Шпалерная, 34Б</span>
          <Link href="/ui-lab/asset" className={s.compare}>Исходный экран <ArrowUpRight size={16} /></Link>
        </header>
        <main id="asset-content" className={s.main}>
          <div className={s.navline}>
            <Link href="/ui-lab" className={s.back}><ArrowLeft size={19} /><span>Узлы квартиры</span></Link>
            <span className={s.demo}>Тестовые данные</span>
          </div>
          <div className={s.layout}>
            <aside className={s.identity}>
              <div className={s.heroTop}><div className={s.objectIcon}><Droplets size={37} strokeWidth={1.5} /></div><span className={s.code}>B-02</span></div>
              <p className={s.eyebrow}>САНУЗЕЛ · ВОДОСНАБЖЕНИЕ</p>
              <h1>Бойлер</h1>
              <p className={s.model}>Ariston · 80 литров</p>
              <button className={`${s.status} ${isOk ? s.good : ""}`} onClick={() => setModal("status")}><span className={s.dot} />{status}<ChevronRight size={15} /></button>
              <div className={s.metrics}>
                <div><Flame size={19} /><strong>80 <span>л</span></strong><span>Объём бака</span></div>
                <div><ShieldCheck size={19} /><strong>2028</strong><span>Гарантия до</span></div>
              </div>
              <button className={s.location} onClick={() => setModal("plan")}>
                <span className={s.planCrop}><Image unoptimized src="/plan/plumbing.png" alt="" width={96} height={74} /></span>
                <span><strong>На плане квартиры</strong><small>Санузел · B-02</small></span><ArrowUpRight size={18} />
              </button>
              <div className={s.identityFoot}><ShieldCheck size={16} /> Паспорт и история в одном месте</div>
            </aside>
            <div className={s.workspace} onTouchStart={event => {
              const touch = event.touches[0];
              swipe.current = { x: touch.clientX, y: touch.clientY, ignore: Boolean((event.target as HTMLElement).closest("button,a,input,textarea,[role=tablist]")) };
            }} onTouchEnd={event => {
              const touch = event.changedTouches[0]; const dx = touch.clientX - swipe.current.x; const dy = touch.clientY - swipe.current.y;
              if (!swipe.current.ignore && Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.8) {
                const sections = ["overview", "passport", "history"]; const index = sections.indexOf(tab);
                setTab(sections[Math.max(0, Math.min(2, index + (dx < 0 ? 1 : -1)))]);
              }
            }}>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className={s.tabs} data-active={tab} aria-label="Разделы узла">
                  <TabsTrigger value="overview">Обзор</TabsTrigger><TabsTrigger value="passport">Паспорт</TabsTrigger><TabsTrigger value="history">История</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className={s.tabContent}>
                  <section className={`${s.card} ${s.attention}`}>
                    <div className={s.sectionLabel}><span className={isOk ? s.greenIcon : s.amberIcon}>{isOk ? <Check size={19} /> : <CircleAlert size={19} />}</span><span>{isOk ? "Всё в порядке" : "Нужно разобраться"}</span><span className={s.when}>8 сен</span></div>
                    <h2>{isOk ? "Бойлер исправен" : "Не нагревает воду"}</h2>
                    <p>{isOk ? "Статус обновлён в тестовой карточке. Изменение появилось в истории узла." : "Питание есть, но вода остаётся холодной. Протечек и постороннего запаха нет."}</p>
                    <div className={s.author}><span className={s.avatar}>В</span>Владимир<span>·</span>заметка владельца</div>
                  </section>
                  <section className={s.card}>
                    <div className={s.sectionHeading}><h2>Ближайшее задание</h2><span className={s.count}>1</span></div>
                    <button className={s.taskRow} onClick={() => setModal("task")}><span className={s.workIcon}><Wrench size={22} /></span><span><strong>{task}</strong><small>Проверить нагрев и блок управления</small></span><ChevronRight size={18} /></button>
                    <div className={s.taskMeta}><span><CalendarDays size={16} />{taskDate}</span><span><span className={s.miniAvatar}>А</span>Алексей</span><span className={s.scheduled}>Запланировано</span></div>
                  </section>
                  <section className={s.historySection}>
                    <div className={s.sectionHeading}><h2>Последние события</h2><button className={s.textButton} onClick={() => setTab("history")}>Все <ChevronRight size={16} /></button></div>
                    <div className={s.timeline}>{events.slice(0, 2).map((event, i) => <div className={s.event} key={`${event.title}-${i}`}><span className={s.eventIcon}>{event.kind === "alert" ? <CircleAlert size={17} /> : <Wrench size={17} />}</span><div><strong>{event.title}</strong><time>{event.time}</time></div></div>)}</div>
                  </section>
                </TabsContent>
                <TabsContent value="passport" className={s.tabContent}>
                  <section className={s.card}><div className={s.sectionHeading}><h2>Паспорт узла</h2><SlidersHorizontal size={19} /></div><dl className={s.details}>{passport.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><div className={s.warranty}><ShieldCheck size={21} /><span><strong>На гарантии</strong><small>До 18 ноября 2028 года</small></span></div></section>
                  <section className={s.card}><div className={s.sectionHeading}><h2>Документы</h2><FileText size={19} /></div><p>В этом прототипе файлы не прикреплены. Модель и серийный номер доступны в паспорте выше.</p></section>
                </TabsContent>
                <TabsContent value="history" className={s.tabContent}><section className={s.card}><div className={s.sectionHeading}><h2>История узла</h2><History size={19} /></div><div className={s.timeline}>{events.map((event, i) => <div className={s.event} key={`${event.title}-${i}`}><span className={s.eventIcon}>{event.kind === "ok" ? <Check size={17} /> : event.kind === "alert" ? <CircleAlert size={17} /> : <Wrench size={17} />}</span><div><strong>{event.title}</strong><p>{event.text}</p><time>{event.time}</time></div></div>)}</div></section></TabsContent>
              </Tabs>
              <div className={s.actionBar}><button className={s.secondary} onClick={() => setModal("note")}><MessageSquare size={20} /><span>Заметка</span></button><button className={s.primary} onClick={() => setModal("task")}><Plus size={21} />Создать задание</button></div>
              <p className={s.localHint}>Изменения в демо действуют до перезагрузки страницы</p>
            </div>
          </div>
        </main>
      </div>
      {feedback ? <div className={s.toast} role="status"><Check size={18} />{feedback}<button onClick={() => setFeedback("")} aria-label="Закрыть уведомление"><X size={18} /></button></div> : null}
      <Dialog open={open} onOpenChange={value => { if (!value) setModal(null); }}>
        <DialogPortal>
        <DialogOverlay className={s.sheetOverlay} />
        <DialogPrimitive.Content className={s.dialog} data-dragging={dragging || undefined} data-interacted={interacted || undefined} style={{ "--drag-y": `${drag}px` } as React.CSSProperties} onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }}>
          <button type="button" className={s.grabber} aria-label="Закрыть шторку. Можно потянуть вниз" onClick={event => { if (event.detail === 0 || !wasDragged.current) setModal(null); }} onPointerDown={event => {
            if (event.button !== 0) return;
            setInteracted(true); wasDragged.current = false; gesture.current = { y: event.clientY, time: performance.now() }; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId);
          }} onPointerMove={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) { const distance = Math.max(0, event.clientY - gesture.current.y); if (distance > 6) wasDragged.current = true; setDrag(distance); }
          }} onPointerUp={event => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            const distance = Math.max(0, event.clientY - gesture.current.y); const velocity = distance / Math.max(1, performance.now() - gesture.current.time);
            event.currentTarget.releasePointerCapture(event.pointerId); setDragging(false);
            if (distance > 110 || (distance > 28 && velocity > .65)) setModal(null); else setDrag(0);
            if (distance > 6) { event.preventDefault(); event.currentTarget.blur(); }
          }} onPointerCancel={() => { setDragging(false); setDrag(0); }}><span /></button>
          <DialogPrimitive.Close className={s.close} aria-label="Закрыть"><X size={19} /></DialogPrimitive.Close>
          <DialogHeader><DialogTitle>{modal === "task" ? "Задание мастеру" : modal === "note" ? "Новая заметка" : modal === "plan" ? "На плане квартиры" : "Статус узла"}</DialogTitle><DialogDescription>B-02 · Бойлер · Санузел</DialogDescription></DialogHeader>
          {modal === "task" ? <form className={s.form} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); const title = String(data.get("title")).trim(); if (!title) return; setTask(title); setTaskDate(new Intl.DateTimeFormat("ru", { day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`))); addEvent("Создано задание", `${title} · ${date}`); setFeedback("Задание добавлено в демо"); setModal(null); }}><label>Что нужно сделать<input name="title" defaultValue={task} required maxLength={120} /></label><label>Дата визита<input type="date" value={date} required onChange={event => setDate(event.target.value)} /></label><label>Мастер<input value="Алексей" readOnly /></label><p>Тестовое задание. Мастеру ничего не отправляется.</p><button className={s.primary} type="submit">Добавить задание</button></form> : null}
          {modal === "note" ? <form className={s.form} onSubmit={event => { event.preventDefault(); if (!note.trim()) return; addEvent("Заметка владельца", note.trim()); setNote(""); setModal(null); setFeedback("Заметка добавлена в историю"); }}><label>Ваше наблюдение<textarea rows={4} value={note} onChange={event => setNote(event.target.value)} required maxLength={1000} placeholder="Что заметили при проверке?" /></label><button className={s.primary} type="submit" disabled={!note.trim()}>Сохранить заметку</button></form> : null}
          {modal === "status" ? <div className={s.statusOptions}>{["Исправно", "Требует внимания", "В работе", "Нужен мастер"].map(value => <button key={value} aria-pressed={status === value} onClick={() => { setStatus(value); addEvent("Статус обновлён", value, value === "Исправно" ? "ok" : "alert"); setModal(null); setFeedback("Статус обновлён в демо"); }}>{value}{status === value ? <Check size={20} /> : null}</button>)}</div> : null}
          {modal === "plan" ? <div className={s.planFull}><Image unoptimized src="/plan/plumbing.png" alt="Схема сантехники квартиры. Бойлер расположен в санузле." width={900} height={700} /><p>Санузел · бойлер B-02. Схема сантехники из проекта квартиры.</p></div> : null}
        </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
