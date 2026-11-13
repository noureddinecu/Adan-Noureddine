import numpy as np, wave
SR=44100; D=10.6; n=int(SR*D); t=np.arange(n)/SR; rng=np.random.default_rng(0)
out=np.zeros(n)
def env(a,d,length):
    x=np.arange(int(length*SR))/SR; return np.minimum(x/a,1)*np.exp(-x/d)
def add(sig,at,g=1):
    i=int(at*SR); j=min(n,i+len(sig)); out[i:j]+=sig[:j-i]*g
bpm=118; beat=60/bpm
# kick, hat, clap, bass
for k in range(int(D/beat)+1):
    tb=k*beat
    if tb<0.6: continue
    x=np.arange(int(0.35*SR))/SR; f=50+90*np.exp(-x*25)
    add(np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-x*9),tb,0.55)
    hat=rng.normal(0,1,int(0.05*SR)); hat=np.diff(hat,prepend=0)*env(0.001,0.012,0.05)
    add(hat,tb+beat/2,0.12)
    if k%2==1:
        cl=rng.normal(0,1,int(0.2*SR))*env(0.002,0.05,0.2); add(np.diff(cl,prepend=0),tb,0.18)
notes=[45,45,48,43]  # A, A, C, G (midi)
for k in range(int(D/beat)+1):
    tb=k*beat
    if tb<0.6: continue
    m=notes[(k//4)%4]; fr=440*2**((m-69)/12)
    x=np.arange(int(beat*0.9*SR))/SR
    s=(2*((x*fr)%1)-1)*0.5+np.sin(2*np.pi*fr*x); s*=np.exp(-x*4)
    add(s,tb,0.16)
# chord pad
for k,m in enumerate([57,60,64]):
    out+=np.sin(2*np.pi*440*2**((m-69)/12)*t)*0.025*np.clip(t/1,0,1)
# can open pssht at 0
x=np.arange(int(0.6*SR))/SR; ps=rng.normal(0,1,len(x)); ps=np.diff(ps,prepend=0)*np.exp(-x*6)*(x>0.03)
add(ps,0.0,0.35); clk=np.sin(2*np.pi*2500*x[:2000])*np.exp(-x[:2000]*300); add(clk,0.0,0.5)
# pour 2.0-3.6 (lowpassed noise with gurgle)
L=int(1.6*SR); x=np.arange(L)/SR; no=rng.normal(0,1,L)
lp=np.convolve(no,np.ones(30)/30,'same')*(1+0.6*np.sin(2*np.pi*9*x))
lp*=np.minimum(x/0.1,1)*np.minimum((1.6-x)/0.2,1); add(lp,2.0,1.6)
# fizz 2.3-5.4: random crackles
for _ in range(900):
    at=rng.uniform(2.3,5.4); c=rng.normal(0,1,120)*np.exp(-np.arange(120)/20); add(np.diff(c,prepend=0),at,0.08)
# whooshes
for at in [5.35,9.1]:
    L=int(0.5*SR); x=np.arange(L)/SR; w=np.convolve(rng.normal(0,1,L),np.ones(8)/8,'same')*np.sin(np.pi*x/0.5)**2; add(w,at,0.5)
out*=np.minimum(1,(D-t)/0.4)
out/=np.abs(out).max()/0.8
with wave.open('music.wav','wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out*32767).astype(np.int16).tobytes())
