from lib import *

ADDR = "г. Условный, ул. Тестовая, д. 17, кв. 42"
PAYER = "Образцов А. Н."

def gold_doc(**kw):
    base = {"documentType": None, "provider": None, "billingPeriod": None, "issueDate": F("absent"),
            "dueDate": F("absent"), "accrued": F("absent"), "openingBalanceSigned": F("absent"),
            "paymentsInPeriod": F("absent"), "recalculation": F("absent"), "benefit": F("absent"),
            "penalty": F("absent"), "rounding": F("absent"), "closingBalanceSigned": F("absent"),
            "dueCandidates": [], "expectedMandatory": None, "lineItems": [], "optionalCharges": [],
            "meters": [], "paymentHistory": F("absent"), "qr": {"present": False}}
    base.update(kw); return base

# ---------------- C01: ЕПД, страховка, два итога, QR со страховкой ----------------
def c01():
    lines = [("Содержание жилого помещения","м²","54,30","38,72",54.30,38.72),
             ("Отопление","Гкал","0,652100","3 104,55",0.6521,3104.55),
             ("Холодное водоснабжение","м³","7,000","55,21",7,55.21),
             ("Горячее водоснабжение","м³","4,000","272,34",4,272.34),
             ("Водоотведение","м³","11,000","44,63",11,44.63),
             ("Электроэнергия (содержание общего имущества)","кВт·ч","3,210","6,57",3.21,6.57),
             ("Обращение с ТКО","чел.","2","118,35",2,118.35),
             ("Запирающее устройство","шт.","1","55,00",1,55.00),
             ("Радиоточка / антенна","шт.","1","187,00",1,187.00)]
    items=[]; rows=[]
    for n,u,vs,ts,v,t in lines:
        a=mul(v,t); items.append({"name":n,"role":"service_charge","unit":u,"volume":vs,"tariff":ts,"amount":a,"recalculation":0,"total":a})
        rows.append([esc(n),u,f'<span class="num">{vs}</span>',f'<span class="num">{ts}</span>',f'<span class="num">{money(a)}</span>','<span class="num">0,00</span>',f'<span class="num">{money(a)}</span>'])
    acc=sum(i["amount"] for i in items); ins=mul(54.30,1.90); req=acc; withopt=acc+ins
    rows.append({"cls":"sum","cells":[("Итого за расчётный период",4),f'<span class="num">{money(acc)}</span>','<span class="num">0,00</span>',f'<span class="num">{money(acc)}</span>']})
    qr=qr_svg(st00012("ГБУ ЕИРЦ Условного р-на","7700000011","40702810000000000011","5512093341","ЕПД 08.2026","082026",withopt))
    body=f'''
<div class="hdr"><div><div class="big">ЕДИНЫЙ ПЛАТЁЖНЫЙ ДОКУМЕНТ</div>
<div>для внесения платы за содержание и ремонт жилого помещения и предоставление коммунальных услуг</div>
<div class="per">за <b>август 2026 г.</b></div></div><div class="qr">{qr}</div></div>
<table class="kv"><tr><td>Плательщик</td><td>{PAYER}</td><td>Код плательщика</td><td>55 1209 3341</td></tr>
<tr><td>Адрес</td><td>{ADDR}</td><td>Площадь, м²</td><td>54,30</td></tr>
<tr><td>Исполнитель</td><td>ООО «Жилсервис-Тест»</td><td>Проживает</td><td>2 чел.</td></tr>
<tr><td>Дата формирования</td><td>01.09.2026</td><td>Оплатить до</td><td><b>10.09.2026</b></td></tr></table>
<div class="h2">Расчёт размера платы за содержание и ремонт жилого помещения и коммунальные услуги</div>
{table([["Вид услуги","Ед. изм.","Объём","Тариф, руб.","Начислено","Перерасчёт","Итого"]],rows,'t svc')}
<table class="kv tot">
<tr><td>Задолженность на 01.08.2026</td><td class="num">0,00</td><td>Последняя оплата 14.08.2026</td><td class="num">6 912,40</td></tr>
<tr><td>Оплачено в августе 2026</td><td class="num">0,00</td><td>Пени</td><td class="num">0,00</td></tr></table>
<table class="due"><tr><td>ИТОГО К ОПЛАТЕ за расчётный период</td><td class="num big">{money(req)}</td></tr>
<tr><td>Добровольное страхование жилого помещения (54,30 м² × 1,90)</td><td class="num">{money(ins)}</td></tr>
<tr><td>ИТОГО К ОПЛАТЕ с учётом добровольного страхования</td><td class="num big">{money(withopt)}</td></tr></table>
<p class="note">Страхование осуществляется на добровольной основе. При нежелании страховать жилое помещение оплатите сумму без учёта страхования. QR-код содержит сумму с учётом добровольного страхования.</p>'''
    css='''body{font-family:Arial,"Liberation Sans","DejaVu Sans",sans-serif;font-size:9.5px}
.hdr{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:6px}
.big{font-size:14px;font-weight:bold}.per{margin-top:4px;font-size:11px}
.kv td{border:1px solid #666;padding:2px 4px}.kv td:nth-child(odd){background:#eee;width:18%}
.h2{font-weight:bold;margin:8px 0 3px;text-align:center}
.t th,.t td{border:1px solid #444;padding:2px 3px}.t th{background:#dde3ea}.sum td{font-weight:bold}
.tot{margin-top:6px}.due{margin-top:6px;border:2px solid #000}.due td{padding:4px 6px;font-size:11px;border-bottom:1px solid #999}
.due .big{font-size:13px}.note{font-size:8px;color:#333}'''
    gold={"caseId":"S01","documents":[gold_doc(documentType="combined",provider="ООО «Жилсервис-Тест» / ГБУ ЕИРЦ Условного р-на",
        billingPeriod="2026-08",issueDate=F("printed","2026-09-01"),dueDate=F("printed","2026-09-10"),accrued=F("printed",acc),
        openingBalanceSigned=F("printed",0),paymentsInPeriod=F("printed",0),recalculation=F("printed",0),penalty=F("printed",0),
        dueCandidates=[{"value":req,"scope":"with_balance","optional":"excluded"},{"value":withopt,"scope":"with_balance","optional":"included"}],
        expectedMandatory={"value":req,"expectedStatus":"confirmed","why":"E2 замыкается на кандидате без страховки; разница кандидатов = строка страхования"},
        lineItems=items,optionalCharges=[{"name":"Добровольное страхование жилого помещения","amount":ins,"includedInMandatory":False}],
        paymentHistory=F("printed",{"date":"2026-08-14","amount":691240}),qr={"present":True,"sum":withopt,"matchesCandidate":"optional_included"})],
        "traps":["Два итога: со страховкой и без","QR содержит сумму со страховкой — совпадение с QR не делает её обязательной",
                 "«Последняя оплата 6 912,40» — историческая, не оплата периода","Столбец «Перерасчёт» с нулями — напечатанный ноль"]}
    return "ЕПД август 2026", css, body, gold

# ---------------- C02: переплата больше начисления, к оплате 0 ----------------
def c02():
    L=[("Содержание общего имущества","61,80","29,44",61.8,29.44),("Текущий ремонт","61,80","4,12",61.8,4.12),
       ("Уборка мест общего пользования","61,80","2,05",61.8,2.05),("Домофон","1","48,00",1,48),("Обращение с ТКО, 3 чел.","3","101,90",3,101.9)]
    items=[];rows=[]
    for i,(n,vs,ts,v,t) in enumerate(L,1):
        a=mul(v,t);items.append({"name":n,"role":"service_charge","volume":vs,"tariff":ts,"amount":a,"total":a})
        rows.append([str(i),esc(n),f'<span class="num">{vs}</span>',f'<span class="num">{ts}</span>',f'<span class="num">{money(a)}</span>'])
    acc=sum(i["amount"] for i in items);open_adv=310000;closing=-open_adv+acc
    body=f'''
<table class="top"><tr><td class="org"><b>ООО «УК Северный квартал»</b><br>ИНН 7700000022 · р/с 40702810000000000022<br>Аварийная служба: 8 (000) 000-00-00</td>
<td class="doc"><div class="t1">СЧЁТ-ИЗВЕЩЕНИЕ</div>№ 4418 от 03.10.2026<br>Расчётный месяц: <b>сентябрь 2026</b></td></tr></table>
<p>Лицевой счёт: <b>100 442 18</b> &nbsp; Собственник: {PAYER} &nbsp; Адрес: {ADDR} &nbsp; Общая площадь: 61,80 м²</p>
{table([["№","Наименование услуги","Кол-во / площадь","Тариф","Начислено, ₽"]],rows,'t')}
<div class="bal">
<div><span>Задолженность на начало периода</span><b>0,00</b></div>
<div><span>Переплата на начало периода</span><b>{money(open_adv)}</b></div>
<div><span>Начислено за период</span><b>{money(acc)}</b></div>
<div><span>Оплачено в периоде</span><b>0,00</b></div>
<div><span>Переплата на конец периода</span><b>{money(-closing)}</b></div>
<div class="pay"><span>Сумма к оплате</span><b>0,00</b></div></div>
<p class="small">Переплата будет учтена в следующих расчётных периодах. Срок внесения платы — до 10 числа месяца, следующего за расчётным.</p>'''
    css='''body{font-family:"Times New Roman","Liberation Serif","DejaVu Serif",serif;font-size:11px}
.top td{vertical-align:top;padding:4px}.org{border-right:1px solid #000;width:60%}.t1{font-size:16px;letter-spacing:1px;font-weight:bold}
.t th,.t td{border:1px solid #000;padding:3px 5px}.t th{font-weight:bold}
.bal{margin:10px 0 0 45%;border:1px solid #000}.bal div{display:flex;justify-content:space-between;padding:3px 6px;border-bottom:1px dotted #777}
.bal .pay{font-size:14px;border-bottom:0;background:#f0f0f0}.small{font-size:9px;margin-top:10px}'''
    gold={"caseId":"S02","documents":[gold_doc(documentType="housing",provider="ООО «УК Северный квартал»",billingPeriod="2026-09",
        issueDate=F("printed","2026-10-03"),dueDate=F("absent",acceptable="2026-10-10 только со статусом needs_review: дата не напечатана, выводится из фразы «до 10 числа месяца, следующего за расчётным»"),
        accrued=F("printed",acc),openingBalanceSigned=F("printed",-open_adv,parts={"debt":0,"advance":open_adv}),paymentsInPeriod=F("printed",0),
        closingBalanceSigned=F("printed",closing),dueCandidates=[{"value":0,"scope":"with_balance","optional":"excluded"}],
        expectedMandatory={"value":0,"expectedStatus":"confirmed","why":"к оплате 0 при замыкании через исходящий баланс; НЕ ложный отказ"},
        lineItems=items)],
        "traps":["К оплате = 0,00 — не должно блокировать черновик","Прямое E2 даёт −812,44 ≠ 0: нужен closing_balance и due = max(0, closing)",
                 "Долг 0,00 и Переплата 3 100,00 — разные строки"],
        "contractGap":"В словаре ролей нет closing_balance — без неё документ корректно уйдёт в needs_review, но не в confirmed"}
    return "Счёт-извещение сентябрь 2026", css, body, gold

# ---------------- C03: отрицательная сумма к оплате ----------------
def c03():
    prev,cur=18342,18619;cons=cur-prev;a=mul(cons,6.24);opening=-320000;due=opening+a
    body=f'''
<div class="band">АО «ЭНЕРГОСБЫТ УСЛОВНЫЙ» · СЧЁТ ЗА ЭЛЕКТРОЭНЕРГИЮ</div>
<div class="grid"><div>Абонент: {PAYER}<br>Адрес: {ADDR}<br>Лицевой счёт: 77 004 912 03</div>
<div>Период: <b>01.09.2026 – 30.09.2026</b><br>Дата счёта: 02.10.2026<br>Срок оплаты: до 15.10.2026</div></div>
<div class="h">Показания прибора учёта</div>
{table([["Прибор учёта №","Тариф","Показания пред. (31.08.2026)","Показания тек. (30.09.2026)","Расход, кВт·ч"]],
       [["0 1147 2290","однотарифный",f'<span class="num">{prev}</span>',f'<span class="num">{cur}</span>',f'<span class="num">{cons}</span>']],'t')}
<div class="h">Расчёт</div>
{table([["Услуга","Расход","Тариф, руб./кВт·ч","Сумма, руб."]],[["Электроэнергия",f'<span class="num">{cons}</span>','<span class="num">6,24</span>',f'<span class="num">{money(a)}</span>']],'t')}
<table class="t fin"><tr><td>Сальдо на начало периода (+ долг / − аванс)</td><td class="num">{money(opening)}</td></tr>
<tr><td>Начислено за период</td><td class="num">{money(a)}</td></tr>
<tr><td>Поступило оплат</td><td class="num">0,00</td></tr>
<tr class="it"><td>Итого к оплате (+ долг / − аванс)</td><td class="num">{money(due)}</td></tr></table>
<p class="ft">Отрицательная сумма означает переплату, которая будет зачтена в следующих периодах.</p>'''
    css='''body{font-family:"DejaVu Sans Condensed","Arial Narrow",Arial,sans-serif;font-size:10.5px}
.band{background:#1f3b63;color:#fff;padding:6px 8px;font-weight:bold;font-size:12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px 0;border-bottom:1px solid #1f3b63}
.h{margin:10px 0 3px;font-weight:bold;color:#1f3b63}
.t th,.t td{border:1px solid #9aa9bd;padding:3px 5px}.t th{background:#e9eef5}
.fin{width:60%;margin-top:10px}.it td{font-weight:bold;font-size:13px;background:#e9eef5}.ft{font-size:9px;color:#333}'''
    gold={"caseId":"S03","documents":[gold_doc(documentType="electricity",provider="АО «Энергосбыт Условный»",billingPeriod="2026-09",
        issueDate=F("printed","2026-10-02"),dueDate=F("printed","2026-10-15"),accrued=F("printed",a),openingBalanceSigned=F("printed",opening),
        paymentsInPeriod=F("printed",0),dueCandidates=[{"value":due,"scope":"with_balance","optional":"excluded"}],
        expectedMandatory={"value":due,"expectedStatus":"confirmed","payableNow":0,"why":"отрицательная напечатанная сумма хранится со знаком"},
        lineItems=[{"name":"Электроэнергия","role":"service_charge","volume":str(cons),"tariff":"6,24","amount":a,"total":a}],
        meters=[{"resource":"electricity","number":"0 1147 2290","zone":"single","prev":F("printed","18342"),"curr":F("printed","18619"),"consumption":F("printed",str(cons))}])],
        "traps":["Итог отрицательный: −1 471,52","Знак сальдо задан легендой «+ долг / − аванс»","Номер счётчика с пробелами похож на число"]}
    return "Счёт за электроэнергию сентябрь 2026", css, body, gold
