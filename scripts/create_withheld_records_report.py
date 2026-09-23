from __future__ import annotations
import json
from pathlib import Path

root=Path('/home/ubuntu/vegas-sweeps-navigator/work')
plan=json.loads((root/'confirmation_update_plan.json').read_text())

def esc(v):
    return str(v).replace('|','\\|')

primary_unmatched=[x for x in plan['issues'] if x['type']=='primary-unmatched']
primary_ambiguous=[x for x in plan['issues'] if x['type']=='primary-ambiguous']
guest_unmatched=[x for x in plan['issues'] if x['type']=='guest-unmatched']
guest_ambiguous=[x for x in plan['issues'] if x['type']=='guest-ambiguous']
lines=['# Withheld Confirmation Records','', 'Source: `Copy of Delegate 9.22 w confirm.xlsx`', 'Target: `realnovemberevent` → `Hotel Confirmation` / column S', '', 'These records were not written because the name was not found exactly, the name matched multiple master rows, or the same master row produced conflicting confirmation numbers. The source spelling and confirmation values below are preserved verbatim.', '', f'## 1. Unmatched primary bowlers ({len(primary_unmatched)})', '', '| Source row | Bowler name | Confirmation |', '|---:|---|---|']
for x in primary_unmatched:
    lines.append(f'| {x["source_row"]} | {esc(x["name"])} | `{x["conf"]}` |')
lines += ['', f'## 2. Ambiguous primary bowlers ({len(primary_ambiguous)})', '', '| Source row | Bowler name | Confirmation | Candidate master rows |', '|---:|---|---|---|']
for x in primary_ambiguous:
    lines.append(f'| {x["source_row"]} | {esc(x["name"])} | `{x["conf"]}` | {", ".join(map(str,x.get("candidates",[])))} |')
lines += ['', f'## 3. Unmatched guests ({len(guest_unmatched)})', '', '| Source row | Guest name | Confirmation | Associated primary bowler |', '|---:|---|---|---|']
for x in guest_unmatched:
    lines.append(f'| {x["source_row"]} | {esc(x["name"])} | `{x["conf"]}` | {esc(x["primary"])} |')
lines += ['', f'## 4. Ambiguous guests ({len(guest_ambiguous)})', '', '| Source row | Guest name | Confirmation | Associated primary bowler | Candidate master rows |', '|---:|---|---|---|---|']
for x in guest_ambiguous:
    lines.append(f'| {x["source_row"]} | {esc(x["name"])} | `{x["conf"]}` | {esc(x["primary"])} | {", ".join(map(str,x.get("candidates",[])))} |')
lines += ['', '## 5. Conflicting target rows', '', '| Master row | Conflicting confirmations | Source assignments |', '|---:|---|---|']
for x in plan['conflicts']:
    assignments='; '.join(f'{a["conf"]} ({a["type"]}, source row {a["source_row"]})' for a in x['assignments'])
    lines.append(f'| {x["target_row"]} | ' + ', '.join(sorted(set(a['conf'] for a in x['assignments']))) + f' | {assignments} |')

out=Path('/home/ubuntu/vegas-sweeps-navigator/references/withheld-confirmation-records.md')
out.write_text('\n'.join(lines)+'\n')
print(out)
print('counts',len(primary_unmatched),len(primary_ambiguous),len(guest_unmatched),len(guest_ambiguous),len(plan['conflicts']))
