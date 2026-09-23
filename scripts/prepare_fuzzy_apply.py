from __future__ import annotations
import json,re
from collections import Counter,defaultdict
from pathlib import Path
root=Path('/home/ubuntu/vegas-sweeps-navigator')
data=json.loads((root/'work/refined_fuzzy_matches.json').read_text())
master=json.loads((root/'work/realnovemberevent_before.json').read_text())['values']
def n(s): return re.sub(r'[^A-Z0-9]','',str(s).upper())
variants=[r for r in data if r['candidates'] and n(r['name'])!=n(r['candidates'][0]['name'])]
assign=[]
for r in variants:
 c=r['candidates'][0]
 target=int(c['row'])
 existing=master[target-1][18] if target-1<len(master) and len(master[target-1])>18 else ''
 assign.append({'source_row':int(r['source_row']),'record_type':r['type'],'source_name':r['name'],'conf':r['conf'],'target_row':target,'target_name':c['name'],'score':c['score'],'center':c['center'],'existing':existing})
by=defaultdict(list)
for a in assign: by[a['target_row']].append(a)
collisions={row:xs for row,xs in by.items() if len(xs)>1}
conflicts=[]; final=[]
for row,xs in by.items():
 confs=sorted(set(x['conf'] for x in xs))
 existing=str(xs[0]['existing'] or '')
 if len(confs)>1: conflicts.append({'target_row':row,'assignments':xs,'existing':existing})
 elif existing and existing not in confs: conflicts.append({'target_row':row,'assignments':xs,'existing':existing})
 else: final.append(xs[0] | {'all_assignments':xs})
plan={'candidate_variants':len(variants),'assignments':assign,'final':final,'conflicts':conflicts}
(root/'work/fuzzy_apply_plan.json').write_text(json.dumps(plan,indent=2))
print('candidate_variants',len(variants))
print('target_rows',len(by),'final',len(final),'conflicts',len(conflicts))
for x in conflicts: print('CONFLICT',x)
print('final_rows')
for x in sorted(final,key=lambda x:x['target_row']): print(x['target_row'],x['target_name'],x['conf'],x['score'],x['source_row'])
