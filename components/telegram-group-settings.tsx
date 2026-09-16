"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Connection = {
  apartmentId: string;
  apartmentName: string;
  personalConnected: boolean;
  group: { title: string; connected_at: string } | null;
  lastDelivery?: {
    period: string;
    group_title: string;
    sent_at: string;
  } | null;
};

async function fetchConnection(): Promise<Connection> {
  const response = await fetch("/api/telegram/group", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(payload.error ?? "Не удалось проверить подключение.");
  return payload;
}

export function TelegramGroupSettings() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [link, setLink] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setConnection(await fetchConnection());
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось проверить подключение.",
      );
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetchConnection()
      .then((data) => {
        if (!cancelled) setConnection(data);
      })
      .catch((error) => {
        if (!cancelled)
          setError(
            error instanceof Error
              ? error.message
              : "Не удалось проверить подключение.",
          );
      });
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  useEffect(() => {
    if (!link) return;
    const interval = setInterval(() => {
      if (Date.parse(expiresAt) < Date.now()) {
        setLink("");
        setNotice(
          "Ссылка истекла. Создайте новую, если группа ещё не подключена.",
        );
      } else if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [link, expiresAt, refresh]);

  async function createLink() {
    if (!connection) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/telegram/group", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apartmentId: connection.apartmentId }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Не удалось создать ссылку.");
      setLink(payload.link);
      setExpiresAt(payload.expiresAt);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Не удалось создать ссылку.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    if (!connection) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/telegram/group", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apartmentId: connection.apartmentId }),
      });
      if (!response.ok) throw new Error("Не удалось отключить группу.");
      setLink("");
      setConfirmDisconnect(false);
      setNotice("Группа отключена. Новые счета отправляться не будут.");
      await refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Не удалось отключить группу.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setNotice("Ссылка скопирована.");
    } catch {
      setError("Не удалось скопировать. Используйте кнопку «Выбрать группу».");
    }
  }

  return (
    <Card className="lg:col-span-2 telegram-group-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare size={18} />
          Чат с арендатором
        </CardTitle>
        <CardDescription>
          Счета за коммуналку для{" "}
          {connection?.apartmentName
            ? `«${connection.apartmentName}»`
            : "выбранной квартиры"}{" "}
          — в вашей Telegram-группе, после подтверждения в личном чате.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {!connection && !error && (
          <p className="text-sm text-muted-foreground" role="status">
            Проверяем подключение…
          </p>
        )}
        {connection?.group && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <div className="grid min-w-0 gap-1">
              <strong className="flex items-center gap-2 text-sm">
                <Check size={16} className="shrink-0 text-primary" />
                <span className="break-words">{connection.group.title}</span>
              </strong>
              <span className="text-sm text-muted-foreground">
                Группа подключена к этой квартире
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDisconnect(true)}
            >
              <Unplug size={15} />
              Отключить
            </Button>
          </div>
        )}
        {confirmDisconnect && (
          <div
            className="grid gap-3"
            role="group"
            aria-label="Отключение группы"
          >
            <p className="text-sm">
              Отключить группу? Бот останется участником, но отправка счетов из
              Fixplan прекратится.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive-soft"
                disabled={busy}
                onClick={() => void disconnect()}
              >
                Отключить группу
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmDisconnect(false)}
              >
                Отмена
              </Button>
            </div>
          </div>
        )}
        {!connection?.group && (
          <ol className="telegram-group-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Подключите личный Telegram</strong>
                <p>
                  Кнопкой в блоке выше. Затем вернитесь сюда — используйте тот
                  же Telegram-аккаунт.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Добавьте бота в группу</strong>
                <p>
                  Создайте группу с арендатором или выберите существующую по
                  кнопке ниже. Разрешите боту отправлять сообщения.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Сформируйте счёт в личном чате</strong>
                <p>
                  Например: «Сформируй счёт арендатору за сентябрь 2026». Бот
                  покажет начисления и итог и предложит отправить их в группу.
                </p>
              </div>
            </li>
          </ol>
        )}
        {!connection?.group && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={busy || !connection?.personalConnected}
              onClick={() => void createLink()}
            >
              <MessageSquare size={16} />
              {busy ? "Готовим ссылку…" : "Добавить бота в группу"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void refresh()}
            >
              <RefreshCw size={15} />
              Проверить подключение
            </Button>
          </div>
        )}
        {connection && !connection.personalConnected && (
          <p className="text-sm text-muted-foreground">
            Сначала подключите личный Telegram в блоке выше, затем нажмите
            «Проверить подключение».
          </p>
        )}
        {link && !connection?.group && (
          <div className="grid gap-3 border-t pt-4">
            <p className="text-sm">
              Ссылка готова. Выберите группу в Telegram и подтвердите добавление
              бота. Ссылка одноразовая и действует 15 минут.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={link} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} />
                  Выбрать группу
                </a>
              </Button>
              <Button variant="outline" onClick={() => void copyLink()}>
                <Copy size={15} />
                Скопировать ссылку
              </Button>
            </div>
          </div>
        )}
        <div className="grid gap-2 border-t pt-4 text-sm text-muted-foreground">
          <p>
            В личном чате можно ответить «да, отправляем», нажать «Отправить в
            группу» или оставить счёт у себя и скопировать текст. Без
            подтверждения бот ничего не отправит.
          </p>
          <p>
            В группу попадут только услуги, суммы и сроки оплаты. Личная
            переписка с помощником останется у вас. Обычные сообщения группы бот
            не обрабатывает.
          </p>
        </div>
        {connection?.lastDelivery && (
          <p className="text-sm text-muted-foreground">
            Последняя отправка: {connection.lastDelivery.period} ·{" "}
            {new Date(connection.lastDelivery.sent_at).toLocaleDateString(
              "ru-RU",
            )}{" "}
            · {connection.lastDelivery.group_title}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
