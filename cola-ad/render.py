import numpy as np, cv2, math, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W,H,FPS=1080,1920,30; DUR=10.6; N=int(DUR*FPS)
R=ImageFont.Layout.RAQM
def F(name,size): return ImageFont.truetype('fonts/'+name,size,layout_engine=R)
CAN=Image.open('can_cut.png').convert('RGBA'); CW,CH=CAN.size
OPEN=(390-0,150)  # opening in cutout coords (approx)
rng=np.random.default_rng(3)
def clamp(x,a=0,b=1): return max(a,min(b,x))
def seg(t,a,b): return clamp((t-a)/(b-a))
def eo(x): return 1-(1-x)**3
def eio(x): return 3*x*x-2*x*x*x
def back(x,s=1.7): x=x-1; return 1+(s+1)*x**3+s*x**2
# ---------- background
yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
rad=np.sqrt(((xx-W/2)/W)**2+((yy-H*0.42)/H)**2)
BASE=np.stack([0.80-1.1*rad,0.02+0.0*rad,0.06-0.05*rad],-1).clip(0.03,1)
BASE[...,0]=np.clip(BASE[...,0],0.12,1); BASE=(BASE*255)
ang=np.arctan2(yy-H*0.42,xx-W/2)
def background(t):
    rays=(np.cos(ang*12+t*0.6)*0.5+0.5)**6*np.exp(-rad*2.2)*55
    b=BASE.copy(); b[...,0]+=rays; b[...,1]+=rays*0.35; b[...,2]+=rays*0.3
    return Image.fromarray(np.clip(b,0,255).astype(np.uint8)).convert('RGBA')
BUB=[(rng.uniform(0,W),rng.uniform(0,H),rng.uniform(4,16),rng.uniform(40,120)) for _ in range(45)]
def bokeh(img,t):
    d=ImageDraw.Draw(img,'RGBA')
    for x,y,r,v in BUB:
        yy_=(y-v*t*2)%(H+60)-30; xx_=x+12*math.sin(t*2+y)
        d.ellipse((xx_-r,yy_-r,xx_+r,yy_+r),outline=(255,255,255,70),width=2)
        d.ellipse((xx_-r*0.5,yy_-r*0.6,xx_-r*0.1,yy_-r*0.2),fill=(255,255,255,90))
# ---------- text helpers
TC={}
def text_img(txt,font,size,fill=(255,255,255),stroke=0,sc=(120,0,0),shadow=True,rtl=True):
    k=(txt,font,size,fill,stroke)
    if k in TC: return TC[k]
    f=F(font,size); d0=ImageDraw.Draw(Image.new('RGBA',(1,1)))
    kw=dict(font=f,stroke_width=stroke); 
    if rtl: kw['direction']='rtl'
    bb=d0.textbbox((0,0),txt,**kw); w,h=bb[2]-bb[0]+60,bb[3]-bb[1]+60
    im=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(im)
    if shadow:
        sh=Image.new('RGBA',(w,h),(0,0,0,0)); ImageDraw.Draw(sh).text((30-bb[0]+6,30-bb[1]+8),txt,fill=(0,0,0,150),stroke_fill=(0,0,0,150),**kw)
        im=Image.alpha_composite(im,sh.filter(ImageFilter.GaussianBlur(6))); d=ImageDraw.Draw(im)
    d.text((30-bb[0],30-bb[1]),txt,fill=fill,stroke_fill=sc,**kw)
    TC[k]=im; return im
def put(canvas,im,cx,cy,scale=1.0,alpha=1.0,rot=0):
    if scale<=0.01 or alpha<=0.01: return
    w,h=im.size; im2=im.resize((max(1,int(w*scale)),max(1,int(h*scale))),Image.LANCZOS)
    if rot: im2=im2.rotate(rot,resample=Image.BICUBIC,expand=True)
    if alpha<1:
        a=im2.split()[-1].point(lambda v:int(v*alpha)); im2.putalpha(a)
    canvas.alpha_composite(im2,(int(cx-im2.size[0]/2),int(cy-im2.size[1]/2)))
def pop(t,t0,dur=0.35): return back(seg(t,t0,t0+dur)) if t>=t0 else 0
# ---------- can
def can_shadow(canvas,cx,cy,s,alpha=1):
    sh=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(sh)
    w=CW*s*0.55; d.ellipse((cx-w,cy-18*s*3,cx+w,cy+18*s*3),fill=(0,0,0,int(140*alpha)))
    canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(25)))
def put_can(canvas,cx,cy,s,rot=0,glow=True):
    im=CAN.resize((int(CW*s),int(CH*s)),Image.LANCZOS)
    if glow:
        g=Image.new('RGBA',im.size,(255,210,160,0)); g.putalpha(im.split()[-1].point(lambda v:int(v*0.55)))
        pad=60; gg=Image.new('RGBA',(im.size[0]+2*pad,im.size[1]+2*pad),(0,0,0,0)); gg.alpha_composite(g,(pad,pad))
        gg=gg.filter(ImageFilter.GaussianBlur(28))
        if rot: gg=gg.rotate(rot,resample=Image.BICUBIC,expand=True)
        canvas.alpha_composite(gg,(int(cx-gg.size[0]/2),int(cy-gg.size[1]/2)))
    if rot: im=im.rotate(rot,resample=Image.BICUBIC,expand=True)
    canvas.alpha_composite(im,(int(cx-im.size[0]/2),int(cy-im.size[1]/2)))
def can_open_pt(cx,cy,s,rot):
    ox,oy=(OPEN[0]-CW/2)*s,(OPEN[1]-CH/2)*s; th=math.radians(rot)
    return cx+ox*math.cos(th)+oy*math.sin(th), cy-ox*math.sin(th)+oy*math.cos(th)
# ---------- glass
GX,GB,GH,GTW,GBW=470,1560,560,350,270
def glass_x(y):  # half width at y
    f=(GB-y)/GH; return (GBW+(GTW-GBW)*f)/2
ICE=[(-55,0.62,20),(50,0.70,-15),(-5,0.80,8)]
def draw_glass(canvas,fill,t,alpha=1.0,dx=0,dy=0,splash=0):
    L=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(L,'RGBA')
    top=GB-GH
    # back rim
    d.ellipse((GX-GTW/2+dx,top-22+dy,GX+GTW/2+dx,top+22+dy),outline=(255,255,255,90),width=4)
    if fill>0.01:
        ly=GB-GH*0.95*fill
        pts=[]
        for y in np.linspace(ly,GB-14,30): pts.append((GX-glass_x(y)+8+dx,y+dy))
        for y in np.linspace(GB-14,ly,30): pts.append((GX+glass_x(y)-8+dx,y+dy))
        liq=Image.new('RGBA',(W,H),(0,0,0,0)); dl=ImageDraw.Draw(liq)
        dl.polygon(pts,fill=(45,8,3,248))
        dl.ellipse((GX-GBW/2+8+dx,GB-30+dy,GX+GBW/2-8+dx,GB+2+dy),fill=(45,8,3,248))
        # inner gradient glow (light through cola)
        arr=np.array(liq).astype(np.float32)
        gl=np.exp(-(((xx-GX-dx-60)/120)**2+((yy-(ly+GB)/2-dy)/((GB-ly)/1.6+1))**2))
        arr[...,0]+=gl*55*(arr[...,3]>0); arr[...,1]+=gl*12*(arr[...,3]>0)
        liq=Image.fromarray(np.clip(arr,0,255).astype(np.uint8))
        L.alpha_composite(liq); d=ImageDraw.Draw(L,'RGBA')
        hw=glass_x(ly)-8
        # ice
        for ix,fl,rot in ICE:
            if fill>fl-0.25:
                iy=ly+40+6*math.sin(t*3+ix); cube=Image.new('RGBA',(110,100),(0,0,0,0)); dc=ImageDraw.Draw(cube)
                dc.rounded_rectangle((5,5,105,95),18,fill=(255,235,230,95),outline=(255,255,255,170),width=3)
                dc.line((25,25,60,20),fill=(255,255,255,200),width=5)
                cube=cube.rotate(rot+5*math.sin(t*2+ix),expand=True,resample=Image.BICUBIC)
                L.alpha_composite(cube,(int(GX+ix-cube.size[0]/2+dx),int(iy-cube.size[1]/2+dy)))
        # foam
        fh=10+28*clamp(fill*1.4)
        d.ellipse((GX-hw+dx,ly-fh*0.6+dy,GX+hw+dx,ly+fh*0.6+dy),fill=(196,140,95,235))
        for k in range(26):
            bx=GX-hw+18+(k*37.3%(2*hw-36)); by=ly+3*math.sin(k+t*5)
            r=5+k%4*2; d.ellipse((bx-r+dx,by-r-4+dy,bx+r+dx,by+r-4+dy),fill=(235,200,165,230))
        # bubbles
        for k in range(40):
            bx=GX+((k*53)%int(2*hw-40))-hw+20; sp=60+(k*17)%90
            by=GB-20-((t*sp+k*41)%max(1,(GB-ly-30)))
            r=2+k%3; d.ellipse((bx-r+dx,by-r+dy,bx+r+dx,by+r+dy),outline=(255,220,190,170),width=1)
    # glass body
    pts=[(GX-GTW/2+dx,top+dy),(GX-GBW/2+dx,GB+dy),(GX+GBW/2+dx,GB+dy),(GX+GTW/2+dx,top+dy)]
    d.line(pts,fill=(255,255,255,150),width=6,joint='curve')
    d.ellipse((GX-GBW/2+dx,GB-22+dy,GX+GBW/2+dx,GB+22+dy),outline=(255,255,255,120),width=5)
    d.ellipse((GX-GTW/2+dx,top-22+dy,GX+GTW/2+dx,top+22+dy),outline=(255,255,255,200),width=5)
    # highlights
    d.line((GX-GTW/2+40+dx,top+50+dy,GX-GBW/2+32+dx,GB-50+dy),fill=(255,255,255,120),width=14)
    d.line((GX+GTW/2-45+dx,top+70+dy,GX+GBW/2-38+dx,GB-80+dy),fill=(255,255,255,60),width=6)
    if alpha<1: L.putalpha(L.split()[-1].point(lambda v:int(v*alpha)))
    sh=Image.new('RGBA',(W,H),(0,0,0,0)); ImageDraw.Draw(sh).ellipse((GX-GBW/2-30+dx,GB-10+dy,GX+GBW/2+30+dx,GB+40+dy),fill=(0,0,0,int(120*alpha)))
    canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(18))); canvas.alpha_composite(L)
def draw_stream(canvas,p0,surf_y,t,width=26,cut=0.0):
    # parabola from p0 to glass center at surf_y
    x0,y0=p0; x1=GX+20
    pts=[]
    for u in np.linspace(cut,1,40):
        x=x0+(x1-x0)*(1-(1-u)**2); y=y0+(surf_y-y0)*u**1.6
        pts.append((x+3*math.sin(t*20+u*9),y))
    L=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(L)
    for i in range(len(pts)-1):
        w=int(width*(1-0.35*i/len(pts)))
        d.line([pts[i],pts[i+1]],fill=(80,14,5,250),width=w)
    for i in range(len(pts)-1):
        d.line([(pts[i][0]-width*0.2,pts[i][1]),(pts[i+1][0]-width*0.2,pts[i+1][1])],fill=(200,90,50,170),width=4)
    # splash droplets
    if cut<0.95:
        for k in range(10):
            a=(k/10)*math.pi; r=20+((t*90+k*13)%40)
            d.ellipse((x1+r*math.cos(a)*1.4-4,surf_y-r*math.sin(a)*0.8-4,x1+r*math.cos(a)*1.4+4,surf_y-r*math.sin(a)*0.8+4),fill=(110,30,10,200))
    canvas.alpha_composite(L)
def badge(text1,text2,r,col=(255,205,0)):
    S=2*r+40; im=Image.new('RGBA',(S,S),(0,0,0,0)); d=ImageDraw.Draw(im)
    pts=[]; 
    for k in range(48):
        rr=r if k%2==0 else r*0.88; a=k*math.pi/24
        pts.append((S/2+rr*math.cos(a),S/2+rr*math.sin(a)))
    d.polygon(pts,fill=col); d.ellipse((S/2-r*0.78,S/2-r*0.78,S/2+r*0.78,S/2+r*0.78),outline=(160,0,0),width=6)
    t1=text_img(text1,'cairo-700.ttf',int(r*0.28),fill=(150,0,0),shadow=False)
    t2=text_img(text2,'lalezar-400.ttf',int(r*0.55),fill=(170,0,0),shadow=False)
    im.alpha_composite(t1,(int(S/2-t1.size[0]/2),int(S/2-r*0.52-t1.size[1]/2+10)))
    im.alpha_composite(t2,(int(S/2-t2.size[0]/2),int(S/2+r*0.12-t2.size[1]/2)))
    return im
B5=badge('غير ب','5 دراهم',230)
B12=badge('3 ب','12 درهم',190,(255,255,255))
def flash(canvas,a):
    if a>0: canvas.alpha_composite(Image.new('RGBA',(W,H),(255,255,255,int(255*a))))
# ---------- scenes
def frame(i):
    t=i/FPS; c=background(t); bokeh(c,t)
    if t<1.55:   # S1 hero
        p=eo(seg(t,0,0.7)); s=0.55+0.33*back(seg(t,0,0.7)); cy=1120+400*(1-p)
        can_shadow(c,W/2,cy+CH*s/2-20,s,p); put_can(c,W/2,cy,s,rot=8*(1-p)+2*math.sin(t*3))
        put(c,text_img('فريواي كولا','lalezar-400.ttf',190,stroke=6),W/2,330,pop(t,0.25),1)
        put(c,text_img('Freeway Cola','cairo-700.ttf',80,fill=(255,225,200),rtl=False),W/2,500,pop(t,0.45),1)
        flash(c,max(0,1-t/0.25)*0.8)
    elif t<5.45: # S2 pour + S3 price
        u=t-1.55
        tilt=eio(seg(u,0,0.45))*(1-eio(seg(u,1.85,2.25)))
        rot=112*tilt
        pos_pour=(800,650); pos_end=(845,1230)
        mv=eio(seg(u,0,0.45)); back_=eio(seg(u,1.85,2.3))
        cx=W/2+(pos_pour[0]-W/2)*mv; cy=1120+(pos_pour[1]-1120)*mv
        cx=cx+(pos_end[0]-cx)*back_; cy=cy+(pos_end[1]-cy)*back_
        s=0.88+(0.58-0.88)*mv; s=s+(0.5-s)*back_
        fill=eio(seg(u,0.5,1.95))*0.88
        gin=eo(seg(u,0,0.4))
        draw_glass(c,fill,t,alpha=gin,dy=300*(1-gin))
        if 0.45<u<2.15:
            surf=GB-GH*0.95*max(fill,0.02)
            cut=seg(u,1.85,2.15)
            draw_stream(c,can_open_pt(cx,cy,s,rot),surf,t,cut=cut)
        if back_>0: can_shadow(c,cx,cy+CH*s/2-15,s,back_)
        put_can(c,cx,cy,s,rot=rot)
        put(c,text_img('باردة ومنعشة','lalezar-400.ttf',160,stroke=5),W/2,300,pop(t,1.65)*(1-seg(t,3.25,3.45)),1)
        if t>=3.35:
            put(c,B5,W/2,360,pop(t,3.38,0.45),1,rot=-8+3*math.sin(t*4))
    elif t<9.2:  # S4 offer
        u=t-5.45
        put(c,text_img('وإلا خديتي 3','lalezar-400.ttf',170,stroke=6),W/2,250,pop(t,5.45),1)
        xs=[250,540,830]
        for k,x in enumerate(xs):
            pk=pop(t,5.6+k*0.18,0.4)
            if pk>0:
                cy=1060+30*math.sin(t*3+k)
                can_shadow(c,x,cy+CH*0.5/2,0.5*pk,pk); put_can(c,x,cy,0.5*pk,rot=(-6+6*k)*pk)
        put(c,text_img('الوحدة غير ب','cairo-700.ttf',96,stroke=4),W/2,1420,pop(t,6.6),1)
        # old price struck, new price
        po=pop(t,6.9); put(c,text_img('5 دراهم','lalezar-400.ttf',100,fill=(255,200,200)),W/2,1560,po,1)
        if t>7.25:
            L=Image.new('RGBA',(W,H),(0,0,0,0)); ImageDraw.Draw(L).line((W/2-140,1590,W/2-140+280*eo(seg(t,7.25,7.5)),1590-50*eo(seg(t,7.25,7.5))),fill=(255,230,0,255),width=12); c.alpha_composite(L)
        put(c,text_img('4 دراهم','lalezar-400.ttf',190,fill=(255,225,0),stroke=6,sc=(140,0,0)),W/2,1745,pop(t,7.55,0.45)*(1+0.05*math.sin(t*8)),1)
        put(c,B12,880,520,pop(t,7.9),1,rot=10)
        flash(c,max(0,1-(t-5.45)/0.2)*0.6)
    else:        # S5 CTA
        u=t-9.2
        for k,x in enumerate([300,540,780]):
            put_can(c,x,1000+(-40 if k==1 else 0),0.40 if k!=1 else 0.48,rot=(-10+10*k))
        draw_glass(c,0.88,t,dx=-330,dy=-80,alpha=0) if False else None
        put(c,text_img('سربي!','lalezar-400.ttf',260,fill=(255,225,0),stroke=8,sc=(140,0,0)),W/2,330,pop(t,9.2)*(1+0.06*math.sin(t*10)),1)
        put(c,text_img('العرض محدود','cairo-700.ttf',90,stroke=3),W/2,540,pop(t,9.45),1)
        put(c,text_img('Freeway Cola  ·  5 DH  ·  3 = 12 DH','cairo-700.ttf',58,fill=(255,230,210),rtl=False),W/2,1600,pop(t,9.6),1)
        flash(c,max(0,1-u/0.2)*0.6)
    # vignette + fade out
    arr=np.asarray(c.convert('RGB')).astype(np.float32)
    v=np.clip(1-0.45*(((xx-W/2)/(W*0.8))**2+((yy-H/2)/(H*0.75))**2),0.5,1)[...,None]
    arr*=v; arr*=1-seg(t,DUR-0.3,DUR)
    Image.fromarray(arr.astype(np.uint8)).save('frames/%04d.png'%i)
if __name__=='__main__':
    from multiprocessing import Pool
    idx=[int(x) for x in sys.argv[1].split(',')] if len(sys.argv)>1 else range(N)
    with Pool(4) as p: list(p.imap_unordered(frame,idx,chunksize=4))
