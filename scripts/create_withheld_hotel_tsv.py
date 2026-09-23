from __future__ import annotations
import csv, json, re
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from openpyxl import load_workbook

root=Path('/home/ubuntu/vegas-sweeps-navigator')
work=root/'work'
source=load_workbook(work/'source_delegate_9_22.xlsx', data_only=True, read_only=False).active
plan=json.loads((work/'confirmation_update_plan.json').read_text())

def clean(v):
    if v is None: return ''
    return str(v).replace('\t',' ').replace('\r',' ').replace('\n',' ').strip()

def date_text(v):
    if isinstance(v, datetime):
        return v.strftime('%m/%d/%Y')
    return clean(v)

def norm(v):
    s=clean(v).upper()
    return re.sub(r'\s+',' ',re.sub(r'[^A-Z0-9]+',' ',s)).strip()

# Map source rows to exact source names and primary associations.
source_primary={}
source_guest={}
current=None
for r in range(1, source.max_row+1):
    a=source.cell(r,1).value; b=source.cell(r,2).value; c=source.cell(r,3).value
    if a is not None and c is not None and not str(a).startswith(('THE ','Print ','Group ')) and norm(a)!='LAST NAME':
        current={'source_row':r,'last':clean(a),'first':clean(b),'full':f'{clean(b)} {clean(a)}'.strip(),'conf':clean(c),'room_type':clean(source.cell(r,4).value),'arrival':date_text(source.cell(r,5).value),'departure':date_text(source.cell(r,6).value)}
        source_primary[r]=current
    elif current and isinstance(b,str) and b.upper().startswith('ADDL GST:'):
        raw=b.split(':',1)[1].strip(); parts=[p.strip() for p in raw.split(',',1)]
        if len(parts)==2:
            guest={'source_row':r,'last':parts[0],'first':parts[1],'full':f'{parts[1]} {parts[0]}'.strip(),'conf':current['conf'],'associated_primary':current['full'],'room_type':current['room_type'],'arrival':current['arrival'],'departure':current['departure']}
            source_guest[r]=guest

headers=['Source Row','Record Type','Last Name','First Name','Name','Confirmation','Room Type','Arrival','Departure','Associated Primary','Status','Candidate Master Rows','Reason']
rows=[]
for x in plan['issues']:
    if x['type'].startswith('primary-'):
        src=source_primary.get(x['source_row'],{})
        rows.append([x['source_row'],'Primary bowler',src.get('last',''),src.get('first',''),src.get('full',x.get('name','')),x['conf'],src.get('room_type',''),src.get('arrival',''),src.get('departure',''),'',x['type'].replace('primary-',''),', '.join(map(str,x.get('candidates',[]))), 'Not written because exact master match was unavailable or ambiguous'])
    elif x['type'].startswith('guest-'):
        src=source_guest.get(x['source_row'],{})
        rows.append([x['source_row'],'Guest',src.get('last',''),src.get('first',''),src.get('full',x.get('name','')),x['conf'],src.get('room_type',''),src.get('arrival',''),src.get('departure',''),src.get('associated_primary',x.get('primary','')),x['type'].replace('guest-',''),', '.join(map(str,x.get('candidates',[]))), 'Not written because exact guest match was unavailable or ambiguous'])
for x in plan['conflicts']:
    for a in x['assignments']:
        if a['type']=='primary': src=source_primary.get(a['source_row'],{})
        else: src=source_guest.get(a['source_row'],{})
        rows.append([a['source_row'], 'Primary bowler' if a['type']=='primary' else 'Guest', src.get('last',''),src.get('first',''),src.get('full',a.get('name','')),a['conf'],src.get('room_type',''),src.get('arrival',''),src.get('departure',''),src.get('associated_primary',''),'conflict',str(x['target_row']),'Same master row received different source confirmations; withheld'])
rows.sort(key=lambda r:(int(r[0]), r[1], r[5]))

out=root/'references/withheld-hotel-data-for-google-sheets.tsv'
with out.open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f,delimiter='\t',lineterminator='\n')
    w.writerow(headers); w.writerows(rows)

# Validate strict TSV shape and counts.
with out.open(newline='',encoding='utf-8') as f:
    check=list(csv.reader(f,delimiter='\t'))
assert len(check)==len(rows)+1
assert all(len(r)==len(headers) for r in check)
print(out)
print('data_rows',len(rows),'columns',len(headers))
from collections import Counter
print('types',Counter(r[1] for r in rows),'statuses',Counter(r[7] for r in rows))
