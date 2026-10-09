# Local OCR assets

Copied from App Courriel PA acceptée, commit `1474422`, static/vendor.
PDF.js and Tesseract.js retain their Apache-2.0 licenses alongside the files.
Only the three LSTM cores used by OEM 1 and the French language model are included.
No CDN, API key or external OCR service; these assets are loaded on demand.
The browser OCR adapter ports the existing rendering, French OCR,
PAD inspection markers and targeted occupation reading. Rendering is capped at 3200 pixels; filled numeric day fields get a bounded
focused read. It does not compress,
modify or persist uploaded PDFs. The server remains the only analysis engine.
