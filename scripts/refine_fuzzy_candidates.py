from __future__ import annotations
import csv,json,re
from pathlib import Path
from difflib import SequenceMatcher
root=Path('/home/ubuntu/vegas-sweeps-navigator')

def norm(s):
 s='' if s is None else str(s).upper().strip()
 return re.sub(r'[^A-Z0-9]','',s)
def sim(a,b): return SequenceMatcher(None,norm(a),norm(b)).ratio()
rows=list(csv.DictReader((root/'references/withheld-hotel-data-for-google-sheets.tsv').open(newline='',encoding='utf-8'),delimiter='\t'))
master=json.load((root/'work/realnovemberevent_before.json').open())['values']
masters=[]
for i,r in enumerate(master[1:],2):
 if len(r)>10 and (r[9] or r[10]): masters.append({'row':i,'first':r[9], 'last':r[10], 'name':f'{r[9]} {r[10]}','center':r[5]})
out=[]
for x in rows:
 scored=[]
 for m in masters:
  fs=sim(x['First Name'],m['first']); ls=sim(x['Last Name'],m['last'])
  # Require meaningful similarity on both components, with an exact component allowing a weaker other component.
  score=(fs+ls)/2
  if (fs>=.72 and ls>=.72) or (fs>=.96 and ls>=.55) or (ls>=.96 and fs>=.55):
   scored.append((score,fs,ls,m))
 scored.sort(key=lambda q:(-q[0],-q[1],-q[2],q[3]['row']))
 out.append({'source_row':x['Source Row'],'type':x['Record Type'],'name':x['Name'],'conf':x['Confirmation'],'candidates':[{'score':round(s*100,1),'first_score':round(fs*100,1),'last_score':round(ls*100,1),'row':m['row'],'name':m['name'],'center':m['center']} for s,fs,ls,m in scored[:5]]})
report=[]
for x in sorted(out,key=lambda x:(-(x['candidates'][0]['score'] if x['candidates'] else 0),int(x['source_row']))):
 if x['candidates']:
  c=x['candidates'][0]; report.append(f"{c['score']:>5} (F{c['first_score']:>4} L{c['last_score']:>4}) source {x['source_row']:>3} {x['type']:<14} {x['name']:<35} {x['conf']:<6} -> master {c['row']} {c['name']} [{c['center']}]")
print('records_with_candidates',sum(bool(x['candidates']) for x in out),'of',len(out))
print('\n'.join(report))
(root/'work/refined_fuzzy_matches.json').write_text(json.dumps(out,indent=2))
