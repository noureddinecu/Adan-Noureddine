import cv2,numpy as np,sys
S=sys.argv[1]
a=cv2.cvtColor(cv2.imread(S+'/photos/full_7858743.jpg'),cv2.COLOR_BGR2RGB)
cx,w=2550,3111; y0,y1=100,100+int(3111*2200/1600)
crop=a[y0:y1,cx-w//2:cx-w//2+w]
crop=cv2.resize(crop,(1600,2200),interpolation=cv2.INTER_AREA).astype(np.float32)/255.
crop=cv2.GaussianBlur(crop,(0,0),1.2)  # slight extra depth-of-field
np.save(S+'/bg_lin.npy',crop.astype(np.float32))
cv2.imwrite(S+'/an/bgp.jpg',cv2.cvtColor((cv2.resize(crop,(400,550))*255).astype(np.uint8),cv2.COLOR_RGB2BGR))
