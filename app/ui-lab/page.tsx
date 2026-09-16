"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Check,
  LoaderCircle,
  Plus,
  ReceiptText,
  Save,
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
import styles from "./ui-lab.module.css";

const catalog = [
  { id: "foundations", title: "Основа", component: "Foundations", file: "app/globals.css", selectors: ":root · .dark · --background · --foreground", mobile: "Цвета общие для всех размеров экрана. Тема переключается в шапке." },
  { id: "buttons", title: "Кнопки", component: "Button", file: "components/ui/button.tsx", selectors: "[data-slot=button] · [data-variant] · [data-size]", mobile: "Default: 40 px, текст 13/20. XS, SM и Large показаны отдельно, это не обозначения мобильных размеров." },
  { id: "inputs", title: "Поля ввода", component: "Input", file: "components/ui/input.tsx", selectors: "[data-slot=input] · :disabled · [aria-invalid]", mobile: "Высота 44 px, редактируемый текст 16 px." },
  { id: "selects", title: "Выбор", component: "Select", file: "components/ui/select.tsx", selectors: "[data-slot=select-trigger] · [data-slot=select-item]", mobile: "Поле и пункты списка высотой не менее 44 px." },
  { id: "tabs", title: "Вкладки", component: "Tabs", file: "components/ui/tabs.tsx", selectors: "[data-slot=tabs-list] · [data-slot=tabs-trigger] · [data-state=active]", mobile: "Сегменты 36 px внутри полосы 44 px. Одна строка с горизонтальной прокруткой." },
  { id: "badges", title: "Статусы", component: "Badge", file: "components/ui/badge.tsx", selectors: "[data-slot=badge] · [data-variant]", mobile: "Тот же компонент. Статус не является кнопкой." },
  { id: "cards", title: "Карточки", component: "Card", file: "components/ui/card.tsx", selectors: "[data-slot=card] · [data-slot=card-header] · [data-slot=card-content]", mobile: "Примеры переходят в одну колонку. Высота определяется содержимым." },
];

function Foundations() {
  const tokens = ["background", "foreground", "card", "primary", "primary-foreground", "secondary", "muted", "muted-foreground", "border", "input", "ring", "destructive", "status-success-bg", "status-success-fg", "status-warning-bg", "status-warning-fg"];
  return <div className={styles.foundations}>
    <h3>Цвета</h3>
    <div className={styles.swatchGrid}>{tokens.map(token => <div key={token} className={styles.swatch}><span style={{ background: `var(--${token})` }} /><code>--{token}</code></div>)}</div>
    <h3>Типографика · Geist</h3>
    <div className={styles.typeSamples}>
      {[[22, 28, 500, "Заголовок страницы"], [16, 24, 500, "Заголовок карточки"], [14, 20, 400, "Основной текст"], [12, 16, 400, "Подпись"]].map(([size, line, weight, label]) => <div key={String(label)}><span style={{fontSize: Number(size), lineHeight: `${line}px`, fontWeight: Number(weight)}}>{label}</span><code>{size}/{line} · {weight}</code></div>)}
    </div>
    <h3>Геометрия</h3>
    <div className={styles.row}><code>Контролы: radius 8 px</code><code>Карточки: radius 16 px</code><code>Tabs: radius 10 / 6 px</code></div>
  </div>;
}

function Specimen({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  const entry = catalog.find(item => item.component === title);
  return (
    <section className={styles.specimen}>
      <header className={styles.specimenHeader}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {entry && <a className={styles.sectionLink} href={`#${entry.id}`} aria-label={`Ссылка на раздел ${entry.title}`}>#</a>}
      </header>
      {children}
      {entry && <footer className={styles.componentReference}>
        <div><span>Компонент</span><code>{entry.component}</code></div>
        <div><span>Источник</span><code>{entry.file}</code></div>
        <div><span>Селекторы</span><code>{entry.selectors}</code></div>
        <div><span>Мобильная версия</span><p>{entry.mobile}</p></div>
        <div><span>Примеры витрины</span><code>app/ui-lab/ui-lab.module.css</code></div>
      </footer>}
    </section>
  );
}

function DemoLabel({ children }: { children: React.ReactNode }) {
  return <span className={styles.demoLabel}>{children}</span>;
}

export default function UiLabPage() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("foundations");
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const threshold = window.matchMedia("(max-width: 760px)").matches ? 140 : 40;
        const reached = catalog.filter(({id}) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= threshold);
        setActive(reached.at(-1)?.id ?? "foundations");
      });
    };
    update();
    window.addEventListener("scroll", update, {passive: true});
    window.addEventListener("resize", update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  const results = catalog.filter(item => `${item.title} ${item.component} ${item.file}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <TooltipProvider>
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.headerCopy}>
            <Badge variant="secondary">Библиотека приложения</Badge>
            <h1>Компоненты FixPlan</h1>
            <p>Библиотека интерфейса · Geist · shadcn/Radix</p>
          </div>
          <div className={styles.headerActions}>
            <ThemeToggle />
            <Button asChild variant="secondary">
              <Link href="/ui-lab/ios">iOS Concept <ArrowRight /></Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/ui-lab/asset">
                Тестовый узел
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">
                <ArrowLeft />В FixPlan
              </Link>
            </Button>
          </div>
        </header>

        <div className={styles.catalogLayout}>
        <aside className={styles.catalogAside}>
          <Input aria-label="Найти компонент" placeholder="Найти компонент…" value={query} onChange={event => setQuery(event.target.value)} />
          <nav aria-label="Разделы каталога" className={styles.anchorNav}>
            {results.map(item => <a key={item.id} href={`#${item.id}`} aria-current={active === item.id ? "location" : undefined} onClick={() => setActive(item.id)}><span>{item.title}</span><small>{item.component}</small></a>)}
          </nav>
          {!results.length && <p className={styles.emptySearch}>Раздел не найден</p>}
        </aside>
        <div className={styles.content}>
          <div id="foundations"><Specimen title="Foundations" description="Цвета, типографика и геометрия текущей веб-библиотеки."><Foundations /></Specimen></div>
          <div id="buttons">
            <Specimen
              description="Четыре размера, основные варианты, состояния и расположение иконок."
              title="Button"
            >
              <div className={styles.demoGroup}>
                <DemoLabel>Размеры</DemoLabel>
                <div className={styles.row}>
                  <Button size="xs">
                    Extra Small · 32
                  </Button>
                  <Button size="sm">
                    Small · 36
                  </Button>
                  <Button>
                    Default · 36
                  </Button>
                  <Button size="lg">
                    Large · 48
                  </Button>
                </div>
              </div>

              <div className={styles.demoGroup}>
                <DemoLabel>Варианты</DemoLabel>
                <div className={styles.row}>
                  <Button>
                    Основная
                  </Button>
                  <Button

                    variant="secondary"
                  >
                    Вторичная
                  </Button>
                  <Button

                    variant="outline"
                  >
                    Контурная
                  </Button>
                  <Button  variant="ghost">
                    Прозрачная
                  </Button>
                  <Button

                    variant="destructive"
                  >
                    Удалить
                  </Button>
                  <Button
                    variant="success"
                  >
                    Готово
                  </Button>
                  <Button
                    variant="warning"
                  >
                    Требует внимания
                  </Button>
                </div>
              </div>

              <div className={styles.demoGroup}>
                <DemoLabel>Состояния</DemoLabel>
                <div className={styles.stateGrid}>
                  <div>
                    <Button>
                      Default
                    </Button>
                    <small>Default</small>
                  </div>
                  <div>
                    <Button
                      className={styles.forcedHover}
                    >
                      Hover
                    </Button>
                    <small>Hover</small>
                  </div>
                  <div>
                    <Button
                      className={styles.forcedFocus}
                    >
                      Focus
                    </Button>
                    <small>Focus</small>
                  </div>
                  <div>
                    <Button  disabled>
                      Disabled
                    </Button>
                    <small>Disabled</small>
                  </div>
                  <div>
                    <Button  disabled>
                      <LoaderCircle className={styles.spinner} />
                      Загрузка
                    </Button>
                    <small>Loading</small>
                  </div>
                </div>
              </div>

              <div className={styles.demoGroup}>
                <DemoLabel>Иконки</DemoLabel>
                <div className={styles.row}>
                  <Button>
                    <Plus />
                    Добавить
                  </Button>
                  <Button>
                    Продолжить
                    <ArrowRight />
                  </Button>
                  <Button
                    aria-label="Сохранить"
                    size="icon"
                  >
                    <Save />
                  </Button>
                </div>
              </div>

              <div className={styles.baseline}>
                <DemoLabel>Общий компонент · default 36</DemoLabel>
                <div className={styles.row}>
                  <Button>Основная</Button>
                  <Button variant="secondary">Вторичная</Button>
                  <Button variant="outline">Контурная</Button>
                  <Button variant="destructive">Удалить</Button>
                </div>
              </div>
            </Specimen>
          </div>

          <div id="inputs">
            <Specimen
              description="Общие поля приложения: заполненное, фокус, ошибка, отключено и только чтение."
              title="Input"
            >
              <div className={styles.fieldGrid}>
                <label className={styles.field} htmlFor="lab-input-default">
                  <span>Default</span>
                  <Input

                    id="lab-input-default"
                    placeholder="Название узла"
                  />
                </label>
                <label className={styles.field} htmlFor="lab-input-filled">
                  <span>Filled</span>
                  <Input

                    defaultValue="Бойлер"
                    id="lab-input-filled"
                  />
                </label>
                <label className={styles.field} htmlFor="lab-input-focus">
                  <span>Focus</span>
                  <Input
                    className={styles.forcedInputFocus}
                    defaultValue="Шпалерная, 34Б"
                    id="lab-input-focus"
                  />
                </label>
                <label className={styles.field} htmlFor="lab-input-error">
                  <span>Error</span>
                  <Input
                    aria-describedby="lab-input-error-message"
                    aria-invalid="true"

                    defaultValue="Неверное значение"
                    id="lab-input-error"
                  />
                  <small
                    className={styles.errorText}
                    id="lab-input-error-message"
                  >
                    Проверьте значение
                  </small>
                </label>
                <label className={styles.field} htmlFor="lab-input-disabled">
                  <span>Disabled</span>
                  <Input

                    disabled
                    defaultValue="Недоступно"
                    id="lab-input-disabled"
                  />
                </label>
                <label className={styles.field} htmlFor="lab-input-large">
                  <span>Read only</span>
                  <Input
                    readOnly defaultValue="Только чтение"
                    id="lab-input-large"

                  />
                </label>
              </div>
              <div className={styles.baseline}>
                <DemoLabel>Общий компонент · 36</DemoLabel>
                <Input
                  className={styles.baselineControl}
                  placeholder="Название узла"
                />
              </div>
            </Specimen>
          </div>

          <div id="selects">
            <Specimen
              description="Trigger 36 px, меню Radix, заполненное и недоступное состояния."
              title="Select"
            >
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <label htmlFor="lab-select-default">Default</label>
                  <Select>
                    <SelectTrigger

                      id="lab-select-default"
                    >
                      <SelectValue placeholder="Выберите статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem

                        value="ok"
                      >
                        Исправно
                      </SelectItem>
                      <SelectItem

                        value="attention"
                      >
                        Требует внимания
                      </SelectItem>
                      <SelectItem

                        value="work"
                      >
                        В работе
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="lab-select-filled">Filled</label>
                  <Select defaultValue="attention">
                    <SelectTrigger

                      id="lab-select-filled"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem

                        value="ok"
                      >
                        Исправно
                      </SelectItem>
                      <SelectItem

                        value="attention"
                      >
                        Требует внимания
                      </SelectItem>
                      <SelectItem

                        value="work"
                      >
                        В работе
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="lab-select-disabled">Disabled</label>
                  <Select disabled defaultValue="ok">
                    <SelectTrigger

                      id="lab-select-disabled"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem

                        value="ok"
                      >
                        Исправно
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className={styles.baseline}>
                <DemoLabel>Общий компонент · 36</DemoLabel>
                <Select defaultValue="ok">
                  <SelectTrigger className={styles.baselineControl}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ok">Исправно</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Specimen>
          </div>

          <div id="tabs">
            <Specimen
              description="Контейнер 40 px, trigger 32 px, основной и линейный варианты."
              title="Tabs"
            >
              <div className={styles.tabExamples}>
                <Tabs defaultValue="overview">
                  <TabsList >
                    <TabsTrigger

                      value="overview"
                    >
                      Обзор
                    </TabsTrigger>
                    <TabsTrigger

                      value="history"
                    >
                      История
                    </TabsTrigger>
                    <TabsTrigger

                      value="documents"
                    >
                      Документы
                    </TabsTrigger>
                    <TabsTrigger

                      disabled
                      value="access"
                    >
                      Доступ
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent className={styles.tabContent} value="overview">
                    Текущее состояние выбранного узла.
                  </TabsContent>
                  <TabsContent className={styles.tabContent} value="history">
                    События и изменения по датам.
                  </TabsContent>
                  <TabsContent className={styles.tabContent} value="documents">
                    Связанные файлы и квитанции.
                  </TabsContent>
                </Tabs>
                <Tabs defaultValue="active">
                  <TabsList className={styles.lineTabs} variant="line">
                    <TabsTrigger value="active">Активные</TabsTrigger>
                    <TabsTrigger value="completed">Завершённые</TabsTrigger>
                  </TabsList>
                  <TabsContent className={styles.tabContent} value="active">
                    Два задания в работе.
                  </TabsContent>
                  <TabsContent className={styles.tabContent} value="completed">
                    Три задания завершены.
                  </TabsContent>
                </Tabs>
              </div>
              <div className={styles.baseline}>
                <DemoLabel>Общий компонент · list 40</DemoLabel>
                <Tabs defaultValue="one">
                  <TabsList>
                    <TabsTrigger value="one">Обзор</TabsTrigger>
                    <TabsTrigger value="two">История</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </Specimen>
          </div>

          <div id="badges">
            <Specimen
              description="Высота 28 px, подписи и цвета из общего компонента Badge."
              title="Badge"
            >
              <div className={styles.row}>
                <Badge>Основной</Badge>
                <Badge  variant="secondary">
                  Вторичный
                </Badge>
                <Badge  variant="outline">
                  Контурный
                </Badge>
                <Badge
                  variant="success"
                >
                  <Check />
                  Исправно
                </Badge>
                <Badge
                  variant="warning"
                >
                  В работе
                </Badge>
                <Badge  variant="destructive">
                  Требует внимания
                </Badge>
              </div>
              <div className={styles.baseline}>
                <DemoLabel>Общий компонент · 28</DemoLabel>
                <div className={styles.row}>
                  <Badge>Основной</Badge>
                  <Badge variant="secondary">Вторичный</Badge>
                  <Badge variant="destructive">Ошибка</Badge>
                </div>
              </div>
            </Specimen>
          </div>

          <div id="cards">
            <Specimen
              description="Рабочие карточки из дашборда, коммуналки и раздела заданий."
              title="Card"
            >
              <div className={styles.cardGrid}>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Требует решения
                    </CardTitle>
                    <CardDescription>
                      Одно действие ждёт владельца.
                    </CardDescription>
                    <CardAction>
                      <Badge variant="destructive">Важно</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <button className={styles.decisionRow} type="button">
                      <span className={styles.cardIcon}>
                        <AlertTriangle />
                      </span>
                      <span>
                        <strong>Бойлер не работает</strong>
                        <small>Нужно назначить мастера</small>
                      </span>
                      <ArrowRight />
                    </button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      Коммуналка · Август 2026
                    </CardTitle>
                    <CardDescription>
                      Две квитанции включены в счёт.
                    </CardDescription>
                    <CardAction>
                      <Badge variant="warning">
                        Счёт выставлен
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent
                    className={` ${styles.utilityContent}`}
                  >
                    <div>
                      <span>ЖКХ</span>
                      <strong>7 616,24 ₽</strong>
                    </div>
                    <div>
                      <span>Электроэнергия</span>
                      <strong>1 203,00 ₽</strong>
                    </div>
                    <div className={styles.totalRow}>
                      <span>Осталось получить</span>
                      <strong>8 819,24 ₽</strong>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button

                      variant="outline"
                    >
                      <ReceiptText />
                      Квитанции
                    </Button>
                    <Button>
                      <Check />
                      Оплата получена
                    </Button>
                  </CardFooter>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      Задание #4 · Алексей
                    </CardTitle>
                    <CardDescription>
                      Ремонт бойлера · четверг, 15:00
                    </CardDescription>
                    <CardAction>
                      <Badge variant="success">В работе</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <div className={styles.taskSummary}>
                      <span className={styles.cardIcon}>
                        <Wrench />
                      </span>
                      <p>Диагностика, ремонт и итоговая проверка работы.</p>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button>
                      Открыть задание
                    </Button>
                    <Button

                      variant="outline"
                    >
                      Редактировать
                    </Button>
                  </CardFooter>
                </Card>

                <Card
                  className={` ${styles.metricCard}`}
                >
                  <CardContent className={styles.metricContent}>
                    <span>Осталось получить</span>
                    <strong>20 658,77 ₽</strong>
                    <small>По трём выставленным счетам</small>
                  </CardContent>
                </Card>
              </div>
              <div className={styles.baseline}>
                <DemoLabel>Общий компонент</DemoLabel>
                <Card className={styles.baselineCard}>
                  <CardHeader>
                    <CardTitle>Карточка текущей базы</CardTitle>
                    <CardDescription>
                      Для прямого сравнения плотности.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>Содержимое карточки FixPlan.</CardContent>
                </Card>
              </div>
            </Specimen>
          </div>
        </div>
        </div>
      </main>
    </TooltipProvider>
  );
}
