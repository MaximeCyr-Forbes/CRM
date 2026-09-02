"""Local differential test harness. Never imported/deployed by the CRM runtime.

Reads the *unmodified* reference parser supplied explicitly as argv[1]. Input is
synthetic extraction DTOs or private local PDF paths. Nothing is written to disk.
No copied email generator and no reference-app runtime dependency.
"""
import contextlib
import importlib.util
import json
import sys
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

sys.dont_write_bytecode = True
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
spec = importlib.util.spec_from_file_location("oaciq_reference", sys.argv[1])
engine = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = engine
spec.loader.exec_module(engine)


def project(result, paths, pages):
    return {
        "forms": [{"document": p.name, "kind": engine.document_kind(pages[p]),
                   "number": engine.extract_form_number(p, pages[p])} for p in paths],
        "mainDocument": result.file_name,
        "acceptanceDateTime": result.raw["effective_acceptance_datetime"],
        "acceptanceSource": result.raw["acceptance_source"],
        "deadlines": [{"title": d.label, "dateText": d.date_text, "details": d.details} for d in result.deadlines],
        "warnings": result.warnings,
        "transactionDates": result.raw["transaction_dates"],
        "allDeadlinesDeferred": result.raw["all_deadlines_deferred"],
    }


original_open = engine.pdfplumber.open
original_signatures = engine.extract_signature_metadata
original_annotations = engine.extract_free_text_annotations
original_widgets = engine.extract_signature_widget_locations


def analyze(case):
    if "paths" in case:
        engine.pdfplumber.open = original_open
        engine.extract_signature_metadata = original_signatures
        engine.extract_free_text_annotations = original_annotations
        engine.extract_signature_widget_locations = original_widgets
        paths = [Path(p) for p in case["paths"]]
        pages = {p: engine.extract_pages_text(p) for p in paths}
        return project(engine.parse_files(paths), paths, pages)

    docs = {d["name"]: d for d in case["documents"]}

    class Page:
        def __init__(self, p):
            self.p = p
            self.width = p["width"]
            self.height = p["height"]

        def extract_text(self, **_):
            return self.p["text"]

        def extract_words(self, **kwargs):
            return self.p.get("wordsLoose", self.p["words"]) if kwargs.get("x_tolerance") == 2 else self.p["words"]

    def open_document(path):
        return contextlib.nullcontext(SimpleNamespace(pages=[Page(p) for p in docs[Path(path).name]["pages"]]))

    def annotation(a):
        return {**a, "page_index": a.get("pageIndex"), "appearance_text": a.get("text", "")}

    def signatures(path):
        result = []
        for s in docs[Path(path).name]["signatures"]:
            result.append({**annotation(s), "signed_at": datetime.fromisoformat(s["signedAt"]) if s.get("signedAt") else None,
                           "certificate_signed_at": None, "visible_signed_at": None})
        return result

    engine.pdfplumber.open = open_document
    engine.extract_signature_metadata = signatures
    engine.extract_free_text_annotations = lambda p: [annotation(a) for a in docs[Path(p).name]["annotations"]]
    engine.extract_signature_widget_locations = lambda p: [annotation(a) for a in docs[Path(p).name]["signatureWidgets"]]
    paths = [Path(n) for n in docs]
    pages = {p: docs[p.name].get("ocrPages") or [page["text"] for page in docs[p.name]["pages"]] for p in paths}
    ocr = [{"name": d["name"], "pages": d["ocrPages"]} for d in docs.values() if "ocrPages" in d]
    return project(engine.parse_files(paths, ocr_documents=ocr), paths, pages)


output = {}
for case in json.load(sys.stdin):
    try:
        output[case["name"]] = analyze(case)
    except (ValueError, TypeError) as error:
        output[case["name"]] = {"error": str(error)}
json.dump(output, sys.stdout, ensure_ascii=False)
