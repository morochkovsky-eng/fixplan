# FixPlan Design Review — 2026-09-09

**Статус:** Выполнено; визуальный baseline ожидает приёмки
**Изменения интерфейса:** базовая дизайн-система и основные продуктовые экраны мигрированы
**Среда:** локальная web-сборка FixPlan с безопасными тестовыми данными; проверка исходного кода и Playwright screenshots.

## 1. Методика и покрытие

Проверены viewport widths `1440`, `1280`, `390`, `360 CSS px`. Desktop height — `900 px`, mobile — `844 px`. Для каждого размера открыты:

- `/dashboard`
- `/plan`
- `/assets`
- `/tasks?tab=master-work`
- `/documents`
- `/utilities`
- `/log`
- `/settings`

Также проверены состояния:

- раскрытое меню «Создать»;
- Select и Tabs в доступных экранах;
- Dialog «Новый объект» desktop/mobile;
- карточки, таблица узлов и длинные списки;
- collapsed и expanded assistant на mobile;
- история чата и composer desktop/mobile;
- светлая тема. Тёмная тема проверялась по реализации токенов, но не прошла полный screenshot-pass каждого экрана.

Никакие производственные данные для ревью не изменялись.

## 2. Контрольные измерения

| Область                      |     1440 |     1280 |                    390 |                    360 |
| ---------------------------- | -------: | -------: | ---------------------: | ---------------------: |
| Left sidebar                 | `280 px` | `248 px` |          mobile header |          mobile header |
| Assistant                    | `380 px` | `340 px` |      `390 px` expanded |      `360 px` expanded |
| Main column                  | `780 px` | `692 px` |               `390 px` |               `360 px` |
| Workspace horizontal padding |  `32 px` |  `20 px` |                `12 px` |                `12 px` |
| Workspace top padding        |  `24 px` |  `24 px` |   `12 px` after header |   `12 px` after header |
| Page H1                      |  `28/36` |  `28/36` |                `24/32` |                `24/32` |
| Base desktop button/input    |  `40 px` |  `40 px` | `44 px` touch override | `44 px` touch override |
| Card radius                  |  `16 px` |  `16 px` |                `16 px` |                `16 px` |
| Collapsed mobile assistant   |        — |        — |                `52 px` |                `52 px` |

Положительные результаты: заголовки имеют одинаковую стартовую координату внутри workspace; горизонтального document overflow на проверенных маршрутах нет; mobile tap targets базовых контролов увеличены до `44x44`; Dialog помещается в `360 px`; текущие три task tabs не переполняются на `360 px`.

## 3. Замечания

### DR-01. Не согласован базовый визуальный стандарт

1. **Экран/состояние:** все, все viewport.
2. **Наблюдение:** FixPlan использует Geist, control height `32`, Card radius `14`; Quadratic использует Inter, Button Medium `40`, Input Medium `40`, Card radius `16`. Это системное расхождение, а не единичный дефект.
3. **Источник кода:** `app/layout.tsx`; `components/ui/button.tsx:7-40`; `components/ui/input.tsx:5-15`; `components/ui/card.tsx:5-18`.
4. **Основание:** Figma Button `1616:1696`, Input `1616:1706`, Card `1616:1731`, Text `1822:2`; действующее требование Geist/Vercel AI Elements.
5. **Предложение:** сначала утвердить, какие части Quadratic становятся нормативными. Рекомендуемый консервативный вариант: Geist оставить, geometry/tokens Quadratic адаптировать выборочно.
6. **Затронет:** все экраны и базовые компоненты.
7. **Приоритет/проверка:** **P0, решение**. Проверка: утверждённая таблица source-of-truth без противоречивых токенов.

Классификация: **не нарушение**, а блокирующее решение дизайн-системы.

### DR-02. Необоснованно разные высоты контролов одной основной роли

1. **Экран/состояние:** Plan, Assets, Tasks, Documents; desktop `1440/1280`.
2. **Наблюдение:** основные toolbar/form controls встречаются высотой `28`, `32` и custom `40 px`; различие не всегда связано с явно названной ролью. Например, базовый Button default/Input/Select — `32`, `sm` — `28`, а часть plan controls — `40`.
3. **Источник кода:** `components/ui/button.tsx:23-35`; `components/ui/input.tsx:10-12`; `components/ui/select.tsx:34-55`; custom selectors/styles в `app/page.tsx` и `app/globals.css:1727-1736`.
4. **Основание:** Figma Button `1616:1696` задаёт именованные sizes `32/36/40/48`; Input `1616:1706` подтверждает Medium `40`, Large `48`; Select `1616:1717` — trigger `40`.
5. **Предложение:** ввести семантические роли `compact`, `default`, `touch`, привязать каждый экранный control к роли. Не запрещать несколько размеров.
6. **Затронет:** toolbars, формы, действия карточек, status selects, dialog actions.
7. **Приоритет/проверка:** **P1**. Одинаковые действия в одном контексте имеют одинаковую высоту; исключения документированы.

### DR-03. Button и Tabs используют `transition-all`

1. **Экран/состояние:** все кнопки и tabs, keyboard/pointer interaction.
2. **Наблюдение:** transition охватывает свойства, которые не должны анимироваться; это может создавать непредсказуемые layout/paint transitions.
3. **Источник кода:** `components/ui/button.tsx:8`; `components/ui/tabs.tsx:66`.
4. **Основание:** Vercel Web Interface Guidelines: переходы должны перечислять конкретные свойства, `transition-all` следует избегать.
5. **Предложение:** заменить на явные `color`, `background-color`, `border-color`, `box-shadow`, `opacity`, а translate оставить только там, где он намеренный.
6. **Затронет:** весь продукт через Button/Tabs.
7. **Приоритет/проверка:** **P1**. По computed style отсутствует `transition-property: all`; hover/focus/active не вызывают layout shift.

### DR-04. Desktop app shell оставляет слишком узкую рабочую колонку на 1280 px

1. **Экран/состояние:** все desktop routes, assistant открыт, viewport `1280x900`.
2. **Наблюдение:** sidebar `248` + assistant `340` оставляют main `692 px`, из которых workspace padding забирает `40 px`. Формы и таблицы рано переходят к плотной компоновке.
3. **Источник кода:** `app/globals.css:497-508`; shell/assistant в `app/page.tsx`.
4. **Основание:** Quadratic не определяет app shell. Это визуальное и продуктовое наблюдение по измерению, не нарушение Figma.
5. **Предложение:** согласовать breakpoint, на котором sidebar автоматически сворачивается, либо сделать assistant resizable/collapsible. Не менять обе панели одновременно без сценарных тестов.
6. **Затронет:** все desktop screens, особенно Plan, Assets, Utilities.
7. **Приоритет/проверка:** **P1 proposal**. На `1280` ключевой content не получает преждевременный wrap; обе панели остаются доступны.

### DR-05. Mobile fixed surfaces не учитывают safe-area insets

1. **Экран/состояние:** mobile header и collapsed/expanded assistant, `390/360`.
2. **Наблюдение:** header padding и bottom assistant задаются фиксированными px; `env(safe-area-inset-top/bottom)` не используется. В браузере без выреза дефект не проявился, но на full-screen/PWA контент может оказаться у системной зоны.
3. **Источник кода:** `app/globals.css:2638-2649`; mobile assistant styles около `app/globals.css:3260-3340`.
4. **Основание:** Vercel Web Interface Guidelines — fixed/full-bleed mobile areas должны учитывать safe areas.
5. **Предложение:** добавить safe-area к header и composer/toggle container, сохранив текущие внутренние размеры.
6. **Затронет:** все mobile screens.
7. **Приоритет/проверка:** **P1**. Проверка в эмуляции notch/home indicator; controls не перекрываются системными зонами.

### DR-06. Очень длинные списки полностью рендерятся и формируют чрезмерную страницу

1. **Экран/состояние:** Plan/Assets mobile `390/360`; Assets desktop.
2. **Наблюдение:** высота Plan около `11 155 px`, Assets около `15 186 px`; в списке узлов отображаются до `117` элементов. Все строки создаются через `.map`, без pagination/virtualization.
3. **Источник кода:** `app/page.tsx:4733-4736` и `app/page.tsx:5453-5488`.
4. **Основание:** Vercel Web Interface Guidelines рекомендуют virtualize большие списки (порядка 50+ элементов); Figma Pagination `1616:1711` доступна, но подробно не исследована.
5. **Предложение:** сначала выбрать продуктовый паттерн: pagination для управляемого списка либо virtualization для непрерывного просмотра. Поиск и фильтры должны сохраняться в URL.
6. **Затронет:** Plan visible nodes, Assets, потенциально Journal/chat history.
7. **Приоритет/проверка:** **P0 performance/UX**. DOM row count ограничен; scroll остаётся плавным; keyboard/focus и deep-link сохраняются.

### DR-07. Card implementation расходится с кандидатом Figma по плотности и заголовку

1. **Экран/состояние:** Dashboard, Tasks, Utilities, Settings; `1440/1280`.
2. **Наблюдение:** computed Card radius `14`, spacing `16`, title `16` Medium. Quadratic Card — radius `16`, content sides/bottom `24`, title `20/28 Semi Bold`. На уровне системы нет решения, какие карточки должны быть Quadratic Card, а какие являются page sections/stat tiles.
3. **Источник кода:** `components/ui/card.tsx:5-45`.
4. **Основание:** Figma Card `1616:1731`, sets `445:4240`, `1745:1231`, `1745:1281`.
5. **Предложение:** классифицировать card roles. Для entity Card проверить Quadratic; для dense operational sections сохранить компактный вариант как отдельный documented size.
6. **Затронет:** практически все разделы.
7. **Приоритет/проверка:** **P1 decision**. Один тип карточки одинаков на всех страницах; page section не превращается в лишнюю вложенную card.

### DR-08. Dialog геометрически не соответствует Quadratic Dialog

1. **Экран/состояние:** «Новый объект», desktop `1440`; mobile `390`.
2. **Наблюдение:** desktop measured `384x293`, padding `16`, radius `14`, title `16`; Quadratic desktop example `512x290`, padding `20/24`, radius `16`, title `20/28`. Mobile measured `358x381`, actions stacked и touch targets `44`, функционально помещается.
3. **Источник кода:** `components/ui/dialog.tsx`; composition `components/system-dialog.tsx`; dialog call sites `app/page.tsx`.
4. **Основание:** Figma Dialog `1616:1703`; shadcn Dialog accessibility behavior.
5. **Предложение:** после решения DR-01 ввести `compact/default` dialog sizes. Не расширять простые подтверждения до `512` без необходимости.
6. **Затронет:** object forms, edit dialogs, system prompts.
7. **Приоритет/проверка:** **P2**. Default dialog соответствует согласованному size; mobile не выходит за viewport; focus trap/Escape/return focus сохраняются.

### DR-09. Dropdown Menu плотнее Figma и использует иной radius/shadow

1. **Экран/состояние:** Dashboard → «Создать», desktop `1440`.
2. **Наблюдение:** measured content `208x148`, radius `10`, item height `28`, shadow; Figma example имеет radius `8`, item rhythm ориентирован на `14/20`, content example без подтверждённой тени.
3. **Источник кода:** `components/ui/dropdown-menu.tsx`; trigger/call site в `app/page.tsx`.
4. **Основание:** Figma Dropdown Menu `1616:1704`, set `449:10131`.
5. **Предложение:** сравнить menu item role с Select и Command, затем утвердить единый desktop menu density. Не переносить размеры Command item на Menu автоматически.
6. **Затронет:** Create, theme menu, assistant actions.
7. **Приоритет/проверка:** **P2**. Меню одной роли имеют одинаковые item height/radius/focus; keyboard navigation работает.

### DR-10. Assistant typography различается между desktop и mobile, но это не само по себе ошибка

1. **Экран/состояние:** assistant expanded, desktop `1440`; mobile `390`.
2. **Наблюдение:** composer и MessageResponse на desktop имеют `14/20`; оба переходят на `16/24` на mobile. Metadata сообщения остаётся визуально меньше. Различие между desktop и mobile обосновано: `16 px` нужно для ввода без iOS zoom.
3. **Источник кода:** `app/globals.css:475-495`, `app/globals.css:1957-1963`, `app/globals.css:3331-3333`; `app/page.tsx:3616`; `components/ai-elements/message.tsx:48-65`; `components/ai-elements/prompt-input.tsx`.
4. **Основание:** Figma Text `1822:2`; AI Elements Prompt Input; Vercel mobile form guidance.
5. **Предложение:** определить chat type scale по ролям: metadata `12/16`, body `14/20` desktop, input `14/20` desktop и `16/24` mobile. Не добиваться равенства ценой mobile usability.
6. **Затронет:** web/Telegram history presentation и assistant composer.
7. **Приоритет/проверка:** **P1**. Внутри одного message body нет скачков; metadata визуально вторична; iOS не zoom при focus.

Классификация: частично **предложение**, а не подтверждённое нарушение.

### DR-11. Theme metadata может расходиться с ручным выбором темы

1. **Экран/состояние:** ручное переключение light/dark при системной теме противоположного значения.
2. **Наблюдение:** UI theme работает через `next-themes`, но browser `theme-color` определяется media query системы. После ручного выбора browser chrome может остаться системного цвета.
3. **Источник кода:** `app/layout.tsx`; theme variables/media в `app/globals.css:3190-3300`; `components/theme-toggle.tsx`.
4. **Основание:** Vercel Web Interface Guidelines — `color-scheme` и `theme-color` должны соответствовать фактической теме.
5. **Предложение:** синхронизировать metadata/theme-color с resolved theme либо документировать ограничение браузера.
6. **Затронет:** весь продукт, особенно PWA/mobile browser chrome.
7. **Приоритет/проверка:** **P2**. При manual light/dark цвет browser UI соответствует приложению независимо от system preference.

### DR-12. Desktop Navigation Menu Figma не может служить нормой для app sidebar

1. **Экран/состояние:** sidebar expanded/collapsed, `1440/1280`.
2. **Наблюдение:** текущий sidebar `280/248/64 px`, nav row `36 px`; Figma Navigation Menu описывает горизонтальное desktop menu с trigger height `36`, но не application sidebar.
3. **Источник кода:** shell/sidebar в `app/page.tsx`; `app/globals.css:338-436`, `497-504`.
4. **Основание:** Figma Navigation Menu `1616:1710`; metadata состава библиотеки.
5. **Предложение:** создать отдельные FixPlan app-shell tokens: expanded/collapsed widths, nav row, logo safe area, mobile header. Использовать Figma лишь для локальных control/text tokens.
6. **Затронет:** все authenticated screens.
7. **Приоритет/проверка:** **P1 decision**. Sidebar остаётся стабильным между routes; collapse не меняет смысл/доступность icon buttons; focus order логичен.

Классификация: **пробел библиотеки**, не нарушение.

## 4. Проверки без найденного дефекта

- На `1440`, `1280`, `390`, `360` нет document-level horizontal overflow.
- Page H1 и левое поле контента согласованы между проверенными routes.
- Текущие task tabs помещаются на `360 px`; риск длинной локализации остаётся непроверенным.
- Базовые mobile controls и icon buttons имеют минимум `44x44` в проверенных состояниях.
- Dashboard clock, utility money grid и StatCard values используют tabular numerals (`app/globals.css:542-568`, `1939-1944`, `3305-3306`).
- Dialog mobile остаётся внутри viewport, actions складываются вертикально.
- Destructive confirmation использует внутренний Radix Alert Dialog, а не browser confirm.
- Assistant отправляет сообщение в историю оптимистично до завершения ответа; прежняя задержка визуального подтверждения в проверенной реализации не воспроизведена.

## 5. Непроверенные экраны и ограничения

- `/login`, `app/error.tsx` и error/loading boundaries не проходили полный viewport sweep.
- Guest inspection `/guest/[token]` и cleaning `/cleaning/[token]` требуют действующих безопасных токенов; визуально не проверены.
- Empty/error/loading/disabled states проверены только там, где они уже были доступны без изменения данных.
- Не выполнен полный visual pass тёмной темы каждого маршрута.
- Не проверены реальный iPhone safe area, Android browser chrome, экранная клавиатура и VoiceOver/TalkBack.
- Не проведён stress-test локализаций длинными английскими/испанскими подписями.
- Figma pages со статусом «Перечень» в UI guide не считаются прочитанными подробно.
- Скриншоты в репозиторий не сохранены: эталоны следует фиксировать только после согласования и визуальной приёмки.

## 6. Предлагаемый порядок исправлений

### Партия 0. Решения

1. Утвердить source-of-truth: Geist остаётся или заменяется Inter.
2. Утвердить control roles и высоты desktop/mobile.
3. Утвердить Card/Dialog density.
4. Утвердить app-shell widths и поведение на `1280`.

### Партия 1. Токены и базовые primitives

1. Typography, spacing, radius, control heights, semantic colors, numeric style.
2. Button/Input/Textarea/Select/Tabs/Badge.
3. Удалить `transition-all`, проверить focus/disabled/invalid.
4. Screenshot before/after: component states на `1440/390`.

### Партия 2. Overlay и feedback

1. Dialog/Alert Dialog/Dropdown/Command/Tooltip.
2. Loading, optimistic feedback, Toast/Skeleton policy.
3. Keyboard, focus trap, Escape, return focus.

### Партия 3. App shell и assistant

1. Sidebar tokens и responsive collapse.
2. Assistant width/resizing/collapse.
3. Mobile safe areas и keyboard viewport.
4. Chat typography и composer states.

### Партия 4. Длинные коллекции

1. Assets/Plan: pagination либо virtualization.
2. URL state для filter/sort/page.
3. Table/list responsive behavior и checkbox.

### Партия 5. Экранная нормализация

Проверять по очереди Dashboard → Assets/Plan → Tasks → Utilities → Documents → Journal → Settings → guest flows. Локальные исключения сохранять только с описанной ролью.

### Проверка каждой партии

- screenshots before/after: `1440`, `1280`, `390`, `360`;
- light и dark;
- default, hover, focus-visible, active, disabled, error, loading;
- overlay states и длинные подписи;
- отсутствие horizontal overflow и перекрытия assistant;
- функциональные тесты и build как дополнительная, но не визуальная проверка;
- baseline screenshots сохранять только после ручной визуальной приёмки.

## 7. Итог миграции

1. Geist сохранён как продуктовый шрифт; подтверждённые размеры и line-height адаптированы из Quadratic.
2. Основная desktop-высота Button/Input/Select установлена в `40 px`; mobile touch controls — `44 px`; компактные варианты имеют отдельные размеры.
3. Card переведён на radius `16 px`, border и отсутствие декоративной тени; operational rows остаются плотнее карточек.
4. Dialog/Alert Dialog, Dropdown, Command, Tooltip и базовые form controls приведены к общим токенам.
5. Tabs на mobile остаются однострочными и горизонтально прокручиваются.
6. Страница узла реагирует на ширину центральной workspace через container query и не обрезается при открытых sidebar и assistant.
7. Проверены `/dashboard`, `/plan`, `/assets`, asset detail, `/tasks`, `/documents`, `/utilities`, `/log`, `/settings` на `1440`, `1280`, `390`, `360 px`; на мобильных viewport горизонтального переполнения документа нет.
8. Светлая и тёмная темы проверены на основном shell; полный screenshot baseline будет сохранён после визуальной приёмки.

Открытыми остаются продуктовые решения о ширинах sidebar/assistant на промежуточных viewport и стратегия pagination/virtualization для длинных списков.
