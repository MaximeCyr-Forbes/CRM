export function initializeEmailTool(root) {
const controller=new AbortController();
const fetch=(url,options={})=>window.fetch(url,{...options,signal:controller.signal});
const byId=id=>root.querySelector("#"+CSS.escape(id));
/* Image-only PDFs are optimized in the browser when a bundle exceeds the
   hosting request limit. Native text PDFs and signature widgets stay intact. */
function imagePdf(pages) {
  const encode = value => new TextEncoder().encode(value);
  const parts = [encode('%PDF-1.4\n')];
  const offsets = [0];
  let length = parts[0].length;
  const append = value => { const bytes=typeof value==='string'?encode(value):value; parts.push(bytes); length+=bytes.length; };
  const object = (id,body,stream) => {
    offsets[id]=length;
    append(id+' 0 obj\n'+body);
    if (stream) { append('\nstream\n'); append(stream); append('\nendstream'); }
    append('\nendobj\n');
  };
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,'<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
  pages.forEach((p,index) => {
    const id=3+index*3;
    object(id,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+p.pageWidth+' '+p.pageHeight+'] /Resources << /XObject << /Im '+(id+1)+' 0 R >> >> /Contents '+(id+2)+' 0 R >>');
    object(id+1,'<< /Type /XObject /Subtype /Image /Width '+p.width+' /Height '+p.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+p.bytes.length+' >>',p.bytes);
    const content=encode('q '+p.pageWidth+' 0 0 '+p.pageHeight+' 0 0 cm /Im Do Q');
    object(id+2,'<< /Length '+content.length+' >>',content);
  });
  const xref=length;
  append('xref\n0 '+offsets.length+'\n0000000000 65535 f \n');
  for (const offset of offsets.slice(1)) append(String(offset).padStart(10,'0')+' 00000 n \n');
  append('trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  return new Blob(parts,{type:'application/pdf'});
}

const dropzone = root.querySelector("#dropzone");
const fileInput = root.querySelector("#fileInput");
const fileName = root.querySelector("#fileName");
const statusLabel = root.querySelector("#status");
const statusText = root.querySelector("#statusText");
const recipientInputs = root.querySelectorAll('input[name="recipient"]');
const errorBox = root.querySelector("#error");
const summary = root.querySelector("#summary");
const deadlinesPanel = root.querySelector("#deadlinesPanel");
const deadlinesList = root.querySelector("#deadlines");
const warningsPanel = root.querySelector("#warningsPanel");
const warningsList = root.querySelector("#warnings");
const email = root.querySelector("#email");
const copyButton = root.querySelector("#copyButton");
const copyButtonLabel = root.querySelector("#copyButtonLabel");
const resetButton = root.querySelector("#resetButton");
const progress = root.querySelector("#progress");
const progressLabel = root.querySelector("#progressLabel");
const progressValue = root.querySelector("#progressValue");
const progressTrack = root.querySelector("#progressTrack");
const progressBar = root.querySelector("#progressBar");

let currentProgress = 0;
let progressTimer = null;
let progressHideTimer = null;
let pdfJsPromise = null;
let analysisRunId = 0;
let currentResult = null;

function setStatus(label, state = "ready") {
  statusText.textContent = label;
  statusLabel.dataset.state = state;
}

function setProgress(value, label) {
  currentProgress = Math.max(0, Math.min(100, Math.round(value)));
  progressBar.style.width = `${currentProgress}%`;
  progressValue.textContent = `${currentProgress}%`;
  progressTrack.setAttribute("aria-valuenow", String(currentProgress));
  if (label) progressLabel.textContent = label;
}

function clearProgressTimers() {
  clearInterval(progressTimer);
  clearTimeout(progressHideTimer);
  progressTimer = null;
  progressHideTimer = null;
}

function hideProgressAfter(delay) {
  progressHideTimer = setTimeout(() => {
    progress.classList.remove("active", "complete", "failed");
    progress.setAttribute("aria-hidden", "true");
  }, delay);
}

function startProgress() {
  clearProgressTimers();
  progress.classList.remove("complete", "failed");
  progress.classList.add("active");
  progress.setAttribute("aria-hidden", "false");
  setStatus("Analyse en cours", "loading");
  setProgress(0, "Préparation des documents");

  progressTimer = setInterval(() => {
    if (currentProgress >= 92) return;
    const step = currentProgress < 35 ? 3 : currentProgress < 70 ? 2 : 1;
    const nextProgress = Math.min(92, currentProgress + step);
    const label = nextProgress < 40 ? "Analyse des documents" : "Génération du courriel";
    setProgress(nextProgress, label);
  }, 180);
}

function pauseProgress() {
  clearInterval(progressTimer);
  progressTimer = null;
}

function resumeProgress(label = "Génération du courriel") {
  pauseProgress();
  progressTimer = setInterval(() => {
    if (currentProgress >= 92) return;
    setProgress(Math.min(92, currentProgress + 1), label);
  }, 220);
}

function completeProgress() {
  clearInterval(progressTimer);
  progressTimer = null;
  progress.classList.add("complete");
  const review = currentResult?.needs_review;
  setProgress(100, review ? "Informations à confirmer" : "Courriel prêt");
  setStatus(review ? "À confirmer" : "Courriel prêt", review ? "error" : "success");
  hideProgressAfter(900);
}

function failProgress() {
  clearInterval(progressTimer);
  progressTimer = null;
  progress.classList.add("failed");
  progressLabel.textContent = "Analyse interrompue";
  setStatus("À vérifier", "error");
  hideProgressAfter(1400);
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
  if (typeof renderManualConfirmation === "function") renderManualConfirmation();
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

function setLoading(isLoading) {
  fileInput.disabled = isLoading;
  if (isLoading) setStatus("Lecture en cours", "loading");
}

function recipientNames(data, recipient) {
  const names = recipient === "vendeur" ? data.seller_names : data.buyer_names;
  return Array.isArray(names) ? names : [];
}

function emailFirstName(name) {
  const firstName = String(name || "").trim().split(/\s+/)[0];
  if (firstName !== firstName.toLocaleUpperCase("fr-CA")) return firstName;
  return firstName
    .toLocaleLowerCase("fr-CA")
    .replace(/(^|[-'’])(\p{L})/gu, (_, separator, letter) => (
      `${separator}${letter.toLocaleUpperCase("fr-CA")}`
    ));
}

function emailGreeting(names) {
  const firstNames = names
    .map(emailFirstName)
    .filter(Boolean);
  if (!firstNames.length) return "Bonjour,";
  return `Bonjour ${firstNames.join(" et ")},`;
}

function replaceEmailGreeting(names) {
  if (!email.value) return;
  const lines = email.value.split(/\r?\n/);
  lines[0] = emailGreeting(names);
  email.value = lines.join("\n");
}

function setRecipient(recipient, updateGreeting = true) {
  for (const input of recipientInputs) {
    input.checked = input.value === recipient;
  }
  if (!currentResult) return;

  const names = recipientNames(currentResult, recipient);
  root.querySelector("#client").textContent = names.join(" et ") || "À vérifier";
  root.querySelector("#role").textContent = recipient === "vendeur" ? "Vendeur" : "Acheteur";
  if (updateGreeting) replaceEmailGreeting(names);
}

function resetApp() {
  analysisRunId += 1;
  clearProgressTimers();
  setLoading(false);
  setProgress(0, "Génération en cours");
  progress.classList.remove("active", "complete", "failed");
  progress.setAttribute("aria-hidden", "true");

  fileInput.value = "";
  fileName.textContent = "Promesse d’achat, contre-proposition et annexes au besoin";
  dropzone.classList.remove("dragover");
  clearError();
  currentResult = null;
  if (typeof resetValidation === "function") resetValidation();
  setRecipient("acheteur", false);

  root.querySelector("#client").textContent = "";
  root.querySelector("#role").textContent = "";
  root.querySelector("#acceptance").textContent = "";
  root.querySelector("#property").textContent = "";
  summary.classList.add("hidden");

  deadlinesList.innerHTML = "";
  deadlinesPanel.classList.add("hidden");
  warningsList.innerHTML = "";
  warningsPanel.classList.add("hidden");

  email.value = "";
  copyButtonLabel.textContent = "Copier";
  copyButton.disabled = true;
  resetButton.disabled = true;
  setStatus("Prêt", "ready");
}

function renderResult(data, preserveEditors = false) {
  currentResult = data;
  setStatus(data.needs_review ? "À confirmer" : "Courriel prêt", data.needs_review ? "error" : "success");
  setProgress(100, data.needs_review ? "Informations à confirmer" : "Courriel prêt");
  if (!preserveEditors && typeof renderValidation === "function") renderValidation(data);
  root.querySelector("#acceptance").textContent = data.acceptance_time
    ? `${data.acceptance_date} à ${data.acceptance_time}`
    : data.acceptance_date;
  root.querySelector("#property").textContent = data.property_address || "À vérifier";

  deadlinesList.innerHTML = "";
  for (const item of data.deadlines) {
    const row = document.createElement("div");
    row.className = "deadline";
    row.innerHTML = `
      <div class="deadline-date"></div>
      <div>
        <div class="deadline-label"></div>
        <div class="deadline-details"></div>
      </div>
    `;
    row.querySelector(".deadline-date").textContent = item.date_text;
    row.querySelector(".deadline-label").textContent = item.label;
    row.querySelector(".deadline-details").textContent = item.details || "";
    deadlinesList.appendChild(row);
  }

  warningsList.innerHTML = "";
  if (data.warnings && data.warnings.length) {
    for (const warning of data.warnings) {
      const li = document.createElement("li");
      li.textContent = warning;
      warningsList.appendChild(li);
    }
    warningsPanel.classList.remove("hidden");
  } else {
    warningsPanel.classList.add("hidden");
  }

  if (typeof renderManualConfirmation === "function") renderManualConfirmation();
  email.value = data.email;
  const selectedRecipient = Array.from(recipientInputs).find((input) => input.checked)?.value;
  setRecipient(selectedRecipient || "acheteur");
  copyButton.disabled = !data.email;
  summary.classList.remove("hidden");
  deadlinesPanel.classList.remove("hidden");
}

async function getPdfJs() {
  if (!pdfJsPromise) {
    const pdfJsUrl = new URL("/oaciq-reader/vendor/pdfjs/pdf.min.mjs", window.location.origin).href;
    pdfJsPromise = import(/* @vite-ignore */ pdfJsUrl).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/oaciq-reader/vendor/pdfjs/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

async function openPdf(file) {
  const pdfjs = await getPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  return pdfjs.getDocument({ data: bytes }).promise;
}

async function pdfHasReadableText(pdf) {
  let textLength = 0;
  const pagesToCheck = Math.min(pdf.numPages, 3);
  for (let pageNumber = 1; pageNumber <= pagesToCheck; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text=content.items.map(item=>item.str || "").join(" ")
      .replace(/authentisign\s*id\s*:\s*[a-f0-9-]+/gi, "");
    textLength += text.trim().length;
    page.cleanup();
    if (textLength >= 400) return true;
  }
  return false;
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

async function prepareOcrDocuments(files) {
  pauseProgress();
  setProgress(4, "Lecture des PDF");

  const opened = [];
  for (const [index,file] of files.entries()) {
    const pdf = await openPdf(file);
    const readable = await pdfHasReadableText(pdf);
    opened.push({ file, pdf, readable, index });
  }

  const scanned = opened.filter((document) => !document.readable);
  if (!scanned.length) {
    for (const openedDocument of opened) await openedDocument.pdf.destroy();
    setProgress(22, "Analyse des documents");
    resumeProgress();
    return [];
  }

  if (!window.Tesseract) {
    await new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='/oaciq-reader/vendor/tesseract/tesseract.min.js';
      script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('Lecteur OCR indisponible.'));};
      document.head.append(script);
    });
  }

  const totalPages = scanned.reduce((total, document) => total + document.pdf.numPages, 0);
  let completedPages = 0;
  setProgress(7, "Préparation de la lecture visuelle");
  const staticBase = `${window.location.origin}/oaciq-reader/vendor/tesseract`;

  const worker = await window.Tesseract.createWorker("fra", 1, {
    workerPath: `${staticBase}/worker.min.js`,
    corePath: `${staticBase}/core`,
    langPath: `${staticBase}/lang`,
    logger(message) {
      if (message.status === "loading language traineddata") {
        setProgress(Math.max(currentProgress, 8), "Chargement du lecteur français");
      }
    },
  });

  const ocrDocuments = [];
  ocrDocuments.optimizedFiles = [...files];
  const optimize = files.reduce((n,f) => n+f.size,0) > 3800000;
  try {
    for (const openedDocument of opened) {
      if (openedDocument.readable) {
        await openedDocument.pdf.destroy();
        continue;
      }

      const pages = [];
      const imagePages = [];
      for (let pageNumber = 1; pageNumber <= openedDocument.pdf.numPages; pageNumber += 1) {
        const page = await openedDocument.pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.8 });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
        await page.render({ canvasContext: context, viewport }).promise;

        if (optimize) {
          const jpeg = await new Promise(resolve => canvas.toBlob(resolve,"image/jpeg",.65));
          imagePages.push({bytes:new Uint8Array(await jpeg.arrayBuffer()),width:canvas.width,height:canvas.height,
            pageWidth:viewport.width/1.8,pageHeight:viewport.height/1.8});
        }
        const result = await worker.recognize(canvas, {}, { text: true, tsv: true });
        let pageText = result.data.text || "";

        const inspectionMarker = detectPadInspectionMarker(result.data.tsv, context, canvas);
        if (inspectionMarker) pageText += `\n${inspectionMarker}\n`;

        const occupationAnchor = findTsvAnchor(result.data.tsv, /^11[.,]?2$/);
        if (occupationAnchor) {
          const cropTop = Math.max(0, occupationAnchor.top - 12);
          const cropHeight = Math.min(canvas.height - cropTop, Math.round(canvas.height * 0.18));
          const cropCanvas = window.document.createElement("canvas");
          cropCanvas.width = canvas.width;
          cropCanvas.height = cropHeight;
          const cropContext = cropCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
          cropContext.drawImage(
            canvas,
            0,
            cropTop,
            canvas.width,
            cropHeight,
            0,
            0,
            canvas.width,
            cropHeight,
          );
          await worker.setParameters({ tessedit_pageseg_mode: window.Tesseract.PSM.SINGLE_BLOCK });
          const focused = await worker.recognize(cropCanvas);
          await worker.setParameters({ tessedit_pageseg_mode: window.Tesseract.PSM.AUTO });
          pageText += `\nLECTURE CIBLÉE 11.2\n${focused.data.text || ""}`;
          cropCanvas.width = 1;
          cropCanvas.height = 1;
        }

        pages.push(pageText);
        completedPages += 1;
        setProgress(
          10 + (completedPages / totalPages) * 70,
          `Lecture visuelle ${completedPages}/${totalPages}`,
        );

        page.cleanup();
        canvas.width = 1;
        canvas.height = 1;
      }

      ocrDocuments.push({ name: openedDocument.file.name, index:openedDocument.index, pages });
      if (imagePages.length) {
        const optimized = new File([imagePdf(imagePages)],openedDocument.file.name,{type:"application/pdf"});
        if (optimized.size < openedDocument.file.size) ocrDocuments.optimizedFiles[openedDocument.index] = optimized;
      }
      await openedDocument.pdf.destroy();
    }
  } finally {
    await worker.terminate();
  }

  setProgress(82, "Génération du courriel");
  resumeProgress();
  return ocrDocuments;
}

// Preserve the source visual fallback using bounded page batches, inside CRM only.
async function reviewDifficultPages(data, files, runId) {
 for(let ti=0;ti<data.transactions.length;ti++) {
  let transaction=data.transactions[ti];
  for(const doc of transaction.documents||[]) {
   if(!doc.visual_pages?.length||!files[doc.input_index])continue;
   let pdf;
   try {
    const pdfjs=await getPdfJs();
    pdf=await pdfjs.getDocument({data:new Uint8Array(await files[doc.input_index].arrayBuffer())}).promise;
    let batch=[],bytes=0;
    const send=async()=>{
     if(runId!==analysisRunId)throw new Error('Analyse remplacée.');
     const response=await fetch('/api/tools/email/vision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transaction,document:doc,pages:batch})});
     const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'Lecture visuelle indisponible.');
     transaction=result.transaction;batch=[];bytes=0;
    };
    for(const number of doc.visual_pages) {
     if(runId!==analysisRunId)return;
     setProgress(88,`Vérification visuelle : ${doc.file_name}, page ${number}`);
     const page=await pdf.getPage(number),viewport=page.getViewport({scale:2});
     const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
     await page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport}).promise;
     const image=canvas.toDataURL('image/jpeg',.85);canvas.width=canvas.height=1;page.cleanup();
     if(batch.length&&(bytes+image.length>3000000||batch.length>=8))await send();
     if(image.length>3500000)throw new Error('Page trop volumineuse pour la lecture visuelle.');
     batch.push({page:number,text:doc.pages[number-1]||'',image});bytes+=image.length;
    }
    if(batch.length)await send();
   }catch(error){
    transaction.warnings=[...new Set([...(transaction.warnings||[]),error.message||'Lecture visuelle à confirmer.'])];
    transaction.issues=[...new Set([...(transaction.issues||[]),error.message||'Lecture visuelle à confirmer.'])];
    transaction.needs_review=true;transaction.email='';
   }finally{await pdf?.destroy();}
  }
  data.transactions[ti]=transaction;
 }
}

async function uploadPdf(files) {
  files = Array.from(files || []);
  if (!files.length) { resetApp(); return; }
  if (typeof resetManualConfirmation === "function") resetManualConfirmation();
  const runId = ++analysisRunId;
  clearError();
  currentResult = null;
  email.value = "";
  copyButton.disabled = true;
  for (const id of ["summary","deadlinesPanel","warningsPanel","bundlePanel","validationPanel","diagnosticPanel"]) {
    byId(id)?.classList.add("hidden");
  }
  fileName.textContent = files.map((file) => file.name).join(", ");
  resetButton.disabled = false;
  setLoading(true);
  startProgress();

  try {
    const ocrDocuments = await prepareOcrDocuments(files);
    if (runId !== analysisRunId) return;
    const prepared = ocrDocuments.optimizedFiles || files;
    if (prepared.reduce((n,f) => n+f.size,0) > 4100000) {
      throw new Error("Ces fichiers dépassent la limite d'import de 4 Mo après optimisation. Réduisez leur taille puis importez ensemble les formulaires de la transaction.");
    }
    const formData = new FormData();
    for (const file of prepared) formData.append("pdf", file);
    if (ocrDocuments.length) {
      formData.append("ocr_data", JSON.stringify(ocrDocuments));
    }
    const response = await fetch("/api/tools/email/analyze", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (runId !== analysisRunId) return;
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Le PDF n'a pas pu être lu.");
    }
    await reviewDifficultPages(data, prepared, runId);
    if (runId !== analysisRunId) return;
    receiveTransactions(data);
    completeProgress();
  } catch (error) {
    if (runId !== analysisRunId) return;
    console.error(error);
    showError(error instanceof Error ? error.message : String(error));
    failProgress();
  } finally {
    if (runId === analysisRunId) setLoading(false);
  }
}

fileInput.addEventListener("change", () => uploadPdf(fileInput.files));

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  uploadPdf(event.dataTransfer.files);
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(email.value);
  copyButtonLabel.textContent = "Copié";
  setStatus("Courriel copié", "success");
  setTimeout(() => {
    copyButtonLabel.textContent = "Copier";
    setStatus("Courriel prêt", "success");
  }, 1200);
});

resetButton.addEventListener("click", resetApp);

for (const input of recipientInputs) {
  input.addEventListener("change", () => {
    if (input.checked) setRecipient(input.value);
  });
}

let transactions = [];
const transactionSelect = root.querySelector("#transactionSelect");
const validationForm = root.querySelector("#validationForm");

function resetValidation() {
  resetManualConfirmation();
  transactions = [];
  for (const id of ["bundlePanel","validationPanel","diagnosticPanel"]) byId(id).classList.add("hidden");
}
function receiveTransactions(result) {
  resetManualConfirmation();
  transactions = result.transactions || [result];
  transactionSelect.replaceChildren();
  for (const tx of transactions) {
    const option = document.createElement("option");
    option.value = tx.id;
    option.textContent = (tx.main_form || "Annexes à compléter") + " — " + (tx.property_address || "Adresse à vérifier");
    transactionSelect.appendChild(option);
  }
  root.querySelector("#bundlePanel").classList.remove("hidden");
  renderResult(transactions[0]);
}
transactionSelect.addEventListener("change", () => {
  if (currentResult?.manual_override) {
    const saved = captureDisplayedTransaction();
    Object.assign(currentResult, saved);
  }
  resetManualConfirmation();
  const tx = transactions.find(t => t.id === transactionSelect.value);
  clearError();
  if (tx) renderResult(tx);
});
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function inputField(label, type, value, name, parent) {
  const wrapper = element("label", label);
  const input = document.createElement("input");
  input.type = type;
  input.name = name;
  input.value = value ?? "";
  if (type === "number") { input.min = "0"; input.step = "1"; }
  wrapper.append(input);
  parent.append(wrapper);
  return input;
}
function selectField(label, value, choices, name, parent) {
  const wrapper = element("label", label);
  const select = document.createElement("select");
  select.name = name;
  for (const [id, text] of choices) {
    const option = element("option", text);
    option.value = id;
    select.append(option);
  }
  select.value = value;
  wrapper.append(select);
  parent.append(wrapper);
  return select;
}
function renderConditionEditor(c, all) {
  const row = element("fieldset", "", "condition-editor");
  row.dataset.id = c.id;
  row.append(element("legend", (c.source?.source_form || "Condition ajoutée") + " — " + (c.clause || "")));
  const grid = element("div", "", "validation-grid");
  inputField("Condition", "text", c.label, "label", grid);
  inputField("Clause source", "text", c.clause, "clause", grid);
  inputField("Nombre de jours", "number", c.duration_days, "days", grid);
  const options = [["acceptance","Acceptation"],["explicit","Date explicite"],
    ["seller_notice","Réception de l'avis écrit du vendeur"],["sale_fulfilled","Réalisation de la vente"],
    ...all.filter(i => i.id !== c.id).map(i => ["condition:" + i.id,"Expiration : " + i.label])];
  if (c.trigger && !options.some(o => o[0] === c.trigger)) options.push([c.trigger,c.trigger.replaceAll("_"," ")]);
  selectField("Point de départ", c.trigger || "acceptance", options, "trigger", grid);
  inputField("Date explicite", "date", c.explicit_date, "date", grid);
  inputField("Heure limite", "time", c.deadline_time, "time", grid);
  row.append(grid);
  row.append(element("p", (c.source?.source_form || "") + ", page " + (c.source_page || "à préciser") +
    " · Confiance " + Math.round((c.confidence || 0)*100) + " %", "validation-help"));
  if (c.source?.detected_text) {
    const details = element("details");
    details.append(element("summary", "Texte source"));
    details.append(element("p", c.source.detected_text, "source-text"));
    row.append(details);
  }
  return row;
}
function renderValidation(data) {
  const response = data.acceptance || {};
  transactionSelect.value = data.id;
  const docs = root.querySelector("#bundleDocuments");
  docs.replaceChildren(...(data.documents || []).map(d =>
    element("li", d.form_id + " · " + d.file_name + (d.target_number ? " → " + d.target_number : ""))));
  root.querySelector("#validationPanel").classList.remove("hidden");
  root.querySelector("#diagnosticPanel").classList.remove("hidden");
  root.querySelector("#validationDetails").open = !!data.needs_review;
  root.querySelector("#responseAction").value = response.action || "unknown";
  const candidates = (response.signatures || []).map(s => s.datetime).filter(Boolean).sort();
  root.querySelector("#acceptanceInput").value = (response.datetime || response.confirmed_datetime || candidates.at(-1) || "").slice(0,19);
  root.querySelector("#confirmSignatures").checked = !!response.complete;
  const proof = response.source || response.signatures?.[0]?.source;
  root.querySelector("#acceptanceEvidence").textContent = proof
    ? proof.source_form + " · " + proof.source_clause + " · page " + (proof.source_page || "à confirmer") +
      " · Confiance " + Math.round((response.confidence || 0)*100) + " %"
    : "Aucune date contractuelle certaine. Consultez la réponse du vendeur.";
  root.querySelector("#conditionEditors").replaceChildren(...(data.conditions || []).map(c => renderConditionEditor(c,data.conditions)));
  const eventIds = new Set((data.conditions || []).map(c => c.trigger_used || c.trigger)
    .filter(t => t && t !== "acceptance" && t !== "explicit" && !t.startsWith("condition:")));
  for (const c of data.conditions || []) if (c.alternative_trigger) eventIds.add(c.alternative_trigger);
  for (const o of data.overrides || []) eventIds.add(o.to_trigger);
  const events = root.querySelector("#eventEditors");
  events.replaceChildren();
  if (eventIds.size) events.append(element("h3", "Événements effectivement survenus"));
  for (const id of eventIds) {
    const input = inputField(id.replaceAll("_"," "), "datetime-local", (data.events?.[id]?.datetime || "").slice(0,19), id, events);
    input.dataset.event = id;
    input.step = "1";
  }
  const overrides = root.querySelector("#overrideEditors");
  overrides.replaceChildren();
  for (const [index,o] of (data.overrides || []).entries()) {
    const select = selectField(o.source.source_form + " — " + o.source.source_clause + " : report du point de départ",
      o.active === null ? "unknown" : String(o.active),
      [["unknown","À confirmer"],["true","Applicable"],["false","Non applicable"]], "override-"+index, overrides);
    select.dataset.override = index;
  }
  root.querySelector("#reviewPagesLabel").classList.toggle("hidden", !(data.issues || []).length);
  root.querySelector("#reviewPages").checked = false;
  root.querySelector("#diagnosticOutput").textContent = JSON.stringify(data.raw, null, 2);
}
root.querySelector("#addCondition").addEventListener("click", () => {
  if (!currentResult) return;
  const c = {id:"manual:"+crypto.randomUUID(), type:"autre", label:"", active:null,
    clause:"Saisie manuelle", source_page:null, source:{source_form:currentResult.main_form || "Manuel",source_clause:"Saisie manuelle",source_page:null,
      detected_text:"Ajout par l'utilisateur",confidence:0,method:"manual"},
    trigger:"acceptance", duration_days:null, explicit_date:null, deadline_time:null, confidence:0};
  currentResult.conditions.push(c);
  root.querySelector("#conditionEditors").append(renderConditionEditor(c,currentResult.conditions));
});
validationForm.addEventListener("submit", async event => {
  event.preventDefault();
  clearError();
  if (!currentResult) return;
  if (currentResult.manual_override) { await saveManualConfirmation(); return; }
  const tx = structuredClone(currentResult);
  const action = root.querySelector("#responseAction").value;
  const moment = root.querySelector("#acceptanceInput").value;
  const signatures = root.querySelector("#confirmSignatures").checked;
  if (action === "unknown" || (action === "accept" && (!moment || !signatures))) {
    showError("Confirmez la réponse, la date et l'heure d'acceptation, et les signatures vendeur requises.");
    return;
  }
  tx.acceptance = {...tx.acceptance, action, confirmed:action === "accept",
    confirmed_datetime:moment, signatures_confirmed:signatures,
    confirmation_source:{method:"user_confirmation",previous:tx.acceptance.source}};
  for (const row of root.querySelectorAll(".condition-editor")) {
    const c = tx.conditions.find(c => c.id === row.dataset.id);
    const value = name => row.querySelector('[name="' + name + '"]').value;
    if (c.active === null) {
      showError("Indiquez si chacune des conditions incertaines est active ou inactive.");
      return;
    }
    c.label=value("label").trim();
    c.clause=value("clause").trim();
    c.duration_days=value("days")===""?null:Number(value("days"));
    c.trigger=value("trigger");
    c.explicit_date=value("date") || null;
    c.deadline_time=value("time") || null;
    if (c.active && (!c.label || (c.duration_days===null && !c.duration_hours && !c.explicit_date))) {
      showError("Précisez le libellé et la durée ou la date de chaque condition active.");
      return;
    }
    c.confirmed=true;
    c.confirmation_source={method:"user_confirmation",previous:structuredClone(c.source)};
    c.source={...c.source,source_clause:c.clause,source_page:c.source_page};
  }
  tx.events = tx.events || {};
  for (const input of root.querySelectorAll("[data-event]")) {
    if (input.value) tx.events[input.dataset.event]={datetime:input.value,confidence:1,confirmed:true};
    else delete tx.events[input.dataset.event];
  }
  for (const select of root.querySelectorAll("[data-override]")) {
    if (select.value==="unknown") { showError("Confirmez l'application des reports de délais."); return; }
    const o=tx.overrides[Number(select.dataset.override)];
    o.active=select.value==="true";
    o.confirmed=true;
  }
  if ((tx.issues || []).length) {
    if (!root.querySelector("#reviewPages").checked) { showError("Vérifiez les pages signalées avant de confirmer."); return; }
    tx.review_log=[...(tx.review_log || []),{issues:tx.issues,method:"user_confirmation",timestamp:new Date().toISOString()}];
    tx.issues=[];
  }
  const button=root.querySelector("#confirmButton");
  button.disabled=true;
  const runId=analysisRunId;
  const revision=manualRevision;
  try {
    const response=await fetch("/api/tools/email/recalculate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(tx)});
    const updated=await response.json();
    if (runId !== analysisRunId || revision !== manualRevision || currentResult?.id !== tx.id) return;
    if (!response.ok || !updated.ok) throw new Error(updated.error || "Le recalcul a échoué.");
    transactions=transactions.map(t=>t.id===updated.id?updated:t);
    renderResult(updated);
    setStatus(updated.needs_review?"À confirmer":"Courriel prêt",updated.needs_review?"error":"success");
  } catch(error) { if (runId===analysisRunId && revision===manualRevision) showError(error.message); }
  finally { if (revision===manualRevision) button.disabled=false; }
});

let manualRevision = 0;
let manualSaving = false;
let manualErrorMessage = "";
const manualConfirmation = root.querySelector("#manualConfirmation");
const manualConfirmButton = root.querySelector("#manualConfirmButton");
function resetManualConfirmation() {
  manualRevision++;
  manualSaving = false;
  manualConfirmButton.disabled = false;
  root.querySelector("#confirmButton").disabled = false;
  manualErrorMessage = "";
  for (const tx of transactions) {
    if (!tx.manual_override) continue;
    tx.manual_override = false;
    if (tx.raw) tx.raw.manual_override = false;
    tx.needs_review = true;
    tx.email = "";
  }
  manualConfirmation.classList.add("hidden");
}
function renderManualConfirmation() {
  const confirmed = currentResult?.manual_override === true;
  const show = !!currentResult && (confirmed || currentResult.needs_review || !errorBox.classList.contains("hidden"));
  manualConfirmation.classList.toggle("hidden", !show);
  manualConfirmButton.classList.toggle("hidden", confirmed);
  root.querySelector("#manualConfirmed").classList.toggle("hidden", !confirmed);
  // Keep the control immediately below whichever warning is currently shown.
  const anchor = !errorBox.classList.contains("hidden") ? errorBox : warningsPanel;
  anchor.after(manualConfirmation);
  root.querySelector("#confirmButton").textContent = confirmed ? "Enregistrer les modifications" : "Confirmer et recalculer";
}
function captureDisplayedTransaction() {
  const tx = structuredClone(currentResult);
  tx.acceptance = {...tx.acceptance, action:root.querySelector("#responseAction").value,
    confirmed_datetime:root.querySelector("#acceptanceInput").value};
  for (const row of root.querySelectorAll(".condition-editor")) {
    const c = tx.conditions.find(c => c.id === row.dataset.id);
    const value = name => row.querySelector('[name="'+name+'"]').value;
    const date = value("date") || null;
    const time = value("time") || null;
    if (date !== (c.explicit_date || null)) c.date = date;
    if (time !== (c.deadline_time || null)) c.time = time;
    Object.assign(c, {label:value("label"),clause:value("clause"),
      duration_days:value("days") === "" ? null : Number(value("days")),
      trigger:value("trigger"),explicit_date:date,deadline_time:time});
    c.source = {...c.source,source_clause:c.clause,source_page:c.source_page};
  }
  tx.events = tx.events || {};
  for (const input of root.querySelectorAll("[data-event]")) {
    if (input.value) tx.events[input.dataset.event] = {datetime:input.value,confirmed:true,confidence:1};
    else delete tx.events[input.dataset.event];
  }
  for (const select of root.querySelectorAll("[data-override]")) {
    tx.overrides[Number(select.dataset.override)].active = select.value === "unknown" ? null : select.value === "true";
  }
  if (!errorBox.classList.contains("hidden") && errorBox.textContent !== manualErrorMessage) tx.warnings = [...new Set([...(tx.warnings || []),errorBox.textContent])];
  return tx;
}
async function saveManualConfirmation() {
  if (!currentResult) return;
  const tx = captureDisplayedTransaction();
  const revision = ++manualRevision;
  manualSaving = true;
  const runId = analysisRunId;
  // An old email must never remain copyable while newer edits are being saved.
  email.value = "";
  copyButton.disabled = true;
  manualConfirmButton.disabled = true;
  root.querySelector("#confirmButton").disabled = true;
  try {
    const response = await fetch("/api/tools/email/confirm", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(tx)});
    const updated = await response.json();
    if (revision !== manualRevision || runId !== analysisRunId || currentResult?.id !== tx.id) return;
    if (!response.ok || !updated.ok) throw new Error(updated.error || "La confirmation a échoué.");
    if (manualErrorMessage && errorBox.textContent === manualErrorMessage) clearError();
    manualErrorMessage = "";
    transactions = transactions.map(t => t.id === updated.id ? updated : t);
    renderResult(updated, true);
    root.querySelector("#diagnosticOutput").textContent = JSON.stringify(updated.raw,null,2);
  } catch (error) {
    if (revision === manualRevision && runId === analysisRunId) {
      manualErrorMessage = error.message;
      showError(error.message);
      setStatus("À vérifier", "error");
    }
  } finally {
    if (revision === manualRevision) {
      manualSaving = false;
      manualConfirmButton.disabled = false;
      root.querySelector("#confirmButton").disabled = false;
    }
  }
}
manualConfirmButton.addEventListener("click", saveManualConfirmation);
validationForm.addEventListener("input", () => {
  if (currentResult?.manual_override || manualSaving) saveManualConfirmation();
});

return () => { analysisRunId++; manualRevision++; clearProgressTimers(); controller.abort(); };
}


