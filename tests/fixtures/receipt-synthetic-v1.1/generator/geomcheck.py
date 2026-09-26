import json, numpy as np, sys
from PIL import Image, ImageDraw
from scipy import ndimage
def check(sid, M, n=25):
    g=json.load(open(f"out11/oracle/geometry_photo/{sid}.json")); p=g["params"]
    W,H=p["clean_size"]; pad=p["pad_px"]; w,h=p["canvas_size"]
    rng=np.random.default_rng(1); d=[]
    for _ in range(n):
        x,y=rng.uniform(40,W-40),rng.uniform(40,H-40)
        im=Image.new("L",(W,H),0); ImageDraw.Draw(im).ellipse([x-6,y-6,x+6,y+6],fill=255)
        bg=Image.new("L",(w,h),0); bg.paste(im,(pad,pad))
        t=bg.transform((w,h),Image.PERSPECTIVE,p["perspective_coeffs_out_to_in"],resample=Image.BICUBIC)
        t=t.rotate(p["rotate_deg_ccw"],resample=Image.BICUBIC,expand=False).resize(tuple(p["resize_to"]),Image.LANCZOS)
        cy,cx=ndimage.center_of_mass(np.asarray(t,float))
        # ellipse drawn on integer grid: its true centre is (x,y) in pixel-edge coords shifted by +0.5 (PIL ellipse bbox is inclusive)
        v=M@np.array([x,y,1]); d.append((v[0]/v[2]-cx, v[1]/v[2]-cy))
    return np.array(d)
if __name__=="__main__":
    for sid in ("S01","S09"):
        M=np.array(json.load(open(f"out11/oracle/geometry_photo/{sid}.json"))["homography_clean_px_to_photo_px"])
        d=check(sid,M); print(sid,"mean signed dx,dy:",d.mean(0).round(3),"std:",d.std(0).round(3))
