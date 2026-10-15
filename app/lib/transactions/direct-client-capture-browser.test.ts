import {expect,it} from 'vitest';
import {validateCaptureFile,CAPTURE_MAX_BYTES} from './direct-client-capture-browser';
it.each([[137,80,78,71],[255,216,255],[82,73,70,70,0,0,0,0,87,69,66,80]])('accepts supported image signatures',async(...bytes)=>{await expect(validateCaptureFile(new File([new Uint8Array(bytes)],'capture'))).resolves.toBeUndefined();});
it('rejects disguised files and oversized captures',async()=>{await expect(validateCaptureFile(new File(['not an image'],'fake.png',{type:'image/png'}))).rejects.toThrow();await expect(validateCaptureFile(new File([new Uint8Array(CAPTURE_MAX_BYTES+1)],'large.png'))).rejects.toThrow('12 Mo');});
