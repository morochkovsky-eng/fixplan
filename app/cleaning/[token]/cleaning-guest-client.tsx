"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  cleaningStatusLabels,
  cleaningTypeLabels,
  type Cleaning,
  type CleaningPhoto,
  type CleaningPhotoPhase,
  type CleaningZoneResult,
  type CleaningZoneStatus,
} from "@/lib/cleanings";

const zoneStatusLabels: Record<CleaningZoneStatus, string> = {
  pending: "Не начато",
  done: "Готово",
  issue: "Есть проблема",
};

export function CleaningGuestClient({ token }: { token: string }) {
  const [cleaning, setCleaning] = useState<Cleaning | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/cleanings/guest/${token}`, { cache: "no-store" });
        const payload = (await response.json()) as { cleaning?: Cleaning; error?: string };
        if (!response.ok || !payload.cleaning) throw new Error(payload.error ?? "Не удалось открыть уборку.");
        if (!cancelled) setCleaning(payload.cleaning);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Не удалось открыть уборку.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  async function patch(completedItems: string[], status: "scheduled" | "in_progress" | "completed" | "declined", zoneResults = cleaning?.zoneResults ?? []) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/cleanings/guest/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedItems, status, zoneResults }),
      });
      const payload = (await response.json().catch(() => ({}))) as { cleaning?: Cleaning; error?: string };
      if (!response.ok || !payload.cleaning) throw new Error(payload.error ?? "Не удалось сохранить прогресс.");
      setCleaning(payload.cleaning);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить прогресс.");
    } finally {
      setSaving(false);
    }
  }

  function updateZoneResult(zone: string, values: Partial<Omit<CleaningZoneResult, "zone">>) {
    if (!cleaning) return [];
    const nextResults = cleaning.zones.map((currentZone) => {
      const current = cleaning.zoneResults.find((result) => result.zone === currentZone) ?? {
        zone: currentZone,
        status: "pending" as const,
        comment: "",
      };
      return currentZone === zone ? { ...current, ...values } : current;
    });
    setCleaning({ ...cleaning, zoneResults: nextResults });
    return nextResults;
  }

  async function uploadPhotos(files: FileList | null, phase: CleaningPhotoPhase, zone: string) {
    if (!files?.length || !cleaning) return;
    const uploadKey = `${zone}:${phase}`;
    setUploadingPhoto(uploadKey);
    setError("");
    try {
      const uploaded: CleaningPhoto[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("phase", phase);
        formData.set("zone", zone);
        const response = await fetch(`/api/cleanings/guest/${token}/photos`, {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          photo?: CleaningPhoto;
          error?: string;
        };
        if (!response.ok || !payload.photo) {
          throw new Error(payload.error ?? "Не удалось загрузить фотографию.");
        }
        uploaded.push(payload.photo);
      }
      setCleaning((current) => current ? {
        ...current,
        status: current.status === "scheduled" ? "in_progress" : current.status,
        photos: [...current.photos, ...uploaded],
      } : current);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить фотографию.");
    } finally {
      setUploadingPhoto(null);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-muted px-4"><Loader2 className="animate-spin" /></main>;
  if (!cleaning) return <main className="grid min-h-screen place-items-center bg-muted px-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>Ссылка недоступна</CardTitle><CardDescription>{error}</CardDescription></CardHeader></Card></main>;

  if (cleaning.status === "offered" || cleaning.status === "declined") {
    const declined = cleaning.status === "declined";
    return <main className="min-h-screen bg-muted px-4 py-6 sm:py-10"><Card className="mx-auto w-full max-w-xl"><CardHeader className="gap-5"><div className="grid gap-1.5"><Image alt="FIXPLAN" height={18} priority src="/fixplan-logo.svg" width={133} /><span className="text-muted-foreground text-sm">Шпалерная, 34Б</span></div><div className="grid gap-2"><Badge className="w-fit" variant={declined ? "destructive" : "secondary"}>{cleaningStatusLabels[cleaning.status]}</Badge><CardTitle>{cleaning.title}</CardTitle><CardDescription>{cleaning.scheduledFor || "Дата не указана"}{cleaning.cost !== undefined ? ` · ${cleaning.cost.toLocaleString("ru-RU")} ₽` : ""}</CardDescription></div></CardHeader><CardContent className="grid gap-5">{declined ? <div className="rounded-lg bg-muted p-4 text-center"><strong>Предложение отклонено</strong><p className="m-1 text-muted-foreground text-sm">Владелец увидит ваш ответ.</p></div> : <><section className="grid gap-2"><strong className="text-sm">Что нужно убрать</strong><div className="flex flex-wrap gap-2">{cleaning.zones.map((zone) => <Badge key={zone} variant="secondary">{zone}</Badge>)}</div></section><section className="grid gap-2"><strong className="text-sm">Состав работы</strong><ul className="m-0 grid gap-1 pl-5 text-sm">{cleaning.checklist.map((item) => <li key={item}>{item}</li>)}</ul></section>{cleaning.notes && <div className="rounded-lg bg-muted p-3 text-sm">{cleaning.notes}</div>}<div className="grid gap-2 sm:grid-cols-2"><Button disabled={saving} onClick={() => void patch([], "scheduled", [])} type="button">Принять задание</Button><Button disabled={saving} onClick={() => void patch([], "declined", [])} type="button" variant="outline">Отказаться</Button></div>{error && <p className="m-0 text-destructive text-sm">{error}</p>}</>}</CardContent></Card></main>;
  }

  const done = cleaning.status === "completed" || cleaning.status === "accepted";
  const legacyPhotos = cleaning.photos.filter((photo) => !photo.zone);
  const hasPhoto = (phase: CleaningPhotoPhase, zone: string) => cleaning.photos.some((photo) => photo.phase === phase && (!photo.zone || photo.zone === zone));
  const missingRequiredPhoto = cleaning.zones.some((zone) =>
    (cleaning.requirePhotoBefore && !hasPhoto("before", zone)) ||
    (cleaning.requirePhotoAfter && !hasPhoto("after", zone))
  );
  const missingZoneResult = cleaning.zones.some((zone) => {
    const result = cleaning.zoneResults.find((item) => item.zone === zone);
    return !result || result.status === "pending";
  });
  return (
    <main className="min-h-screen bg-muted px-4 py-6 sm:py-10">
      <Card className="mx-auto w-full max-w-xl">
        <CardHeader className="gap-5">
          <div className="grid gap-1.5"><Image alt="FIXPLAN" height={18} priority src="/fixplan-logo.svg" width={133} /><span className="text-muted-foreground text-sm">Шпалерная, 34Б</span></div>
          <div className="grid gap-2"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{cleaningTypeLabels[cleaning.type]}</Badge><Badge variant="secondary">{cleaningStatusLabels[cleaning.status]}</Badge></div><CardTitle className="text-xl">{cleaning.title}</CardTitle><CardDescription>{cleaning.scheduledFor || "Без указанной даты"}{cleaning.cleaner ? ` · ${cleaning.cleaner}` : ""}</CardDescription></div>
        </CardHeader>
        <CardContent className="grid gap-5">
          {cleaning.zones.length > 0 && <section className="grid gap-2"><strong className="text-sm">Зоны</strong><div className="flex flex-wrap gap-2">{cleaning.zones.map((zone) => <Badge key={zone} variant="secondary">{zone}</Badge>)}</div></section>}
          {cleaning.supplies.length > 0 && <section className="grid gap-2"><strong className="text-sm">Средства и инвентарь</strong><ul className="m-0 grid gap-1 pl-5 text-muted-foreground text-sm">{cleaning.supplies.map((item) => <li key={item}>{item}</li>)}</ul></section>}
          {cleaning.notes && <div className="rounded-lg bg-muted p-3 text-sm">{cleaning.notes}</div>}
          {cleaning.ownerFeedback && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm"><strong className="block text-destructive">Нужно доработать</strong><span>{cleaning.ownerFeedback}</span></div>}
          {cleaning.zones.length > 0 && <section className="grid gap-3">
            <div className="grid gap-1"><strong>Результат по зонам</strong><span className="text-muted-foreground text-sm">Отметьте результат и оставьте комментарий, если обнаружили проблему.</span></div>
            {cleaning.zones.map((zone) => {
              const result = cleaning.zoneResults.find((item) => item.zone === zone) ?? { zone, status: "pending" as const, comment: "" };
              return <div className="grid gap-3 rounded-lg border p-3" key={zone}>
                <strong className="text-sm">{zone}</strong>
                <Select disabled={done || saving} onValueChange={(value) => { const nextResults = updateZoneResult(zone, { status: value as CleaningZoneStatus }); void patch(cleaning.completedItems, "in_progress", nextResults); }} value={result.status}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(zoneStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
                <Textarea disabled={done || saving} onChange={(event) => { const comment = event.currentTarget.value; updateZoneResult(zone, { comment }); }} placeholder="Комментарий, если нужен" rows={2} value={result.comment} />
                {(cleaning.requirePhotoBefore || cleaning.requirePhotoAfter) && <div className="grid gap-2 sm:grid-cols-2">
                  {cleaning.requirePhotoBefore && <PhotoSection
                    disabled={done || uploadingPhoto !== null}
                    label="Фото до"
                    loading={uploadingPhoto === `${zone}:before`}
                    onOpen={(photo) => setGalleryIndex(cleaning.photos.findIndex((item) => item.id === photo.id))}
                    onUpload={(files) => void uploadPhotos(files, "before", zone)}
                    photos={cleaning.photos.filter((photo) => photo.zone === zone && photo.phase === "before")}
                  />}
                  {cleaning.requirePhotoAfter && <PhotoSection
                    disabled={done || uploadingPhoto !== null}
                    label="Фото после"
                    loading={uploadingPhoto === `${zone}:after`}
                    onOpen={(photo) => setGalleryIndex(cleaning.photos.findIndex((item) => item.id === photo.id))}
                    onUpload={(files) => void uploadPhotos(files, "after", zone)}
                    photos={cleaning.photos.filter((photo) => photo.zone === zone && photo.phase === "after")}
                  />}
                </div>}
              </div>;
            })}
            {!done && <Button disabled={saving} onClick={() => void patch(cleaning.completedItems, "in_progress", cleaning.zoneResults)} type="button" variant="outline">Сохранить комментарии</Button>}
          </section>}
          {legacyPhotos.length > 0 && <section className="grid gap-2"><strong className="text-sm">Ранее загруженные общие фотографии</strong><div className="flex gap-2 overflow-x-auto pb-1">{legacyPhotos.map((photo) => <button aria-label={`Открыть ${photo.filename}`} className="size-20 shrink-0 rounded-md border bg-cover bg-center" key={photo.id} onClick={() => setGalleryIndex(cleaning.photos.findIndex((item) => item.id === photo.id))} style={{ backgroundImage: `url(${photo.url})` }} type="button" />)}</div></section>}
          <section className="grid gap-2"><div className="flex items-center justify-between gap-3"><strong>Чек-лист</strong><span className="text-muted-foreground text-sm">{cleaning.completedItems.length}/{cleaning.checklist.length}</span></div>{cleaning.checklist.map((item) => { const checked = cleaning.completedItems.includes(item); return <button className={`flex min-h-12 items-center gap-3 rounded-lg border p-3 text-left ${checked ? "bg-muted text-muted-foreground" : "bg-background"}`} disabled={done || saving} key={item} onClick={() => { const completedItems = checked ? cleaning.completedItems.filter((value) => value !== item) : [...cleaning.completedItems, item]; void patch(completedItems, "in_progress"); }} type="button"><span className={`grid size-5 shrink-0 place-items-center rounded border ${checked ? "border-foreground bg-foreground text-background" : "bg-background"}`}>{checked && <Check size={14} />}</span><span className={checked ? "line-through" : ""}>{item}</span></button>; })}</section>
          {error && <p className="m-0 text-destructive text-sm">{error}</p>}
          {(missingRequiredPhoto || missingZoneResult) && !done && <p className="m-0 text-center text-muted-foreground text-sm">Для завершения заполните результаты по зонам и добавьте обязательные фотографии.</p>}
          {done ? <div className="rounded-lg bg-muted p-4 text-center"><strong>Уборка завершена</strong><p className="m-1 text-muted-foreground text-sm">Результат уже передан владельцу.</p></div> : <Button className="w-full" disabled={saving || uploadingPhoto !== null || missingRequiredPhoto || missingZoneResult || cleaning.completedItems.length !== cleaning.checklist.length} onClick={() => void patch(cleaning.completedItems, "completed", cleaning.zoneResults)} type="button">{saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}Завершить уборку</Button>}
        </CardContent>
      </Card>
      {galleryIndex !== null && cleaning.photos[galleryIndex] && (
        <div
          aria-label="Галерея фотографий уборки"
          aria-modal="true"
          className="fixed inset-0 z-50 grid bg-black/85 p-4 sm:p-8"
          role="dialog"
        >
          <div className="relative grid min-h-0 grid-rows-[auto_1fr_auto] gap-4">
            <div className="flex items-center justify-between gap-4 text-white">
              <span className="text-sm">{galleryIndex + 1} из {cleaning.photos.length}</span>
              <Button aria-label="Закрыть галерею" onClick={() => setGalleryIndex(null)} size="icon" type="button" variant="secondary"><X size={18} /></Button>
            </div>
            <div
              aria-label={cleaning.photos[galleryIndex].filename}
              className="min-h-0 rounded-lg bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${cleaning.photos[galleryIndex].url})` }}
            />
            <div className="flex items-center justify-center gap-3">
              <Button aria-label="Предыдущее фото" disabled={cleaning.photos.length < 2} onClick={() => setGalleryIndex((galleryIndex - 1 + cleaning.photos.length) % cleaning.photos.length)} size="icon" type="button" variant="secondary"><ChevronLeft size={20} /></Button>
              <span className="max-w-[60vw] truncate text-sm text-white">{cleaning.photos[galleryIndex].filename}</span>
              <Button aria-label="Следующее фото" disabled={cleaning.photos.length < 2} onClick={() => setGalleryIndex((galleryIndex + 1) % cleaning.photos.length)} size="icon" type="button" variant="secondary"><ChevronRight size={20} /></Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function PhotoSection({
  disabled,
  label,
  loading,
  onOpen,
  onUpload,
  photos,
}: {
  disabled: boolean;
  label: string;
  loading: boolean;
  onOpen: (photo: CleaningPhoto) => void;
  onUpload: (files: FileList | null) => void;
  photos: CleaningPhoto[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="grid content-start gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><strong className="text-sm">{label}</strong><Badge variant="secondary">Обязательно</Badge></div>
        <span className="text-muted-foreground text-xs">{photos.length}</span>
      </div>
      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((photo) => (
            <button
              aria-label={`Открыть ${photo.filename}`}
              className="size-20 shrink-0 rounded-md border bg-cover bg-center"
              key={photo.id}
              onClick={() => onOpen(photo)}
              style={{ backgroundImage: `url(${photo.url})` }}
              type="button"
            />
          ))}
        </div>
      )}
      <input
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabled}
        multiple
        onChange={(event) => {
          const files = event.currentTarget.files;
          onUpload(files);
          event.currentTarget.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      <Button disabled={disabled} onClick={() => inputRef.current?.click()} type="button" variant="outline">
        {loading ? <Loader2 className="animate-spin" size={16} /> : <Camera size={16} />}
        {photos.length ? "Добавить еще" : `Добавить ${label.toLowerCase()}`}
      </Button>
    </div>
  );
}
