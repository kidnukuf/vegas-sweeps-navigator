from __future__ import annotations
import json
from pathlib import Path
root=Path('/home/ubuntu/vegas-sweeps-navigator')
plan=json.loads((root/'work/fuzzy_apply_plan.json').read_text())
current=json.loads((root/'work/realnovemberevent_after.json').read_text())['values']
after=json.loads((root/'work/realnovemberevent_fuzzy_after.json').read_text())['values']
expected={a['target_row']:a['conf'] for a in plan['final']}
errors=[]
for row in range(2,1001):
 old=current[row-1][18] if row-1<len(current) and len(current[row-1])>18 else ''
 actual=after[row-1][18] if row-1<len(after) and len(after[row-1])>18 else ''
 want=expected.get(row,old or '')
 if str(actual or '') != str(want or ''): errors.append((row,want,actual))
print('verified_cells',999-len(errors),'errors',len(errors))
if errors:
 print(errors[:20]); raise SystemExit(1)
