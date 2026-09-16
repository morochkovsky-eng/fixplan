# FixPlan Web: перенос библиотеки в Figma

Дата: 2026-09-10. Статус: **В работе, не финальная приёмка**.

[Файл Figma](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/) · [Веб-каталог](https://fixplan-ui-lab-public-20260909.vercel.app/ui-lab)

## Что создано

В 14 разделах Figma сейчас 60 наборов вариантов и 318 компонентных узлов, включая варианты и иконки. Это технический счётчик, а не число самостоятельных элементов продукта.

Основы: 3 коллекции, 188 переменных (81 примитив, 79 семантических цветов, 28 геометрических значений), Light/Dark, 15 текстовых стилей. Цвета, текст и вложенные компоненты связаны. Геометрия воспроизводит текущий веб-код, локальные исключения указаны в описаниях компонентов. Размеры демонстрационных контейнеров не являются новым стандартом.

Есть кнопки, поля, селекты, табы, бейджи, карточки и заменяемые слоты, навигация, мобильная шапка, сайдбар, диалоги, меню, строки узлов и событий, вложения и панель ассистента.

## Проверено в этом продолжении

- Исправлено переполнение селекта ApartmentSwitcher в Sidebar/Narrow: селект занимает остаток ширины, кнопка сохраняет размер. Проверен скриншот 248 px.
- Фон активных TabsTrigger связан с существующим tabs-active-surface для Light/Dark.
- Созданы контрольные экземпляры карточки коммуналки и мобильных табов: [Light](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=43-1308), [Dark](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=43-1350). Оба скриншота просмотрены.
- Проверены все 14 страниц на текст без стиля, SOLID-заливки/обводки без переменной и оставленные placeholders. В мастер-компонентах таких проблем не обнаружено. Проверка не доказывает полную визуальную идентичность, доступность или корректность всех состояний.
- Семь несвязанных цветов найдены внутри отдельного экземпляра Card 4:646 в рамке 4:645. Эти изменения не принадлежат текущему переносу и сохранены.

## Изменения, которые нельзя перезаписывать автоматически

- Общий стиль FixPlan/Label/Default сейчас 12/20 Medium; исходный экспорт был 14/20 Medium. Пользователю задан вопрос, является ли 12 px новым утверждённым стандартом. До ответа не менять стиль и не переносить его в веб.
- primary содержит прямое цветовое значение вместо alias. Возможная внешняя правка; сохранить до уточнения.
- Отдельный экземпляр Card 4:646 имеет локальные overrides. Не считать их автоматически изменением мастера.
- В рабочем дереве есть изменения продукта, сделанные вне этого экспорта. Они не изменялись и не откатывались.

## Осталось до завершения

1. Сверить hover/focus и полупрозрачные цвета кнопок в обеих темах с реальным CSS; проверить Badge/StatusBadge, границу активного таба, Tooltip arrow и футеры/кнопки закрытия диалогов.
2. Проверить локальные исключения StatCard, EventTask, ThemeToggle/Clock3, адаптивную ширину PromptInput и состояния панели ассистента.
3. Дополнить покрытие реальными таблицами узлов, строками счетов и месяцами, счетчиками, рабочими карточками ремонта/уборки/обхода, документами, галереей и прикладными формами. Существующие демонстрационные ProductCard не заменяют все эти сущности.
4. Добавить недостающие мобильные и ошибочные/пустые/загрузочные состояния. Нативный checkbox зависит от браузера: не выдавать условный рисунок за единый стандарт.
5. Проверить семантические aliases и точность code syntax производных цветов. Отсутствие пустого code syntax не означает правильность каждого выражения.
6. Выполнить финальную визуальную проверку каждого раздела и согласовать результат. Только затем сохранять эталоны регрессии и публиковать библиотеку при необходимости.

## Работа с правками в Figma

1. Редактировать мастер-компонент или общий стиль/переменную, если изменение должно быть общим. Правка отдельного instance остаётся локальной.
2. Передать ссылку на изменённый компонент и подтвердить объём переноса в веб.
3. Сопоставить изменение с кодом, локальными исключениями и текущими несохранёнными правками. Figma не подменяет продуктовую спецификацию.
4. Изменить базовый компонент/токен в коде, проверить зависимые страницы desktop/mobile и показать до/после.
5. После приёмки обновить карту и эталоны.

**Автоматической двусторонней синхронизации нет.** JSON ниже является картой соответствий и состоянием переноса, а не опубликованным Code Connect. Наличие компонентов в файле не означает публикацию team library.

## Карта разделов и компонентов

Полные ID, свойства и описания с источниками находятся в [FIGMA_UI_KIT_STATE_2026-09-10.json](./FIGMA_UI_KIT_STATE_2026-09-10.json).

### 00 · Start

[Открыть раздел](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=7-2)

### 01 · Foundations

[Открыть раздел](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=7-3)

### 02 · Icons

- [Plus](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-5).
- [X](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-10).
- [Check](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-15).
- [ChevronDown](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-19).
- [ChevronUp](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-23).
- [ChevronRight](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-27).
- [ArrowLeft](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-31).
- [ArrowRight](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-36).
- [ArrowUp](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-41).
- [Search](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-46).
- [Pencil](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-51).
- [Trash2](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-56).
- [Save](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-64).
- [LoaderCircle](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-70).
- [AlertTriangle](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-74).
- [ReceiptText](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-80).
- [Wrench](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-87).
- [Bot](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-91).
- [Mic](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-100).
- [Paperclip](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-106).
- [FileText](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-110).
- [Image](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-118).
- [Upload](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-124).
- [Clock](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-130).
- [Moon](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-135).
- [Sun](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-139).
- [Monitor](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-151).
- [PanelLeftClose](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-157).
- [PanelLeftOpen](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-163).
- [LayoutDashboard](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-169).
- [Map](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-176).
- [List](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-182).
- [History](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-191).
- [Settings](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-197).
- [User](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-202).
- [Droplets](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-207).
- [Zap](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-212).
- [Gauge](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-216).
- [Ellipsis](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-221).
- [Download](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-227).
- [Copy](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-233).
- [ExternalLink](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-238).
- [Circle](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-244).
- [Calendar](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-248).
- [ClipboardCheck](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=10-255).
- [CornerDownLeft](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=22-2).
- [Square](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=22-6).
- [Clock3](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=22-9).
- [BrandMark](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=31-2).
- [BrandSymbol](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=41-2).

### 03 · Buttons

- [Button/default](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=11-34): 5 вариантов.
- [Button/secondary](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=11-64): 5 вариантов.
- [Button/outline](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=11-94): 5 вариантов.
- [Button/ghost](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=11-124): 5 вариантов.
- [Button/destructive](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=11-154): 5 вариантов.
- [Button/destructive-outline](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=11-184): 5 вариантов.
- [Button/success](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=11-214): 5 вариантов.
- [Button/success-outline](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=11-244): 5 вариантов.
- [Button/warning](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=11-274): 5 вариантов.
- [Button/warning-outline](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=11-304): 5 вариантов.
- [Button/link](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=11-334): 5 вариантов.
- [Button/Size](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=14-34): 5 вариантов.
- [IconButton](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=14-60): 5 вариантов.
- [Lab/Button](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=14-65): 2 вариантов.
- [ButtonGroup](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=37-74): 2 вариантов.

### 04 · Fields

- [Input](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=15-25): 10 вариантов.
- [Textarea](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=15-49): 10 вариантов.
- [Select](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=15-103): 10 вариантов.
- [InputGroup](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=15-167): 10 вариантов.

### 05 · Selection

- [SelectItem](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=15-182): 4 вариантов.
- [SelectContent](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=15-196): 1 вариантов.
- [Badge](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=16-29): 8 вариантов.
- [StatusBadge](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=16-41): 4 вариантов.
- [StatusSelect](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=38-61): 8 вариантов.

### 06 · Tabs

- [TabsTrigger](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=17-116): 6 вариантов.
- [Tabs](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=17-148): 4 вариантов.

### 07 · Cards

- [Card](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=17-181): 2 вариантов.
- [StatCard](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=17-194): 3 вариантов.
- [CardContent / Slot](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=27-6).
- [CardFooter / Slot](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=27-8).
- [ProductCardContent](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=28-451): 6 вариантов.
- [ProductCardFooter](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=28-527): 4 вариантов.

### 08 · Navigation

- [NavItem](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=19-195): 6 вариантов.
- [DashboardClock](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=19-211): 2 вариантов.
- [ThemeToggle](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=19-237): 3 вариантов.
- [Navigation](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=34-980): 3 вариантов.
- [MobileHeader](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=34-1014): 2 вариантов.
- [ApartmentSwitcher](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=40-271): 6 вариантов.
- [Sidebar](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=42-512): 3 вариантов.

### 09 · Overlays

- [MenuItem](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=17-211): 5 вариантов.
- [DropdownMenu](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=17-225): 1 вариантов.
- [Dialog](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=18-65): 2 вариантов.
- [AlertDialog](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=18-106): 2 вариантов.
- [HoverCard](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=19-157): 1 вариантов.
- [Command](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=30-713): 4 вариантов.
- [Tooltip](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=33-405): 4 вариантов.

### 10 · Data

- [TaskItemFile](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=20-47): 1 вариантов.
- [Task](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=21-27): 2 вариантов.
- [AssetRow](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=29-659): 8 вариантов.
- [EventTask](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=29-712): 4 вариантов.

### 11 · Assistant

- [Message](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=23-25): 4 вариантов.
- [PromptInput](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=24-338): 10 вариантов.
- [AttachmentRemove](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=33-177): 3 вариантов.
- [Attachment](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=33-345): 12 вариантов.
- [AssistantPanel](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=35-1047): 3 вариантов.

### 12 · Feedback

- [Separator](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=21-215): 2 вариантов.
- [Spinner](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=21-223): 1 вариантов.
- [ScrollArea](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=30-731): 1 вариантов.

### 13 · Product blocks

- [DecisionRow](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=25-33): 2 вариантов.
- [UtilityContent](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=25-57): 2 вариантов.
- [TaskSummary](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=25-75): 2 вариантов.
- [ProductCard](https://www.figma.com/design/fSlKjQJ1qHZmA6CWrq9ZyT/?node-id=28-757): 6 вариантов.


