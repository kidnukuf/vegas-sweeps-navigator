from __future__ import annotations
import csv,json
from pathlib import Path
root=Path('/home/ubuntu/vegas-sweeps-navigator')
source=root/'references/withheld-hotel-data-for-google-sheets.tsv'
plan=json.loads((root/'work/fuzzy_apply_plan.json').read_text())
removed={str(x['source_row']) for x in plan['assignments']}
with source.open(newline='',encoding='utf-8') as f:
    rows=list(csv.DictReader(f,delimiter='\t'))
remaining=[r for r in rows if r['Source Row'] not in removed]
remaining.sort(key=lambda r:(int(r['Source Row']),r['Record Type'],r['Name']))
out=root/'references/remaining-not-added-row-name-confirmation.tsv'
with out.open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f,delimiter='\t',lineterminator='\n')
    w.writerow(['Row Data','Name','Conf #'])
    for r in remaining:
        w.writerow([r['Source Row'],r['Name'],r['Confirmation']])
with out.open(newline='',encoding='utf-8') as f:
    check=list(csv.reader(f,delimiter='\t'))
assert len(check)==119 and all(len(r)==3 for r in check)
print(out)
print('data_rows',len(check)-1,'columns',len(check[0]))
print('first_data',check[1])
print('last_data',check[-1])
