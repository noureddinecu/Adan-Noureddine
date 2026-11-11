import onnxruntime as ort, numpy as np, glob, sys
from PIL import Image
S=sys.argv[1]
sess=ort.InferenceSession(S+'/models/rvm_resnet50_fp32.onnx',providers=['CPUExecutionProvider'])
rec=[np.zeros([1,1,1,1],np.float32)]*4
dr=np.array([0.4],np.float32)
files=sorted(glob.glob(S+'/fr/*.png'))
# warm up recurrent state on first frames (run first 15 frames twice)
seq=files[:15]+files
for i,f in enumerate(seq):
    x=np.asarray(Image.open(f),np.float32).transpose(2,0,1)[None]/255.
    fgr,pha,*rec=sess.run(None,{'src':x,'r1i':rec[0],'r2i':rec[1],'r3i':rec[2],'r4i':rec[3],'downsample_ratio':dr})
    if i>=15:
        Image.fromarray((pha[0,0]*255).clip(0,255).astype(np.uint8)).save(S+'/alpha/'+f.split('/')[-1])
        if i%50==0: print(i,flush=True)
