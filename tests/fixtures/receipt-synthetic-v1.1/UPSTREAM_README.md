# Homory synthetic-v1.1 — oracle для synthetic-v1 (ред. 2: S07 → partial_draft)

**Изображения не изменились.** Все 10 `png_clean` и 10 `photo_telegram` побитно совпадают с v1 (SHA-256 в `manifest.json`).
В генератор добавлены только `data-`атрибуты разметки, на рендер они не влияют. Можно продолжать использовать уже скачанные файлы.

## Состав

| Путь | Что | Кто видит |
|---|---|---|
| `html/`, `png_clean/`, `photo_telegram/` | входы, те же, что v1 | модель |
| `oracle/literal_source/Sxx.json` | literal oracle для clean в формате `VisualDocumentInput` | только evaluator |
| `oracle/literal_photo/Sxx.json` | тот же literal, bbox пересчитаны в координаты финального JPEG | только evaluator |
| `oracle/geometry_photo/Sxx.json` | гомография clean→JPEG, все параметры преобразования, четырёхугольник каждой ячейки | только evaluator |
| `oracle/semantic/Sxx.json` | semantic gold: `RoleClassification` вашего контракта + ожидаемые исходы | только evaluator |
| `gold/Sxx.legacy-v1.json` | старый эталон v1 (поля, строки, счётчики, QR); ожидаемые решения в нём устарели — источник истины `oracle/semantic/` | только evaluator |
| `manifest.json` | соответствие clean ↔ photo ↔ документы, размеры, seed, SHA-256 | только evaluator |
| `reports/` | прогон вашего ядра `c6a52c9` на oracle + semantic gold | команда |
| `generator/` | исходники и `reproduce.sh` | команда |

## Literal oracle

Формат — ровно `VisualDocumentInput` из `receipt-core/types.ts`: `readable → pages[{width,height}] → blocks[{layout,bbox}] → rows → cells[{text,state,bbox,colSpan?,rowSpan?,isHeader?}]`.
Проверено: `indexLiteralDocument` вашего ядра принимает все 10 файлов без ошибок.

- Размер страницы — пиксели соответствующего PNG (clean) или JPEG (photo). bbox нормализованы в [0,1] относительно этого изображения.
- Блоки и строки идут в порядке DOM. Позиционные ID сервера (`p1.b3.r2.c4`, с единицы) однозначно выводятся из порядка.
- Текст: пробелы внутри строки схлопнуты, NBSP → пробел. Многострочная ячейка — строки через `\n`. Символы сохранены буквально, включая «−» (U+2212), «·», «×», «№».
- Строка — это логическая строка генератора (строка таблицы, строка `kv`, строка текста до `<br>`). Абзац, который **визуально** переносится на 2 строки, в oracle — одна строка. Evaluator должен допускать, что reader разобьёт его на две.
- `blank` — пустая ячейка таблицы или пустое значение. `illegible` в синтетике **нет** (нечитаемых ячеек генератор не создаёт).
- QR — блок `layout: "code"` с одной ячейкой `text: ""`, `state: "ok"`. Payload в literal не входит (есть в legacy-эталоне).
- `isHeader` — у `<th>` и строк `<thead>`. `colSpan`/`rowSpan` — только когда > 1.
- **Не сохраняется:** bbox строки (в вашем контракте его нет), визуальные переносы внутри абзаца, шрифт и начертание.

## Геометрия photo_telegram

Точная. `homography_clean_px_to_photo_px` — матрица 3×3, переводящая пиксели clean PNG в пиксели финального JPEG (отступ → перспектива → поворот → resize).
Параметры каждого шага — в `params`. Проверено эмпирически: маркеры, прогнанные через те же операции PIL, совпадают с предсказанием матрицы; средняя ошибка 0,25–0,30 px, максимум ≤ 0,5 px на всех 10 файлах.

- В `literal_photo` bbox — описанный прямоугольник вокруг повёрнутой ячейки (он шире самой ячейки). Точная форма — `cellQuads` (4 точки по часовой стрелке от левого верхнего угла, нормализованные).
- Координаты непрерывные (граница пикселя = целое число), не «центр пикселя».
- Ни одна ячейка не вышла за край кадра (`cellsNotFullyInside: 0` во всех файлах).
- Шум, тени, blur и JPEG геометрию не меняют.

## Соответствие файлов

| ID | clean | photo | документы |
|---|---|---|---|
| S01 | png_clean/S01.png | photo_telegram/S01.jpg | S01-D1 |
| S02 | png_clean/S02.png | photo_telegram/S02.jpg | S02-D1 |
| S03 | png_clean/S03.png | photo_telegram/S03.jpg | S03-D1 |
| S04 | png_clean/S04.png | photo_telegram/S04.jpg | S04-D1 |
| S05 | png_clean/S05.png | photo_telegram/S05.jpg | S05-D1 |
| S06 | png_clean/S06.png | photo_telegram/S06.jpg | S06-D1 |
| S07 | png_clean/S07.png | photo_telegram/S07.jpg | **S07-D1** (капремонт), **S07-D2** (ТКО), 2 общие строки |
| S08 | png_clean/S08.png | photo_telegram/S08.jpg | S08-D1 |
| S09 | png_clean/S09.png | photo_telegram/S09.jpg | S09-D1 |
| S10 | png_clean/S10.png | photo_telegram/S10.jpg | S10-D1 |

## Semantic gold

`oracle/semantic/Sxx.json` содержит:
- `roleClassification` — полный вход вашего `processReceiptBundle`: `documents`, `sharedRowIds`, `rows` с ролями и слотами, разрешёнными в конкретные ячейки и `tokenIds`;
- `documents[].expected` — продуктовое ожидание: период, `mandatoryDue` (значение, статус, источник), `computedDue`, `computedClosingBalance` (только S02), решение и запрещённые решения;
- `evalHints` — нестрогие строки и допустимые альтернативные роли.

Правила эталона:
- везде `mode: "label_value"`; разметка `table_columns` от классификатора эквивалентна, если указывает на те же ячейки;
- текстовые слоты (период, даты, провайдер, счёт, адрес, `label`) имеют `tokenIds: []` и не владеют числами;
- строгими считать денежные роли и слоты; метаданные — мягче;
- `partial_draft` вместо ожидаемого `confirmed_draft` — потеря покрытия, не ошибка безопасности. Silent error — неверное значение в `confirmed`.

## Прогон вашего ядра (`c6a52c9`) на oracle + semantic gold

Ожидаемый итог набора: **8 `confirmed_draft` и 3 `partial_draft`** (S07-D1, S07-D2, S10).
Для S07-D1 и S07-D2 `confirmed_draft` запрещён: без напечатанного `accrued_total` замыкание E2 слабое (одна строка услуги равна итогу).
Для S10 запрещены `confirmed_draft` и «исправление» итога на 3 412,90.

Факт: решение совпадает у **4 из 11** (S02, S07-D1, S07-D2, S10); после диагностической замены U+2212 на `-` — у **6 из 11** (плюс S03, S06). Silent confirmed errors: **0**.
У S07 решение совпадает, но причины шире ожидаемых: кроме `due_reconciliation_insufficient` ядро даёт ещё `billing_period_ambiguous` (п. 2 ниже).

Эталон проверен тем же прогоном: там, где ядро поддерживает случай, E1/E2 замыкаются. Остальные расхождения — ограничения ядра:

1. **Потеря знака у «−» (U+2212) и «–» (U+2013). Критично.** `−3 200,00` токенизируется как `3 200,00`, `printedSign: none`. В S03 и S06 это ломает E2 и даёт review. В S03 значение для проверки выводится как `+1 471,52` вместо `−1 471,52`. В документе, где формула случайно замкнётся, это станет silent error. После замены U+2212 на `-` S03 и S06 подтверждаются, S04 проходит E2.
2. **Период в ячейке с другими датами → `billing_period_ambiguous`** (S04, S05, S07, S09): «за июнь 2026 · Оплатить до 15.07.2026». Литерально это одна ячейка, а парсер берёт все даты ячейки. Нужна адресация части текста ячейки (диапазон символов) для текстовых слотов — без языковых правил.
3. **Два замыкания, отличающиеся только optional или scope → `multiple_materially_distinct_closures`** (S01: со страховкой и без; S08: «за период» и «с долгом»). Единственный замкнутый кандидат с `optional: excluded` по вашему дизайну можно подтверждать; разность кандидатов, равная `optional_charge` или балансовым компонентам при согласованных осях, — подтверждение, а не неоднозначность.
4. **Нет напечатанного «итого начислено» → E1/E2 `insufficient`** (S07). Ожидаемое решение для S07 — `partial_draft`, так что это не расхождение по решению, а ожидаемая причина review.

Подробности по каждому документу — `reports/core_run_summary.json` (`expectedTotals`, `decisionMatches`, `decisionMatch` по документам) и `reports/core_run_Sxx.*.json`.

## Воспроизведение

`generator/reproduce.sh` (нужна переменная `HOMORY_REPO` с путём к репозиторию для сборки ядра).

- Генератор: `synthetic-v1.1`. Seed фото: `1000 + номер кейса` (S01 = 1001 … S10 = 1010). Рендер детерминирован, случайных элементов нет.
- Окружение сборки: Python 3.12.3, Playwright 1.56.0, Chromium 141.0.7390.37, Pillow 12.1.1, numpy 2.4.4, segno 1.6.6, Node 22.22.2, viewport 794×1123, `device_scale_factor=2`.
- Шрифты — только системные, внешних assets нет. Фактическая подстановка fontconfig: Arial → Liberation Sans, Times New Roman → Liberation Serif, Courier New → Liberation Mono, Verdana/Tahoma/Trebuchet MS → DejaVu Sans, Georgia → DejaVu Serif, DejaVu Sans Condensed.
- Побитная воспроизводимость картинок гарантирована только на том же Chromium и тех же шрифтах. На другой машине пересобирайте всё целиком: oracle всегда снимается с того же рендера, что и картинки, поэтому он останется согласованным.
