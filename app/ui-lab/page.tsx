"use client";

import Link from "next/link";
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

function Specimen({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className={styles.specimen}>
      <header className={styles.specimenHeader}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Badge variant="outline">Кандидат</Badge>
      </header>
      {children}
    </section>
  );
}

function DemoLabel({ children }: { children: React.ReactNode }) {
  return <span className={styles.demoLabel}>{children}</span>;
}

function CandidateButton({
  className = "",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button className={`${styles.candidateButton} ${className}`} {...props} />
  );
}

export default function UiLabPage() {
  return (
    <TooltipProvider>
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.headerCopy}>
            <Badge variant="secondary">Черновик на согласование</Badge>
            <h1>Компоненты FixPlan</h1>
            <p>Geist, shadcn/Radix и проверяемая геометрия Quadratic UI.</p>
          </div>
          <div className={styles.headerActions}>
            <ThemeToggle />
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

        <nav aria-label="Компоненты" className={styles.anchorNav}>
          <a href="#buttons">Button</a>
          <a href="#inputs">Input</a>
          <a href="#selects">Select</a>
          <a href="#tabs">Tabs</a>
          <a href="#badges">Badge</a>
          <a href="#cards">Card</a>
        </nav>

        <div className={styles.content}>
          <div id="buttons">
            <Specimen
              description="Четыре размера, основные варианты, состояния и расположение иконок."
              title="Button"
            >
              <div className={styles.demoGroup}>
                <DemoLabel>Размеры</DemoLabel>
                <div className={styles.row}>
                  <CandidateButton className={styles.buttonXs}>
                    Extra Small · 32
                  </CandidateButton>
                  <CandidateButton className={styles.buttonSm}>
                    Small · 36
                  </CandidateButton>
                  <CandidateButton className={styles.buttonMd}>
                    Default · 36
                  </CandidateButton>
                  <CandidateButton className={styles.buttonLg}>
                    Large · 48
                  </CandidateButton>
                </div>
              </div>

              <div className={styles.demoGroup}>
                <DemoLabel>Варианты</DemoLabel>
                <div className={styles.row}>
                  <CandidateButton className={styles.buttonMd}>
                    Основная
                  </CandidateButton>
                  <CandidateButton
                    className={styles.buttonMd}
                    variant="secondary"
                  >
                    Вторичная
                  </CandidateButton>
                  <CandidateButton
                    className={styles.buttonMd}
                    variant="outline"
                  >
                    Контурная
                  </CandidateButton>
                  <CandidateButton className={styles.buttonMd} variant="ghost">
                    Прозрачная
                  </CandidateButton>
                  <CandidateButton
                    className={styles.buttonMd}
                    variant="destructive"
                  >
                    Удалить
                  </CandidateButton>
                  <CandidateButton
                    className={`${styles.buttonMd} ${styles.successButton}`}
                  >
                    Готово
                  </CandidateButton>
                  <CandidateButton
                    className={`${styles.buttonMd} ${styles.warningButton}`}
                  >
                    Требует внимания
                  </CandidateButton>
                </div>
              </div>

              <div className={styles.demoGroup}>
                <DemoLabel>Состояния</DemoLabel>
                <div className={styles.stateGrid}>
                  <div>
                    <CandidateButton className={styles.buttonMd}>
                      Default
                    </CandidateButton>
                    <small>Default</small>
                  </div>
                  <div>
                    <CandidateButton
                      className={`${styles.buttonMd} ${styles.forcedHover}`}
                    >
                      Hover
                    </CandidateButton>
                    <small>Hover</small>
                  </div>
                  <div>
                    <CandidateButton
                      className={`${styles.buttonMd} ${styles.forcedFocus}`}
                    >
                      Focus
                    </CandidateButton>
                    <small>Focus</small>
                  </div>
                  <div>
                    <CandidateButton className={styles.buttonMd} disabled>
                      Disabled
                    </CandidateButton>
                    <small>Disabled</small>
                  </div>
                  <div>
                    <CandidateButton className={styles.buttonMd} disabled>
                      <LoaderCircle className={styles.spinner} />
                      Загрузка
                    </CandidateButton>
                    <small>Loading</small>
                  </div>
                </div>
              </div>

              <div className={styles.demoGroup}>
                <DemoLabel>Иконки</DemoLabel>
                <div className={styles.row}>
                  <CandidateButton className={styles.buttonMd}>
                    <Plus />
                    Добавить
                  </CandidateButton>
                  <CandidateButton className={styles.buttonMd}>
                    Продолжить
                    <ArrowRight />
                  </CandidateButton>
                  <CandidateButton
                    aria-label="Сохранить"
                    className={`${styles.buttonMd} ${styles.iconButton}`}
                  >
                    <Save />
                  </CandidateButton>
                </div>
              </div>

              <div className={styles.baseline}>
                <DemoLabel>Текущая база · default 36</DemoLabel>
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
              description="Основная форма 36 px, крупная 48 px и все рабочие состояния."
              title="Input"
            >
              <div className={styles.fieldGrid}>
                <label className={styles.field} htmlFor="lab-input-default">
                  <span>Default</span>
                  <Input
                    className={styles.candidateInput}
                    id="lab-input-default"
                    placeholder="Название узла"
                  />
                </label>
                <label className={styles.field} htmlFor="lab-input-filled">
                  <span>Filled</span>
                  <Input
                    className={styles.candidateInput}
                    defaultValue="Бойлер"
                    id="lab-input-filled"
                  />
                </label>
                <label className={styles.field} htmlFor="lab-input-focus">
                  <span>Focus</span>
                  <Input
                    className={`${styles.candidateInput} ${styles.forcedInputFocus}`}
                    defaultValue="Шпалерная, 34Б"
                    id="lab-input-focus"
                  />
                </label>
                <label className={styles.field} htmlFor="lab-input-error">
                  <span>Error</span>
                  <Input
                    aria-describedby="lab-input-error-message"
                    aria-invalid="true"
                    className={styles.candidateInput}
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
                    className={styles.candidateInput}
                    disabled
                    defaultValue="Недоступно"
                    id="lab-input-disabled"
                  />
                </label>
                <label className={styles.field} htmlFor="lab-input-large">
                  <span>Large · 48</span>
                  <Input
                    className={`${styles.candidateInput} ${styles.inputLarge}`}
                    id="lab-input-large"
                    placeholder="Крупное поле"
                  />
                </label>
              </div>
              <div className={styles.baseline}>
                <DemoLabel>Текущая база · 36</DemoLabel>
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
                      className={styles.candidateSelect}
                      id="lab-select-default"
                    >
                      <SelectValue placeholder="Выберите статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        className={styles.candidateSelectItem}
                        value="ok"
                      >
                        Исправно
                      </SelectItem>
                      <SelectItem
                        className={styles.candidateSelectItem}
                        value="attention"
                      >
                        Требует внимания
                      </SelectItem>
                      <SelectItem
                        className={styles.candidateSelectItem}
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
                      className={styles.candidateSelect}
                      id="lab-select-filled"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        className={styles.candidateSelectItem}
                        value="ok"
                      >
                        Исправно
                      </SelectItem>
                      <SelectItem
                        className={styles.candidateSelectItem}
                        value="attention"
                      >
                        Требует внимания
                      </SelectItem>
                      <SelectItem
                        className={styles.candidateSelectItem}
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
                      className={styles.candidateSelect}
                      id="lab-select-disabled"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        className={styles.candidateSelectItem}
                        value="ok"
                      >
                        Исправно
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className={styles.baseline}>
                <DemoLabel>Текущая база · 36</DemoLabel>
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
                  <TabsList className={styles.candidateTabsList}>
                    <TabsTrigger
                      className={styles.candidateTab}
                      value="overview"
                    >
                      Обзор
                    </TabsTrigger>
                    <TabsTrigger
                      className={styles.candidateTab}
                      value="history"
                    >
                      История
                    </TabsTrigger>
                    <TabsTrigger
                      className={styles.candidateTab}
                      value="documents"
                    >
                      Документы
                    </TabsTrigger>
                    <TabsTrigger
                      className={styles.candidateTab}
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
                <DemoLabel>Текущая база · list 40</DemoLabel>
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
              description="Высота 28 px, текст 14/20 и семантические цветовые роли."
              title="Badge"
            >
              <div className={styles.row}>
                <Badge className={styles.candidateBadge}>Основной</Badge>
                <Badge className={styles.candidateBadge} variant="secondary">
                  Вторичный
                </Badge>
                <Badge className={styles.candidateBadge} variant="outline">
                  Контурный
                </Badge>
                <Badge
                  className={`${styles.candidateBadge} ${styles.successBadge}`}
                >
                  <Check />
                  Исправно
                </Badge>
                <Badge
                  className={`${styles.candidateBadge} ${styles.warningBadge}`}
                >
                  В работе
                </Badge>
                <Badge className={styles.candidateBadge} variant="destructive">
                  Требует внимания
                </Badge>
              </div>
              <div className={styles.baseline}>
                <DemoLabel>Текущая база · 20</DemoLabel>
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
                <Card className={styles.candidateCard}>
                  <CardHeader className={styles.candidateCardHeader}>
                    <CardTitle className={styles.candidateCardTitle}>
                      Требует решения
                    </CardTitle>
                    <CardDescription>
                      Одно действие ждёт владельца.
                    </CardDescription>
                    <CardAction>
                      <Badge variant="destructive">Важно</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className={styles.candidateCardContent}>
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

                <Card className={styles.candidateCard}>
                  <CardHeader className={styles.candidateCardHeader}>
                    <CardTitle className={styles.candidateCardTitle}>
                      Коммуналка · Август 2026
                    </CardTitle>
                    <CardDescription>
                      Две квитанции включены в счёт.
                    </CardDescription>
                    <CardAction>
                      <Badge className={styles.warningBadge}>
                        Счёт выставлен
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent
                    className={`${styles.candidateCardContent} ${styles.utilityContent}`}
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
                  <CardFooter className={styles.candidateCardFooter}>
                    <CandidateButton
                      className={styles.buttonMd}
                      variant="outline"
                    >
                      <ReceiptText />
                      Квитанции
                    </CandidateButton>
                    <CandidateButton className={styles.buttonMd}>
                      <Check />
                      Оплата получена
                    </CandidateButton>
                  </CardFooter>
                </Card>

                <Card className={styles.candidateCard}>
                  <CardHeader className={styles.candidateCardHeader}>
                    <CardTitle className={styles.candidateCardTitle}>
                      Задание #4 · Алексей
                    </CardTitle>
                    <CardDescription>
                      Ремонт бойлера · четверг, 15:00
                    </CardDescription>
                    <CardAction>
                      <Badge className={styles.successBadge}>В работе</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className={styles.candidateCardContent}>
                    <div className={styles.taskSummary}>
                      <span className={styles.cardIcon}>
                        <Wrench />
                      </span>
                      <p>Диагностика, ремонт и итоговая проверка работы.</p>
                    </div>
                  </CardContent>
                  <CardFooter className={styles.candidateCardFooter}>
                    <CandidateButton className={styles.buttonMd}>
                      Открыть задание
                    </CandidateButton>
                    <CandidateButton
                      className={styles.buttonMd}
                      variant="outline"
                    >
                      Редактировать
                    </CandidateButton>
                  </CardFooter>
                </Card>

                <Card
                  className={`${styles.candidateCard} ${styles.metricCard}`}
                >
                  <CardContent className={styles.metricContent}>
                    <span>Осталось получить</span>
                    <strong>20 658,77 ₽</strong>
                    <small>По трём выставленным счетам</small>
                  </CardContent>
                </Card>
              </div>
              <div className={styles.baseline}>
                <DemoLabel>Текущая база</DemoLabel>
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
      </main>
    </TooltipProvider>
  );
}
