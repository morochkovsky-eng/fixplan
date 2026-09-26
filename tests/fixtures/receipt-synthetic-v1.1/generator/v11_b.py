from lib import *
from cases_a import ADDR, PAYER
from cases_b import c04 as old04, c05 as old05, c06 as old06

def c04():
    title, css, _, gold = old04()
    L=[("Управление МКД","м²",72.40,"72,40",6.11,"6,11",0),("Содержание общего имущества","м²",72.40,"72,40",24.70,"24,70",0),
       ("Текущий ремонт","м²",72.40,"72,40",5.35,"5,35",0),("Лифты","м²",72.40,"72,40",3.48,"3,48",0),
       ("Консьержи","м²",72.40,"72,40",7.90,"7,90",-31240),("ХВС","м³",9,"9,000",59.80,"59,80",0),
       ("ГВС","м³",5,"5,000",278.90,"278,90",0),("Водоотведение","м³",14,"14,000",46.10,"46,10",0),
       ("Тепловая энергия","Гкал",0.915,"0,915000",2968.40,"2 968,40",0),("Электроэнергия ОДН (день)","кВт·ч",12.4,"12,400",7.02,"7,02",0),
       ("Электроэнергия ОДН (ночь)","кВт·ч",8.1,"8,100",2.77,"2,77",0),("Машино-место № 118","шт.",1,"1",1850.00,"1 850,00",0),
       ("Коллективная антенна","шт.",1,"1",245.00,"245,00",0)]
    rows=[];sem={};acc=0
    for i,(n,u,v,vs,t,ts,r) in enumerate(L,1):
        a=mul(v,t);acc+=a
        rows.append(R([esc(n),u,f'<span class="num">{vs}</span>',f'<span class="num">{ts}</span>',f'<span class="num">{money(a)}</span>',f'<span class="num">{money(r) if r else "—"}</span>',f'<span class="num">{money(a+r)}</span>'],k=f"svc{i}"))
        slots=dict(name=T(1),unit=T(2),volume=M(3),tariff=M(4),charge=M(5),row_total=M(7))
        if r: slots["recalculation"]=M(6)
        sem[f"svc{i}"]=[I("service_charge",**slots)]
    rec=-31240;tot=acc+rec
    rows.append(R([("Итого начислено",4),f'<span class="num">{money(acc)}</span>',f'<span class="num">{money(rec)}</span>',f'<span class="num">{money(tot)}</span>'],k="acc",cls="sub"))
    sem["acc"]=[I("accrued_total",label=T(1),accrued_total=M(2))]
    opening=1842015;pen=4518;paid=1800000;due=opening+acc+rec+pen-paid
    summ=table([["Входящее сальдо на 01.06.2026","Начислено","Перерасчёт","Пени","Поступило в июне","К оплате"]],
        [R([f'<span class="num">{money(opening)}</span>',f'<span class="num">{money(acc)}</span>',f'<span class="num">{money(rec)}</span>',f'<span class="num">{money(pen)}</span>',f'<span class="num">{money(paid)}</span>',f'<span class="num"><b>{money(due)}</b></span>'],k="summ")],'t sm')
    sem["summ"]=[I("opening_balance",opening_balance=M(1)),I("accrued_total",accrued_total=M(2)),I("recalculation",recalculation=M(3)),
                 I("penalty",penalty=M(4)),I("payment",payment=M(5)),I("due_candidate","with_balance","excluded",due_candidate=M(6))]
    qr=qr_svg(st00012("ООО УК Резиденция-Тест","7700000044","40702810000000000044","3300118","ЖКУ 06.2026","062026",due))
    body=f'''
<div class="top"><div data-b="text"><span data-r data-k="prov"><b>ООО «УК Резиденция-Тест»</b> · ЖК «Условный парк»</span><br><span data-r data-k="period">Платёжный документ за <b>июнь 2026</b> · Оплатить до 15.07.2026</span></div><div class="qr" data-b="code">{qr}</div></div>
<p data-b="text" data-k="acct">Л/с 3300118 · {PAYER} · {ADDR} · 72,40 м²</p>
<div class="cap" data-b="text">Сводка по лицевому счёту</div>{summ}
<div class="cap" data-b="text">Детализация начислений</div>
{table([["Услуга","Ед.","Объём","Тариф","Начислено","Перерасчёт","Итого"]],rows,'t')}
<p class="small" data-b="text"><span data-r>Перерасчёт по услуге «Консьержи» за апрель–май 2026 в связи с отсутствием услуги. Пени начислены на задолженность за апрель 2026.</span><br>
<span data-r data-k="hist">Оплаты в июне: 05.06.2026 — 8 500,00; 22.06.2026 — 9 500,00. Дата последнего платежа: 22.06.2026.</span></p>
<div class="cut" data-b="text">линия отреза</div>
<table class="t sm" data-b="kv"><tr data-k="due2"><td>КВИТАНЦИЯ · июнь 2026 · л/с 3300118</td><td>Итого к оплате: <b>{money(due)}</b> руб.</td></tr></table>'''
    sem.update({"prov":[I("provider",provider=T(1))],"period":[I("billing_period",billing_period=TF(1,"июнь 2026")),I("due_date",due_date=T(1))],
                "acct":[I("account",account=T(1)),I("address",address=T(1))],
                "due2":[I("billing_period",billing_period=T(1)),I("due_candidate","with_balance","excluded",due_candidate=M(2))]})
    return title, css, body, gold, {"rows":sem,"hints":{"hist":{"strict":False,"acceptableRoles":["other","payment_history"],
            "note":"две оплаты текущего периода; «последний платёж» 9 500,00 — история, сумма поступлений уже в сводке"}}}

def c05():
    title, css, _, gold = old05()
    m=[("ХВС (кухня)","19015917","03.2029","00231,418","00236,902","5,484","по показаниям"),
       ("ХВС (ванная)","19015918","11.2027","00118,230","","3,120","по среднему (показания не переданы)"),
       ("ГВС (ванная)","22400571","06.2030","00087,655","00091,106","3,451","по показаниям")]
    mrows=[R([esc(r),f'<span class="num">{n}</span>',p,f'<span class="num">{a}</span>',f'<span class="num">{b}</span>',f'<span class="num">{c}</span>',s],k=f"m{i}") for i,(r,n,p,a,b,c,s) in enumerate(m,1)]
    sem={f"m{i}":[I("meter_reading",name=T(1),meter_number=T(2),meter_prev=M(4),meter_curr=M(5),consumption=M(6))] for i in (1,2,3)}
    hvs=8.604;vo=12.055;a1=mul(hvs,55.21);a2=mul(vo,44.63);acc=a1+a2
    norm=[("Норматив потребления ХВС","м³/чел. в мес.","4,745"),("Норматив потребления ГВС","м³/чел. в мес.","3,041"),("Норматив водоотведения","м³/чел. в мес.","7,786"),("Повышающий коэффициент","","1,5")]
    for i in range(1,5): sem[f"n{i}"]=[I("normative_reference",name=T(1),normative=M(3))]
    body=f'''
<div class="head"><div class="logo" data-b="text" data-k="prov">МУП «Водоканал г. Условного»</div><div data-b="text"><span data-r>Квитанция на оплату услуг водоснабжения и водоотведения</span><br><span data-r data-k="issue">Документ № 60221 от 04.09.2026</span></div></div>
<div class="pp" data-b="text"><span data-r data-k="period">Расчётный период: <b>01.08.2026 – 31.08.2026</b> &nbsp;|&nbsp; Оплатить до: <b>20.09.2026</b></span><br><span data-r data-k="acct">Потребитель: {PAYER}, {ADDR}. Л/с 0060221-7. Зарегистрировано: 3 чел.</span></div>
<div class="sec" data-b="text">Сведения о приборах учёта</div>
{table([["Ресурс","Заводской №","Поверка до","Предыдущие","Текущие","Расход, м³","Способ расчёта"]],mrows,'t')}
<div class="sec" data-b="text">Нормативы (справочно)</div>
{table([["Показатель","Ед. изм.","Значение"]],[R([a,b,f'<span class="num">{c}</span>'],k=f"n{i}") for i,(a,b,c) in enumerate(norm,1)],'t ref')}
<div class="sec" data-b="text">Начисления</div>
{table([["Услуга","Объём, м³","Тариф, руб./м³","Сумма, руб."]],[R(["Холодное водоснабжение",'<span class="num">8,604</span>','<span class="num">55,21</span>',f'<span class="num">{money(a1)}</span>'],k="svc1"),
 R(["Водоотведение",'<span class="num">12,055</span>','<span class="num">44,63</span>',f'<span class="num">{money(a2)}</span>'],k="svc2"),
 R([("Итого начислено",3),f'<span class="num">{money(acc)}</span>'],k="acc",cls="b")],'t')}
<div class="fin" data-b="text" data-k="fin">Долг на начало периода: 0,00 &nbsp;&nbsp; Оплачено: 0,00 &nbsp;&nbsp; <b>К ОПЛАТЕ: {money(acc)} руб.</b></div>
<p class="small" data-b="text">Передать показания можно до 25 числа. Для ХВС (ванная) объём определён по среднемесячному потреблению.</p>'''
    sem.update({"prov":[I("provider",provider=T(1))],"issue":[I("issue_date",issue_date=T(1))],
                "period":[I("billing_period",billing_period=TF(1,"01.08.2026 – 31.08.2026")),I("due_date",due_date=T(1))],
                "acct":[I("address",address=T(1)),I("account",account=T(1))],
                "svc1":[I("service_charge",name=T(1),volume=M(2),tariff=M(3),charge=M(4))],
                "svc2":[I("service_charge",name=T(1),volume=M(2),tariff=M(3),charge=M(4))],
                "acc":[I("accrued_total",label=T(1),accrued_total=M(2))],
                "fin":[I("opening_debt",opening_debt=K(1,"0,00#1")),I("payment",payment=K(1,"0,00#2")),
                       I("due_candidate","with_balance","excluded",due_candidate=K(1,money(acc)))]})
    return title, css, body, gold, {"rows":sem,"hints":{"n4":{"strict":False,"acceptableRoles":["normative_reference","other"]}}}

def c06():
    title, css, _, gold = old06()
    a1=mul(0.764512,3912.44);a2=mul(5.9,34.12);a3=mul(0.354,3912.44);acc=a1+a2+a3;adv=-4120;due=acc+adv
    rows=[R([("КОММУНАЛЬНЫЕ УСЛУГИ",7)],k="sec",cls="sec"),
          R(["Отопление","Гкал",'<span class="num">0,764512</span>','<span class="num">3 912,44</span>',f'<span class="num">{money(a1)}</span>','<span class="num">0,00</span>',f'<span class="num">{money(a1)}</span>'],k="svc1"),
          R(["Горячее водоснабжение (теплоноситель)","м³",'<span class="num">5,9</span>','<span class="num">34,12</span>',f'<span class="num">{money(a2)}</span>','<span class="num">0,00</span>',f'<span class="num">{money(a2)}</span>'],k="svc2"),
          R(["Горячее водоснабжение (тепловая энергия)","Гкал",'<span class="num">0,354000</span>','<span class="num">3 912,44</span>',f'<span class="num">{money(a3)}</span>','<span class="num">0,00</span>',f'<span class="num">{money(a3)}</span>'],k="svc3"),
          R(["Итого начислено за август 2026","","","",f'<span class="num">{money(acc)}</span>','<span class="num">0,00</span>',f'<span class="num">{money(acc)}</span>'],k="acc",cls="b"),
          R(["Задолженность (+) / аванс (−) на 01.08.2026","","","","","",f'<span class="num">{money(adv)}</span>'],k="ob"),
          R(["Оплачено в августе 2026","","","","","",'<span class="num">0,00</span>'],k="pay"),
          R(["ИТОГО К ОПЛАТЕ","","","","","",f'<span class="num">{money(due)}</span>'],k="due",cls="b big")]
    sem={f"svc{i}":[I("service_charge",name=T(1),unit=T(2),volume=M(3),tariff=M(4),charge=M(5),recalculation=M(6),row_total=M(7))] for i in (1,2,3)}
    sem.update({"sec":[I("section_title")],"acc":[I("accrued_total",label=T(1),accrued_total=M(5))],
                "ob":[I("opening_balance",label=T(1),opening_balance=M(7))],"pay":[I("payment",label=T(1),payment=M(7))],
                "due":[I("due_candidate","with_balance","excluded",label=T(1),due_candidate=M(7))]})
    body=f'''
<table class="hd"><tr><td data-b="text"><b data-r data-k="prov">ПАО «Теплосеть-Столица»</b><br><span data-r>Платёжный документ (счёт) за тепловую энергию и ГВС</span></td><td data-b="text"><span data-r data-k="period">за <b>08.2026</b></span><br><span data-r data-k="duedate">Оплатить до 25.09.2026</span></td></tr></table>
<p data-b="text" data-k="acct">Номер лицевого счёта: 44 0071 5512 · {PAYER} · {ADDR}</p>
<p data-b="text" data-k="meter">Сведения о приборах учёта: ИПУ ГВС № 240118773, расход 5,9 м³ (показания переданы 23.08.2026).</p>
{table([["Вид услуги","Ед. изм.","Объём","Тариф, руб.","Начислено","Перерасчёт","Всего"]],rows,'t')}
<p class="small" data-b="text">Оплата производится без комиссии в личном кабинете. Сумма аванса учтена при формировании итога.</p>'''
    sem.update({"prov":[I("provider",provider=T(1))],"period":[I("billing_period",billing_period=T(1))],"duedate":[I("due_date",due_date=T(1))],
                "acct":[I("account",account=T(1)),I("address",address=T(1))]})
    return title, css, body, gold, {"rows":sem,"hints":{"meter":{"strict":False,"acceptableRoles":["other"],
            "note":"счётчик упомянут текстом без показаний: meter_reading требует meter_curr — создавать нельзя"}}}
