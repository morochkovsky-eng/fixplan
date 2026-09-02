"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Status = "ok" | "attention" | "in_progress" | "needs_master";

type GuestAsset = {
  id: string;
  code: string;
  name: string;
  roomId: string;
  category: string;
  kind?: string;
  status: Status;
  x: number;
  y: number;
  lastChecked: string;
  photoNote: string;
};

type GuestInspection = {
  id: string;
  number: string;
  title: string;
  createdAt: string;
  completedAt?: string;
  contractor: string;
  contractorPhone?: string;
  workflow?: "inspection" | "work_order";
  scope: string;
  status: "draft" | "sent" | "in_progress" | "completed" | "accepted";
  summary: string;
  conclusion?: string;
  assetInstructions?: Record<string, string>;
};

type GuestResult = {
  assetId: string;
  statusAfter: Status | "";
  comment: string;
  cost?: number | string | null;
  photoCount: number;
};

type GuestPayload = {
  inspection: GuestInspection;
  assets: GuestAsset[];
  results: GuestResult[];
};

const statusLabels: Record<Status, string> = {
  ok: "Исправно",
  attention: "Есть замечание",
  in_progress: "В работе",
  needs_master: "Нужен ремонт",
};

const roomLabels: Record<string, string> = {
  living: "Гостиная",
  kitchen: "Кухня",
  bath: "Ванная",
  bedroom: "Спальня",
  hall: "Прихожая",
  office: "Кабинет",
  laundry: "Постирочная",
};

const categoryLabels: Record<string, string> = {
  electric: "Электрика",
  plumbing: "Сантехника",
  appliance: "Техника",
  household_appliance: "Бытовая техника",
  furniture: "Мебель",
  window: "Окна",
  hvac: "Климат",
};

function planForAsset(asset: GuestAsset) {
  if (asset.category === "plumbing") return "/plan/plumbing-real.png";
  if (asset.category === "window") return "/plan/windows.png";
  if (asset.category === "furniture") return "/plan/furniture-real.png";
  if (asset.kind === "light") return "/plan/lighting-fixtures.png";
  if (asset.kind === "radiator") return "/plan/radiators.png";
  if (asset.kind === "warm_floor") return "/plan/warm-floor.png";
  if (asset.kind === "ventilation") return "/plan/ventilation-real.png";
  return "/plan/sockets-switches.png";
}

function defaultResult(asset: GuestAsset): GuestResult {
  return {
    assetId: asset.id,
    statusAfter: "",
    comment: "",
    cost: "",
    photoCount: 0,
  };
}

export function GuestInspectionClient({ token }: { token: string }) {
  const [payload, setPayload] = useState<GuestPayload | null>(null);
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [results, setResults] = useState<Record<string, GuestResult>>({});
  const [conclusion, setConclusion] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAssetId, setUploadingAssetId] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [savedAssetIds, setSavedAssetIds] = useState<Set<string>>(() => new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadInspection() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/guest/${token}`, { cache: "no-store" });
        const data = (await response.json()) as GuestPayload & { error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "Не удалось открыть задание.");
        }

        if (cancelled) return;

        const initialResults: Record<string, GuestResult> = {};
        for (const asset of data.assets) {
          const existing = data.results.find((result) => result.assetId === asset.id);
          initialResults[asset.id] = existing ?? defaultResult(asset);
        }

        setPayload(data);
        setResults(initialResults);
        setSavedAssetIds(new Set(data.results.map((result) => result.assetId)));
        setIndex(Math.max(0, data.assets.findIndex((item) => !data.results.some((result) => result.assetId === item.id))));
        setConclusion(data.inspection.conclusion ?? "");
        setDone(data.inspection.status === "completed");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось открыть задание.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInspection();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const assets = payload?.assets ?? [];
  const asset = assets[index];
  const currentResult = asset ? results[asset.id] ?? defaultResult(asset) : undefined;
  const completedCount = savedAssetIds.size;
  const isWorkOrder = payload?.inspection.workflow === "work_order";
  const currentInstruction =
    asset && payload?.inspection.assetInstructions
      ? payload.inspection.assetInstructions[asset.id]?.trim()
      : "";
  const [statusErrorAssetId, setStatusErrorAssetId] = useState("");

  useEffect(() => {
    const saveTimers = saveTimersRef.current;

    return () => {
      Object.values(saveTimers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  async function saveResult(result: GuestResult) {
    if (!result.statusAfter) {
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/guest/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Не удалось сохранить результат.");
      }

      setSavedAssetIds((current) => new Set(current).add(result.assetId));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить результат.");
    } finally {
      setSaving(false);
    }
  }

  function queueAutosave(result: GuestResult) {
    if (!result.statusAfter) {
      return;
    }

    clearTimeout(saveTimersRef.current[result.assetId]);
    saveTimersRef.current[result.assetId] = setTimeout(() => {
      void saveResult(result);
    }, 700);
  }

  function patchResult(assetId: string, patch: Partial<GuestResult>) {
    const targetAsset = assets.find((item) => item.id === assetId) ?? asset;
    if (!targetAsset) return;
    const nextResult = {
      ...(results[assetId] ?? defaultResult(targetAsset)),
      ...patch,
    };

    setResults((current) => ({
      ...current,
      [assetId]: nextResult,
    }));
    if (patch.statusAfter) {
      setStatusErrorAssetId("");
    }
    queueAutosave(nextResult);
  }

  async function moveStep(direction: 1 | -1) {
    if (!currentResult) return;

    if (!currentResult.statusAfter) {
      setStatusErrorAssetId(currentResult.assetId);
      return;
    }

    clearTimeout(saveTimersRef.current[currentResult.assetId]);
    await saveResult(currentResult);
    setIndex((current) => Math.min(assets.length - 1, Math.max(0, current + direction)));
  }

  async function uploadPhotos(files: FileList | null) {
    if (!asset || !currentResult || !files?.length) return;

    clearTimeout(saveTimersRef.current[asset.id]);
    setUploadingAssetId(asset.id);
    setError("");

    try {
      let nextPhotoCount = currentResult.photoCount;

      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("assetId", asset.id);
        formData.append("file", file);

        const response = await fetch(`/api/guest/${token}/photos`, {
          method: "POST",
          body: formData,
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          photoCount?: number;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Не удалось загрузить фото.");
        }

        nextPhotoCount = data.photoCount ?? nextPhotoCount + 1;
      }

      const nextResult = { ...currentResult, photoCount: nextPhotoCount };
      setResults((current) => ({ ...current, [asset.id]: nextResult }));
      await saveResult(nextResult);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить фото.");
    } finally {
      setUploadingAssetId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function submitReport() {
    if (!payload) return;

    if (!currentResult?.statusAfter) {
      setStatusErrorAssetId(currentResult?.assetId ?? "");
      return;
    }

    const submittedResults = assets
      .map((item) => results[item.id] ?? defaultResult(item))
      .filter((result): result is GuestResult & { statusAfter: Status } =>
        Boolean(result.statusAfter),
      );

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/guest/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conclusion,
          results: submittedResults,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Не удалось отправить отчет.");
      }

      setDone(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось отправить отчет.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex items-center gap-3 pt-6">
            <Loader2 className="size-4 animate-spin" />
            Открываем задание...
          </CardContent>
        </Card>
      </main>
    );
  }

  if (error && !payload) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Ссылка не открылась</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (!payload || !asset || !currentResult) {
    return null;
  }

  if (done) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Отчет отправлен</CardTitle>
            <CardDescription>
              Спасибо. Владелец увидит {isWorkOrder ? "результат задания" : "сводку обхода"} и результаты по каждому узлу.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary">Проверено {assets.length} узлов</Badge>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!started) {
    const contractorLine = [
      payload.inspection.contractor,
      payload.inspection.contractorPhone,
    ].filter(Boolean).join(" · ");

    return (
      <main className="min-h-screen bg-muted px-4 py-6">
        <section className="mx-auto grid max-w-[490px] gap-4">
          <Card className="guest-start-card">
            <CardHeader className="guest-start-header">
              <div className="guest-brand-mark" aria-label="FIXPLAN, Шпалерная, 34Б">
                <Image
                  alt="FIXPLAN"
                  height={18}
                  priority
                  src="/fixplan-logo.svg"
                  width={133}
                />
                <span>Шпалерная, 34Б</span>
              </div>
              <CardTitle>{payload.inspection.number}</CardTitle>
              <CardDescription>{contractorLine}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted p-3">
                  <span className="text-muted-foreground text-sm">Узлов</span>
                  <strong className="block text-2xl font-medium">{assets.length}</strong>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <span className="text-muted-foreground text-sm">Создан</span>
                  <strong className="block text-base font-medium">{payload.inspection.createdAt}</strong>
                </div>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <span className="text-muted-foreground text-sm">Доступ выдан</span>
                <strong className="block text-base font-medium">{contractorLine}</strong>
              </div>
              {completedCount > 0 && (
                <div className="rounded-lg bg-muted p-3">
                  <span className="text-muted-foreground text-sm">Прогресс</span>
                  <strong className="block text-base font-medium">
                    {completedCount} из {assets.length} узлов уже сохранено
                  </strong>
                </div>
              )}
              <p className="m-0 text-muted-foreground text-sm">
                Нажмите «Начать». Дальше будет один узел за раз: схема, статус, комментарий и кнопки назад/далее.
              </p>
              <Button className="w-full" onClick={() => setStarted(true)} size="lg" type="button">
                {isWorkOrder ? "Начать задание" : "Начать обход"}
                <ArrowRight size={16} />
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }

  const isLast = index === assets.length - 1;
  const contractorLine = [
    payload.inspection.contractor,
    payload.inspection.contractorPhone,
  ].filter(Boolean).join(" · ");

  return (
    <main className="min-h-screen bg-muted px-3 py-3 sm:px-4 sm:py-5">
      <section className="mx-auto grid max-w-xl gap-3">
        <Card className="py-3">
          <CardContent className="grid gap-3 px-3 sm:px-4">
            <div className="flex items-center justify-between gap-3">
              <Badge variant="outline">
                {index + 1} из {assets.length}
              </Badge>
              <Badge variant="secondary">
                {saving ? "Сохраняем..." : `${completedCount} сохранено`}
              </Badge>
            </div>
            <div className="relative overflow-hidden rounded-xl bg-muted p-2">
              <img
                alt="Схема расположения узла"
                className="block max-h-[34vh] w-full object-contain"
                src={planForAsset(asset)}
              />
              <div
                className="absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background"
                style={{ left: `${asset.x}%`, top: `${asset.y}%` }}
              >
                <span className="text-xs font-medium">{asset.code.split("-")[0]}</span>
              </div>
            </div>

            <div className="grid gap-1">
              <h1 className="m-0 text-xl font-medium leading-tight">{asset.code} · {asset.name}</h1>
              <p className="m-0 text-muted-foreground text-sm">
                {roomLabels[asset.roomId] ?? asset.roomId} · {categoryLabels[asset.category] ?? asset.category}
              </p>
              <p className="m-0 text-muted-foreground text-xs">{contractorLine}</p>
            </div>

            {isWorkOrder && currentInstruction && (
              <div className="rounded-lg bg-background p-3">
                <span className="text-muted-foreground text-sm">Комментарий владельца</span>
                <p className="m-0 mt-1 text-sm">{currentInstruction}</p>
              </div>
            )}

            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="guest-status">
                Статус
              </label>
              <Select
                onValueChange={(value) => patchResult(asset.id, { statusAfter: value as Status })}
                value={currentResult.statusAfter || undefined}
              >
                <SelectTrigger
                  className={statusErrorAssetId === asset.id ? "border-destructive ring-2 ring-destructive/20" : ""}
                  id="guest-status"
                >
                  <SelectValue placeholder="Выберите статус" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(statusLabels) as Status[]).map((status) => (
                    <SelectItem key={status} value={status}>
                      {statusLabels[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {statusErrorAssetId === asset.id && (
                <p className="m-0 text-destructive text-sm">Выберите статус, чтобы перейти дальше.</p>
              )}
            </div>

            <Textarea
              className="min-h-24"
              onChange={(event) => patchResult(asset.id, { comment: event.currentTarget.value })}
              placeholder="Что проверили, что нашли, что нужно сделать"
              value={currentResult.comment}
            />

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                inputMode="numeric"
                onChange={(event) => patchResult(asset.id, { cost: event.currentTarget.value })}
                placeholder="Стоимость ремонта, руб. (необязательно)"
                value={currentResult.cost ?? ""}
              />
              <Button
                disabled={uploadingAssetId === asset.id}
                onClick={() => fileInputRef.current?.click()}
                size="lg"
                type="button"
                variant="secondary"
              >
                {uploadingAssetId === asset.id ? <Loader2 className="size-4 animate-spin" /> : <Camera size={16} />}
                {currentResult.photoCount || ""}
              </Button>
              <input
                accept="image/*"
                capture="environment"
                className="hidden"
                multiple
                onChange={(event) => void uploadPhotos(event.currentTarget.files)}
                ref={fileInputRef}
                type="file"
              />
            </div>

            {isLast && (
              <Textarea
                className="min-h-24"
                onChange={(event) => setConclusion(event.currentTarget.value)}
                placeholder="Общее заключение по обходу: что важно знать владельцу"
                value={conclusion}
              />
            )}

            {error && <p className="m-0 text-destructive text-sm">{error}</p>}

            <div className="grid grid-cols-2 gap-2">
              <Button
                disabled={index === 0 || submitting}
                onClick={() => void moveStep(-1)}
                size="lg"
                type="button"
                variant="secondary"
              >
                <ArrowLeft size={16} />
                Назад
              </Button>
              {isLast ? (
                <Button disabled={submitting} onClick={submitReport} size="lg" type="button">
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <Check size={16} />}
                  Отправить
                </Button>
              ) : (
                <Button
                  disabled={submitting}
                  onClick={() => void moveStep(1)}
                  size="lg"
                  type="button"
                >
                  Далее
                  <ArrowRight size={16} />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
