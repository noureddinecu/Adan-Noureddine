import numpy as np, sys
S=sys.argv[1]; T=np.load(S+'/T.npy'); n=len(T)
inc=np.zeros((n,2)); rot=np.zeros(n)
for i in range(1,n):
    D=T[i]@np.linalg.inv(T[i-1]); inc[i]=D[:2,2]; rot[i]=np.arctan2(D[1,0],D[0,0])
inc=np.clip(inc,-40,40)
# smooth increments lightly (remove jitter of estimation, keep real shake)
k=np.ones(3)/3; inc=np.stack([np.convolve(inc[:,j],k,'same') for j in range(2)],1)
pos=np.zeros((n,2)); ang=np.zeros(n); p=np.zeros(2); a=0
for i in range(n):
    p=p*0.985+inc[i]*1.5*0.55   # to output px, parallax factor, leaky
    a=a*0.97+rot[i]*0.5
    pos[i]=p; ang[i]=a
pos-=pos.mean(0)
pos=np.clip(pos,[-240,-300],[240,300])
np.save(S+'/path.npy',np.c_[pos,ang]); print(pos.min(0),pos.max(0),np.degrees(ang).min(),np.degrees(ang).max())
