from lib import *
from cases_a import ADDR, PAYER
from cases_c import c07 as old07, c08 as old08, c09 as old09, c10 as old10

def c07():
    title, css, _, gold = old07()
    a1=mul(52.70,18.40);a2=mul(2,118.35);debt2=23670;due2=a2+debt2
    q1=qr_svg(st00012("НО Фонд капремонта Условной обл.","7700000077","40703810000000000077","9900417","Взнос на капремонт 08.2026","082026",a1))
    q2=qr_svg(st00012("ООО Региональный оператор ТКО-Тест","7700000078","40702810000000000078","TKO-5521","Обращение с ТКО 08.2026","082026",due2))
    def blk(doc,title,org,acc,qr,rowcells,fin):
        return f'''<div class="blk"><div class="side" data-b="text" data-doc="{doc}"><span data-r>ИЗВЕЩЕНИЕ</span><br><br><span data-r>Кассир</span></div><div class="main">
<div class="ttl" data-b="text" data-doc="{doc}">{title}</div><div class="org" data-b="text" data-doc="{doc}" data-k="{doc}prov">{org}</div>
<div class="ln" data-b="text" data-doc="{doc}" data-k="{doc}ln">Плательщик: {PAYER} · {ADDR} · Лицевой счёт: <b>{acc}</b> · Период: <b>август 2026</b> · Срок оплаты: 25.09.2026</div>
{table([["Услуга","Расчёт","Сумма, руб."]],[R(rowcells,k=doc+"svc")],'t',attrs=f'data-b="table" data-doc="{doc}"')}<div class="fin" data-b="text" data-doc="{doc}" data-k="{doc}fin">{fin}</div></div><div class="qr" data-b="code" data-doc="{doc}">{qr}</div></div>'''
    b1=blk("D1","Взнос на капитальный ремонт","НО «Фонд капитального ремонта Условной области» · ИНН 7700000077","9900417",q1,
           ["Взнос на капитальный ремонт","52,70 м² × 18,40 руб./м²",f'<span class="num">{money(a1)}</span>'],
           f'Задолженность: 0,00 · Пени: 0,00 · <b>Итого к оплате: {money(a1)}</b>')
    b2=blk("D2","Обращение с твёрдыми коммунальными отходами","ООО «Региональный оператор ТКО-Тест» · ИНН 7700000078","TKO-5521",q2,
           ["Обращение с ТКО","2 чел. × 118,35 руб./чел.",f'<span class="num">{money(a2)}</span>'],
           f'Задолженность на 01.08.2026: {money(debt2)} · Оплачено: 0,00 · <b>Итого к оплате: {money(due2)}</b>')
    body=f'<div class="top" data-b="text">Документы сформированы расчётным центром ООО «РЦ Условный» 02.09.2026 для оплаты разным получателям</div>{b1}<div class="cut" data-b="text">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>{b2}'
    sem={}
    for d in ("D1","D2"):
        sem[d+"prov"]=[I("provider",provider=T(1))]
        sem[d+"ln"]=[I("address",address=T(1)),I("account",account=T(1)),I("billing_period",billing_period=TF(1,"август 2026")),I("due_date",due_date=T(1))]
    sem["D1svc"]=[I("service_charge",name=T(1),volume=K(2,"52,70"),tariff=K(2,"18,40"),charge=M(3))]
    sem["D2svc"]=[I("service_charge",name=T(1),volume=K(2,"2"),tariff=K(2,"118,35"),charge=M(3))]
    sem["D1fin"]=[I("opening_debt",opening_debt=K(1,"0,00#1")),I("penalty",penalty=K(1,"0,00#2")),I("due_candidate","with_balance","excluded",due_candidate=K(1,money(a1)))]
    sem["D2fin"]=[I("opening_debt",opening_debt=K(1,money(debt2))),I("payment",payment=K(1,"0,00")),I("due_candidate","with_balance","excluded",due_candidate=K(1,money(due2)))]
    return title, css, body, gold, {"rows":sem,"multiDoc":True}

def c08():
    title, css, _, gold = old08()
    L=[("День (T1), в пределах соц. нормы",140,"7,34",7.34),("День (T1), сверх соц. нормы",47,"9,54",9.54),
       ("Ночь (T2), в пределах соц. нормы",86,"2,94",2.94),("Ночь (T2), сверх соц. нормы",28,"3,82",3.82)]
    rows=[];sem={};acc=0
    for i,(n,v,ts,t) in enumerate(L,1):
        a=mul(v,t);acc+=a
        rows.append(R([n,f'<span class="num">{v}</span>',f'<span class="num">{ts}</span>',f'<span class="num">{money(a)}</span>'],k=f"svc{i}"))
        sem[f"svc{i}"]=[I("service_charge",name=T(1),volume=M(2),tariff=M(3),charge=M(4))]
    rows.append(R([("Итого",3),f'<span class="num">{money(acc)}</span>'],k="acc",cls="b"))
    sem["acc"]=[I("accrued_total",label=T(1),accrued_total=M(2))]
    debt=120418;full=acc+debt
    qr=qr_svg(st00012("АО Энергосбыт Приморье-Тест","7700000088","40702810000000000088","61-0098812","Электроэнергия"))
    body=f'''
<div class="hd"><div data-b="text"><div class="n" data-r data-k="prov">Энергосбыт Приморье-Тест</div><span data-r>Счёт на оплату электрической энергии</span><br><span data-r data-k="period">за <b>сентябрь 2026 года</b></span></div><div class="qr" data-b="code">{qr}</div></div>
<div class="row" data-b="kv" data-r data-k="info"><div data-c>Лицевой счёт<br><b>61-0098812</b></div><div data-c>Абонент<br>{PAYER}</div><div data-c>Адрес<br>{ADDR}</div><div data-c>Срок оплаты<br><b>до 10.10.2026</b></div></div>
<div class="h" data-b="text">Показания счётчика № 0811 4403 9971 (двухтарифный)</div>
{table([["Зона","Предыдущие","Текущие","Разность"]],[R(["T1 (день)",'<span class="num">41 208</span>','<span class="num">41 395</span>','<span class="num">187</span>'],k="m1"),R(["T2 (ночь)",'<span class="num">20 115</span>','<span class="num">20 229</span>','<span class="num">114</span>'],k="m2")],'t')}
<div class="h" data-b="text">Начисление</div>
{table([["Зона / диапазон","кВт·ч","Тариф, руб.","Сумма, руб."]],rows,'t')}
<div class="res" data-b="kv" data-r data-k="res"><div data-c>К оплате за период<b>{money(acc)}</b></div><div data-c>Задолженность на 01.09.2026<b>{money(debt)}</b></div><div class="all" data-c>Всего к оплате с учётом задолженности<b>{money(full)}</b></div></div>
<p class="sm" data-b="text">Социальная норма: 140 кВт·ч (T1) и 86 кВт·ч (T2) в месяц для домохозяйства из 2 человек. Во избежание отключения погасите задолженность.</p>'''
    sem.update({"prov":[I("provider",provider=T(1))],"period":[I("billing_period",billing_period=T(1))],
                "info":[I("account",account=T(1)),I("address",address=T(3)),I("due_date",due_date=T(4))],
                "m1":[I("meter_reading",name=T(1),meter_prev=M(2),meter_curr=M(3),consumption=M(4))],
                "m2":[I("meter_reading",name=T(1),meter_prev=M(2),meter_curr=M(3),consumption=M(4))],
                "res":[I("due_candidate","period_only","excluded",due_candidate=K(1,money(acc))),I("opening_debt",opening_debt=K(2,money(debt))),
                       I("due_candidate","with_balance","excluded",due_candidate=K(3,money(full)))]})
    return title, css, body, gold, {"rows":sem}

def c09():
    title, css, _, gold = old09()
    S=[("1. Жилищные услуги",[("Управление МКД",39,"39.00",5.90,"5.90",0),("Содержание домохозяйства",39,"39.00",4.55,"4.55",0),
        ("Содержание территории",39,"39.00",6.90,"6.90",0),("Текущий ремонт",39,"39.00",18.10,"18.10",0),("Техническое обслуживание",39,"39.00",3.65,"3.65",0),
        ("Уборка лестничных клеток",39,"39.00",3.40,"3.40",0),("АППЗ",39,"39.00",1.00,"1.00",0),("АУР",39,"39.00",8.80,"8.80",0),
        ("Диспетчеризация",39,"39.00",10.70,"10.70",0),("Лифт",39,"39.00",5.70,"5.70",0),("ТО КУУ тепла",39,"39.00",1.10,"1.10",0),("ПЗУ и видеонаблюдение",39,"39.00",1.20,"1.20",0)]),
       ("2. Коммунальные услуги",[("ХВС ОДН",0.366,"0.366",33.34,"33.34",0),("ГВС ОДН",0.103,"0.103",251.17,"251.17",0),("Отопление",39,"39.00",41.23,"41.23",32159),
        ("ХВС",6,"6.000",49.80,"49.80",0),("ГВС",3,"3.000",241.15,"241.15",14469),("Водоотведение",9,"9.000",37.90,"37.90",0),("Электроэнергия МОП",2.1,"2.100",6.57,"6.57",0)]),
       ("3. Прочие услуги",[("Кабельное телевидение",1,"1",180.00,"180.00",0),("Вывоз мусора",39,"39.00",6.65,"6.65",0),("Ведение расчётного счёта",1,"1",15.82,"15.82",0)])]
    rows=[];sem={};acc=0;ben=0;n=0
    for si,(title_s,L) in enumerate(S,1):
        rows.append(R([(title_s,6)],k=f"sec{si}",cls="sec"));sem[f"sec{si}"]=[I("section_title")];sa=0;sb=0
        for nm,v,vs,t,ts,b in L:
            n+=1;a=mul(v,t);sa+=a;sb+=b
            rows.append(R([nm,f'<span class="num">{vs}</span>',f'<span class="num">{ts}</span>',f'<span class="num">{money(a,"dot",minus="-")}</span>',
                         f'<span class="num">{money(-b,"dot",minus="-") if b else ""}</span>',f'<span class="num">{money(a-b,"dot",minus="-")}</span>'],k=f"svc{n}"))
            slots=dict(name=T(1),volume=M(2),tariff=M(3),charge=M(4),row_total=M(6))
            if b: slots["benefit"]=M(5)
            sem[f"svc{n}"]=[I("service_charge",**slots)]
        rows.append(R([(f"Итого по разделу {title_s[0]}",3),f'<span class="num">{money(sa,"dot")}</span>',f'<span class="num">{money(-sb,"dot",minus="-") if sb else ""}</span>',f'<span class="num">{money(sa-sb,"dot")}</span>'],k=f"sub{si}",cls="sub"))
        sem[f"sub{si}"]=[I("subtotal",name=T(1),row_total=M(4))]
        acc+=sa;ben+=sb
    adv=3576;pre=acc-ben-adv;rnd=-(pre%100);due=pre+rnd
    body=f'''
<div class="h1" data-b="text" data-k="head">ИЗВЕЩЕНИЕ № 9 от 02.10.2026 &nbsp; за СЕНТЯБРЬ 2026 &nbsp; ОПЛАТИТЬ ДО 25.10.2026</div>
<table class="k" data-b="kv"><tr data-k="top1"><td>ТСЖ «Условный-9» ИНН 7700000099</td><td>Л/с 000912</td><td>{PAYER}</td><td>{ADDR}</td><td>S=39.00 м²</td></tr>
<tr data-k="top2"><td colspan="3">Задолженность / Аванс на 01.09.2026: 0.00 / 35.76</td><td colspan="2">Последний платёж: 3163.03 от 11.09.2026</td></tr></table>
{table([["Услуга","Объём","Тариф","Начислено","Льгота / субсидия","К оплате"]],rows,'t')}
<table class="k fin" data-b="kv"><tr data-k="f1"><td>Всего начислено</td><td class="num">{money(acc,"dot")}</td><td>Льготы</td><td class="num">-{money(ben,"dot")}</td></tr>
<tr data-k="f2"><td>Учтён аванс</td><td class="num">-{money(adv,"dot")}</td><td>Округление</td><td class="num">{money(rnd,"dot",minus="-")}</td></tr>
<tr class="it" data-k="f3"><td colspan="3">ИТОГО К ОПЛАТЕ</td><td class="num">{money(due,"dot")}</td></tr></table>
<p class="sm" data-b="text"><span data-r data-k="ins">Добровольное страхование квартиры — 117.00 руб. (оплачивается по желанию отдельным платежом, в итог не включено).</span><br><span data-r data-k="form">Счётчики воды: показания на 20.09.2026 — ХВС __________ ГВС __________ (заполняется плательщиком)</span></p>'''
    sem.update({"head":[I("issue_date",issue_date=T(1)),I("billing_period",billing_period=TF(1,"СЕНТЯБРЬ 2026")),I("due_date",due_date=T(1))],
                "top1":[I("provider",provider=T(1)),I("account",account=T(2)),I("address",address=T(4))],
                "top2":[I("opening_debt",opening_debt=K(1,"0.00")),I("opening_advance",opening_advance=K(1,"35.76")),I("payment_history",payment_history=K(2,"3163.03"))],
                "f1":[I("accrued_total",label=T(1),accrued_total=M(2)),I("benefit",label=T(3),benefit=M(4))],
                "f2":[I("other",label=T(1)),I("rounding",label=T(3),rounding=M(4))],
                "f3":[I("due_candidate","with_balance","excluded",label=T(1),due_candidate=M(2))],
                "ins":[I("optional_charge",name=T(1),optional_charge=K(1,"117.00"))]})
    return title, css, body, gold, {"rows":sem,"hints":{
        "f2":{"strict":False,"note":"«Учтён аванс -35.76» — повтор аванса из верхней составной ячейки; разметка opening_advance здесь И там = двойной учёт"},
        "form":{"strict":False,"acceptableRoles":["other"],"note":"пустой бланк показаний: meter_curr printed_blank, но счётчика с номером нет"}}}

def c10():
    title, css, _, gold = old10()
    a1=mul(32.4,8.12);a2=9650;acc=a1+a2;debt=305331;correct=debt+acc;printed=correct+100
    body=f'''
<div class="h" data-b="kv" data-r data-k="head"><div data-c>ООО «Газпоставка-Тест»</div><span data-c>КВИТАНЦИЯ за 09.26</span></div>
<p data-b="text"><span data-r>Абонент: {PAYER}</span><br><span data-r data-k="addr">Адрес: {ADDR}</span><br><span data-r data-k="acct">Лицевой счёт № 5500-3312-07 · Прописано: 3 чел. · Прибор учёта газа: отсутствует</span></p>
{table([["Услуга","Основание","Объём","Цена","Сумма"]],[R(["Газоснабжение (пищеприготовление)","норматив 10,8 м³/чел. × 3 чел.",'<span class="num">32,400 м³</span>','<span class="num">8,12</span>',f'<span class="num">{money(a1)}</span>'],k="svc1"),
 R(["ТО ВДГО","договор № 118-В",'<span class="num">1</span>','<span class="num">96,50</span>',f'<span class="num">{money(a2)}</span>'],k="svc2"),
 R([("Итого начислено",4),f'<span class="num">{money(acc)}</span>'],k="acc",cls="b")],'t')}
<table class="f" data-b="kv"><tr data-k="od"><td>Долг на начало месяца</td><td class="num">{money(debt)}</td></tr><tr data-k="pay"><td>Оплачено</td><td class="num">0,00</td></tr>
<tr class="b" data-k="due"><td>ИТОГО К ОПЛАТЕ</td><td class="num">{money(printed)}</td></tr></table>
<p class="sm" data-b="text" data-k="issue">Дата формирования 05.10.2026. Телефон абонентского отдела 8 (000) 000-00-01.</p>'''
    sem={"head":[I("provider",provider=T(1)),I("billing_period",billing_period=T(2))],"addr":[I("address",address=T(1))],"acct":[I("account",account=T(1))],
         "svc1":[I("service_charge",name=T(1),volume=M(3),tariff=M(4),charge=M(5))],"svc2":[I("service_charge",name=T(1),volume=M(3),tariff=M(4),charge=M(5))],
         "acc":[I("accrued_total",label=T(1),accrued_total=M(2))],"od":[I("opening_debt",label=T(1),opening_debt=M(2))],
         "pay":[I("payment",label=T(1),payment=M(2))],"due":[I("due_candidate","with_balance","excluded",label=T(1),due_candidate=M(2))],
         "issue":[I("issue_date",issue_date=T(1))]}
    return title, css, body, gold, {"rows":sem}
