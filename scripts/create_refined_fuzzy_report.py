from __future__ import annotations
import json,re
from pathlib import Path
root=Path('/home/ubuntu/vegas-sweeps-navigator')
data=json.loads((root/'work/refined_fuzzy_matches.json').read_text())
def n(s): return re.sub(r'[^A-Z0-9]','',str(s).upper())
def is_variant(r): return bool(r['candidates']) and n(r['name']) != n(r['candidates'][0]['name'])
variants=[r for r in data if is_variant(r)]
strong=[r for r in variants if r['candidates'][0]['score']>=88]
review=[r for r in variants if 78<=r['candidates'][0]['score']<88]
weak=[r for r in variants if r['candidates'][0]['score']<78]
exact=[r for r in data if r['candidates'] and not is_variant(r)]
none=[r for r in data if not r['candidates']]
lines=['# Refined Fuzzy-Match Review of Withheld Hotel Records','', 'Read-only analysis. **No Google Sheet values were changed.** Names were compared component-by-component against the master sheet, using first-name and last-name similarity.', '', '| Result group | Count |', '|---|---:|', f'| Strong spelling-variation candidates (score ≥ 88) | {len(strong)} |', f'| Review spelling-variation candidates (78–87.9) | {len(review)} |', f'| Weak spelling-variation candidates (< 78) | {len(weak)} |', f'| Exact-name candidates already covered by ambiguity/conflict review | {len(exact)} |', f'| No qualifying candidate | {len(none)} |', '', '## Strong spelling-variation candidates', '', '| Source row | Type | Withheld name | Conf # | Master row | Master name | Score | First score | Last score | Center |', '|---:|---|---|---|---:|---|---:|---:|---:|---|']
def add_table(records):
 for r in sorted(records,key=lambda r:(-r['candidates'][0]['score'],int(r['source_row']))):
  c=r['candidates'][0]
  lines.append(f'| {r["source_row"]} | {r["type"]} | {r["name"]} | `{r["conf"]}` | {c["row"]} | {c["name"]} | {c["score"]} | {c["first_score"]} | {c["last_score"]} | {c["center"]} |')
add_table(strong)
lines += ['', '## Review candidates', '', '| Source row | Type | Withheld name | Conf # | Master row | Master name | Score | First score | Last score | Center |', '|---:|---|---|---|---:|---|---:|---:|---:|---|']
add_table(review)
lines += ['', '## Interpretation', '', 'The strong list contains plausible typographical, punctuation, suffix, or spelling variants. It still requires human confirmation before importing because a similar name is not proof of identity. The review list contains weaker similarities and should not be imported without additional evidence such as center, team, dates, phone, email, or hotel details.', '', 'The full top-five candidate ranking for all 147 withheld records is available in the companion fuzzy audit report.']
out=root/'references/refined-fuzzy-match-candidates.md'
out.write_text('\n'.join(lines)+'\n')
print(out)
print('strong',len(strong),'review',len(review),'weak',len(weak),'exact',len(exact),'none',len(none))
