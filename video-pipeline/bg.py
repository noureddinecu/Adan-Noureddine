import numpy as np, cv2, sys, math
S=sys.argv[1]
W,H=1600,2600  # canvas larger than 1080x1920 frame for camera moves
rng=np.random.default_rng(7)
yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
img=np.zeros((H,W,3),np.float32)  # linear-ish RGB 0..1
glow=np.zeros((H,W,3),np.float32)
def C(h,s=1,v=1):
    c=cv2.cvtColor(np.uint8([[[h/2,s*255,v*255]]]),cv2.COLOR_HSV2RGB)[0,0]/255.
    return c.astype(np.float32)
BLUE=np.array([0.10,0.35,1.0],np.float32); PURP=np.array([0.55,0.15,1.0],np.float32); PINK=np.array([1.0,0.15,0.65],np.float32); CYAN=np.array([0.1,0.8,1.0],np.float32)
# --- walls: back wall gradient, dark
t=yy/H
img[:]=np.stack([0.025+0.02*t,0.02+0.01*t,0.05+0.03*t],-1)
# wall acoustic panel texture (vertical slats) subtle
slat=(np.sin(xx/9.0)*0.5+0.5)**8*0.012
img+=slat[...,None]*np.array([0.6,0.5,1.0])
# floor/desk zone bottom
desk_y=1700
img[desk_y:]=np.array([0.012,0.012,0.02])
def line_glow(p0,p1,col,width=4,inten=1.0):
    m=np.zeros((H,W),np.float32); cv2.line(m,p0,p1,1.0,width,cv2.LINE_AA)
    glow[:]+=m[...,None]*col*inten
def poly_glow(pts,col,width=4,inten=1.0):
    m=np.zeros((H,W),np.float32); cv2.polylines(m,[np.int32(pts)],True,1.0,width,cv2.LINE_AA)
    glow[:]+=m[...,None]*col*inten
# --- ceiling LED strip with hue gradient (blue->purple->pink)
for x in range(0,W,4):
    f=x/W; col=BLUE*(1-f)*(f<0.5)*2*(0.5-f)+PURP*(1-abs(f-0.5)*2)+PINK*max(0,f-0.5)*2
    cv2.line(glow,(x,140),(x+4,140),tuple(float(c)*1.4 for c in col),6,cv2.LINE_AA)
# wall wash under ceiling strip
wash=np.exp(-((yy-140).clip(0))/260.0)*(yy>140)
hue=np.clip(xx/W,0,1)
washcol=np.stack([0.15+0.85*hue,0.1+0.1*(1-hue),1.0-0.4*hue],-1)
img+=wash[...,None]*washcol*0.18
# --- hexagon LED panels on left wall
def hexagon(cx,cy,r):
    return [(cx+r*math.cos(math.radians(60*k+30)),cy+r*math.sin(math.radians(60*k+30))) for k in range(6)]
r=78; dx=r*math.sqrt(3); 
hexes=[(0,0),(1,0),(0.5,1.5),(1.5,1.5),(1,3),(-0.5,1.5),(2,3)]
for i,(a,b) in enumerate(hexes):
    cx=180+a*dx; cy=420+b*r
    col=[PURP,PINK,BLUE,PURP,PINK,CYAN,BLUE][i]
    m=np.zeros((H,W),np.float32); cv2.fillPoly(m,[np.int32(hexagon(cx,cy,r-6))],1.0,cv2.LINE_AA)
    img+=m[...,None]*col*0.10
    poly_glow(hexagon(cx,cy,r-6),col,5,1.3)
# --- shelf on left with items
cv2.rectangle(img,(60,1050),(560,1068),(0.05,0.05,0.07),-1); line_glow((60,1069),(560,1069),PINK,3,1.2)
for i,x in enumerate([110,230,380]):
    h=[120,80,150][i]
    cv2.rectangle(img,(x,1050-h),(x+70,1050),(0.04,0.04,0.06),-1)
    line_glow((x,1050-h),(x+70,1050-h),[CYAN,PURP,BLUE][i],2,0.8)
# --- ultrawide curved monitor (right-centre), behind person's shoulder
mx0,mx1,my0,my1=520,1500,980,1400
cx=(mx0+mx1)/2
def curve(x): return 30*((x-cx)/((mx1-mx0)/2))**2
# screen content: neon game scene
sw,sh=mx1-mx0,my1-my0
sy,sx=np.mgrid[0:sh,0:sw].astype(np.float32)
sky=np.stack([0.05+0.5*(sx/sw)*(1-sy/sh),0.05+0.2*(1-sy/sh),0.35+0.5*(1-sy/sh)],-1)
scr=sky.copy()
# sun
sd=np.sqrt((sx-sw*0.62)**2+(sy-sh*0.45)**2); scr+=(np.exp(-sd/40)*1.2)[...,None]*np.array([1,0.4,0.6])
# city skyline
for k in range(60):
    bx=rng.integers(0,sw); bw=rng.integers(15,50); bh=rng.integers(60,int(sh*0.6))
    scr[sh-bh:,bx:bx+bw]=np.array([0.03,0.02,0.08])
    for j in range(rng.integers(2,8)):
        wy=sh-rng.integers(10,bh); scr[wy:wy+3,bx+3:bx+bw-3]=[CYAN,PINK,PURP][j%3]*0.9
# grid floor
g=((np.abs(np.sin(sx/sw*40))<0.05)|(np.abs(np.sin(sy*0.5))<0.04))&(sy>sh*0.82)
scr[g]=PINK*0.9
# HUD bars
scr[20:30,30:260]=CYAN; scr[40:48,30:180]=PINK
scr*=0.45
# warp into curved screen
for x in range(sw):
    off=int(curve(mx0+x))
    col=scr[:,x]
    y0=my0+off//2; y1=my1-off//2
    colr=cv2.resize(col[:,None,:],(1,y1-y0))[:,0,:]
    img[y0:y1,mx0+x]=colr
# bezel
for x in range(mx0-6,mx1+6):
    off=int(curve(x)); img[my0+off//2-6:my0+off//2,x]=0.02; img[my1-off//2:my1-off//2+8,x]=0.02
# screen light spill on wall & desk
spill=np.exp(-(((xx-cx)/700)**2+((yy-1190)/380)**2))
img+=spill[...,None]*np.array([0.25,0.25,0.55])*0.18
glow[my0:my1,mx0:mx1]+=img[my0:my1,mx0:mx1]*0.25
# monitor stand
cv2.rectangle(img,(int(cx)-25,my1),(int(cx)+25,desk_y),(0.03,0.03,0.04),-1)
# --- desk edge LED
line_glow((0,desk_y),(W,desk_y),BLUE,6,1.4)
img[desk_y+6:desk_y+60]=np.array([0.03,0.03,0.05])
# keyboard rgb under-glow
for i,x in enumerate(range(700,1200,10)):
    c=C((i*7)%360); cv2.rectangle(glow,(x,desk_y-28),(x+8,desk_y-14),tuple(float(v)*0.9 for v in c),-1)
# --- PC tower glass case far right
px0,px1,py0,py1=1250,1560,1150,1700
cv2.rectangle(img,(px0,py0),(px1,py1),(0.015,0.015,0.025),-1)
inner=np.zeros((H,W),np.float32); cv2.rectangle(inner,(px0+12,py0+12),(px1-12,py1-12),1.0,-1)
img+=inner[...,None]*np.array([0.06,0.03,0.12])
poly_glow([(px0,py0),(px1,py0),(px1,py1),(px0,py1)],PURP,3,0.7)
# fans
for k,fy in enumerate([py0+110,py0+270,py0+430]):
    fcx=px0+90
    for a in range(0,360,3):
        c=C((a+120*k)%360,0.9,1)
        p=(int(fcx+60*math.cos(math.radians(a))),int(fy+60*math.sin(math.radians(a))))
        cv2.circle(glow,p,5,tuple(float(v)*1.5 for v in c),-1,cv2.LINE_AA)
    fm=np.zeros((H,W),np.float32); cv2.circle(fm,(fcx,fy),52,1.0,-1,cv2.LINE_AA)
    img+=fm[...,None]*np.array([0.15,0.08,0.3])
# GPU + RAM strips
cv2.rectangle(img,(px0+170,py0+300),(px1-20,py0+360),(0.05,0.05,0.07),-1); line_glow((px0+170,py0+360),(px1-20,py0+360),CYAN,4,1.3)
for k in range(4): line_glow((px0+200+k*22,py0+60),(px0+200+k*22,py0+200),C((300-k*30)%360),8,1.2)
# --- wall neon sign-like arc top right
cv2.ellipse(glow,(1200,620),(220,220),0,200,340,tuple(float(v)*1.4 for v in PINK),6,cv2.LINE_AA)
cv2.ellipse(glow,(1200,620),(180,180),0,200,340,tuple(float(v)*1.2 for v in CYAN),4,cv2.LINE_AA)
# vertical LED bars on wall
line_glow((1020,300),(1020,880),PURP,6,1.2); line_glow((1500,300),(1500,880),BLUE,6,1.2)
# --- bokeh dots far
for k in range(70):
    p=(int(rng.integers(0,W)),int(rng.integers(200,1650))); c=[BLUE,PURP,PINK,CYAN][k%4]
    cv2.circle(glow,p,int(rng.integers(2,5)),tuple(float(v)*rng.uniform(0.3,0.8) for v in c),-1,cv2.LINE_AA)
# --- bloom
bloom=sum(cv2.GaussianBlur(glow,(0,0),s)*w for s,w in [(4,0.9),(15,0.7),(45,0.5),(120,0.35)])
out=img+glow+bloom
# filmic tonemap
out=1-np.exp(-out*1.6)
np.save(S+'/bg_lin.npy',out.astype(np.float32))
cv2.imwrite(S+'/bg_sharp.png',cv2.cvtColor((out**(1/1.1)*255).clip(0,255).astype(np.uint8),cv2.COLOR_RGB2BGR))
