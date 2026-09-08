"use client";

import { formatMoney } from "@/lib/format-money";

import { useEffect, useMemo, useState } from "react";
import { Bell, Check, CheckCheck, ChevronLeft, ChevronRight, ClipboardCheck, ExternalLink, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  cleaningModeLabels,
  cleaningRecurrenceLabels,
  cleaningStatusLabels,
  cleaningTypeLabels,
  type Cleaning,
  type CleaningMode,
  type CleaningPhoto,
  type CleaningRecurrence,
  type CleaningStatus,
  type CleaningType,
} from "@/lib/cleanings";
import type { AppNotification } from "@/lib/notifications";

const zones = ["Вся квартира", "Гостиная", "Кухня", "Санузел", "Спальня", "Прихожая", "Кабинет", "Постирочная"];

type CleaningDraft = Omit<Cleaning, "id" | "link" | "createdAt" | "completedAt" | "completedItems" | "photos"> & {
  checklistText: string;
  suppliesText: string;
};

function emptyDraft(): CleaningDraft {
  return {
    title: "Поддерживающая уборка",
    type: "standard",
    mode: "managed",
    zones: ["Вся квартира"],
    zoneResults: [],
    checklist: [],
    checklistText: "Пропылесосить и вымыть полы\nПротереть доступные поверхности\nУбрать кухню и санузел\nВынести мусор",
    supplies: [],
    suppliesText: "",
    scheduledFor: "",
    scheduledAt: "",
    recurrence: "none",
    cleaner: "",
    cleanerPhone: "",
    status: "offered",
    cost: undefined,
    notes: "",
    requirePhotoBefore: false,
    requirePhotoAfter: true,
  };
}

function draftFromCleaning(cleaning: Cleaning): CleaningDraft {
  return {
    ...cleaning,
    scheduledAt: cleaning.scheduledAt ? toDateTimeLocal(cleaning.scheduledAt) : "",
    checklistText: cleaning.checklist.join("\n"),
    suppliesText: cleaning.supplies.join("\n"),
  };
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + 3 * 60 * 60_000).toISOString().slice(0, 16);
}

function draftFromRecentCleaning(cleanings: Cleaning[]): CleaningDraft {
  const recent = cleanings.find((cleaning) => cleaning.status === "accepted" || cleaning.status === "completed") ?? cleanings[0];
  if (!recent) return emptyDraft();
  return {
    ...emptyDraft(),
    title: recent.title,
    type: recent.type,
    mode: recent.mode,
    zones: recent.zones,
    checklistText: recent.checklist.join("\n"),
    suppliesText: recent.supplies.join("\n"),
    cleaner: recent.cleaner,
    cleanerPhone: recent.cleanerPhone ?? "",
    cost: recent.cost,
    notes: recent.notes ?? "",
    requirePhotoBefore: recent.requirePhotoBefore,
    requirePhotoAfter: recent.requirePhotoAfter,
    recurrence: "none",
  };
}

function statusTone(status: CleaningStatus): "secondary" | "outline" | "destructive" {
  if (status === "in_progress") return "outline";
  if (status === "draft" || status === "revision_requested" || status === "declined") return "destructive";
  return "secondary";
}

export function CleaningsView({ cleanings, setCleanings }: { cleanings: Cleaning[]; setCleanings: (items: Cleaning[]) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CleaningDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [gallery, setGallery] = useState<{ photos: CleaningPhoto[]; index: number } | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const activeCount = cleanings.filter((item) => ["offered", "scheduled", "in_progress", "revision_requested"].includes(item.status)).length;
  const completedCount = cleanings.filter((item) => ["completed", "accepted"].includes(item.status)).length;
  const totalCost = cleanings.reduce((sum, item) => sum + (item.cost ?? 0), 0);
  const sorted = useMemo(() => [...cleanings], [cleanings]);
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { notifications?: AppNotification[] };
      if (!cancelled && response.ok) setNotifications(payload.notifications ?? []);
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function refreshNotifications() {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { notifications?: AppNotification[] };
    if (response.ok) setNotifications(payload.notifications ?? []);
  }

  async function markNotificationRead(notification: AppNotification) {
    if (notification.readAt) return;
    const response = await fetch(`/api/notifications/${notification.id}`, { method: "PATCH" });
    if (response.ok) setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
  }

  async function markAllNotificationsRead() {
    const response = await fetch("/api/notifications", { method: "PATCH" });
    if (response.ok) setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
  }

  function openCreate() {
    setEditingId(null);
    setDraft(draftFromRecentCleaning(cleanings));
    setShowForm(true);
  }

  function openEdit(cleaning: Cleaning) {
    setEditingId(cleaning.id);
    setDraft(draftFromCleaning(cleaning));
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setDraft(emptyDraft());
  }

  async function saveCleaning() {
    const checklist = draft.checklistText.split("\n").map((item) => item.trim()).filter(Boolean);
    const supplies = draft.suppliesText.split("\n").map((item) => item.trim()).filter(Boolean);
    if (!draft.title.trim() || !checklist.length) {
      window.alert("Укажите название и добавьте хотя бы один пункт чек-листа.");
      return;
    }
    setSaving(true);
    try {
      const body = { ...draft, title: draft.title.trim(), checklist, supplies, scheduledAt: draft.scheduledAt ? `${draft.scheduledAt}:00+03:00` : undefined };
      const response = await fetch(editingId ? `/api/cleanings/${editingId}` : "/api/cleanings", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { cleaning?: Cleaning; error?: string };
      if (!response.ok || !payload.cleaning) throw new Error(payload.error ?? "Не удалось сохранить уборку.");
      setCleanings(editingId ? cleanings.map((item) => item.id === editingId ? { ...payload.cleaning!, photos: item.photos } : item) : [payload.cleaning, ...cleanings]);
      closeForm();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Не удалось сохранить уборку.");
    } finally {
      setSaving(false);
    }
  }

  async function removeCleaning(cleaning: Cleaning) {
    if (!window.confirm(`Удалить «${cleaning.title}»?`)) return;
    const response = await fetch(`/api/cleanings/${cleaning.id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      window.alert(payload.error ?? "Не удалось удалить уборку.");
      return;
    }
    setCleanings(cleanings.filter((item) => item.id !== cleaning.id));
  }

  async function reviewCleaning(cleaning: Cleaning, status: "accepted" | "revision_requested") {
    const ownerFeedback = status === "revision_requested" ? (reviewDrafts[cleaning.id] ?? "").trim() : "";
    if (status === "revision_requested" && !ownerFeedback) {
      window.alert("Напишите, что нужно доработать.");
      return;
    }
    const response = await fetch(`/api/cleanings/${cleaning.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...cleaning, ownerFeedback, status }),
    });
    const payload = (await response.json().catch(() => ({}))) as { cleaning?: Cleaning; nextCleaning?: Cleaning; error?: string };
    if (!response.ok || !payload.cleaning) {
      window.alert(payload.error ?? "Не удалось сохранить решение.");
      return;
    }
    const updated = cleanings.map((item) => item.id === cleaning.id ? { ...payload.cleaning!, photos: item.photos } : item);
    setCleanings(payload.nextCleaning ? [payload.nextCleaning, ...updated] : updated);
    setReviewDrafts((current) => ({ ...current, [cleaning.id]: "" }));
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <strong className="text-lg">Уборки квартиры</strong>
          <span className="text-muted-foreground text-sm">Планируйте работу, передавайте чек-лист и принимайте результат.</span>
        </div>
        <div className="flex gap-2"><Button aria-expanded={showNotifications} aria-label="Уведомления об уборках" onClick={() => { const next = !showNotifications; setShowNotifications(next); if (next) void refreshNotifications(); }} type="button" variant="outline"><Bell size={16} />{unreadCount > 0 && <Badge>{unreadCount}</Badge>}</Button><Button onClick={openCreate} type="button"><Plus size={16} />Новая уборка</Button></div>
      </div>

      {showNotifications && <section className="grid gap-2 rounded-lg border bg-background p-3"><div className="flex items-center justify-between gap-3"><strong>События уборок</strong>{unreadCount > 0 && <Button onClick={() => void markAllNotificationsRead()} size="sm" type="button" variant="ghost"><CheckCheck size={14} />Прочитать все</Button>}</div>{notifications.length > 0 ? <div className="grid divide-y">{notifications.map((notification) => <button className={`grid gap-1 py-3 text-left ${notification.readAt ? "text-muted-foreground" : ""}`} key={notification.id} onClick={() => void markNotificationRead(notification)} type="button"><span className="flex items-center gap-2 text-sm"><span className={`size-2 rounded-full ${notification.readAt ? "bg-muted" : "bg-foreground"}`} /><strong>{notification.title}</strong></span><span className="pl-4 text-sm">{notification.body}</span><time className="pl-4 text-muted-foreground text-xs">{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(notification.createdAt))}</time></button>)}</div> : <span className="py-3 text-muted-foreground text-sm">Новых событий пока нет.</span>}</section>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Всего" value={cleanings.length} />
        <Metric label="Активные" value={activeCount} />
        <Metric label="Завершены" value={completedCount} />
        <Metric label="Расходы" value={formatMoney(totalCost)} />
      </div>

      {showForm && (
        <Card>
          <CardHeader className="grid-cols-[1fr_auto] gap-3">
            <div><CardTitle>{editingId ? "Редактировать уборку" : "Новая уборка"}</CardTitle><CardDescription>Клинер увидит только понятный чек-лист, зоны, средства и примечание.</CardDescription></div>
            <Button aria-label="Закрыть форму" onClick={closeForm} size="icon" type="button" variant="ghost"><X size={16} /></Button>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Название"><Input onChange={(event) => { const title = event.currentTarget.value; setDraft((current) => ({ ...current, title })); }} value={draft.title} /></Field>
              <Field label="Тип"><Select value={draft.type} onValueChange={(value) => setDraft((current) => ({ ...current, type: value as CleaningType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(cleaningTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Сценарий"><Select disabled={editingId !== null} value={draft.mode} onValueChange={(value) => setDraft((current) => ({ ...current, mode: value as CleaningMode }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(cleaningModeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Дата и время"><Input onChange={(event) => { const scheduledAt = event.currentTarget.value; setDraft((current) => ({ ...current, scheduledAt, scheduledFor: scheduledAt ? current.scheduledFor : "" })); }} type="datetime-local" value={draft.scheduledAt ?? ""} /></Field>
              <Field label="Повторение"><Select value={draft.recurrence} onValueChange={(value) => setDraft((current) => ({ ...current, recurrence: value as CleaningRecurrence }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(cleaningRecurrenceLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Клинер"><Input onChange={(event) => { const cleaner = event.currentTarget.value; setDraft((current) => ({ ...current, cleaner })); }} placeholder="Имя" value={draft.cleaner} /></Field>
              <Field label="Телефон"><Input onChange={(event) => { const cleanerPhone = event.currentTarget.value; setDraft((current) => ({ ...current, cleanerPhone })); }} placeholder="+7..." value={draft.cleanerPhone ?? ""} /></Field>
              <Field label="Стоимость"><Input min="0" onChange={(event) => { const value = event.currentTarget.value; setDraft((current) => ({ ...current, cost: value === "" ? undefined : Number(value) })); }} placeholder="0" type="number" value={draft.cost ?? ""} /></Field>
            </div>
            <div className="grid gap-2"><span className="text-sm font-medium">Зоны</span><div className="flex flex-wrap gap-2">{zones.map((zone) => { const active = draft.zones.includes(zone); return <Button key={zone} onClick={() => setDraft((current) => ({ ...current, zones: active ? current.zones.filter((item) => item !== zone) : zone === "Вся квартира" ? [zone] : [...current.zones.filter((item) => item !== "Вся квартира"), zone] }))} size="sm" type="button" variant={active ? "default" : "secondary"}>{active && <Check size={14} />}{zone}</Button>; })}</div></div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Чек-лист, по одному пункту в строке"><Textarea onChange={(event) => { const checklistText = event.currentTarget.value; setDraft((current) => ({ ...current, checklistText })); }} rows={7} value={draft.checklistText} /></Field>
              <div className="grid gap-3"><Field label="Средства и инвентарь, по одному в строке"><Textarea onChange={(event) => { const suppliesText = event.currentTarget.value; setDraft((current) => ({ ...current, suppliesText })); }} rows={3} value={draft.suppliesText} /></Field><Field label="Примечание клинеру"><Textarea onChange={(event) => { const notes = event.currentTarget.value; setDraft((current) => ({ ...current, notes })); }} rows={3} value={draft.notes ?? ""} /></Field></div>
            </div>
            <fieldset className="grid gap-2 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">Фотоконтроль</legend>
              <p className="m-0 text-muted-foreground text-sm">Выберите, какие фотографии клинер обязан приложить перед завершением.</p>
              <div className="flex flex-wrap gap-4">
                <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
                  <input checked={draft.requirePhotoBefore} onChange={(event) => { const requirePhotoBefore = event.currentTarget.checked; setDraft((current) => ({ ...current, requirePhotoBefore })); }} type="checkbox" />
                  Нужно фото до
                </label>
                <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
                  <input checked={draft.requirePhotoAfter} onChange={(event) => { const requirePhotoAfter = event.currentTarget.checked; setDraft((current) => ({ ...current, requirePhotoAfter })); }} type="checkbox" />
                  Нужно фото после
                </label>
              </div>
            </fieldset>
            <div className="flex justify-end gap-2"><Button onClick={closeForm} type="button" variant="outline">Отменить</Button><Button disabled={saving} onClick={() => void saveCleaning()} type="button"><Save size={16} />{saving ? "Сохраняем..." : "Сохранить"}</Button></div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {sorted.map((cleaning) => {
          const progress = cleaning.checklist.length ? Math.round(cleaning.completedItems.length / cleaning.checklist.length * 100) : 0;
          const beforeCount = cleaning.photos.filter((photo) => photo.phase === "before").length;
          const afterCount = cleaning.photos.filter((photo) => photo.phase === "after").length;
          const issueZones = cleaning.zoneResults.filter((result) => result.status === "issue");
          const photoRequirement = cleaning.requirePhotoBefore && cleaning.requirePhotoAfter ? "до и после" : cleaning.requirePhotoBefore ? "до" : cleaning.requirePhotoAfter ? "после" : "не нужен";
          return <Card key={cleaning.id}><CardContent className="grid gap-4 pt-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="grid min-w-0 gap-2"><div className="flex flex-wrap items-center gap-2"><strong>{cleaning.title}</strong><Badge variant={statusTone(cleaning.status)}>{cleaningStatusLabels[cleaning.status]}</Badge><Badge variant="outline">{cleaningTypeLabels[cleaning.type]}</Badge>{cleaning.recurrence !== "none" && <Badge variant="outline">{cleaningRecurrenceLabels[cleaning.recurrence]}</Badge>}{issueZones.length > 0 && <Badge variant="destructive">Проблемы: {issueZones.length}</Badge>}</div><div className="text-muted-foreground text-sm">{cleaning.scheduledFor || "Дата не указана"}{cleaning.cleaner ? ` · ${cleaning.cleaner}` : " · Клинер не назначен"}{cleaning.cost !== undefined ? ` · ${formatMoney(cleaning.cost)}` : ""}</div><div className="text-sm">{cleaning.zones.join(", ") || "Зоны не выбраны"}</div>{issueZones.map((result) => <div className="rounded-md bg-destructive/10 p-2 text-destructive text-sm" key={result.zone}><strong>{result.zone}</strong>{result.comment ? ` · ${result.comment}` : ""}</div>)}{cleaning.ownerFeedback && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm"><strong className="block text-destructive">Комментарий владельца</strong><span>{cleaning.ownerFeedback}</span></div>}<div className="text-muted-foreground text-sm">Фотоконтроль: {photoRequirement}{cleaning.requirePhotoBefore ? ` · до ${beforeCount}` : ""}{cleaning.requirePhotoAfter ? ` · после ${afterCount}` : ""}</div>{cleaning.photos.length > 0 && <div className="flex gap-2 overflow-x-auto">{cleaning.photos.map((photo, index) => <button aria-label={`Открыть ${photo.filename}`} className="block size-16 shrink-0 rounded-md border bg-cover bg-center" key={photo.id} onClick={() => setGallery({ photos: cleaning.photos, index })} style={{ backgroundImage: `url(${photo.url})` }} title={photo.zone ? `${photo.zone} · ${photo.phase === "before" ? "Фото до" : "Фото после"}` : photo.filename} type="button" />)}</div>}{cleaning.status === "completed" && <Textarea onChange={(event) => { const value = event.currentTarget.value; setReviewDrafts((current) => ({ ...current, [cleaning.id]: value })); }} placeholder="Что нужно исправить, если возвращаете уборку" rows={2} value={reviewDrafts[cleaning.id] ?? ""} />}<div className="flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-foreground" style={{ width: `${progress}%` }} /></div><span className="shrink-0 text-muted-foreground text-xs">{cleaning.completedItems.length}/{cleaning.checklist.length}</span></div></div><div className="flex flex-wrap gap-2 md:justify-end">{cleaning.link && <Button asChild size="sm" variant="secondary"><a href={cleaning.link} rel="noreferrer" target="_blank"><ExternalLink size={14} />Ссылка клинеру</a></Button>}{cleaning.status === "completed" && <Button onClick={() => void reviewCleaning(cleaning, "accepted")} size="sm" type="button"><Check size={14} />Принять</Button>}{cleaning.status === "completed" && <Button onClick={() => void reviewCleaning(cleaning, "revision_requested")} size="sm" type="button" variant="outline">Вернуть на доработку</Button>}<Button onClick={() => openEdit(cleaning)} size="sm" type="button" variant="outline"><Pencil size={14} />Редактировать</Button><Button aria-label="Удалить уборку" onClick={() => void removeCleaning(cleaning)} size="icon-sm" type="button" variant="destructive"><Trash2 size={14} /></Button></div></CardContent></Card>;
        })}
        {!sorted.length && <Card><CardContent className="grid place-items-center gap-3 py-12 text-center"><span className="grid size-11 place-items-center rounded-lg bg-muted"><ClipboardCheck size={20} /></span><div><strong className="block">Уборок пока нет</strong><span className="text-muted-foreground text-sm">Создайте первую уборку и передайте клинеру простой чек-лист.</span></div><Button onClick={openCreate} type="button"><Plus size={16} />Новая уборка</Button></CardContent></Card>}
      </div>
      {gallery && gallery.photos[gallery.index] && (
        <div aria-label="Галерея фотографий уборки" aria-modal="true" className="fixed inset-0 z-50 grid bg-black/85 p-4 sm:p-8" role="dialog">
          <div className="relative grid min-h-0 grid-rows-[auto_1fr_auto] gap-4">
            <div className="flex items-center justify-between gap-4 text-white">
              <span className="text-sm">{gallery.index + 1} из {gallery.photos.length}</span>
              <Button aria-label="Закрыть галерею" onClick={() => setGallery(null)} size="icon" type="button" variant="secondary"><X size={18} /></Button>
            </div>
            <div aria-label={gallery.photos[gallery.index].filename} className="min-h-0 rounded-lg bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${gallery.photos[gallery.index].url})` }} />
            <div className="flex items-center justify-center gap-3">
              <Button aria-label="Предыдущее фото" disabled={gallery.photos.length < 2} onClick={() => setGallery((current) => current ? { ...current, index: (current.index - 1 + current.photos.length) % current.photos.length } : null)} size="icon" type="button" variant="secondary"><ChevronLeft size={20} /></Button>
              <span className="max-w-[60vw] truncate text-sm text-white">{gallery.photos[gallery.index].zone ? `${gallery.photos[gallery.index].zone} · ` : ""}{gallery.photos[gallery.index].phase === "before" ? "Фото до" : "Фото после"}</span>
              <Button aria-label="Следующее фото" disabled={gallery.photos.length < 2} onClick={() => setGallery((current) => current ? { ...current, index: (current.index + 1) % current.photos.length } : null)} size="icon" type="button" variant="secondary"><ChevronRight size={20} /></Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="grid content-start gap-1.5 text-sm font-medium"><span>{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <Card size="sm"><CardContent className="grid gap-1 pt-4"><span className="text-muted-foreground text-sm">{label}</span><strong className="text-2xl font-semibold">{value}</strong></CardContent></Card>;
}
