"""Generate anonymous parity expectations with the pinned external source.

Usage: python source-parity-oracle.py /path/to/Courriel-PA-accept-e
No source files are modified and no client PDF is read.
"""
import json
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
root = Path(sys.argv[1])
sha = subprocess.check_output(['git', '-c', f'safe.directory={root.as_posix()}', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
assert sha == '1474422e5f1e9b5e64464ba645cd4d7b3f188017', sha
sys.path[:0] = [str(root), str(root / 'tests')]
from test_final_contract import base, cp, fact
from transaction_bundle import make_transaction
from transaction_engine import source

results = {}
for name in ['pa', 'price', 'notary', 'time', 'successive', 'refused', 'cancel']:
    main = base()
    documents = [main]
    if name != 'pa':
        first = cp(action='refuse' if name == 'refused' else 'accept')
        if name == 'price':
            first['terms'] = [dict(name='prix', value='475000', source=source(first['form_id'], 'P2.3.1', 1, 'Price', .99))]
        if name in ['notary', 'successive', 'refused']:
            first['conditions'] = [fact(first, 'acte_vente', 'P2.3.2', '2027-02-05')]
        if name == 'time':
            first['conditions'] = [fact(first, 'occupation', 'P2.3.3', deadline_time='15:00', patch_fields=['deadline_time'])]
        if name == 'cancel':
            first['conditions'] = [fact(first, 'cancel', 'P2.3.4', active=False, replaces_clause='8.1', removes_clause='8.1')]
        documents.append(first)
        if name == 'successive':
            last = cp('20002', '20001', '2026-09-04T10:00:00-04:00')
            last['conditions'] = [fact(last, 'occupation', 'P2.3.3', '2027-02-07')]
            documents.append(last)
    tx = make_transaction(documents)
    conditions = {c['type']: c for c in tx['conditions']}
    results[name] = dict(price=int(tx['terms']['prix']['value']),
        notary=conditions['acte_vente']['date'], occupancy=conditions['occupation']['date'],
        time=conditions['occupation'].get('time'), inspection=conditions.get('inspection', {}).get('date'),
        financing=conditions['financement']['date'])
print(json.dumps(dict(source=sha, cases=results), indent=2))
