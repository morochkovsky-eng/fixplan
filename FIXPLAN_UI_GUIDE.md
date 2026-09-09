# FixPlan UI Guide

**Статус:** Принят как визуальный стандарт для поэтапной миграции
**Дата исследования:** 2026-09-09  
**Область:** действующий веб-интерфейс FixPlan, Figma Community file Quadratic UI и официальные рекомендации Vercel/shadcn/AI Elements.

## 1. Статус источников

### Мобильная навигация и шапка узла, 9 сентября 2026

- До 980 px основные разделы доступны в горизонтально прокручиваемой полосе, которая закрепляется сверху при прокрутке. Ссылки сохраняют URL и обозначение активного раздела.
- Верхняя строка содержит логотип и компактную дату/время в выбранном часовом поясе. Нажатие на логотип раскрывает выбор квартиры.
- На узле исключён повторный мобильный заголовок страницы, уменьшены отступы шапки, действия подписаны «Назад», «Изменить», «Задание». История располагается перед формой комментария.
- Desktop-композиция не меняется. Это продуктовые решения FixPlan, а не требования библиотеки Figma.

### Согласованная плотность FixPlan, 9 сентября 2026

После визуальной приёмки `/ui-lab/asset` этот масштаб применён к локальной тестовой сборке и витрине `/ui-lab`:

- Заголовки карточек: 16/24 px, weight 500; заголовок страницы: 22/28 px, weight 500.
- Основные desktop Button, Input и Select: 36 px; текст 14/20 px. Компактные и крупные варианты сохраняются для соответствующих ролей.
- Mobile до 760 px: кнопки 40 px с текстом 13/20; поля и селекты остаются 44 px, текст редактируемых полей 16 px. Табы 36 px в контейнере 44 px, прокручиваются горизонтально в одну строку. Кнопки карточек UI Lab переносятся по доступной ширине, а не принудительно занимают всю строку. Уточнение от 9 сентября после отдельного согласования мобильной компактности; desktop зафиксирован.
- Между карточками дашборда и примерами витрины: 24 px. Внутренние отступы сохраняют свободное пространство из принятого образца.
- Это согласованная адаптация FixPlan, а не новые факты о Figma. Она имеет приоритет над прежними предложениями о размере default 40 px ниже в документе.

### 1.1. Принятое сочетание источников

- **Figma Quadratic UI** — community-библиотека на основе shadcn/ui. Её подтверждённые токены приняты как визуальный стандарт геометрии и состояний базовых компонентов FixPlan.
- **Geist** остаётся шрифтом продукта. Размеры и line-height берутся из согласованной шкалы Quadratic, но FixPlan не объявляется буквальной копией библиотеки.
- **shadcn/ui и Radix** определяют реализацию и доступное поведение базовых контролов; **Vercel AI Elements** — состав и поведение интерфейса ассистента.
- Значения Quadratic UI нельзя автоматически называть официальными значениями Geist/Vercel.
- Продуктовая структура FixPlan, состав экранов и сценарии не определяются Quadratic UI.
- Параметры, которых нет в Quadratic (app shell, сайдбары, адаптивные сценарии), определяются и документируются как собственные правила FixPlan.

### 1.2. Использованные официальные источники

- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
- [shadcn/ui Button](https://ui.shadcn.com/docs/components/base/button)
- [shadcn/ui Dialog](https://ui.shadcn.com/docs/components/base/dialog)
- [Vercel AI Elements Prompt Input](https://elements.ai-sdk.dev/components/prompt-input)

Официальные рекомендации используются для семантики, доступности, адаптивности и поведения. Они не заменяют числовые токены Figma там, где Figma их действительно задаёт.

## 2. Инвентаризация Figma

Файл: [Quadratic UI](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/)

### 2.1. Доступные страницы

| Страница               |   Page node | Статус чтения                      | Применимость                     |
| ---------------------- | ----------: | ---------------------------------- | -------------------------------- |
| Cover                  | `1347:1540` | Перечень                           | Нет                              |
| Accordion              | `1616:1677` | Перечень                           | Возможна для мобильных раскрытий |
| Alert Dialog           | `1616:1691` | Геометрия footer/header и варианты | Да, подтверждения                |
| Avatar                 | `1616:1693` | Перечень                           | Возможна для чата                |
| Badge                  | `1616:1694` | Варианты и геометрия               | Да, статусы                      |
| Breadcrumb             | `1616:1695` | Перечень                           | Пока не используется             |
| Button                 | `1616:1696` | Подробно                           | Да                               |
| Calendar               | `1616:1697` | Перечень                           | Возможна для дат                 |
| Callout                | `1616:1698` | Перечень                           | Возможна для предупреждений      |
| Card                   | `1616:1731` | Подробно                           | Да                               |
| Checkbox               | `1616:1699` | Варианты и геометрия               | Да, таблица узлов                |
| Collapsible            | `1616:1700` | Варианты и геометрия               | Да, AI task                      |
| Combobox               | `1616:1729` | Перечень                           | Да, выбор узла                   |
| Command                | `1616:1701` | Подробно                           | Да, поиск/выбор                  |
| Context Menu           | `1616:1702` | Перечень                           | Пока не используется             |
| Date Picker            | `1616:1730` | Перечень                           | Возможна для форм                |
| Dialog                 | `1616:1703` | Подробно                           | Да                               |
| Drawer                 | `1616:1734` | Перечень                           | Возможна на мобильном            |
| Dropdown Menu          | `1616:1704` | Подробно                           | Да                               |
| Input                  | `1616:1706` | Подробно                           | Да                               |
| Input OTP              | `1616:1707` | Перечень                           | Пока не используется             |
| Label                  | `1616:1708` | Перечень                           | Да, формы                        |
| Menubar                | `1616:1709` | Перечень                           | Нет                              |
| Navigation Menu        | `1616:1710` | Структура и геометрия              | Частично; это не app sidebar     |
| Pagination             | `1616:1711` | Перечень                           | Нужна для длинных списков        |
| Progress               | `1616:1713` | Перечень                           | Да, задания/уборки               |
| Radio Group            | `1616:1714` | Перечень                           | Возможна в настройках            |
| Resizable              | `1616:1715` | Перечень                           | Возможна для панели ассистента   |
| Select                 | `1616:1717` | Подробно                           | Да                               |
| Separator              | `1616:1718` | Варианты и геометрия               | Да                               |
| Sheet                  | `1616:1736` | Подробно                           | Да, мобильные панели             |
| Skeleton               | `1616:1719` | Перечень                           | Нужна для ожидания               |
| Slider                 | `1616:1720` | Перечень                           | Пока не используется             |
| Switch                 | `1616:1721` | Подробно                           | Да, настройки                    |
| Table                  | `1616:1722` | Структура и геометрия              | Да                               |
| Tabs                   | `1616:1723` | Подробно                           | Да                               |
| Textarea               | `1616:1724` | Подробно                           | Да                               |
| Toast                  | `1616:1725` | Перечень                           | Нужна для обратной связи         |
| Toggle                 | `1616:1726` | Перечень                           | Возможна для режимов             |
| Toggle Group           | `1616:1727` | Перечень                           | Возможна для фильтров            |
| Tooltip                | `1616:1728` | Подробно                           | Да                               |
| Text                   |    `1822:2` | Подробно                           | Да                               |
| Icons                  |       `0:1` | Перечень                           | Да, но FixPlan использует Lucide |
| Shared Menu Components | `2183:6834` | Перечень                           | Да, через menu primitives        |

**Ограничение:** страницы со статусом «Перечень» обнаружены в структуре файла, но их внутренние токены не считаются изученными. В этом документе для них не приводятся придуманные значения.

## 3. Подтверждённые основы Figma

### 3.1. Цвета

Подтверждены переменные:

| Роль                   | Light     | Dark      |
| ---------------------- | --------- | --------- |
| Background             | `#FFFFFF` | `#09090B` |
| Foreground             | `#09090B` | `#F7F8F8` |
| Border                 | `#E4E4E7` | `#27272A` |
| Primary                | `#18181B` | `#F7F8F8` |
| Primary foreground     | `#FAFAFA` | `#18181B` |
| Secondary              | `#F4F4F5` | `#27272A` |
| Secondary foreground   | `#18181B` | `#F7F8F8` |
| Destructive default    | `#FFF0F0` | `#2D0607` |
| Destructive foreground | `#E60000` | `#FF9EA1` |
| Warning default        | `#FFFCF0` | `#1D1F00` |
| Warning foreground     | `#DC7609` | `#F3CF58` |
| Success default        | `#ECFDF3` | `#001F0F` |
| Success foreground     | `#008A2E` | `#59F3A6` |

### 3.2. Пространственная шкала

Подтверждены шаги `0, 4, 8, 12, 16, 20, 24, 32, 36, 40, 48 px` и промежуточные `6, 10, 14, 18 px`.

### 3.3. Типографика

**Факт Figma:** текстовые стили Quadratic используют Inter, letter-spacing `0`.

| Размер | Базовый line-height | Paragraph line-height |
| -----: | ------------------: | --------------------: |
|     12 |                  16 |                    20 |
|     14 |                  20 |                    24 |
|     16 |                  24 |                    28 |
|     18 |                  28 |                    32 |
|     20 |                  28 |                    32 |
|     24 |                  32 |                    40 |
|     28 |                  36 |                    44 |
|     32 |                  36 |                    48 |
|     36 |                  40 |                    56 |
|     40 |                  48 |                    64 |
|     44 |                  52 |                    68 |
|     48 |                  56 |                    76 |
|     52 |                  60 |                    80 |
|     56 |                  64 |                    88 |
|     60 |                  68 |                    92 |
|     64 |                  72 |                    96 |

Варианты начертания: Regular, Medium, Semi Bold, Bold; paragraph подтверждён как Regular.

**Текущая реализация:** Geist Sans/Mono подключены в `app/layout.tsx`; `app/globals.css` использует Geist Sans с fallback Inter.

**Предложение FixPlan:** сохранить Geist до отдельного решения. Применять из Quadratic согласованные размеры/line-height, но не объявлять получившуюся систему буквальным Quadratic UI.

## 4. Компоненты

В каждом разделе сначала перечислены факты Figma, затем текущий код и предложение. Неподтверждённые значения помечены как пробел.

### 4.1. Button

- Figma: [page `1616:1696`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1696), set [`98:31`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=98-31).
- Размеры: Extra Small `32`, Small `36`, Medium `40`, Large `48 px`; radius `8 px`.
- Текст: большинство вариантов `14/20 Inter Medium`; Large использует подтверждённый стиль `16/24 Medium`.
- Варианты: Primary, Secondary, Ghost, Outline, Destructive, Destructive Outline, Warning, Warning Outline, Success, Success Outline.
- Content: Text, Text Icon, Icon, Icon Text; темы Light/Dark.
- Иконка: в просмотренных экземплярах `16 px`; точные размеры для каждого size требуют отдельной проверки.
- Код: `components/ui/button.tsx`; по умолчанию `32 px`, `sm 28`, `lg 36`, `xs 24`, radius `8`; Lucide обычно `16 px`.
- Официальная рекомендация: использовать семантический `button`, доступное имя для icon-only, заметный focus state; избегать `transition-all`.
- Предложение FixPlan: сначала определить роли `compact`, `default`, `touch`; затем сопоставить их с Quadratic. Не увеличивать все кнопки вслепую. Для одной роли на одном экране исключить случайные высоты.

### 4.2. Input

- Figma: [page `1616:1706`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1706), set `116:373`.
- Large: `320x48`, radius `10`, horizontal padding `14`, text `16/24`.
- Medium: `320x40`, radius `8`, horizontal padding `12`, text `14/20`.
- Варианты: XS/Small/Medium/Large; Default/Disabled/Placeholder; Light/Dark.
- Пробел: точная геометрия XS/Small не подтверждена.
- Код: `components/ui/input.tsx`; desktop `32 px`, mobile font `16 px`, desktop font `14 px`, radius `8`, horizontal padding `10 px`.
- Официальная рекомендация: указывать label, `name`, `autocomplete`, корректные `type` и `inputmode`; mobile text `16 px` предотвращает нежелательный zoom в iOS.
- Предложение FixPlan: не уменьшать мобильный текст до размера chat bubble. Согласовать, является ли основной desktop input компактным исключением или должен перейти на Medium `40 px`.

### 4.3. Textarea и Prompt Input

- Figma: [Textarea `1616:1724`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1724), set `448:9489`.
- Large: `384x128`, radius `10`, padding `12 px` vertical / `14 px` horizontal, text `16/24`.
- Варианты: Medium/Small/Large; Default/Disabled/Filled; Light/Dark.
- Пробел: точные размеры Medium/Small не подтверждены.
- Код: `components/ui/textarea.tsx`; AI composition — `components/ai-elements/prompt-input.tsx`; оболочка — `app/page.tsx` и `app/globals.css`.
- Текущее: composer textarea `64 px` minimum, desktop `14/20`, mobile `16/24`.
- Официальная рекомендация AI Elements: собирать ввод через PromptInput primitives, сохранять доступные file/action controls и явный pending state.
- Предложение FixPlan: сохранить `16 px` на mobile; унифицировать padding/radius с выбранным Input size; сравнивать иерархию, а не заставлять поле и сообщения иметь одинаковый размер.

### 4.4. Select

- Figma: [page `1616:1717`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1717), trigger set `207:777`, content set `450:10688`.
- Trigger: `192x40`, radius `8`, horizontal padding `12`, gap `10`, text `14/20`, icon `16`.
- Content: `192x164`, radius `8`, padding `4`, border, без тени в проверенном экземпляре; item text `14/20`, check `16`.
- Код: `components/ui/select.tsx`; default trigger `32`, small `28`, radius `8`, text `14`, icon `16`; content использует `shadow-md`.
- Предложение FixPlan: desktop primary form select привести к одной выбранной высоте; компактный status-select оставить отдельной документированной ролью. Решить расхождение тени после визуального сравнения, не механически.

### 4.5. Tabs

- Figma: [page `1616:1723`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1723), trigger set `1045:6826`, list set `452:10857`.
- List: `174x40`, radius `10`, padding `4`, gap `2`.
- Trigger example: `76x32`, radius `6`, padding `6/10`, text `14/20 Medium`.
- Код: `components/ui/tabs.tsx`; list `32 px` high, padding `3`, radius `8`; trigger uses `transition-all`.
- Официальная рекомендация: клавиатурная навигация и видимый focus; длинные подписи не должны ломать контейнер.
- Предложение FixPlan: выбрать один таб-стиль для одной роли; mobile допускает горизонтальный scroll с видимой подсказкой продолжения либо перенос продуктово разрешённых групп.

### 4.6. Card

- Figma: [page `1616:1731`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1731), main set `445:4240`, header `1745:1231`, footer `1745:1281`.
- Main example: `384x326`, radius `16`, padding top `20`, sides/bottom `24`, border; тень отсутствует.
- Header: width `336`, height `74`, gap `6`, bottom padding `20`; title `20/28 Semi Bold`, description `14/20 Regular`.
- Footer: width `336`, height `64`, top padding `24`, gap `16`.
- Код: `components/ui/card.tsx`; radius `14 px` (`rounded-xl` при текущем token), spacing `16`, title `16` Medium, ring вместо border.
- Предложение FixPlan: не заменять все карточки одинаково. Сначала разделить `section`, `entity card`, `stat tile`; применять Card только к действительно обособленным сущностям.

### 4.7. Badge и статусы

- Figma: [page `1616:1694`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1694), set `116:149`.
- Example: height `28`, pill radius `9999`, horizontal padding `10`, gap `10`, text `14/20 Medium`.
- Варианты: Primary, Secondary, Warning, Success, Outline и destructive/success/warning outline; Light/Dark.
- Код: `components/ui/badge.tsx`; продуктовые tone mappings в `app/page.tsx` и `app/globals.css`.
- Предложение FixPlan: цвет всегда дополняется текстом; закрепить словарь статусов по доменам, не использовать один цвет с разными значениями.

### 4.8. Dialog и Alert Dialog

- Figma: [Dialog `1616:1703`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1703), set `446:6088`.
- Desktop example: `512x290`, radius `16`, padding top `20`, sides/bottom `24`, border, без тени; heading `20/28 Semi Bold`, description `14/24`.
- Варианты: Light/Dark, Default/Mobile.
- Alert Dialog: [page `1616:1691`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1691), footer set `2059:2551`, header `2059:2537`.
- Alert footer: desktop width `464`, height `72`, horizontal gap `16`, top padding `32`; mobile width `297`, height `120`, vertical gap `12`, top padding `28`.
- Пробел: полная геометрия Alert Dialog content и mobile Dialog content не подтверждена.
- Код: `components/ui/dialog.tsx`, `components/ui/alert-dialog.tsx`, `components/system-dialog.tsx`.
- Текущее измерение New Object: desktop `384x293`, padding `16`, radius `14`; mobile `358x381`, padding `16`, stacked actions.
- Официальная рекомендация: focus trap, возврат фокуса, Escape, label/description, осознанное подтверждение destructive actions.
- Предложение FixPlan: сохранить Radix behavior; отдельно согласовать более просторную геометрию Quadratic. Не возвращаться к browser confirm.

### 4.9. Dropdown Menu и Command

- Figma Dropdown: [page `1616:1704`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1704), set `449:10131`; example `256x415`, radius `8`, border, text `14/20`, shortcut `12/16`, icon `16`.
- Figma Command: [page `1616:1701`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1701), item set `165:423`; item `512x40`, radius `6`, horizontal padding `8`, text `14/20`, icon `18`, gap `8`.
- Код: `components/ui/dropdown-menu.tsx`, `components/ui/command.tsx`.
- Текущее Dropdown Create: `208x148`, padding `4`, radius `10`, item `200x28`, icon `16`, shadow.
- Предложение FixPlan: сохранить различие menu и command; привести одинаковые menu items к общей высоте и focus treatment после выбора стандарта.

### 4.10. Table и Checkbox

- Figma Table: [page `1616:1722`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1722).
- Table example: width `852`, height `552`; header `36`; row/cell/footer `44`; select cell `40`, actions cell `44`, default cell `160`; Light/Dark, last-row variants.
- Figma Checkbox: [page `1616:1699`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1699), set `133:295`; checked/unchecked Light/Dark, `16x16`.
- Код: список узлов реализован вручную в `app/page.tsx` (`asset-table*`), используются native checkboxes; отдельного `components/ui/table.tsx` нет.
- Предложение FixPlan: сначала решить pagination/virtualization и responsive representation. Затем унифицировать row heights и checkbox через базовый компонент; на mobile таблица может становиться списком, это продуктовый паттерн вне Figma.

### 4.11. Collapsible, Separator, Switch, Tooltip, Sheet

- Collapsible: [page `1616:1700`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1700); trigger `320x24`, closed composition `320x68`, open `320x156`; Light/Dark, open/closed.
- Separator: [page `1616:1718`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1718); horizontal `128x1`, vertical `1x128`; Light/Dark.
- Switch: [page `1616:1721`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1721), set `216:1362`; `36x20`, radius `9999`, padding `2`; On/Off Light/Dark.
- Tooltip: [page `1616:1728`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1728), set `221:1007`; `93x28`, radius `6`, padding `6/8`, text `12/16`, border, no shadow.
- Sheet: [page `1616:1736`](https://www.figma.com/design/FGTNNznbEyqIW7YVfYgchv/?node-id=1616-1736); example width `383`, padding `24`, radius `0`, border; heading `20/28`, description `14/24`.
- Код: `components/ui/collapsible.tsx`, `components/ui/separator.tsx`, `components/ui/tooltip.tsx`; theme control currently uses dropdown, отдельного Switch в продукте нет; assistant panel — custom layout, не Sheet.
- Пробел: Quadratic не определяет sticky assistant panel FixPlan.

### 4.12. Компоненты кода без прямого стандарта в изученной Figma

- `components/ui/scroll-area.tsx`
- `components/ui/hover-card.tsx`
- `components/ui/input-group.tsx`
- `components/ui/button-group.tsx`
- `components/ui/spinner.tsx`
- `components/ai-elements/message.tsx`
- custom sidebar, mobile header, assistant shell, plan canvas, utility month accordion.

Для них нельзя ссылаться на Quadratic как на источник числовых значений. Предлагаемое решение: поведение брать из официальных primitives/AI Elements, а визуальные токены наследовать от согласованных Button/Input/Card/Text; специфическую геометрию FixPlan утвердить отдельно.

## 5. Принятые решения и открытые вопросы

1. Принято: шрифт продукта — Geist; Inter из исходной Figma-библиотеки не переносится.
2. Принято: базовая desktop-высота input/button/select — Quadratic Medium `40 px`; компактные роли `32/36 px` используются только явно.
3. Принято: Card — radius `16 px`, border без декоративной тени, padding `20–24 px`; компактная карточка остаётся отдельным вариантом.
4. Принято: Dialog — desktop до `512 px`, radius `16 px`; mobile ограничивается полями viewport и safe-area.
5. Принято: мобильные Tabs остаются в одну строку и горизонтально прокручиваются.
6. Открыто: ширины expanded/collapsed sidebar и assistant panel отсутствуют в библиотеке и остаются продуктовыми токенами FixPlan.
7. Открыто: mobile navigation, bottom assistant и safe-area отсутствуют в библиотеке и требуют собственных правил FixPlan.
8. Открыто: стратегия длинных списков — pagination, virtualization или progressive disclosure.

## 6. Предлагаемая область стандартизации

После согласования создать слой токенов для typography, spacing, radius, control heights, semantic colors и app-shell dimensions. Затем привести базовые компоненты, только после этого страницы. Локальные исключения должны иметь имя роли и причину, а не произвольное значение.
