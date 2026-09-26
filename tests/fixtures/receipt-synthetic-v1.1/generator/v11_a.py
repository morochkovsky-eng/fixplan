from lib import *
from cases_a import gold_doc, ADDR, PAYER, c01 as old01, c02 as old02, c03 as old03

# Каждая функция возвращает тот же видимый HTML, что v1, плюс data-атрибуты и semantic spec.
# data-b = блок literal, data-r = строка вне таблицы, data-c = ячейка вне таблицы, data-k = ключ строки для semantic gold,
# data-doc = принадлежность блока документу (только S07).

def c01():
    title, css, _, gold = old01()
    lines = [("Содержание жилого помещения","м²","54,30","38,72",54.30,38.72),("Отопление","Гкал","0,652100","3 104,55",0.6521,3104.55),
             ("Холодное водоснабжение","м³","7,000","55,21",7,55.21),("Горячее водоснабжение","м³","4,000","272,34",4,272.34),
             ("Водоотведение","м³","11,000","44,63",11,44.63),("Электроэнергия (содержание общего имущества)","кВт·ч","3,210","6,57",3.21,6.57),
             ("Обращение с ТКО","чел.","2","118,35",2,118.35),("Запирающее устройство","шт.","1","55,00",1,55.00),("Радиоточка / антенна","шт.","1","187,00",1,187.00)]
    rows=[];sem={}
    for i,(n,u,vs,ts,v,t) in enumerate(lines,1):
        a=mul(v,t)
        rows.append(R([esc(n),u,f'<span class="num">{vs}</span>',f'<span class="num">{ts}</span>',f'<span class="num">{money(a)}</span>','<span class="num">0,00</span>',f'<span class="num">{money(a)}</span>'],k=f"svc{i}"))
        sem[f"svc{i}"]=[I("service_charge",name=T(1),unit=T(2),volume=M(3),tariff=M(4),charge=M(5),recalculation=M(6),row_total=M(7))]
    acc=sum(i["amount"] for i in gold["documents"][0]["lineItems"]); ins=mul(54.30,1.90); req=acc; withopt=acc+ins
    rows.append(R([("Итого за расчётный период",4),f'<span class="num">{money(acc)}</span>','<span class="num">0,00</span>',f'<span class="num">{money(acc)}</span>'],k="acc",cls="sum"))
    sem["acc"]=[I("accrued_total",label=T(1),accrued_total=M(2))]
    qr=qr_svg(st00012("ГБУ ЕИРЦ Условного р-на","7700000011","40702810000000000011","5512093341","ЕПД 08.2026","082026",withopt))
    body=f'''
<div class="hdr"><div data-b="text"><div class="big" data-r>ЕДИНЫЙ ПЛАТЁЖНЫЙ ДОКУМЕНТ</div>
<div data-r>для внесения платы за содержание и ремонт жилого помещения и предоставление коммунальных услуг</div>
<div class="per" data-r data-k="period">за <b>август 2026 г.</b></div></div><div class="qr" data-b="code">{qr}</div></div>
<table class="kv" data-b="kv"><tr data-k="acct"><td>Плательщик</td><td>{PAYER}</td><td>Код плательщика</td><td>55 1209 3341</td></tr>
<tr data-k="addr"><td>Адрес</td><td>{ADDR}</td><td>Площадь, м²</td><td>54,30</td></tr>
<tr data-k="prov"><td>Исполнитель</td><td>ООО «Жилсервис-Тест»</td><td>Проживает</td><td>2 чел.</td></tr>
<tr data-k="dates"><td>Дата формирования</td><td>01.09.2026</td><td>Оплатить до</td><td><b>10.09.2026</b></td></tr></table>
<div class="h2" data-b="text">Расчёт размера платы за содержание и ремонт жилого помещения и коммунальные услуги</div>
{table([["Вид услуги","Ед. изм.","Объём","Тариф, руб.","Начислено","Перерасчёт","Итого"]],rows,'t svc')}
<table class="kv tot" data-b="kv">
<tr data-k="bal1"><td>Задолженность на 01.08.2026</td><td class="num">0,00</td><td>Последняя оплата 14.08.2026</td><td class="num">6 912,40</td></tr>
<tr data-k="bal2"><td>Оплачено в августе 2026</td><td class="num">0,00</td><td>Пени</td><td class="num">0,00</td></tr></table>
<table class="due" data-b="kv"><tr data-k="due1"><td>ИТОГО К ОПЛАТЕ за расчётный период</td><td class="num big">{money(req)}</td></tr>
<tr data-k="ins"><td>Добровольное страхование жилого помещения (54,30 м² × 1,90)</td><td class="num">{money(ins)}</td></tr>
<tr data-k="due2"><td>ИТОГО К ОПЛАТЕ с учётом добровольного страхования</td><td class="num big">{money(withopt)}</td></tr></table>
<p class="note" data-b="text">Страхование осуществляется на добровольной основе. При нежелании страховать жилое помещение оплатите сумму без учёта страхования. QR-код содержит сумму с учётом добровольного страхования.</p>'''
    sem.update({
        "period":[I("billing_period",billing_period=T(1))],
        "acct":[I("account",label=T(3),account=T(4))],
        "addr":[I("address",label=T(1),address=T(2))],
        "prov":[I("provider",label=T(1),provider=T(2))],
        "dates":[I("issue_date",label=T(1),issue_date=T(2)),I("due_date",label=T(3),due_date=T(4))],
        "bal1":[I("opening_debt",label=T(1),opening_debt=M(2)),I("payment_history",label=T(3),payment_history=M(4))],
        "bal2":[I("payment",label=T(1),payment=M(2)),I("penalty",label=T(3),penalty=M(4))],
        "due1":[I("due_candidate","with_balance","excluded",label=T(1),due_candidate=M(2))],
        "ins":[I("optional_charge",name=T(1),optional_charge=M(2))],
        "due2":[I("due_candidate","with_balance","included",label=T(1),due_candidate=M(2))],
    })
    return title, css, body, gold, {"rows":sem}

def c02():
    title, css, _, gold = old02()
    L=[("Содержание общего имущества","61,80","29,44",61.8,29.44),("Текущий ремонт","61,80","4,12",61.8,4.12),
       ("Уборка мест общего пользования","61,80","2,05",61.8,2.05),("Домофон","1","48,00",1,48),("Обращение с ТКО, 3 чел.","3","101,90",3,101.9)]
    rows=[];sem={};acc=0
    for i,(n,vs,ts,v,t) in enumerate(L,1):
        a=mul(v,t);acc+=a
        rows.append(R([str(i),esc(n),f'<span class="num">{vs}</span>',f'<span class="num">{ts}</span>',f'<span class="num">{money(a)}</span>'],k=f"svc{i}"))
        sem[f"svc{i}"]=[I("service_charge",name=T(2),volume=M(3),tariff=M(4),charge=M(5))]
    open_adv=310000;closing=-open_adv+acc
    body=f'''
<table class="top"><tr><td class="org" data-b="text"><b data-r data-k="prov">ООО «УК Северный квартал»</b><br><span data-r>ИНН 7700000022 · р/с 40702810000000000022</span><br><span data-r>Аварийная служба: 8 (000) 000-00-00</span></td>
<td class="doc" data-b="text"><div class="t1" data-r>СЧЁТ-ИЗВЕЩЕНИЕ</div><span data-r data-k="issue">№ 4418 от 03.10.2026</span><br><span data-r data-k="period">Расчётный месяц: <b>сентябрь 2026</b></span></td></tr></table>
<p data-b="text" data-k="acct">Лицевой счёт: <b>100 442 18</b> &nbsp; Собственник: {PAYER} &nbsp; Адрес: {ADDR} &nbsp; Общая площадь: 61,80 м²</p>
{table([["№","Наименование услуги","Кол-во / площадь","Тариф","Начислено, ₽"]],rows,'t')}
<div class="bal" data-b="kv">
<div data-r data-k="od"><span data-c>Задолженность на начало периода</span><b data-c>0,00</b></div>
<div data-r data-k="oa"><span data-c>Переплата на начало периода</span><b data-c>{money(open_adv)}</b></div>
<div data-r data-k="acc"><span data-c>Начислено за период</span><b data-c>{money(acc)}</b></div>
<div data-r data-k="pay"><span data-c>Оплачено в периоде</span><b data-c>0,00</b></div>
<div data-r data-k="ca"><span data-c>Переплата на конец периода</span><b data-c>{money(-closing)}</b></div>
<div class="pay" data-r data-k="due"><span data-c>Сумма к оплате</span><b data-c>0,00</b></div></div>
<p class="small" data-b="text">Переплата будет учтена в следующих расчётных периодах. Срок внесения платы — до 10 числа месяца, следующего за расчётным.</p>'''
    sem.update({
        "prov":[I("provider",provider=T(1))],"issue":[I("issue_date",issue_date=T(1))],"period":[I("billing_period",billing_period=T(1))],
        "acct":[I("account",account=T(1)),I("address",address=T(1))],
        "od":[I("opening_debt",label=T(1),opening_debt=M(2))],"oa":[I("opening_advance",label=T(1),opening_advance=M(2))],
        "acc":[I("accrued_total",label=T(1),accrued_total=M(2))],"pay":[I("payment",label=T(1),payment=M(2))],
        "ca":[I("closing_advance",label=T(1),closing_advance=M(2))],"due":[I("due_candidate","with_balance","excluded",label=T(1),due_candidate=M(2))],
    })
    return title, css, body, gold, {"rows":sem}

def c03():
    title, css, _, gold = old03()
    prev,cur=18342,18619;cons=cur-prev;a=mul(cons,6.24);opening=-320000;due=opening+a
    body=f'''
<div class="band" data-b="text" data-k="prov">АО «ЭНЕРГОСБЫТ УСЛОВНЫЙ» · СЧЁТ ЗА ЭЛЕКТРОЭНЕРГИЮ</div>
<div class="grid"><div data-b="text"><span data-r>Абонент: {PAYER}</span><br><span data-r data-k="addr">Адрес: {ADDR}</span><br><span data-r data-k="acct">Лицевой счёт: 77 004 912 03</span></div>
<div data-b="text"><span data-r data-k="period">Период: <b>01.09.2026 – 30.09.2026</b></span><br><span data-r data-k="issue">Дата счёта: 02.10.2026</span><br><span data-r data-k="duedate">Срок оплаты: до 15.10.2026</span></div></div>
<div class="h" data-b="text">Показания прибора учёта</div>
{table([["Прибор учёта №","Тариф","Показания пред. (31.08.2026)","Показания тек. (30.09.2026)","Расход, кВт·ч"]],
       [R(["0 1147 2290","однотарифный",f'<span class="num">{prev}</span>',f'<span class="num">{cur}</span>',f'<span class="num">{cons}</span>'],k="m1")],'t')}
<div class="h" data-b="text">Расчёт</div>
{table([["Услуга","Расход","Тариф, руб./кВт·ч","Сумма, руб."]],[R(["Электроэнергия",f'<span class="num">{cons}</span>','<span class="num">6,24</span>',f'<span class="num">{money(a)}</span>'],k="svc1")],'t')}
<table class="t fin" data-b="kv"><tr data-k="ob"><td>Сальдо на начало периода (+ долг / − аванс)</td><td class="num">{money(opening)}</td></tr>
<tr data-k="acc"><td>Начислено за период</td><td class="num">{money(a)}</td></tr>
<tr data-k="pay"><td>Поступило оплат</td><td class="num">0,00</td></tr>
<tr class="it" data-k="due"><td>Итого к оплате (+ долг / − аванс)</td><td class="num">{money(due)}</td></tr></table>
<p class="ft" data-b="text">Отрицательная сумма означает переплату, которая будет зачтена в следующих периодах.</p>'''
    sem={"prov":[I("provider",provider=T(1))],"addr":[I("address",address=T(1))],"acct":[I("account",account=T(1))],
         "period":[I("billing_period",billing_period=T(1))],"issue":[I("issue_date",issue_date=T(1))],"duedate":[I("due_date",due_date=T(1))],
         "m1":[I("meter_reading",meter_number=T(1),name=T(2),meter_prev=M(3),meter_curr=M(4),consumption=M(5))],
         "svc1":[I("service_charge",name=T(1),volume=M(2),tariff=M(3),charge=M(4))],
         "ob":[I("opening_balance",label=T(1),opening_balance=M(2))],"acc":[I("accrued_total",label=T(1),accrued_total=M(2))],
         "pay":[I("payment",label=T(1),payment=M(2))],"due":[I("due_candidate","with_balance","excluded",label=T(1),due_candidate=M(2))]}
    return title, css, body, gold, {"rows":sem}
