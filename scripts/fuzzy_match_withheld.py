from __future__ import annotations
import csv, json, re
from pathlib import Path
from difflib import SequenceMatcher
from collections import defaultdict

root=Path('/home/ubuntu/vegas-sweeps-navigator')
withheld=root/'references/withheld-hotel-data-for-google-sheets.tsv'
master_doc=json.loads((root/'work/realnovemberevent_before.json').read_text())
master=master_doc['values']

def norm(s):
    s='' if s is None else str(s).upper().strip()
    s=s.replace('&',' AND ')
    s=re.sub(r'[^A-Z0-9 ]+',' ',s)
    return re.sub(r'\s+',' ',s).strip()

def compact(s): return norm(s).replace(' ','')
def tokens(s): return set(norm(s).split())
def similarity(a,b):
    na,nb=norm(a),norm(b)
    ca,cb=compact(a),compact(b)
    seq=SequenceMatcher(None,ca,cb).ratio()
    tok=(2*len(tokens(a)&tokens(b))/(len(tokens(a))+len(tokens(b)))) if tokens(a) and tokens(b) else 0
    # Favor sequence for names, but retain token overlap for rearranged names.
    return max(seq, 0.65*seq+0.35*tok)

master_names=[]
seen=set()
for rownum,row in enumerate(master[1:],2):
    first=row[9] if len(row)>9 else ''
    last=row[10] if len(row)>10 else ''
    name=f'{first} {last}'.strip()
    if not norm(name): continue
    master_names.append({'row':rownum,'name':name,'center':row[5] if len(row)>5 else '', 'team':row[7] if len(row)>7 else ''})

records=[]
with withheld.open(newline='',encoding='utf-8') as f:
    for r in csv.DictReader(f,delimiter='\t'):
        records.append(r)

# Deduplicate identical withheld source row/name/conf entries only for ranking; retain all source rows in output.
out=[]
for rec in records:
    scored=[]
    for m in master_names:
        score=similarity(rec['Name'],m['name'])
        scored.append((score,m))
    scored.sort(key=lambda x:(-x[0],x[1]['row']))
    top=[]
    for score,m in scored[:5]:
        top.append({'score':round(score*100,1),'row':m['row'],'name':m['name'],'center':m['center'],'team':m['team']})
    best=top[0]
    # Conservative labels: likely >=88, review 78-87.9, weak below 78.
    label='likely' if best['score']>=88 else ('review' if best['score']>=78 else 'weak')
    out.append({**rec,'best_score':best['score'],'best_row':best['row'],'best_name':best['name'],'label':label,'candidates':top})

out_json=root/'work/fuzzy_withheld_matches.json'
out_json.write_text(json.dumps(out,indent=2))

md=[]
md += ['# Fuzzy Match Audit — Withheld Hotel Records','', 'Read-only comparison against `realnovemberevent`. No Google Sheet values were changed.', '', 'Scoring uses normalized full-name similarity. Results are candidates only and require human confirmation before any import.', '', '| Category | Count |', '|---|---:|']
from collections import Counter
md += [f'| Likely candidate (score ≥ 88) | {sum(x["label"]=="likely" for x in out)} |',f'| Review candidate (78–87.9) | {sum(x["label"]=="review" for x in out)} |',f'| Weak candidate (< 78) | {sum(x["label"]=="weak" for x in out)} |', '', '## Candidate matches', '', '| Source row | Type | Withheld name | Conf # | Score | Best master row | Best master name | Center |', '|---:|---|---|---|---:|---:|---|---|']
for x in sorted(out,key=lambda x:(-x['best_score'],int(x['Source Row']))):
    md.append(f'| {x["Source Row"]} | {x["Record Type"]} | {x["Name"]} | `{x["Confirmation"]}` | {x["best_score"]} | {x["best_row"]} | {x["best_name"]} | {x["candidates"][0]["center"]} |')
md += ['', '## Top-five candidates for each withheld record', '']
for x in sorted(out,key=lambda x:int(x['Source Row'])):
    md.append(f'### Source row {x["Source Row"]}: {x["Name"]} — `{x["Confirmation"]}` ({x["label"]})')
    md.append('| Score | Master row | Master name | Center | Team |')
    md.append('|---:|---:|---|---|---|')
    for c in x['candidates']:
        md.append(f'| {c["score"]} | {c["row"]} | {c["name"]} | {c["center"]} | {c["team"]} |')
    md.append('')
report=root/'references/fuzzy-match-audit-withheld-records.md'
report.write_text('\n'.join(md)+'\n')

# Flat TSV for sorting/filtering.
tsv=root/'references/fuzzy-match-audit-withheld-records.tsv'
with tsv.open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f,delimiter='\t',lineterminator='\n')
    w.writerow(['Source Row','Record Type','Withheld Name','Conf #','Label','Best Score','Best Master Row','Best Master Name','Center','Top 5 Candidates'])
    for x in out:
        candidates='; '.join(f'{c["score"]}% row {c["row"]} {c["name"]}' for c in x['candidates'])
        w.writerow([x['Source Row'],x['Record Type'],x['Name'],x['Confirmation'],x['label'],x['best_score'],x['best_row'],x['best_name'],x['candidates'][0]['center'],candidates])
print('records',len(out))
print('labels',Counter(x['label'] for x in out))
print('report',report)
print('tsv',tsv)
