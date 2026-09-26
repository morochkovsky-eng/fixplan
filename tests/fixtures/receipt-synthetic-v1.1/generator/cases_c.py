from lib import *
from cases_a import gold_doc, ADDR, PAYER

# ---------------- C07: два документа на одном листе ----------------
def c07():
    a1=mul(52.70,18.40);a2=mul(2,118.35);debt2=23670;due2=a2+debt2
    q1=qr_svg(st00012("НО Фонд капремонта Условной обл.","7700000077","40703810000000000077","9900417","Взнос на капремонт 08.2026","082026",a1))
    q2=qr_svg(st00012("ООО Региональный оператор ТКО-Тест","7700000078","40702810000000000078","TKO-5521","Обращение с ТКО 08.2026","082026",due2))
    def blk(title,org,acc,qr,rows,fin):
        return f'''<div class="blk"><div class="side">ИЗВЕЩЕНИЕ<br><br>Кассир</div><div class="main">
<div class="ttl">{title}</div><div class="org">{org}</div>
<div class="ln">Плательщик: {PAYER} · {ADDR} · Лицевой счёт: <b>{acc}</b> · Период: <b>август 2026</b> · Срок оплаты: 25.09.2026</div>
{table([["Услуга","Расчёт","Сумма, руб."]],rows,'t')}<div class="fin">{fin}</div></div><div class="qr">{qr}</div></div>'''
    b1=blk("Взнос на капитальный ремонт","НО «Фонд капитального ремонта Условной области» · ИНН 7700000077","9900417",q1,
           [["Взнос на капитальный ремонт","52,70 м² × 18,40 руб./м²",f'<span class="num">{money(a1)}</span>']],
           f'Задолженность: 0,00 · Пени: 0,00 · <b>Итого к оплате: {money(a1)}</b>')
    b2=blk("Обращение с твёрдыми коммунальными отходами","ООО «Региональный оператор ТКО-Тест» · ИНН 7700000078","TKO-5521",q2,
           [["Обращение с ТКО","2 чел. × 118,35 руб./чел.",f'<span class="num">{money(a2)}</span>']],
           f'Задолженность на 01.08.2026: {money(debt2)} · Оплачено: 0,00 · <b>Итого к оплате: {money(due2)}</b>')
    body=f'<div class="top">Документы сформированы расчётным центром ООО «РЦ Условный» 02.09.2026 для оплаты разным получателям</div>{b1}<div class="cut">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>{b2}'
    css='''body{font-family:Tahoma,"DejaVu Sans",sans-serif;font-size:10px}.top{font-size:9px;color:#444;margin-bottom:6px}
.blk{display:flex;border:1px solid #000;min-height:95mm}.side{width:22mm;border-right:1px solid #000;padding:6px;font-weight:bold;font-size:9px}
.main{flex:1;padding:6px}.ttl{font-size:13px;font-weight:bold}.org{margin:2px 0 6px}.ln{margin-bottom:6px}.qr{padding:6px}
.t th,.t td{border:1px solid #000;padding:3px 5px}.fin{margin-top:8px;font-size:11px}.cut{margin:10px 0;color:#555;white-space:nowrap;overflow:hidden}'''
    gold={"caseId":"S07","documents":[
        gold_doc(documentType="capital_repair",provider="НО «Фонд капитального ремонта Условной области»",billingPeriod="2026-08",issueDate=F("printed","2026-09-02"),
                 dueDate=F("printed","2026-09-25"),accrued=F("printed",a1),openingBalanceSigned=F("printed",0),penalty=F("printed",0),
                 dueCandidates=[{"value":a1,"scope":"with_balance","optional":"excluded"}],expectedMandatory={"value":a1,"expectedStatus":"confirmed"},
                 lineItems=[{"name":"Взнос на капитальный ремонт","role":"service_charge","volume":"52,70","tariff":"18,40","amount":a1,"total":a1}],qr={"present":True,"sum":a1}),
        gold_doc(documentType="waste",provider="ООО «Региональный оператор ТКО-Тест»",billingPeriod="2026-08",issueDate=F("printed","2026-09-02"),
                 dueDate=F("printed","2026-09-25"),accrued=F("printed",a2),openingBalanceSigned=F("printed",debt2),paymentsInPeriod=F("printed",0),
                 dueCandidates=[{"value":due2,"scope":"with_balance","optional":"excluded"}],expectedMandatory={"value":due2,"expectedStatus":"confirmed"},
                 lineItems=[{"name":"Обращение с ТКО","role":"service_charge","volume":"2","tariff":"118,35","amount":a2,"total":a2}],qr={"present":True,"sum":due2})],
        "expectedDocumentCount":2,"expectedMonthlyTotalBothDocs":a1+due2,
        "traps":["Два разных получателя на одном листе — ДВА документа","Общий период, адрес и срок провоцируют склейку","Два QR с разными ИНН — сигнал разделения",
                 "Поле «Расчёт» — формула текстом в одной ячейке (составная ячейка)"]}
    return "Капремонт и ТКО август 2026", css, body, gold

# ---------------- C08: двухзонный учёт, соцнорма, долг, два итога ----------------
def c08():
    L=[("День (T1), в пределах соц. нормы",140,"7,34",7.34),("День (T1), сверх соц. нормы",47,"9,54",9.54),
       ("Ночь (T2), в пределах соц. нормы",86,"2,94",2.94),("Ночь (T2), сверх соц. нормы",28,"3,82",3.82)]
    items=[];rows=[]
    for n,v,ts,t in L:
        a=mul(v,t);items.append({"name":n,"role":"service_charge","volume":str(v),"tariff":ts,"amount":a,"total":a,"calculationMode":"zoned+tiered"})
        rows.append([n,f'<span class="num">{v}</span>',f'<span class="num">{ts}</span>',f'<span class="num">{money(a)}</span>'])
    acc=sum(i["amount"] for i in items);debt=120418;full=acc+debt
    qr=qr_svg(st00012("АО Энергосбыт Приморье-Тест","7700000088","40702810000000000088","61-0098812","Электроэнергия"))
    body=f'''
<div class="hd"><div><div class="n">Энергосбыт Приморье-Тест</div>Счёт на оплату электрической энергии<br>за <b>сентябрь 2026 года</b></div><div class="qr">{qr}</div></div>
<div class="row"><div>Лицевой счёт<br><b>61-0098812</b></div><div>Абонент<br>{PAYER}</div><div>Адрес<br>{ADDR}</div><div>Срок оплаты<br><b>до 10.10.2026</b></div></div>
<div class="h">Показания счётчика № 0811 4403 9971 (двухтарифный)</div>
{table([["Зона","Предыдущие","Текущие","Разность"]],[["T1 (день)",'<span class="num">41 208</span>','<span class="num">41 395</span>','<span class="num">187</span>'],["T2 (ночь)",'<span class="num">20 115</span>','<span class="num">20 229</span>','<span class="num">114</span>']],'t')}
<div class="h">Начисление</div>
{table([["Зона / диапазон","кВт·ч","Тариф, руб.","Сумма, руб."]],rows+[{"cls":"b","cells":[("Итого",3),f'<span class="num">{money(acc)}</span>']}],'t')}
<div class="res"><div>К оплате за период<b>{money(acc)}</b></div><div>Задолженность на 01.09.2026<b>{money(debt)}</b></div><div class="all">Всего к оплате с учётом задолженности<b>{money(full)}</b></div></div>
<p class="sm">Социальная норма: 140 кВт·ч (T1) и 86 кВт·ч (T2) в месяц для домохозяйства из 2 человек. Во избежание отключения погасите задолженность.</p>'''
    css='''body{font-family:"Trebuchet MS","DejaVu Sans",sans-serif;font-size:10px}.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #c0392b;padding-bottom:6px}
.n{font-size:15px;font-weight:bold;color:#c0392b}.row{display:grid;grid-template-columns:1fr 1fr 2fr 1fr;gap:6px;margin:8px 0}.row div{border-left:2px solid #c0392b;padding-left:5px}
.h{font-weight:bold;margin:8px 0 3px}.t th,.t td{border:1px solid #bbb;padding:2px 5px}.t th{background:#fbeaea}.b td{font-weight:bold}
.res{margin-top:10px;display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:6px}.res div{border:1px solid #c0392b;padding:6px}.res b{display:block;font-size:14px;margin-top:3px}
.res .all{background:#fbeaea}.sm{font-size:8px;color:#444}'''
    gold={"caseId":"S08","documents":[gold_doc(documentType="electricity",provider="АО «Энергосбыт Приморье-Тест»",billingPeriod="2026-09",
        dueDate=F("printed","2026-10-10"),accrued=F("printed",acc),openingBalanceSigned=F("printed",debt),
        dueCandidates=[{"value":acc,"scope":"period_only","optional":"excluded"},{"value":full,"scope":"with_balance","optional":"excluded"}],
        expectedMandatory={"value":full,"expectedStatus":"confirmed","why":"обязательна сумма с учётом задолженности; «за период» — period_only"},
        lineItems=items,
        meters=[{"resource":"electricity","number":"0811 4403 9971","zone":"T1","prev":F("printed","41 208"),"curr":F("printed","41 395"),"consumption":F("printed","187")},
                {"resource":"electricity","number":"0811 4403 9971","zone":"T2","prev":F("printed","20 115"),"curr":F("printed","20 229"),"consumption":F("printed","114")}],
        qr={"present":True,"sum":None,"note":"QR без Sum — не свидетельство суммы"})],
        "traps":["Два итога: за период и с долгом — обязателен второй","Зоны × соц. норма: 4 строки, объёмы 140+47=187 и 86+28=114",
                 "Социальная норма 140/86 в примечании — справочные числа","QR без суммы","«Оплачено» не напечатано — absent"]}
    return "Электроэнергия сентябрь 2026", css, body, gold

# ---------------- C09: плотная квитанция, разделы, льготы, составная ячейка, округление ----------------
def c09():
    S=[("1. Жилищные услуги",[("Управление МКД",39,"39.00",5.90,"5.90",0),("Содержание домохозяйства",39,"39.00",4.55,"4.55",0),
        ("Содержание территории",39,"39.00",6.90,"6.90",0),("Текущий ремонт",39,"39.00",18.10,"18.10",0),("Техническое обслуживание",39,"39.00",3.65,"3.65",0),
        ("Уборка лестничных клеток",39,"39.00",3.40,"3.40",0),("АППЗ",39,"39.00",1.00,"1.00",0),("АУР",39,"39.00",8.80,"8.80",0),
        ("Диспетчеризация",39,"39.00",10.70,"10.70",0),("Лифт",39,"39.00",5.70,"5.70",0),("ТО КУУ тепла",39,"39.00",1.10,"1.10",0),("ПЗУ и видеонаблюдение",39,"39.00",1.20,"1.20",0)]),
       ("2. Коммунальные услуги",[("ХВС ОДН",0.366,"0.366",33.34,"33.34",0),("ГВС ОДН",0.103,"0.103",251.17,"251.17",0),("Отопление",39,"39.00",41.23,"41.23",32159),
        ("ХВС",6,"6.000",49.80,"49.80",0),("ГВС",3,"3.000",241.15,"241.15",14469),("Водоотведение",9,"9.000",37.90,"37.90",0),("Электроэнергия МОП",2.1,"2.100",6.57,"6.57",0)]),
       ("3. Прочие услуги",[("Кабельное телевидение",1,"1",180.00,"180.00",0),("Вывоз мусора",39,"39.00",6.65,"6.65",0),("Ведение расчётного счёта",1,"1",15.82,"15.82",0)])]
    rows=[];items=[];acc=0;ben=0
    for title,L in S:
        rows.append({"cls":"sec","cells":[(title,6)]});sa=0;sb=0
        for n,v,vs,t,ts,b in L:
            a=mul(v,t);sa+=a;sb+=b;items.append({"name":n,"role":"service_charge","volume":vs,"tariff":ts,"amount":a,"benefit":-b if b else 0,"total":a-b})
            rows.append([n,f'<span class="num">{vs}</span>',f'<span class="num">{ts}</span>',f'<span class="num">{money(a,"dot",minus="-")}</span>',
                         f'<span class="num">{money(-b,"dot",minus="-") if b else ""}</span>',f'<span class="num">{money(a-b,"dot",minus="-")}</span>'])
        rows.append({"cls":"sub","cells":[(f"Итого по разделу {title[0]}",3),f'<span class="num">{money(sa,"dot")}</span>',f'<span class="num">{money(-sb,"dot",minus="-") if sb else ""}</span>',f'<span class="num">{money(sa-sb,"dot")}</span>']})
        acc+=sa;ben+=sb
    adv=3576;pre=acc-ben-adv;rnd=-(pre%100);due=pre+rnd
    body=f'''
<div class="h1">ИЗВЕЩЕНИЕ № 9 от 02.10.2026 &nbsp; за СЕНТЯБРЬ 2026 &nbsp; ОПЛАТИТЬ ДО 25.10.2026</div>
<table class="k"><tr><td>ТСЖ «Условный-9» ИНН 7700000099</td><td>Л/с 000912</td><td>{PAYER}</td><td>{ADDR}</td><td>S=39.00 м²</td></tr>
<tr><td colspan="3">Задолженность / Аванс на 01.09.2026: 0.00 / 35.76</td><td colspan="2">Последний платёж: 3163.03 от 11.09.2026</td></tr></table>
{table([["Услуга","Объём","Тариф","Начислено","Льгота / субсидия","К оплате"]],rows,'t')}
<table class="k fin"><tr><td>Всего начислено</td><td class="num">{money(acc,"dot")}</td><td>Льготы</td><td class="num">-{money(ben,"dot")}</td></tr>
<tr><td>Учтён аванс</td><td class="num">-{money(adv,"dot")}</td><td>Округление</td><td class="num">{money(rnd,"dot",minus="-")}</td></tr>
<tr class="it"><td colspan="3">ИТОГО К ОПЛАТЕ</td><td class="num">{money(due,"dot")}</td></tr></table>
<p class="sm">Добровольное страхование квартиры — 117.00 руб. (оплачивается по желанию отдельным платежом, в итог не включено).<br>Счётчики воды: показания на 20.09.2026 — ХВС __________ ГВС __________ (заполняется плательщиком)</p>'''
    css='''body{font-family:"Courier New","Liberation Mono","DejaVu Sans Mono",monospace;font-size:8.5px}.h1{font-weight:bold;font-size:10px;border:1px solid #000;padding:3px}
.k td{border:1px solid #000;padding:1.5px 3px}.t th,.t td{border:1px solid #000;padding:1px 3px}.sec td{font-weight:bold;text-decoration:underline}
.sub td{font-style:italic}.fin{margin-top:4px}.it td{font-weight:bold;font-size:11px}.sm{font-size:8px}'''
    gold={"caseId":"S09","documents":[gold_doc(documentType="combined",provider="ТСЖ «Условный-9»",billingPeriod="2026-09",issueDate=F("printed","2026-10-02"),
        dueDate=F("printed","2026-10-25"),accrued=F("printed",acc),openingBalanceSigned=F("printed",-adv,parts={"debt":0,"advance":adv,"compositeCell":True}),
        benefit=F("printed",-ben),rounding=F("printed",rnd),
        dueCandidates=[{"value":due,"scope":"with_balance","optional":"excluded"}],expectedMandatory={"value":due,"expectedStatus":"confirmed"},
        lineItems=items,optionalCharges=[{"name":"Добровольное страхование квартиры","amount":11700,"includedInMandatory":False}],
        paymentHistory=F("printed",{"date":"2026-09-11","amount":316303}),
        meters=[{"resource":"cold_water","number":None,"prev":F("absent"),"curr":F("printed_blank"),"note":"бланк для заполнения, не счётчик с показаниями"},
                {"resource":"hot_water","number":None,"prev":F("absent"),"curr":F("printed_blank")}])],
        "traps":["22 строки + заголовки разделов + подытоги разделов","Составная ячейка «0.00 / 35.76» — долг и аванс",
                 "Льготы — отрицательная колонка только у двух строк","Округление в итоге","Десятичная точка без разделителя тысяч",
                 "Страховка текстом, не в итоге","Пустой бланк показаний — не выдумывать значения","«Последний платёж 3163.03» — история"]}
    return "Извещение ТСЖ сентябрь 2026", css, body, gold

# ---------------- C10: газ по нормативу, арифметическая ошибка поставщика, нет срока ----------------
def c10():
    a1=mul(32.4,8.12);a2=9650;acc=a1+a2;debt=305331;correct=debt+acc;printed=correct+100
    body=f'''
<div class="h">ООО «Газпоставка-Тест»<span>КВИТАНЦИЯ за 09.26</span></div>
<p>Абонент: {PAYER}<br>Адрес: {ADDR}<br>Лицевой счёт № 5500-3312-07 · Прописано: 3 чел. · Прибор учёта газа: отсутствует</p>
{table([["Услуга","Основание","Объём","Цена","Сумма"]],[["Газоснабжение (пищеприготовление)","норматив 10,8 м³/чел. × 3 чел.",'<span class="num">32,400 м³</span>','<span class="num">8,12</span>',f'<span class="num">{money(a1)}</span>'],
 ["ТО ВДГО","договор № 118-В",'<span class="num">1</span>','<span class="num">96,50</span>',f'<span class="num">{money(a2)}</span>'],
 {"cls":"b","cells":[("Итого начислено",4),f'<span class="num">{money(acc)}</span>']}],'t')}
<table class="f"><tr><td>Долг на начало месяца</td><td class="num">{money(debt)}</td></tr><tr><td>Оплачено</td><td class="num">0,00</td></tr>
<tr class="b"><td>ИТОГО К ОПЛАТЕ</td><td class="num">{money(printed)}</td></tr></table>
<p class="sm">Дата формирования 05.10.2026. Телефон абонентского отдела 8 (000) 000-00-01.</p>'''
    css='''body{font-family:Georgia,"DejaVu Serif",serif;font-size:11px}.h{display:flex;justify-content:space-between;font-size:15px;font-weight:bold;border-bottom:1px solid #000;padding-bottom:4px}
.h span{font-size:12px}.t th,.t td{border:1px solid #444;padding:3px 5px}.b td{font-weight:bold}.f{width:55%;margin:10px 0 0 auto}.f td{border-bottom:1px solid #999;padding:3px}.sm{font-size:9px}'''
    gold={"caseId":"S10","documents":[gold_doc(documentType="gas",provider="ООО «Газпоставка-Тест»",billingPeriod="2026-09",issueDate=F("printed","2026-10-05"),
        dueDate=F("absent"),accrued=F("printed",acc),openingBalanceSigned=F("printed",debt),paymentsInPeriod=F("printed",0),
        dueCandidates=[{"value":printed,"scope":"with_balance","optional":"excluded"}],
        expectedMandatory={"value":printed,"basis":"printed","expectedStatus":"needs_review","computed":correct,"reconciliation":"open","deltaMinor":100,
                           "why":"ошибка поставщика на 1,00 ₽: сохранить напечатанное, НЕ исправлять, отправить на проверку"},
        lineItems=[{"name":"Газоснабжение (пищеприготовление)","role":"service_charge","volume":"32,400","tariff":"8,12","amount":a1,"total":a1},
                   {"name":"ТО ВДГО","role":"service_charge","volume":"1","tariff":"96,50","amount":a2,"total":a2}])],
        "traps":["Итог не сходится с компонентами на 1,00 ₽ — ловушка «тихого исправления»","Срок оплаты не напечатан — absent, не угадывать",
                 "Период «09.26» — двузначный год","Норматив 10,8 × 3 в текстовой ячейке","«Прибор учёта газа: отсутствует» — не создавать счётчик"]}
    return "Газ сентябрь 2026", css, body, gold
