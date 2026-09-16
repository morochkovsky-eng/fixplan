"use client";

import Link from "next/link";
import Image from "next/image";
import { ProductHeader } from "@/components/product-header";
import { DashboardClock } from "@/components/dashboard-clock";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  ReceiptText,
  ShieldCheck,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import styles from "./asset-demo.module.css";

const details = [
  ["Код", "B-02"],
  ["Комната", "Санузел"],
  ["Категория", "Бытовая техника и инженерные коммуникации"],
  ["Производитель", "Ariston Thermo Group"],
  ["Модель", "ABS VLS EVO INOX PW 80 D"],
  ["Серийный номер", "982620300419758214"],
  ["Установлен", "18 ноября 2021 г."],
  ["Гарантия", "до 18 ноября 2028 г."],
];

const events = [
  {
    date: "8 сентября 2026 · 18:42",
    icon: Wrench,
    title: "Создано задание мастеру",
    text: "Алексей проведёт диагностику блока управления, проверит нагревательные элементы, соединения и предохранительный клапан. После ремонта нужна итоговая проверка полного цикла нагрева.",
    badge: "Задание #4",
  },
  {
    date: "8 сентября 2026 · 18:37",
    icon: AlertTriangle,
    title: "Статус изменён",
    text: "После включения бойлер не нагревает воду. Индикатор питания работает, постороннего запаха и следов протечки нет.",
    badge: "Требует внимания",
  },
  {
    date: "16 августа 2026 · 12:15",
    icon: Check,
    title: "Плановая проверка завершена",
    text: "Корпус, подводка и соединения без видимых повреждений. Температура нагрева соответствует установленному режиму.",
    badge: "Исправно",
  },
  {
    date: "11 февраля 2026 · 09:20",
    icon: FileText,
    title: "Добавлен документ",
    text: "Инструкция по эксплуатации и гарантийный талон привязаны к паспорту узла.",
    badge: "2 файла",
  },
];

export default function AssetDemoPage() {
  return (
    <TooltipProvider>
      <ProductHeader
        brand={<Link aria-label="FixPlan" className="product-brand brand-mark" href="/ui-lab"><Image src="/fixplan-logo.svg" width={133} height={18} alt="FixPlan" /></Link>}
        navigation={<>{[["Дашборд", "/dashboard"], ["Узлы", "/assets"], ["План", "/plan"], ["Задания", "/tasks"], ["Документы", "/documents"], ["Счета", "/utilities"], ["Журнал", "/log"], ["Настройки", "/settings"]].map(([label, href]) => <Button key={href} asChild variant="ghost"><Link aria-current={href === "/assets" ? "page" : undefined} href={href}>{label}</Link></Button>)}</>}
        tools={<><DashboardClock compact timeZone="Europe/Moscow" /><div className="apartment-switcher"><Select defaultValue="sample"><SelectTrigger className="w-full" aria-label="Тестовый объект"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sample">Шпалерная, 34Б</SelectItem></SelectContent></Select></div></>}
      />
      <main className={styles.page}>
        {process.env.NODE_ENV === "development" && <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async />}
        <header className={styles.labHeader}>
            <Button asChild variant="ghost">
              <Link href="/ui-lab">
                <ArrowLeft />
                Компоненты
              </Link>
            </Button>
            <ThemeToggle />
        </header>

        <Card className={styles.heroCard}>
          <CardHeader className={styles.heroHeader}>
            <div className={styles.heroIdentity}>
              <span className={styles.heroIcon}>
                <AlertTriangle />
              </span>
              <div>
                <div className={styles.eyebrow}>B-02 · Санузел · Техника</div>
                <CardTitle className={styles.heroTitle}>
                  Бойлер накопительный с подключением к инженерным коммуникациям
                </CardTitle>
                <CardDescription className={styles.heroDescription}>
                  Электрический водонагреватель на 80 литров для резервного
                  горячего водоснабжения квартиры.
                </CardDescription>
              </div>
            </div>
            <CardAction className={styles.heroActions}>
              <Select defaultValue="attention">
                <SelectTrigger
                  aria-label="Статус узла"
                  className={styles.statusSelect}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ok">Исправно</SelectItem>
                  <SelectItem value="attention">Требует внимания</SelectItem>
                  <SelectItem value="work">В работе</SelectItem>
                  <SelectItem value="master">Нужен мастер</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline">
                <Pencil />
                <span className="desktop-action-label">Редактировать</span><span className="mobile-action-label">Изменить</span>
              </Button>
              <Button>
                <Plus />
                <span className="desktop-action-label">Создать задание</span><span className="mobile-action-label">Задание</span>
              </Button>
              <Button
                aria-label="Другие действия"
                className={styles.moreButton}
                size="icon"
                variant="ghost"
              >
                <MoreHorizontal />
              </Button>
            </CardAction>
          </CardHeader>
        </Card>

        <Tabs className={styles.assetTabs} defaultValue="overview">
          <TabsList aria-label="Разделы узла" >
            <TabsTrigger  value="overview">
              Обзор
            </TabsTrigger>
            <TabsTrigger  value="history">
              История
            </TabsTrigger>
            <TabsTrigger  value="documents">
              Документы
            </TabsTrigger>
            <TabsTrigger  value="tasks">
              Задания
            </TabsTrigger>
          </TabsList>

          <TabsContent className={styles.tabPanel} value="overview">
            <div className={styles.layout}>
              <div className={styles.primaryColumn}>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Текущая проблема
                    </CardTitle>
                    <CardDescription>
                      Зафиксировано 8 сентября 2026 г.
                    </CardDescription>
                    <CardAction>
                      <Badge variant="destructive">Требует внимания</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <p className={styles.leadText}>
                      Бойлер включается, но не нагревает воду после длительного
                      простоя. Индикатор питания горит, автомат не выбивает,
                      видимой протечки нет.
                    </p>
                    <div className={styles.notice}>
                      <AlertTriangle />
                      <div>
                        <strong>До осмотра мастером</strong>
                        <span>
                          Не снимать защитную крышку и не менять настройки
                          электрического подключения.
                        </span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button>
                      <Wrench />
                      Открыть задание #4
                    </Button>
                    <Button variant="outline">
                      <MessageSquare />
                      Добавить комментарий
                    </Button>
                  </CardFooter>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      Паспорт узла
                    </CardTitle>
                    <CardDescription>
                      Технические и учётные данные оборудования.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <dl className={styles.detailGrid}>
                      {details.map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      Активное задание
                    </CardTitle>
                    <CardDescription>
                      Мастер получил ссылку и подтвердил визит.
                    </CardDescription>
                    <CardAction>
                      <Badge variant="success">В работе</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <div className={styles.taskHeader}>
                      <span className={styles.avatar}>А</span>
                      <div>
                        <strong>Алексей · задание #4</strong>
                        <span>Диагностика и ремонт бойлера</span>
                      </div>
                    </div>
                    <div className={styles.taskMeta}>
                      <span>
                        <CalendarDays />
                        Четверг, 10 сентября
                      </span>
                      <span>
                        <Clock3 />
                        15:00–17:00
                      </span>
                      <span>
                        <UserRound />1 мастер
                      </span>
                    </div>
                    <p className={styles.bodyText}>
                      Проверить блок управления, питание, ТЭНы и защитные
                      элементы. При необходимости заменить неисправную деталь.
                      После ремонта запустить полный цикл и приложить фотографии
                      результата.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Button>
                      <Link2 />
                      Ссылка мастеру
                    </Button>
                    <Button variant="outline">
                      Перенести визит
                    </Button>
                  </CardFooter>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      Последние события
                    </CardTitle>
                    <CardDescription>
                      Сквозная история состояния, документов и работ.
                    </CardDescription>
                  </CardHeader>
                  <CardContent
                    className={`${styles.timeline}`}
                  >
                    {events.map((event) => {
                      const Icon = event.icon;
                      return (
                        <article
                          className={styles.event}
                          key={`${event.date}-${event.title}`}
                        >
                          <span className={styles.eventIcon}>
                            <Icon />
                          </span>
                          <div className={styles.eventBody}>
                            <time>{event.date}</time>
                            <div className={styles.eventTitle}>
                              <strong>{event.title}</strong>
                              <Badge variant="outline">{event.badge}</Badge>
                            </div>
                            <p>{event.text}</p>
                          </div>
                        </article>
                      );
                    })}
                  </CardContent>
                  <CardFooter>
                    <Button variant="outline">
                      Показать всю историю
                      <ChevronRight />
                    </Button>
                  </CardFooter>
                </Card>
              </div>

              <aside className={styles.sideColumn}>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Состояние
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className={styles.summaryList}>
                      <div>
                        <dt>Статус</dt>
                        <dd>
                          <Badge variant="destructive">Требует внимания</Badge>
                        </dd>
                      </div>
                      <div>
                        <dt>Последняя проверка</dt>
                        <dd>16 августа 2026</dd>
                      </div>
                      <div>
                        <dt>Следующая проверка</dt>
                        <dd>16 февраля 2027</dd>
                      </div>
                      <div>
                        <dt>Ответственный</dt>
                        <dd>Владелец</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      Документы
                    </CardTitle>
                    <CardDescription>
                      Три файла привязаны к узлу.
                    </CardDescription>
                  </CardHeader>
                  <CardContent
                    className={`${styles.fileList}`}
                  >
                    <button type="button">
                      <FileText />
                      <span>
                        <strong>
                          Инструкция_Ariston_ABS_VLS_EVO_INOX_PW_80.pdf
                        </strong>
                        <small>PDF · 4,8 МБ</small>
                      </span>
                      <ChevronRight />
                    </button>
                    <button type="button">
                      <ShieldCheck />
                      <span>
                        <strong>
                          Гарантийный талон и отметка об установке.pdf
                        </strong>
                        <small>PDF · 1,2 МБ</small>
                      </span>
                      <ChevronRight />
                    </button>
                    <button type="button">
                      <ReceiptText />
                      <span>
                        <strong>
                          Чек на покупку оборудования 18.11.2021.jpg
                        </strong>
                        <small>JPG · 860 КБ</small>
                      </span>
                      <ChevronRight />
                    </button>
                  </CardContent>
                  <CardFooter>
                    <Button variant="outline">
                      <Paperclip />
                      Добавить файл
                    </Button>
                  </CardFooter>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Расходы</CardTitle>
                    <CardDescription>
                      По этому узлу за всё время.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className={styles.moneyBlock}>
                      <span>Работы и материалы</span>
                      <strong>18 430,00 ₽</strong>
                    </div>
                    <div className={styles.moneyRows}>
                      <div>
                        <span>2026</span>
                        <strong>4 800,00 ₽</strong>
                      </div>
                      <div>
                        <span>2025</span>
                        <strong>6 250,00 ₽</strong>
                      </div>
                      <div>
                        <span>Ранее</span>
                        <strong>7 380,00 ₽</strong>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      Комментарий
                    </CardTitle>
                    <CardDescription>
                      Запись сразу появится в истории узла.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <label
                      className={styles.commentField}
                      htmlFor="asset-demo-comment"
                    >
                      <span>Новая запись</span>
                      <Input
                        id="asset-demo-comment"
                        placeholder="Например, согласовать стоимость детали"
                      />
                    </label>
                  </CardContent>
                  <CardFooter>
                    <Button>
                      <MessageSquare />
                      Добавить в историю
                    </Button>
                  </CardFooter>
                </Card>

                <Button className={styles.deleteButton} variant="destructive">
                  <Trash2 />
                  Удалить узел
                </Button>
              </aside>
            </div>
          </TabsContent>

          <TabsContent className={styles.tabPanel} value="history">
            <Card>
              <CardHeader>
                <CardTitle>История узла</CardTitle>
                <CardDescription>
                  Отдельное состояние вкладки для проверки навигации.
                </CardDescription>
              </CardHeader>
              <CardContent
                className={`${styles.timeline}`}
              >
                {events.map((event) => (
                  <p className={styles.bodyText} key={event.date}>
                    <strong>{event.date}</strong>
                    <br />
                    {event.text}
                  </p>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent className={styles.tabPanel} value="documents">
            <Card>
              <CardHeader>
                <CardTitle>
                  Документы узла
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={styles.bodyText}>
                  Инструкции, гарантии, чеки и акты собраны здесь. Длинные имена
                  файлов проверяются в правой колонке вкладки «Обзор».
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent className={styles.tabPanel} value="tasks">
            <Card>
              <CardHeader>
                <CardTitle>
                  Задания по узлу
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={styles.bodyText}>
                  Одно задание в работе, два завершены. Все события также
                  остаются в общей истории узла.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </TooltipProvider>
  );
}
