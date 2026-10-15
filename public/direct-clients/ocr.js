// Reuses the CRM's self-hosted Tesseract engine and French language data.
// Images and OCR text remain in memory; no upload, analytics or persistent image cache.
let enginePromise;
function engine() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  enginePromise ??= new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='/oaciq-reader/vendor/tesseract/tesseract.min.js';
    script.onload=()=>resolve(window.Tesseract);
    script.onerror=()=>{enginePromise=undefined;script.remove();reject(new Error('OCR indisponible. Réessayez.'));};
    document.head.append(script);
  });
  return enginePromise;
}
export async function recognizeCapture(file,{signal,onProgress}) {
  let worker,bitmap,canvas;
  const stop=()=>{if(worker)void worker.terminate();};
  signal.addEventListener('abort',stop,{once:true});
  try {
    signal.throwIfAborted();
    bitmap=await createImageBitmap(file);signal.throwIfAborted();
    if(bitmap.width<100||bitmap.height<50||bitmap.width*bitmap.height>80000000)throw new Error('Dimensions de capture non prises en charge. Choisissez une capture plus petite et lisible.');
    const scale=Math.min(2,Math.sqrt(12000000/(bitmap.width*bitmap.height)),12000/Math.max(bitmap.width,bitmap.height));
    canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();bitmap=null;
    onProgress('Préparation de la lecture locale…');
    const Tesseract=await engine();signal.throwIfAborted();
    const base=new URL('/oaciq-reader/vendor/tesseract/',location.origin).href;
    worker=await Tesseract.createWorker('fra',1,{workerPath:base+'worker.min.js',corePath:base+'core',langPath:base+'lang',logger:m=>{
      if(!signal.aborted&&m.status==='recognizing text')onProgress('Lecture de la capture… '+Math.round(m.progress*100)+' %');
    },errorHandler:()=>{}});
    signal.throwIfAborted();
    await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1',user_defined_dpi:'150'});
    const {data}=await worker.recognize(canvas,{}, {text:true,tsv:true});
    signal.throwIfAborted();
    return {text:data.text||'',tsv:data.tsv||'',confidence:data.confidence};
  } finally {
    signal.removeEventListener('abort',stop);
    if(worker)await worker.terminate();
    bitmap?.close();if(canvas){canvas.width=0;canvas.height=0;}
  }
}

