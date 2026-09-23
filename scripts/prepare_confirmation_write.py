from __future__ import annotations
import json
from pathlib import Path

root=Path('/home/ubuntu/vegas-sweeps-navigator/work')
plan=json.loads((root/'confirmation_update_plan.json').read_text())
master=json.loads((root/'realnovemberevent_before.json').read_text())['values']
# Build the S2:S1000 column, preserving all current cells except approved targets.
column=[]
for sheet_row in range(2,1001):
    old=master[sheet_row-1][18] if sheet_row-1 < len(master) and len(master[sheet_row-1])>18 else ''
    column.append([old or ''])
for item in plan['final']:
    sheet_row=item['target_row']
    if 2 <= sheet_row <= 1000:
        column[sheet_row-2]=[item['conf']]
    else:
        raise ValueError(f'out of range target row {sheet_row}')
payload={'range':'realnovemberevent!S2:S1000','majorDimension':'ROWS','values':column}
(root/'confirmation_column_update.json').write_text(json.dumps(payload))

from collections import Counter
issue_counts=Counter(x['type'] for x in plan['issues'])
changed=[x for x in plan['final'] if not x['existing']]
unchanged=[x for x in plan['final'] if x['existing']]
lines=[]
lines += ['# Confirmation Number Import Audit','', '## Source and target', '', '- Source workbook: `Copy of Delegate 9.22 w confirm.xlsx`', '- Target spreadsheet tab: `realnovemberevent`', '- Target column: `Hotel Confirmation` (column S)', f'- Source primary records: **{plan["source_primary_records"]}**', f'- Source guest records: **{plan["source_guest_records"]}**', f'- Verified target rows proposed: **{len(plan["final"])}**', f'- New cell values to write: **{len(changed)}**', f'- Existing matching values preserved: **{len(unchanged)}**', '', '## Exceptions withheld from writing', '', 'Only exact name matches, or uniquely resolved matches using the source arrival/departure dates or the matched primary center, were included. No unmatched or ambiguous record was invented or assigned.', '', '| Exception | Count |', '|---|---:|']
for kind in ('primary-unmatched','primary-ambiguous','guest-unmatched','guest-ambiguous'):
 lines.append(f'| {kind} | {issue_counts.get(kind,0)} |')
lines += ['', '### Primary records withheld', '']
for x in plan['issues']:
 if x['type'].startswith('primary-'):
  lines.append(f'- Source row {x["source_row"]}: **{x["name"]}**, confirmation `{x["conf"]}` — {x["type"].replace("primary-","")}. Candidates: {x.get("candidates",[])}.')
lines += ['', '### Guest records withheld', '']
for x in plan['issues']:
 if x['type'].startswith('guest-'):
  lines.append(f'- Source row {x["source_row"]}: guest **{x["name"]}**, confirmation `{x["conf"]}`, associated primary **{x["primary"]}** — {x["type"].replace("guest-","")}. Candidates: {x.get("candidates",[])}.')
lines += ['', '### Target-row conflicts withheld', '']
for x in plan['conflicts']:
 lines.append(f'- Master row {x["target_row"]}: multiple different confirmations were derived for the same master person, so no value was written. Assignments: ' + '; '.join(f'{a["conf"]} ({a["type"]}, source row {a["source_row"]})' for a in x['assignments']) + '.')
lines += ['', '## Verification notes', '', 'The source confirmation values were copied verbatim. Duplicate confirmation values are retained when the source associates the same confirmation with a bowler and a guest. Rows withheld above require a source correction or an explicit disambiguation before they can be safely imported.']
(root/'confirmation_import_audit.md').write_text('\n'.join(lines)+'\n')
print('payload',root/'confirmation_column_update.json')
print('report',root/'confirmation_import_audit.md')
print('new_values',len(changed),'preserved',len(unchanged),'issues',len(plan['issues']),'conflicts',len(plan['conflicts']))
