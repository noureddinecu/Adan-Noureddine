import cv2, numpy as np, glob, sys
S=sys.argv[1]; fs=sorted(glob.glob(S+'/fr/*.png'))
orb=cv2.ORB_create(1500)
prev=None; T=[np.eye(3)]
def load(i):
    g=cv2.cvtColor(cv2.imread(fs[i]),cv2.COLOR_BGR2GRAY); a=cv2.imread(fs[i].replace('/fr/','/alpha/'),0)
    m=(cv2.dilate(a,np.ones((41,41)))<20).astype(np.uint8)*255
    return g,m
g0,m0=load(0); k0,d0=orb.detectAndCompute(g0,m0)
bf=cv2.BFMatcher(cv2.NORM_HAMMING,crossCheck=True)
for i in range(1,len(fs)):
    g1,m1=load(i); k1,d1=orb.detectAndCompute(g1,m1)
    M=None
    if d0 is not None and d1 is not None and len(k0)>10 and len(k1)>10:
        ms=bf.match(d0,d1)
        if len(ms)>12:
            p0=np.float32([k0[m.queryIdx].pt for m in ms]); p1=np.float32([k1[m.trainIdx].pt for m in ms])
            M,inl=cv2.estimateAffinePartial2D(p0,p1,method=cv2.RANSAC,ransacReprojThreshold=3)
            if M is not None and inl.sum()<10: M=None
    if M is None: M=np.float32([[1,0,0],[0,1,0]])
    A=np.vstack([M,[0,0,1]]); T.append(A@T[-1])
    k0,d0=k1,d1
T=np.array(T); np.save(S+'/T.npy',T)
print(T[::50,:2,2], [np.sqrt(abs(np.linalg.det(t[:2,:2]))) for t in T[::50]])
