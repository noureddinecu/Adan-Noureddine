import cv2, numpy as np, glob, sys, math
from multiprocessing import Pool
S=sys.argv[1]; OW,OH=1080,1920
fs=sorted(glob.glob(S+'/fr/*.png')); N=len(fs)
P=np.load(S+'/path.npy'); P[:,0]=240*np.tanh(P[:,0]/240); P[:,1]=260*np.tanh(P[:,1]/260)
BG=np.load(S+'/bg_lin.npy')
BGb=cv2.GaussianBlur(BG,(0,0),5.5)            # shallow depth of field
BGbb=cv2.GaussianBlur(BG,(0,0),40)             # for light wrap / ambient
CH,CW=BG.shape[:2]
# ---------- subject tracking for chair (smoothed)
def clean_alpha(a):
    m=(a>128).astype(np.uint8); n,lab,st,_=cv2.connectedComponentsWithStats(m,8)
    if n>1:
        keep=1+np.argmax(st[1:,cv2.CC_STAT_AREA]); km=(lab==keep).astype(np.uint8)
        km=cv2.dilate(km,np.ones((25,25),np.uint8)); a=(a*km)
    return a
def chair_anchor(a):
    a=a>128; rows=a.sum(1); top=np.argmax(rows>5)
    shoulder=min(top+int(0.42*1280*0.5),1279)
    xs=np.where(a[shoulder])[0]; cx=xs.mean() if len(xs) else 360
    return top,cx
anch=[]
for f in fs:
    a=cv2.imread(f.replace('/fr/','/alpha/'),0); anch.append(chair_anchor(a))
anch=np.array(anch,float)
k=np.ones(9)/9; anch=np.stack([np.convolve(np.pad(anch[:,j],4,mode='edge'),k,'valid') for j in range(2)],1)
# ---------- chair sprite (premium black leather, RGB piping)
def make_chair(w,h):
    m=np.zeros((h,w),np.float32)
    cv2.ellipse(m,(w//2,int(h*0.18)),(int(w*0.36),int(h*0.18)),0,180,360,1,-1,cv2.LINE_AA)
    cv2.rectangle(m,(int(w*0.14),int(h*0.18)),(int(w*0.86),h),1,-1)
    # side wings
    for s in (-1,1):
        pts=np.int32([[w//2+s*int(w*0.36),int(h*0.35)],[w//2+s*int(w*0.5),int(h*0.42)],[w//2+s*int(w*0.5),h],[w//2+s*int(w*0.36),h]])
        cv2.fillPoly(m,[pts],1,cv2.LINE_AA)
    yy,xx=np.mgrid[0:h,0:w].astype(np.float32)
    base=0.006+0.010*np.exp(-((xx-w/2)/(w*0.22))**2)+0.01*np.exp(-((xx-w*0.3)/(w*0.06))**2)        # leather sheen
    quilt=(np.abs(np.sin(yy/40))**20)*0.004
    col=np.stack([base*0.9,base*0.9,base*1.1],-1)-quilt[...,None]
    edge=m-cv2.erode(m,np.ones((9,9)))
    pip=np.zeros((h,w,3),np.float32)
    grad=(xx/w)[...,None]; pip=edge[...,None]*(np.array([1.0,0.15,0.65])*(1-grad)+np.array([0.1,0.4,1.0])*grad)*0.7
    # headrest pillow
    pm=np.zeros((h,w),np.float32); cv2.ellipse(pm,(w//2,int(h*0.16)),(int(w*0.2),int(h*0.07)),0,0,360,1,-1,cv2.LINE_AA)
    col=col*(1-pm[...,None])+pm[...,None]*np.array([0.012,0.012,0.016])
    col=col+pip+cv2.GaussianBlur(pip,(0,0),6)*0.8
    return col.astype(np.float32),cv2.GaussianBlur(m,(0,0),1.5)
CHW,CHH=820,1500; chair_rgb,chair_a=make_chair(CHW,CHH)
chair_rgb=cv2.GaussianBlur(chair_rgb,(0,0),2.0)
def paste(dst,src,sa,x,y):
    h,w=sa.shape; H,W=dst.shape[:2]
    x0,y0=max(0,x),max(0,y); x1,y1=min(W,x+w),min(H,y+h)
    if x1<=x0 or y1<=y0: return
    s=sa[y0-y:y1-y,x0-x:x1-x,None]
    dst[y0:y1,x0:x1]=dst[y0:y1,x0:x1]*(1-s)+src[y0-y:y1-y,x0-x:x1-x]*s
yy,xx=np.mgrid[0:OH,0:OW].astype(np.float32)
vign=1-0.55*(((xx-OW/2)/(OW*0.75))**2+((yy-OH/2)/(OH*0.7))**2)
vign=np.clip(vign,0.35,1)[...,None]
rng=np.random.default_rng(1)
def proc(i):
    fr=cv2.cvtColor(cv2.imread(fs[i]),cv2.COLOR_BGR2RGB)
    fr=cv2.resize(fr,(OW,OH),interpolation=cv2.INTER_LANCZOS4).astype(np.float32)/255.
    a=clean_alpha(cv2.imread(fs[i].replace('/fr/','/alpha/'),0))
    a=cv2.resize(a,(OW,OH),interpolation=cv2.INTER_CUBIC).astype(np.float32)/255.; a=np.clip((a-0.12)/0.83,0,1)
    lin=fr**2.2
    # ---- background with camera motion
    dx,dy,ang=P[i]
    cx,cy=CW/2+dx,CH/2-80+dy
    M=cv2.getRotationMatrix2D((cx,cy),math.degrees(ang),1.0)
    M[:,2]+=np.array([OW/2-cx,OH/2-cy])
    bg=cv2.warpAffine(BGb,M,(OW,OH),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT)
    amb=cv2.warpAffine(BGbb,M,(OW,OH),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT)
    bg=bg**2.2; amb=amb**2.2
    # ---- chair at subject plane
    top,cxs=anch[i]; sc=OW/720
    paste(bg,chair_rgb**1.0,chair_a,int(cxs*sc-CHW/2),int(top*sc+170))
    # contact shadow of subject on chair/wall
    sh=cv2.GaussianBlur(a,(0,0),25); sh=np.roll(sh,(18,-22),(0,1))
    bg*=(1-0.55*sh)[...,None]
    # ---- subject relight
    s=lin*0.72                                   # darker room exposure
    lum=(s@np.array([0.2126,0.7152,0.0722]))[...,None]
    s=lum+(s-lum)*0.95                            # slight desat
    s*=np.array([0.95,0.96,1.06])               # cool ambient
    s+=amb*0.06*(0.4+0.6*lum)                   # environment fill
    # monitor key-light from the right: soft directional
    ab=cv2.GaussianBlur(a,(0,0),45)
    gx=cv2.Sobel(ab,cv2.CV_32F,1,0,ksize=5); gy=cv2.Sobel(ab,cv2.CV_32F,0,1,ksize=5)
    nrm=np.sqrt(gx**2+gy**2)+1e-6
    right=np.clip(-gx/nrm,0,1); left=np.clip(gx/nrm,0,1); upw=np.clip(gy/nrm,0,1)
    xr=np.clip(xx/OW,0,1)[...,None]
    s*=1+xr*np.array([0.05,0.12,0.45])*0.6
    # rim lights (inner edge band)
    band=np.clip(a-cv2.GaussianBlur(a,(0,0),5),0,1)*a*2.2
    band=np.clip(band,0,1)
    rim=band[...,None]*(left[...,None]*np.array([1.0,0.18,0.7])+right[...,None]*np.array([0.15,0.45,1.0])+upw[...,None]*np.array([0.55,0.2,1.0])*0.8)
    s+=rim*(0.25+0.75*lum)*0.9
    # light wrap
    wrap=np.clip(1-cv2.GaussianBlur(a,(0,0),3),0,1)*a
    s=s*(1-wrap[...,None]*0.35)+bg*wrap[...,None]*0.3
    # edge despill (beige halo) -> pull edge colour toward dark
    e=(a*(1-a)*4)[...,None]; s=s*(1-0.7*e)
    out=bg*(1-a[...,None])+s*a[...,None]
    # cinematic grade
    out=out*1.15
    out=out/(1+out*0.6)                           # soft shoulder
    out=out**(1/2.2)
    lum=(out@np.array([0.2126,0.7152,0.0722]))[...,None]
    out=out+(np.array([0.0,0.02,0.05])*(1-lum)-np.array([0.0,0.01,0.02])*lum)   # teal shadows
    out=np.clip(out,0,1)*vign
    out=(out-0.5)*1.06+0.5+0.012
    g=np.random.default_rng(i).normal(0,0.012,(OH,OW,1)).astype(np.float32)
    out=np.clip(out+g*(1-lum*0.6),0,1)
    cv2.imwrite(S+'/out/%04d.png'%(i+1),cv2.cvtColor((out*255+0.5).astype(np.uint8),cv2.COLOR_RGB2BGR))
    return i
if __name__=='__main__':
    idx=[int(x) for x in sys.argv[2].split(',')] if len(sys.argv)>2 else range(N)
    with Pool(4) as p:
        for i in p.imap_unordered(proc,idx):
            if i%50==0: print(i,flush=True)
