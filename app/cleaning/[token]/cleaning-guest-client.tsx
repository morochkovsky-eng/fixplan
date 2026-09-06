"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cleaningStatusLabels, cleaningTypeLabels, type Cleaning } from "@/lib/cleanings";

export function CleaningGuestClient({ token }: { token: string }) {
  const [cleaning, setCleaning] = useState<Cleaning | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  async function patch(completedItems: string[], status: "in_progress" | "completed") {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/cleanings/guest/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedItems, status }),
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

  if (loading) return <main className="grid min-h-screen place-items-center bg-muted px-4"><Loader2 className="animate-spin" /></main>;
  if (!cleaning) return <main className="grid min-h-screen place-items-center bg-muted px-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>Ссылка недоступна</CardTitle><CardDescription>{error}</CardDescription></CardHeader></Card></main>;

  const done = cleaning.status === "completed" || cleaning.status === "accepted";
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
          <section className="grid gap-2"><div className="flex items-center justify-between gap-3"><strong>Чек-лист</strong><span className="text-muted-foreground text-sm">{cleaning.completedItems.length}/{cleaning.checklist.length}</span></div>{cleaning.checklist.map((item) => { const checked = cleaning.completedItems.includes(item); return <button className={`flex min-h-12 items-center gap-3 rounded-lg border p-3 text-left ${checked ? "bg-muted text-muted-foreground" : "bg-background"}`} disabled={done || saving} key={item} onClick={() => { const completedItems = checked ? cleaning.completedItems.filter((value) => value !== item) : [...cleaning.completedItems, item]; void patch(completedItems, "in_progress"); }} type="button"><span className={`grid size-5 shrink-0 place-items-center rounded border ${checked ? "border-foreground bg-foreground text-background" : "bg-background"}`}>{checked && <Check size={14} />}</span><span className={checked ? "line-through" : ""}>{item}</span></button>; })}</section>
          {error && <p className="m-0 text-destructive text-sm">{error}</p>}
          {done ? <div className="rounded-lg bg-muted p-4 text-center"><strong>Уборка завершена</strong><p className="m-1 text-muted-foreground text-sm">Результат уже передан владельцу.</p></div> : <Button className="w-full" disabled={saving || cleaning.completedItems.length !== cleaning.checklist.length} onClick={() => void patch(cleaning.completedItems, "completed")} type="button">{saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}Завершить уборку</Button>}
        </CardContent>
      </Card>
    </main>
  );
}
