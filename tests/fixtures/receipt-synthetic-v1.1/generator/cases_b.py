from lib import *
from cases_a import gold_doc, ADDR, PAYER

# ---------------- C04: горизонтальная сводка, перерасчёт, пени, два платежа ----------------
def c04():
    L=[("Управление МКД","м²",72.40,"72,40",6.11,"6,11",0),("Содержание общего имущества","м²",72.40,"72,40",24.70,"24,70",0),
       ("Текущий ремонт","м²",72.40,"72,40",5.35,"5,35",0),("Лифты","м²",72.40,"72,40",3.48,"3,48",0),
       ("Консьержи","м²",72.40,"72,40",7.90,"7,90",-31240),("ХВС","м³",9,"9,000",59.80,"59,80",0),
       ("ГВС","м³",5,"5,000",278.90,"278,90",0),("Водоотведение","м³",14,"14,000",46.10,"46,10",0),
       ("Тепловая энергия","Гкал",0.915,"0,915000",2968.40,"2 968,40",0),("Электроэнергия ОДН (день)","кВт·ч",12.4,"12,400",7.02,"7,02",0),
       ("Электроэнергия ОДН (ночь)","кВт·ч",8.1,"8,100",2.77,"2,77",0),("Машино-место № 118","шт.",1,"1",1850.00,"1 850,00",0),
       ("Коллективная антенна","шт.",1,"1",245.00,"245,00",0)]
    items=[];rows=[]
    for n,u,v,vs,t,ts,r in L:
        a=mul(v,t);items.append({"name":n,"role":"service_charge","unit":u,"volume":vs,"tariff":ts,"amount":a,"recalculation":r,"total":a+r})
        rows.append([esc(n),u,f'<span class="num">{vs}</span>',f'<span class="num">{ts}</span>',f'<span class="num">{money(a)}</span>',f'<span class="num">{money(r) if r else "—"}</span>',f'<span class="num">{money(a+r)}</span>'])
    acc=sum(i["amount"] for i in items);rec=-31240;tot=acc+rec
    rows.append({"cls":"sub","cells":[("Итого начислено",4),f'<span class="num">{money(acc)}</span>',f'<span class="num">{money(rec)}</span>',f'<span class="num">{money(tot)}</span>']})
    opening=1842015;pen=4518;paid=1800000;due=opening+acc+rec+pen-paid
    summ=table([["Входящее сальдо на 01.06.2026","Начислено","Перерасчёт","Пени","Поступило в июне","К оплате"]],
        [[f'<span class="num">{money(opening)}</span>',f'<span class="num">{money(acc)}</span>',f'<span class="num">{money(rec)}</span>',f'<span class="num">{money(pen)}</span>',f'<span class="num">{money(paid)}</span>',f'<span class="num"><b>{money(due)}</b></span>']],'t sm')
    qr=qr_svg(st00012("ООО УК Резиденция-Тест","7700000044","40702810000000000044","3300118","ЖКУ 06.2026","062026",due))
    body=f'''
<div class="top"><div><b>ООО «УК Резиденция-Тест»</b> · ЖК «Условный парк»<br>Платёжный документ за <b>июнь 2026</b> · Оплатить до 15.07.2026</div><div class="qr">{qr}</div></div>
<p>Л/с 3300118 · {PAYER} · {ADDR} · 72,40 м²</p>
<div class="cap">Сводка по лицевому счёту</div>{summ}
<div class="cap">Детализация начислений</div>
{table([["Услуга","Ед.","Объём","Тариф","Начислено","Перерасчёт","Итого"]],rows,'t')}
<p class="small">Перерасчёт по услуге «Консьержи» за апрель–май 2026 в связи с отсутствием услуги. Пени начислены на задолженность за апрель 2026.<br>
Оплаты в июне: 05.06.2026 — 8 500,00; 22.06.2026 — 9 500,00. Дата последнего платежа: 22.06.2026.</p>
<div class="cut">линия отреза</div>
<table class="t sm"><tr><td>КВИТАНЦИЯ · июнь 2026 · л/с 3300118</td><td>Итого к оплате: <b>{money(due)}</b> руб.</td></tr></table>'''
    css='''body{font-family:Arial,"Liberation Sans",sans-serif;font-size:9px}.top{display:flex;justify-content:space-between;align-items:flex-start}
.cap{margin:6px 0 2px;font-weight:bold;border-bottom:1px solid #000}
.t th,.t td{border:1px solid #777;padding:1.5px 3px}.t th{background:#f2f2f2;font-weight:normal}.sub td{font-weight:bold;background:#f7f7f7}
.sm td{font-size:10px}.small{font-size:8px}.cut{border-top:1px dashed #000;text-align:center;font-size:7px;color:#666;margin:8px 0 4px}'''
    gold={"caseId":"S04","documents":[gold_doc(documentType="combined",provider="ООО «УК Резиденция-Тест»",billingPeriod="2026-06",
        dueDate=F("printed","2026-07-15"),accrued=F("printed",acc),openingBalanceSigned=F("printed",opening),paymentsInPeriod=F("printed",paid),
        recalculation=F("printed",rec),penalty=F("printed",pen),
        dueCandidates=[{"value":due,"scope":"with_balance","optional":"excluded","printedCount":2}],
        expectedMandatory={"value":due,"expectedStatus":"confirmed","why":"E2: сальдо + начислено + перерасчёт + пени − поступило"},
        lineItems=items,paymentHistory=F("printed",{"date":"2026-06-22","amount":950000,"note":"две оплаты в периоде; сумма поступлений = 18 000,00"}),
        qr={"present":True,"sum":due,"matchesCandidate":"required"})],
        "traps":["Горизонтальная сводка: заголовки в одной строке, числа в другой","Поступило 18 000 = 8 500 + 9 500; «последний платёж» 9 500 — не оплата периода целиком",
                 "Перерасчёт отрицательный в строке и в сводке","Итог напечатан дважды (сводка и корешок)","Строка «Итого начислено» — не услуга"]}
    return "ЖКУ июнь 2026", css, body, gold

# ---------------- C05: вода, счётчики, пустое показание, нормативы ----------------
def c05():
    m=[("ХВС (кухня)","19015917","03.2029","00231,418","00236,902","5,484","по показаниям"),
       ("ХВС (ванная)","19015918","11.2027","00118,230","","3,120","по среднему (показания не переданы)"),
       ("ГВС (ванная)","22400571","06.2030","00087,655","00091,106","3,451","по показаниям")]
    mrows=[[esc(r),f'<span class="num">{n}</span>',p,f'<span class="num">{a}</span>',f'<span class="num">{b}</span>',f'<span class="num">{c}</span>',s] for r,n,p,a,b,c,s in m]
    hvs=8.604;vo=12.055;a1=mul(hvs,55.21);a2=mul(vo,44.63);acc=a1+a2
    norm=[("Норматив потребления ХВС","м³/чел. в мес.","4,745"),("Норматив потребления ГВС","м³/чел. в мес.","3,041"),("Норматив водоотведения","м³/чел. в мес.","7,786"),("Повышающий коэффициент","","1,5")]
    body=f'''
<div class="head"><div class="logo">МУП «Водоканал г. Условного»</div><div>Квитанция на оплату услуг водоснабжения и водоотведения<br>Документ № 60221 от 04.09.2026</div></div>
<div class="pp">Расчётный период: <b>01.08.2026 – 31.08.2026</b> &nbsp;|&nbsp; Оплатить до: <b>20.09.2026</b><br>Потребитель: {PAYER}, {ADDR}. Л/с 0060221-7. Зарегистрировано: 3 чел.</div>
<div class="sec">Сведения о приборах учёта</div>
{table([["Ресурс","Заводской №","Поверка до","Предыдущие","Текущие","Расход, м³","Способ расчёта"]],mrows,'t')}
<div class="sec">Нормативы (справочно)</div>
{table([["Показатель","Ед. изм.","Значение"]],[[a,b,f'<span class="num">{c}</span>'] for a,b,c in norm],'t ref')}
<div class="sec">Начисления</div>
{table([["Услуга","Объём, м³","Тариф, руб./м³","Сумма, руб."]],[["Холодное водоснабжение",'<span class="num">8,604</span>','<span class="num">55,21</span>',f'<span class="num">{money(a1)}</span>'],
 ["Водоотведение",'<span class="num">12,055</span>','<span class="num">44,63</span>',f'<span class="num">{money(a2)}</span>'],
 {"cls":"b","cells":[("Итого начислено",3),f'<span class="num">{money(acc)}</span>']}],'t')}
<div class="fin">Долг на начало периода: 0,00 &nbsp;&nbsp; Оплачено: 0,00 &nbsp;&nbsp; <b>К ОПЛАТЕ: {money(acc)} руб.</b></div>
<p class="small">Передать показания можно до 25 числа. Для ХВС (ванная) объём определён по среднемесячному потреблению.</p>'''
    css='''body{font-family:Verdana,"DejaVu Sans",sans-serif;font-size:9px}.head{display:flex;gap:14px;align-items:center;border:2px solid #2a6f97;padding:6px}
.logo{font-weight:bold;font-size:12px;color:#2a6f97;width:40%}.pp{padding:6px 2px}.sec{background:#2a6f97;color:#fff;padding:2px 5px;margin-top:6px}
.t th,.t td{border:1px solid #2a6f97;padding:2px 4px}.t th{background:#e6f0f5}.ref td{color:#333}.b td{font-weight:bold}
.fin{margin-top:8px;padding:6px;border:1px solid #2a6f97;font-size:11px}.small{font-size:8px}'''
    meters=[{"resource":"cold_water","location":"кухня","number":"19015917","prev":F("printed","00231,418"),"curr":F("printed","00236,902"),"consumption":F("printed","5,484")},
            {"resource":"cold_water","location":"ванная","number":"19015918","prev":F("printed","00118,230"),"curr":F("printed_blank"),"consumption":F("printed","3,120",basis="по среднему")},
            {"resource":"hot_water","location":"ванная","number":"22400571","prev":F("printed","00087,655"),"curr":F("printed","00091,106"),"consumption":F("printed","3,451")}]
    gold={"caseId":"S05","documents":[gold_doc(documentType="water",provider="МУП «Водоканал г. Условного»",billingPeriod="2026-08",
        issueDate=F("printed","2026-09-04"),dueDate=F("printed","2026-09-20"),accrued=F("printed",acc),openingBalanceSigned=F("printed",0),
        paymentsInPeriod=F("printed",0),dueCandidates=[{"value":acc,"scope":"with_balance","optional":"excluded"}],
        expectedMandatory={"value":acc,"expectedStatus":"confirmed"},
        lineItems=[{"name":"Холодное водоснабжение","role":"service_charge","volume":"8,604","tariff":"55,21","amount":a1,"total":a1},
                   {"name":"Водоотведение","role":"service_charge","volume":"12,055","tariff":"44,63","amount":a2,"total":a2}],meters=meters)],
        "traps":["Пустое текущее показание ХВС (ванная) — printed_blank, НЕ заполнять","Таблица нормативов выглядит как таблица показаний — не счётчики",
                 "Заводские номера и «поверка до 03.2029» похожи на числа/даты периода","Объём ХВС 8,604 = 5,484 + 3,120 (по среднему)","Аванс не напечатан — absent, не 0"]}
    return "Водоснабжение август 2026", css, body, gold

# ---------------- C06: строки баланса внутри таблицы услуг, двухкомпонентная ГВС ----------------
def c06():
    a1=mul(0.764512,3912.44);a2=mul(5.9,34.12);a3=mul(0.354,3912.44);acc=a1+a2+a3;adv=-4120;due=acc+adv
    rows=[{"cls":"sec","cells":[("КОММУНАЛЬНЫЕ УСЛУГИ",7)]},
          ["Отопление","Гкал",'<span class="num">0,764512</span>','<span class="num">3 912,44</span>',f'<span class="num">{money(a1)}</span>','<span class="num">0,00</span>',f'<span class="num">{money(a1)}</span>'],
          ["Горячее водоснабжение (теплоноситель)","м³",'<span class="num">5,9</span>','<span class="num">34,12</span>',f'<span class="num">{money(a2)}</span>','<span class="num">0,00</span>',f'<span class="num">{money(a2)}</span>'],
          ["Горячее водоснабжение (тепловая энергия)","Гкал",'<span class="num">0,354000</span>','<span class="num">3 912,44</span>',f'<span class="num">{money(a3)}</span>','<span class="num">0,00</span>',f'<span class="num">{money(a3)}</span>'],
          {"cls":"b","cells":["Итого начислено за август 2026","","","",f'<span class="num">{money(acc)}</span>','<span class="num">0,00</span>',f'<span class="num">{money(acc)}</span>']},
          ["Задолженность (+) / аванс (−) на 01.08.2026","","","","","",f'<span class="num">{money(adv)}</span>'],
          ["Оплачено в августе 2026","","","","","",'<span class="num">0,00</span>'],
          {"cls":"b big","cells":["ИТОГО К ОПЛАТЕ","","","","","",f'<span class="num">{money(due)}</span>']}]
    body=f'''
<table class="hd"><tr><td><b>ПАО «Теплосеть-Столица»</b><br>Платёжный документ (счёт) за тепловую энергию и ГВС</td><td>за <b>08.2026</b><br>Оплатить до 25.09.2026</td></tr></table>
<p>Номер лицевого счёта: 44 0071 5512 · {PAYER} · {ADDR}</p>
<p>Сведения о приборах учёта: ИПУ ГВС № 240118773, расход 5,9 м³ (показания переданы 23.08.2026).</p>
{table([["Вид услуги","Ед. изм.","Объём","Тариф, руб.","Начислено","Перерасчёт","Всего"]],rows,'t')}
<p class="small">Оплата производится без комиссии в личном кабинете. Сумма аванса учтена при формировании итога.</p>'''
    css='''body{font-family:Arial,"Liberation Sans",sans-serif;font-size:10px}.hd td{border:1px solid #000;padding:5px;font-size:11px}
.t th,.t td{border:1px solid #000;padding:2px 4px}.t th{background:#ffe9c7}.sec td{font-weight:bold;background:#fafafa}.b td{font-weight:bold}.big td{font-size:12px}
.small{font-size:8px}'''
    gold={"caseId":"S06","documents":[gold_doc(documentType="heating",provider="ПАО «Теплосеть-Столица»",billingPeriod="2026-08",
        dueDate=F("printed","2026-09-25"),accrued=F("printed",acc),openingBalanceSigned=F("printed",adv),paymentsInPeriod=F("printed",0),recalculation=F("printed",0),
        dueCandidates=[{"value":due,"scope":"with_balance","optional":"excluded"}],expectedMandatory={"value":due,"expectedStatus":"confirmed"},
        lineItems=[{"name":"Отопление","role":"service_charge","volume":"0,764512","tariff":"3 912,44","amount":a1,"total":a1},
                   {"name":"ГВС (теплоноситель)","role":"service_charge","volume":"5,9","tariff":"34,12","amount":a2,"total":a2},
                   {"name":"ГВС (тепловая энергия)","role":"service_charge","volume":"0,354000","tariff":"3 912,44","amount":a3,"total":a3}],
        meters=[{"resource":"hot_water","number":"240118773","prev":F("absent"),"curr":F("absent"),"consumption":F("printed","5,9")}])],
        "traps":["Строки аванса, оплаты и «ИТОГО» внутри той же таблицы, что и услуги (ловушка T03)","ГВС из двух компонентов: не склеивать и не терять",
                 "Счётчик упомянут текстом, показаний нет — prev/curr absent, не выдумывать","Заголовок раздела в строке таблицы"]}
    return "Теплоснабжение август 2026", css, body, gold
