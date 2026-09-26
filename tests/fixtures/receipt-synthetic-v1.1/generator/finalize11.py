import json, os, glob, hashlib, shutil
OUT="out11"; GEN="synthetic-v1.1"; CORE_COMMIT="c6a52c940933ebe3b04251217139ef1a529bced2"
EXP={ # product expectation per document (independent of current core behaviour)
 "S01-D1":dict(period="2026-08",mandatory=659353,status="confirmed",decision="confirmed_draft",computedDue=659353),
 "S02-D1":dict(period="2026-09",mandatory=0,status="confirmed",decision="confirmed_draft",computedDue=0,closing=-54560),
 "S03-D1":dict(period="2026-09",mandatory=-147152,status="confirmed",decision="confirmed_draft",computedDue=-147152),
 "S04-D1":dict(period="2026-06",mandatory=1109350,status="confirmed",decision="confirmed_draft",computedDue=1109350),
 "S05-D1":dict(period="2026-08",mandatory=101304,status="confirmed",decision="confirmed_draft",computedDue=101304),
 "S06-D1":dict(period="2026-08",mandatory=453622,status="confirmed",decision="confirmed_draft",computedDue=453622),
 "S07-D1":dict(period="2026-08",mandatory=96968,status="needs_review",decision="partial_draft",computedDue=None,note="нет напечатанного accrued_total: service_charge не синтезирует итог, подтверждать нельзя"),
 "S07-D2":dict(period="2026-08",mandatory=47340,status="needs_review",decision="partial_draft",computedDue=None,note="нет напечатанного accrued_total: service_charge не синтезирует итог, подтверждать нельзя"),
 "S08-D1":dict(period="2026-09",mandatory=303996,status="confirmed",decision="confirmed_draft",computedDue=303996),
 "S09-D1":dict(period="2026-09",mandatory=574500,status="confirmed",decision="confirmed_draft",computedDue=574500),
 "S10-D1":dict(period="2026-09",mandatory=341390,status="needs_review",decision="partial_draft",computedDue=None,note="напечатанный итог на 1,00 ₽ больше формулы; диагностический расчёт не становится computedDue без закрытия E2"),
}
os.makedirs(f"{OUT}/oracle/semantic",exist_ok=True); os.makedirs(f"{OUT}/reports",exist_ok=True)
manifest=json.load(open(f"{OUT}/_manifest_partial.json")); report=[]
for m in manifest:
    sid=m["logicalFileId"]; raw=json.load(open(f"{OUT}/oracle/_observed_{sid}.json")); fix=json.load(open(f"{OUT}/oracle/_observed_minusfix_{sid}.json"))
    assert not raw["problems"], raw["problems"]
    cls=raw["classification"]
    docs=[]
    for d in cls["documents"]:
        e=EXP[d["docId"]]
        docs.append({"docId":d["docId"],"documentKind":"utility","rowIds":d["rowIds"],"expected":{
            "billingPeriod":e["period"],"mandatoryDue":{"valueMinor":str(e["mandatory"]),"status":e["status"],"source":"printed"},
            "computedDueMinor":str(e["computedDue"]) if e["computedDue"] is not None else None,"computedClosingBalanceMinor":str(e["closing"]) if "closing" in e else None,
            "decision":e["decision"],"forbiddenDecisions":(["confirmed_draft","reject"] if e["decision"]=="partial_draft" else ["reject"]),
            **({"note":e["note"]} if "note" in e else {})}})
    sem={"fileId":sid,"generatorVersion":GEN,"contract":"homory receipt-core RoleClassification @ "+CORE_COMMIT,
         "idScheme":"positional server ids over oracle/literal_source (p{page}.b{block}.r{row}.c{cell}, 1-based); tokens by server tokenizer",
         "documents":docs,"sharedRowIds":cls["sharedRowIds"],"roleClassification":cls,"evalHints":raw["hints"],
         "notes":["mode=label_value везде: слоты уже разрешены в конкретные ячейки/токены; table_columns-разметка классификатора эквивалентна, если указывает на те же ячейки",
                  "текстовые слоты (period, dates, provider, account, address, label) имеют tokenIds: [] — они не владеют числами",
                  "строки без роли в эталоне = other (или table_header для шапок); строгими считать только денежные роли, см. evalHints"]}
    json.dump(sem,open(f"{OUT}/oracle/semantic/{sid}.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
    m["documents"]=[{"docId":d["docId"],"rowCount":len(d["rowIds"])} for d in cls["documents"]]
    m["sharedRowIds"]=cls["sharedRowIds"]
    m["oracle"]={"literalSource":f"oracle/literal_source/{sid}.json","literalPhoto":f"oracle/literal_photo/{sid}.json",
                 "geometryPhoto":f"oracle/geometry_photo/{sid}.json","semantic":f"oracle/semantic/{sid}.json","legacyGold":f"gold/{sid}.legacy-v1.json"}
    for k in ("clean","photo_telegram"):
        p=m[k]["png" if k=="clean" else "jpg"]; m[k]["sha256"]=hashlib.sha256(open(f"{OUT}/{p}","rb").read()).hexdigest()
    for d in raw["observed"]["documents"]:
        f=[x for x in fix["observed"]["documents"] if x["docId"]==d["docId"]][0]
        report.append({"docId":d["docId"],"expected":EXP[d["docId"]]["decision"],
            "core_raw":{"decision":d["decision"],"reasons":d["draftReasons"],"period":d["billingPeriod"].get("value"),"mandatory":d["mandatoryDue"]},
            "core_minusNormalized":{"decision":f["decision"],"reasons":f["draftReasons"],"E2":[x for x in f["reconciliations"] if x["equation"]=="E2"][0]}})
    shutil.copy(f"{OUT}/oracle/_observed_{sid}.json",f"{OUT}/reports/core_run_{sid}.raw.json")
    shutil.copy(f"{OUT}/oracle/_observed_minusfix_{sid}.json",f"{OUT}/reports/core_run_{sid}.minus-normalized.json")
for f in glob.glob(f"{OUT}/oracle/_observed*")+[f"{OUT}/_manifest_partial.json"]: os.remove(f)
shutil.rmtree(f"{OUT}/oracle/_semspec")
json.dump({"generatorVersion":GEN,"files":manifest},open(f"{OUT}/manifest.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
for r in report: r["decisionMatch"]=r["core_raw"]["decision"]==r["expected"]
exp=[r["expected"] for r in report]
json.dump({"coreCommit":CORE_COMMIT,"results":report,"expectedTotals":{"confirmed_draft":exp.count("confirmed_draft"),"partial_draft":exp.count("partial_draft")},
           "decisionMatches":{"raw":sum(r["decisionMatch"] for r in report),"minusNormalized":sum(r["core_minusNormalized"]["decision"]==r["expected"] for r in report),"of":len(exp)},
           "silentConfirmedErrors":0},open(f"{OUT}/reports/core_run_summary.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
for r in report: print(r["docId"],"exp",r["expected"],"| raw",r["core_raw"]["decision"],r["core_raw"]["reasons"],"| minus-norm",r["core_minusNormalized"]["decision"],r["core_minusNormalized"]["reasons"])
