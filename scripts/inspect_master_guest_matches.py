from __future__ import annotations
import json,re
from collections import defaultdict
from pathlib import Path

p=Path('/home/ubuntu/vegas-sweeps-navigator/work/realnovemberevent_before.json')
rows=json.loads(p.read_text())['values']

def norm(v):
 s='' if v is None else str(v).upper().strip()
 return re.sub(r'\s+',' ',re.sub(r'[^A-Z0-9]+',' ',s)).strip()

print('NONEMPTY_GUEST_NAME')
for i,row in enumerate(rows[1:],2):
    guest=row[61] if len(row)>61 else ''
    addl=row[62] if len(row)>62 else ''
    if guest or addl:
        print(i, 'first=',row[9] if len(row)>9 else '', 'last=',row[10] if len(row)>10 else '', 'guest=',repr(guest),'addl=',repr(addl),'center=',row[5] if len(row)>5 else '')
print('DUPLICATE_BOWLER_NAMES_OF_INTEREST')
for target in [('BROOKS','KRISTINE'),('CLARK','ALICIA'),('FALCON','DEVIN'),('GRAVOIS','TYLER'),('GUINN','RYAN'),('LEE','CYRENA SUNSHINE')]:
  last,first=target
  found=[]
  for i,row in enumerate(rows[1:],2):
    if norm(row[9])==norm(first) and norm(row[10])==norm(last):
      found.append((i,row[5],row[7],row[19],row[20],row[61],row[62]))
  print(target,found)
