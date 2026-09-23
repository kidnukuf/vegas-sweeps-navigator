from __future__ import annotations
import json
from pathlib import Path

root=Path('/home/ubuntu/vegas-sweeps-navigator/work')
plan=json.loads((root/'confirmation_update_plan.json').read_text())
master_before=json.loads((root/'realnovemberevent_before.json').read_text())['values']
after=json.loads((root/'realnovemberevent_after.json').read_text())['values']
expected={x['target_row']:x['conf'] for x in plan['final']}
errors=[]
for row in range(2,1001):
    before=master_before[row-1][18] if row-1<len(master_before) and len(master_before[row-1])>18 else ''
    actual=after[row-1][18] if row-1<len(after) and len(after[row-1])>18 else ''
    want=expected.get(row,before or '')
    if str(actual or '') != str(want or ''):
        errors.append({'row':row,'before':before,'want':want,'actual':actual})
print('verified_rows',999-len(errors))
print('errors',len(errors))
if errors:
    print(json.dumps(errors[:20],indent=2))
    raise SystemExit(1)
