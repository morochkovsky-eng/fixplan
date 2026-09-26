"""synthetic-v1.1 build: renders + literal oracle + photo geometry + semantic spec.
Reproduce: python3 build11.py  (then: node resolve_semantics.mjs)"""
import json, os, random, shutil, math, hashlib
from PIL import Image, ImageFilter, ImageEnhance
import numpy as np
from playwright.sync_api import sync_playwright
from lib import page
import v11_a, v11_b, v11_c

GEN_VERSION = "synthetic-v1.1"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out11"); shutil.rmtree(OUT, ignore_errors=True)
for d in ("html","png_clean","photo_telegram","oracle/literal_source","oracle/literal_photo","oracle/geometry_photo","oracle/_semspec","gold"):
    os.makedirs(f"{OUT}/{d}")
CASES=[v11_a.c01,v11_a.c02,v11_a.c03,v11_b.c04,v11_b.c05,v11_b.c06,v11_c.c07,v11_c.c08,v11_c.c09,v11_c.c10]
PHOTO_SEED_BASE = 1000
DEVICE_SCALE = 2

EXTRACT_JS = r"""() => {
  const sheet = document.querySelector('.sheet').getBoundingClientRect();
  const nb = r => ({x:(r.left-sheet.left)/sheet.width, y:(r.top-sheet.top)/sheet.height, width:r.width/sheet.width, height:r.height/sheet.height});
  const txt = el => (el.innerText || '').replace(/\u00a0/g,' ').split('\n').map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s.length).join('\n');
  const blocks = [];
  for (const b of document.querySelectorAll('[data-b]')) {
    const layout = b.dataset.b;
    let rowEls;
    if (b.tagName === 'TABLE') rowEls = [...b.querySelectorAll(':scope > thead > tr, :scope > tbody > tr')];
    else if (b.matches('[data-r]')) rowEls = [b];
    else { rowEls = [...b.querySelectorAll('[data-r]')]; if (!rowEls.length) rowEls = [b]; }
    const rows = rowEls.map(r => {
      let cellEls;
      if (r.tagName === 'TR') cellEls = [...r.children].filter(c => c.tagName==='TD' || c.tagName==='TH');
      else { cellEls = [...r.querySelectorAll('[data-c]')]; if (!cellEls.length) cellEls = [r]; }
      const inHead = !!r.closest('thead');
      return { key: r.dataset.k || (rowEls.length===1 ? b.dataset.k : undefined) || null,
        cells: cellEls.map(c => {
          const t = layout === 'code' ? '' : txt(c);
          const cell = { text: t, state: (t === '' && layout !== 'code') ? 'blank' : 'ok', bbox: nb(c.getBoundingClientRect()) };
          const cs = parseInt(c.getAttribute('colspan')||'1'), rs = parseInt(c.getAttribute('rowspan')||'1');
          if (cs > 1) cell.colSpan = cs; if (rs > 1) cell.rowSpan = rs;
          if (c.tagName === 'TH' || inHead) cell.isHeader = true;
          return cell; }) };
    });
    const docEl = b.closest('[data-doc]');
    blocks.push({ layout, bbox: nb(b.getBoundingClientRect()), doc: docEl ? docEl.dataset.doc : null, rows });
  }
  return { sheetCss: {width: sheet.width, height: sheet.height}, blocks };
}"""

def pil_rotate_inverse_matrix(w, h, angle):
    # replicates PIL.Image.rotate(angle, expand=False) internal output->input affine
    center = [w/2, h/2]; a = -math.radians(angle % 360.0)
    m = [round(math.cos(a),15), round(math.sin(a),15), 0.0, round(-math.sin(a),15), round(math.cos(a),15), 0.0]
    tx, ty = m[0]*(-center[0]) + m[1]*(-center[1]) + m[2], m[3]*(-center[0]) + m[4]*(-center[1]) + m[5]
    m[2], m[5] = tx + center[0], ty + center[1]
    return np.array([[m[0],m[1],m[2]],[m[3],m[4],m[5]],[0,0,1]], float)

def photo(src, dst, seed):
    """Identical random stream to v1; additionally returns forward geometry clean-px -> final-JPEG-px."""
    rnd=random.Random(seed); im=Image.open(src).convert("RGB")
    W,H=im.size; pad=int(W*0.05)
    bg=Image.new("RGB",(W+2*pad,H+2*pad),tuple(rnd.randint(95,150) for _ in range(3)))
    bg.paste(im,(pad,pad))
    w,h=bg.size
    def coeffs(dst_pts, src_pts):
        A=[];B=[]
        for (x,y),(X,Y) in zip(dst_pts,src_pts):
            A.append([x,y,1,0,0,0,-X*x,-X*y]);B.append(X)
            A.append([0,0,0,x,y,1,-Y*x,-Y*y]);B.append(Y)
        return np.linalg.solve(np.array(A,float),np.array(B,float)).tolist()
    j=lambda: rnd.uniform(-0.03,0.03)*w
    src=[(pad*0.5,pad*0.5),(w-pad*0.5,pad*0.5),(w-pad*0.5,h-pad*0.5),(pad*0.5,h-pad*0.5)]
    dpts=[(x+j(),y+j()) for x,y in src]
    pc=coeffs(dpts,src)
    im=bg.transform((w,h),Image.PERSPECTIVE,pc,resample=Image.BICUBIC,fillcolor=bg.getpixel((2,2)))
    angle=rnd.uniform(-3,3)
    im=im.rotate(angle,resample=Image.BICUBIC,expand=False,fillcolor=bg.getpixel((2,2)))
    a=np.asarray(im).astype(np.float32); yy,xx=np.mgrid[0:h,0:w]
    cx,cy=rnd.uniform(0.2,0.8)*w,rnd.uniform(0.2,0.8)*h
    light=1.08-0.35*(((xx-cx)/w)**2+((yy-cy)/h)**2)
    if rnd.random()<0.6:
        light*=np.where((xx*rnd.uniform(0.3,1.0)+yy) > rnd.uniform(0.9,1.4)*h, rnd.uniform(0.72,0.85), 1.0)
    a=a*light[...,None]
    tint=np.array([rnd.uniform(0.95,1.05),rnd.uniform(0.95,1.03),rnd.uniform(0.85,0.98)]); a=a*tint
    a+=np.random.default_rng(seed).normal(0,rnd.uniform(3,7),a.shape)
    im=Image.fromarray(np.clip(a,0,255).astype(np.uint8))
    im=im.filter(ImageFilter.GaussianBlur(rnd.uniform(0.5,1.1)))
    im=ImageEnhance.Contrast(im).enhance(rnd.uniform(0.85,1.05))
    im.thumbnail((1280,1280))
    fw,fh=im.size
    q=rnd.randint(62,78)
    im.save(dst,"JPEG",quality=q)
    T_pad=np.array([[1,0,pad],[0,1,pad],[0,0,1]],float)
    P_out2in=np.array([[pc[0],pc[1],pc[2]],[pc[3],pc[4],pc[5]],[pc[6],pc[7],1]],float)
    R_out2in=pil_rotate_inverse_matrix(w,h,angle)
    S=np.array([[fw/w,0,0],[0,fh/h,0],[0,0,1]],float)
    M=S @ np.linalg.inv(R_out2in) @ np.linalg.inv(P_out2in) @ T_pad   # clean px -> final px (homography)
    M=M/M[2,2]
    params={"seed":seed,"clean_size":[W,H],"pad_px":pad,"canvas_size":[w,h],"perspective_coeffs_out_to_in":pc,
            "perspective_src_corners":src,"perspective_dst_corners":dpts,"rotate_deg_ccw":angle,"rotate_center":[w/2,h/2],
            "resize_to":[fw,fh],"jpeg_quality":q}
    return M, params, (fw,fh)

def apply(M, x, y):
    v=M@np.array([x,y,1.0]); return v[0]/v[2], v[1]/v[2]

manifest=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":794,"height":1123},device_scale_factor=DEVICE_SCALE)
    for i,fn in enumerate(CASES,1):
        title,css,body,gold,sem=fn(); sid=f"S{i:02d}"
        html=page(f"Квитанция {sid}",css,body)
        hp=f"{OUT}/html/{sid}.html"; open(hp,"w",encoding="utf-8").write(html)
        pg.goto("file://"+hp); pg.wait_for_timeout(150)
        pp=f"{OUT}/png_clean/{sid}.png"; pg.locator(".sheet").screenshot(path=pp)
        ext=pg.evaluate(EXTRACT_JS)
        W,H=Image.open(pp).size
        M,params,(fw,fh)=photo(pp,f"{OUT}/photo_telegram/{sid}.jpg",PHOTO_SEED_BASE+i)
        # --- literal source (clean) in VisualDocumentInput format
        def strip(block, bbox_fn):
            return {"layout":block["layout"],"bbox":bbox_fn(block["bbox"]),
                    "rows":[{"cells":[{k:v for k,v in {**c,"bbox":bbox_fn(c["bbox"])}.items()} for c in r["cells"]]} for r in block["rows"]]}
        ident=lambda bb: {k:round(v,6) for k,v in bb.items()}
        src_doc={"readable":True,"pages":[{"width":W,"height":H,"blocks":[strip(bl,ident) for bl in ext["blocks"]]}]}
        # --- photo transform: quads + enclosing axis-aligned bbox, normalized to final JPEG
        quads=[]; clipped=0
        def tbox(bb, collect=None):
            pts=[(bb["x"]*W,bb["y"]*H),((bb["x"]+bb["width"])*W,bb["y"]*H),((bb["x"]+bb["width"])*W,(bb["y"]+bb["height"])*H),(bb["x"]*W,(bb["y"]+bb["height"])*H)]
            t=[apply(M,x,y) for x,y in pts]; xs=[q[0] for q in t]; ys=[q[1] for q in t]
            out={"x":min(xs)/fw,"y":min(ys)/fh,"width":(max(xs)-min(xs))/fw,"height":(max(ys)-min(ys))/fh}
            if collect is not None: collect.append([[round(x/fw,6),round(y/fh,6)] for x,y in t])
            return {k:round(v,6) for k,v in out.items()}
        pblocks=[]
        for bi,bl in enumerate(ext["blocks"],1):
            bq=[]; bb=tbox(bl["bbox"],bq); rows=[]
            for ri,r in enumerate(bl["rows"],1):
                cells=[]
                for ci,c in enumerate(r["cells"],1):
                    cq=[]; cb=tbox(c["bbox"],cq)
                    inside=all(0<=x<=1 and 0<=y<=1 for x,y in cq[0])
                    if not inside: clipped+=1
                    quads.append({"cellId":f"p1.b{bi}.r{ri}.c{ci}","quad":cq[0],"fullyInsideImage":inside})
                    cells.append({**{k:v for k,v in c.items() if k!="bbox"},"bbox":cb})
                rows.append({"cells":cells})
            pblocks.append({"layout":bl["layout"],"bbox":bb,"rows":rows})
        photo_doc={"readable":True,"pages":[{"width":fw,"height":fh,"blocks":pblocks}]}
        for path,obj in ((f"oracle/literal_source/{sid}.json",src_doc),(f"oracle/literal_photo/{sid}.json",photo_doc)):
            json.dump(obj,open(f"{OUT}/{path}","w",encoding="utf-8"),ensure_ascii=False,indent=1)
        json.dump({"fileId":f"{sid}-photo","coordinateSpace":"final JPEG pixels / normalized [0,1]","homography_clean_px_to_photo_px":M.round(10).tolist(),
                   "params":params,"cellQuads":quads,"cellsNotFullyInside":clipped,
                   "note":"bbox в literal_photo — описанный прямоугольник вокруг четырёхугольника; точная форма — cellQuads"},
                  open(f"{OUT}/oracle/geometry_photo/{sid}.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
        # --- semantic spec keyed by positional row ids (resolved to token ids by node)
        rowspec=[]
        for bi,bl in enumerate(ext["blocks"],1):
            for ri,r in enumerate(bl["rows"],1):
                rowspec.append({"rowId":f"p1.b{bi}.r{ri}","key":r["key"],"doc":bl["doc"],"isHeaderRow":all(c.get("isHeader") for c in r["cells"])})
        keys=[r["key"] for r in rowspec if r["key"]]; assert len(keys)==len(set(keys)), (sid,"duplicate keys")
        missing=set(sem["rows"])-set(keys); assert not missing, (sid,"sem keys not in DOM",missing)
        json.dump({"caseId":sid,"rows":rowspec,"sem":sem,"multiDoc":sem.get("multiDoc",False)},open(f"{OUT}/oracle/_semspec/{sid}.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
        json.dump(gold,open(f"{OUT}/gold/{sid}.legacy-v1.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
        manifest.append({"logicalFileId":sid,"title":title,"clean":{"html":f"html/{sid}.html","png":f"png_clean/{sid}.png","size":[W,H]},
                         "photo_telegram":{"jpg":f"photo_telegram/{sid}.jpg","size":[fw,fh],"seed":PHOTO_SEED_BASE+i},"clippedCells":clipped})
        print(sid,"blocks",len(ext["blocks"]),"rows",len(rowspec),"clipped",clipped)
    b.close()
json.dump(manifest,open(f"{OUT}/_manifest_partial.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
