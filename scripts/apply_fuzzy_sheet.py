from __future__ import annotations
import csv,json
from pathlib import Path
root=Path('/home/ubuntu/vegas-sweeps-navigator')
work=root/'work'
plan=json.loads((work/'fuzzy_apply_plan.json').read_text())
current=json.loads((work/'realnovemberevent_after.json').read_text())['values']
column=[]
for row in range(2,1001):
 old=current[row-1][18] if row-1<len(current) and len(current[row-1])>18 else ''
 column.append([old or ''])
for a in plan['final']:
 column[a['target_row']-2]=[a['conf']]
payload={'range':'realnovemberevent!S2:S1000','majorDimension':'ROWS','values':column}
(work/'fuzzy_sheet_update.json').write_text(json.dumps(payload))

out=root/'references/fuzzy-matches-applied-row-name-confirmation.tsv'
with out.open('w',newline='',encoding='utf-8') as f:
 w=csv.writer(f,delimiter='\t',lineterminator='\n')
 w.writerow(['Master Row','Name','Conf #'])
 for a in sorted(plan['final'],key=lambda x:x['target_row']):
  w.writerow([a['target_row'],a['target_name'],a['conf']])
with out.open(newline='',encoding='utf-8') as f:
 check=list(csv.reader(f,delimiter='\t'))
assert len(check)==30 and all(len(r)==3 for r in check)
print('payload',work/'fuzzy_sheet_update.json')
print('paste_file',out)
print('fuzzy_rows',len(plan['final']))
