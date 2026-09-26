from decimal import Decimal as D, ROUND_HALF_UP
import segno, io, html

def kop(x):  # decimal rubles -> int kopecks
    return int((D(str(x)) * 100).quantize(D('1'), rounding=ROUND_HALF_UP))

def mul(volume, tariff):
    return int((D(str(volume)) * D(str(tariff)) * 100).quantize(D('1'), rounding=ROUND_HALF_UP))

def money(k, style='ru', minus='−', plus=False):
    neg = k < 0; k = abs(k)
    r, c = divmod(k, 100)
    if style == 'ru':
        s = f"{r:,}".replace(',', ' ') + f",{c:02d}"
    elif style == 'ru_nosep':
        s = f"{r},{c:02d}"
    elif style == 'dot':
        s = f"{r}.{c:02d}"
    if neg: s = minus + s
    elif plus and k: s = '+' + s
    return s

def esc(s): return html.escape(str(s))

def qr_svg(payload, scale=2):
    q = segno.make(payload, error='m', encoding='utf-8')
    buf = io.BytesIO()
    q.save(buf, kind='svg', scale=scale, border=2, xmldecl=False, svgns=True, nl=False)
    return buf.getvalue().decode()

def st00012(name, inn, acc, pers, purpose, period=None, total=None):
    parts = ["ST00012", f"Name={name}", f"PersonalAcc={acc}", "BankName=АО ТЕСТБАНК", "BIC=044500000",
             "CorrespAcc=30101810000000000000", f"PayeeINN={inn}", f"persAcc={pers}", f"Purpose={purpose}"]
    if period: parts.append(f"paymPeriod={period}")
    if total is not None: parts.append(f"Sum={total}")
    return "|".join(parts)

def table(headers, rows, cls='t', colgroup=None, attrs='data-b="table"'):
    h = ''
    if headers:
        for hr in headers:
            h += '<tr>' + ''.join(
                f'<th{" colspan=%d" % c[1] if isinstance(c, tuple) and c[1] > 1 else ""}{" rowspan=%d" % c[2] if isinstance(c, tuple) and len(c) > 2 else ""}>{c[0] if isinstance(c, tuple) else c}</th>'
                for c in hr) + '</tr>'
    b = ''
    for r in rows:
        rc = ''
        if isinstance(r, dict):
            rc = f' class="{r.get("cls","")}"' if r.get("cls") else ''
            if r.get("k"): rc += f' data-k="{r["k"]}"'
            r = r['cells']
        b += f'<tr{rc}>' + ''.join(
            f'<td{" colspan=%d" % c[1] if isinstance(c, tuple) else ""}>{c[0] if isinstance(c, tuple) else c}</td>'
            for c in r) + '</tr>'
    cg = ''
    if colgroup: cg = '<colgroup>' + ''.join(f'<col style="width:{w}">' for w in colgroup) + '</colgroup>'
    return f'<table class="{cls}" {attrs}>{cg}<thead>{h}</thead><tbody>{b}</tbody></table>'

def R(cells, k=None, cls=None):
    d = {"cells": cells}
    if k: d["k"] = k
    if cls: d["cls"] = cls
    return d

# semantic slot specs
def T(i): return ("T", i)          # text slot, owns no numeric tokens
def TF(i, fragment): return ("T", i, fragment) # addressable text fragment within one literal cell
def M(i): return ("M", i)          # money/number slot, owns all tokens of the cell
def K(i, raw): return ("K", i, raw) # one numeric token of the cell, matched by literal raw
def I(role, dueScope=None, optionalScope=None, **slots):
    d = {"role": role, "slots": slots}
    if dueScope: d["dueScope"] = dueScope
    if optionalScope: d["optionalScope"] = optionalScope
    return d

def page(title, css, body):
    return f'''<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title><style>
@page {{ size: A4; margin: 0; }}
* {{ box-sizing: border-box; }}
html,body {{ margin:0; background:#fff; color:#000; }}
.sheet {{ width: 210mm; padding: 9mm 10mm; margin: 0 auto; background:#fff; }}
@media print {{ .sheet {{ min-height: 297mm; }} }}
table {{ border-collapse: collapse; width: 100%; }}
.qr svg {{ display:block; }}
.num {{ text-align:right; white-space:nowrap; }}
td:has(> .num) {{ text-align:right; }}
{css}
</style></head><body><div class="sheet">{body}</div></body></html>'''

def F(state, value=None, **kw):
    d = {"state": state}
    if value is not None: d["value"] = value
    d.update(kw); return d
