// Browser-only OCR port from App Courriel PA acceptée (1474422).
// All engines/language data are self-hosted. Original PDFs stay unchanged.
let pdfJsPromise;
let tesseractPromise;
async function engines() {
  pdfJsPromise ??= import("./vendor/pdfjs/pdf.min.mjs").then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
    return pdfjs;
  });
  return pdfJsPromise;
}
async function tesseract() {
  tesseractPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("./vendor/tesseract/tesseract.min.js", import.meta.url).href;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => { tesseractPromise = undefined; script.remove(); reject(new Error("Lecteur OCR indisponible.")); };
    document.head.append(script);
  });
  return tesseractPromise;
}
function findTsvAnchor(tsv, pattern) {
  for (const row of (tsv || "").split("\n").slice(1)) {
    const columns = row.split("\t");
    if (columns.length < 12 || columns[0] !== "5" || !pattern.test(columns[11].trim())) continue;
    return {
      left: Number(columns[6]),
      top: Number(columns[7]),
      width: Number(columns[8]),
      height: Number(columns[9]),
    };
  }
  return null;
}

function tsvWords(tsv) {
  const words = [];
  for (const row of (tsv || "").split("\n").slice(1)) {
    const columns = row.split("\t");
    if (columns.length < 12 || columns[0] !== "5") continue;
    words.push({
      left: Number(columns[6]),
      top: Number(columns[7]),
      width: Number(columns[8]),
      height: Number(columns[9]),
      text: columns[11].trim(),
    });
  }
  return words;
}

function detectPadInspectionMarker(tsv, context, canvas) {
  const words = tsvWords(tsv);
  const clauseAnchor = words.find((word) => /^8[.,]?1$/.test(word.text));
  if (!clauseAnchor) return "";

  const sectionNine = words.find(
    (word) => /^9[.,]?$/.test(word.text) && word.top > clauseAnchor.top,
  );
  const optionAnchors = words
    .filter((word) => (
      /^apposant$/i.test(word.text)
      && word.top > clauseAnchor.top
      && (!sectionNine || word.top < sectionNine.top)
      && word.left < canvas.width * 0.45
    ))
    .sort((a, b) => a.top - b.top)
    .slice(0, 2);
  if (optionAnchors.length < 2) return "";

  function inkRatio(anchor) {
    const left = Math.max(0, Math.round(anchor.left - 100));
    const top = Math.max(0, Math.round(anchor.top + 3));
    const width = Math.min(60, canvas.width - left);
    const height = Math.min(24, canvas.height - top);
    if (width <= 0 || height <= 0) return 0;
    const pixels = context.getImageData(left, top, width, height).data;
    let ink = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const brightness = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
      if (brightness < 170) ink += 1;
    }
    return ink / (pixels.length / 4);
  }

  const privateInk = inkRatio(optionAnchors[0]);
  const waiverInk = inkRatio(optionAnchors[1]);
  if (waiverInk > 0.025 && waiverInk > privateInk + 0.008) {
    return "CLAUSE 8.1 OPTION RENONCIATION INITIALEE";
  }
  if (privateInk > 0.025 && privateInk > waiverInk + 0.008) {
    return "CLAUSE 8.1 OPTION PARTIE PRIVATIVE INITIALEE";
  }
  return "";
}


/** One sequential pass, bounded work, isolated document failures, no persistence. */
export async function prepareOcrDocuments(files, { signal, onProgress = () => {} } = {}) {
  const results = [];
  let pdfjs;
  try { pdfjs = await engines(); } catch { return results; }
  let worker;
  let completedPages = 0;
  const stop = () => { void worker?.terminate(); };
  signal?.addEventListener("abort", stop, { once: true });
  try {
    for (const [index, file] of files.entries()) {
      signal?.throwIfAborted();
      let pdf;
      const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
      const abortPdf = () => { void loading.destroy(); };
      signal?.addEventListener("abort", abortPdf, { once: true });
      try {
        pdf = await loading.promise;
        if (pdf.numPages > 150) continue;
        let readable = false;
        for (let n = 1; n <= pdf.numPages; n++) {
          signal?.throwIfAborted();
          const page = await pdf.getPage(n);
          const content = await page.getTextContent();
          const text = content.items.map(item => item.str || "").join("");
          page.cleanup();
          if (text.replace(/\s/g, "").length >= 20) { readable = true; break; }
        }
        if (readable) continue;
        if (completedPages + pdf.numPages > 150) continue;
        if (!worker) {
          onProgress("Préparation de la lecture visuelle…");
          const Tesseract = await tesseract();
          signal?.throwIfAborted();
          const base = new URL("./vendor/tesseract/", import.meta.url).href;
          worker = await Tesseract.createWorker("fra", 1, {
            workerPath: base + "worker.min.js", corePath: base + "core", langPath: base + "lang",
          });
        }
        signal?.throwIfAborted();
        const pages = [];
        const words = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          signal?.throwIfAborted();
          onProgress(`Lecture visuelle · document ${index + 1}/${files.length} · page ${n}/${pdf.numPages}`);
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({ scale: Math.min(2.5, 3200 / Math.max(page.view[2], page.view[3])) });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          try {
            const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
            await page.render({ canvasContext: context, viewport }).promise;
            const result = await worker.recognize(canvas, {}, { text: true, tsv: true });
            let text = result.data.text || "";
            let positioned = tsvWords(result.data.tsv);
            // Read the filled count between "les" and "jours" as digits.
            // The rule still comes from the original anchored clause; no day
            // count is inferred from an OCR spelling, filename or signature.
            for (const section of ["6.2", "8.1"]) {
              const anchor = positioned.find(w => w.text === section && w.left < canvas.width * .15);
              if (!anchor) continue;
              const days = positioned.find(w => /^jours?$/i.test(w.text) && w.top >= anchor.top - 5 && w.top < anchor.top + viewport.scale * 35);
              if (!days) continue;
              const before = positioned.filter(w => w.left < days.left && Math.abs(w.top - days.top) < viewport.scale * 5).sort((a,b)=>b.left-a.left);
              const les = before.find(w => /^les$/i.test(w.text));
              if (!les || days.left - les.left > canvas.width * .12) continue;
              const left = Math.round(les.left + les.width + 2), top = Math.max(0, Math.round(days.top - viewport.scale * 3));
              const width = Math.round(days.left - left - 2), height = Math.ceil(days.height + viewport.scale * 6);
              if (width < 5) continue;
              const crop = document.createElement("canvas"); crop.width = width * 2; crop.height = height * 2;
              try {
                const context = crop.getContext("2d", { alpha: false, willReadFrequently: true });
                context.drawImage(canvas,left,top,width,height,0,0,crop.width,crop.height);
                const pixels = context.getImageData(0,0,crop.width,crop.height);
                for(let y=0;y<crop.height;y++) {
                  let ink=0;for(let x=0;x<crop.width;x++)if(pixels.data[(y*crop.width+x)*4]<150)ink++;
                  if(ink>crop.width*.7)for(let x=0;x<crop.width;x++){const k=(y*crop.width+x)*4;pixels.data[k]=pixels.data[k+1]=pixels.data[k+2]=255;}
                }
                context.putImageData(pixels,0,0);
                await worker.setParameters({ tessedit_pageseg_mode: "8", tessedit_char_whitelist: "0123456789" });
                let focused=await worker.recognize(crop);
                if (focused.data.confidence < 60) {
                  await worker.setParameters({ tessedit_pageseg_mode: "7" });
                  focused=await worker.recognize(crop);
                }
                const digits=focused.data.text.trim();
                if (/^\d{1,3}$/.test(digits) && +digits > 0 && +digits <= 365 && focused.data.confidence >= 60) {
                  const start=text.indexOf(section);
                  const tail=text.slice(start);
                  const match=/dans\s+les\s+(\S+)\s+jours?/.exec(tail.slice(0,600));
                  if(start>=0 && match) {
                    const offset=start+match.index+match[0].indexOf(match[1]);
                    text=text.slice(0,offset)+digits+text.slice(offset+match[1].length);
                    positioned=positioned.filter(w=>!(w.left>=left && w.left<days.left && Math.abs(w.top-days.top)<viewport.scale*5));
                    positioned.push({text:digits,left,top:days.top,width,height:days.height});
                  }
                }
              } finally { await worker.setParameters({ tessedit_pageseg_mode:"3",tessedit_char_whitelist:"" });crop.width=crop.height=1; }
            }
            const marker = detectPadInspectionMarker(result.data.tsv, context, canvas);
            if (marker) text += `\n${marker}\n`;
            const anchor = findTsvAnchor(result.data.tsv, /^11[.,]?2$/);
            if (anchor) {
              const top = Math.max(0, anchor.top - 12);
              const crop = document.createElement("canvas");
              crop.width = canvas.width; crop.height = Math.min(canvas.height - top, Math.round(canvas.height * .18));
              try {
                crop.getContext("2d", { alpha: false }).drawImage(canvas, 0, top, crop.width, crop.height, 0, 0, crop.width, crop.height);
                await worker.setParameters({ tessedit_pageseg_mode: "6" });
                const focused = await worker.recognize(crop);
                text += `\nLECTURE CIBLÉE 11.2\n${focused.data.text || ""}`;
              } finally {
                await worker.setParameters({ tessedit_pageseg_mode: "3" });
                crop.width = crop.height = 1;
              }
            }
            pages.push(text);
            words.push(positioned.map(w => [w.text, w.left / viewport.scale, w.top / viewport.scale, w.width / viewport.scale, w.height / viewport.scale].map((v, i) => i ? Math.round(v * 100) / 100 : v)));
            completedPages++;
          } finally { page.cleanup(); canvas.width = canvas.height = 1; }
        }
        results.push({ index, pages, words });
      } catch {
        signal?.throwIfAborted();
        // The original file is still sent; the server reports its precise failure.
      } finally {
        signal?.removeEventListener("abort", abortPdf);
        await loading.destroy();
      }
    }
  } finally {
    signal?.removeEventListener("abort", stop);
    await worker?.terminate();
  }
  signal?.throwIfAborted();
  return results;
}
