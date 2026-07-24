"""
fix_all_ids.py

1. Renumber all bowling centers alphabetically as 01, 02, 03...
   (merging duplicate names by keeping the lowest DB id)
2. Regenerate all bowler scantronIds to new 10-digit format:
   CC(2) + L(1) + EE(2) + TT(2) + X(1) + BB(2) = 10 digits
3. Update guest_pool_party_tokens.token (= scantronId + suffix letter)

Run: python3 scripts/fix_all_ids.py
"""

import os, re, sys
import pymysql

url = os.environ.get("DATABASE_URL", "")
m = re.match(r"mysql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?]+)", url)
if not m:
    print("ERROR: DATABASE_URL not set or invalid")
    sys.exit(1)

conn = pymysql.connect(
    user=m.group(1), password=m.group(2),
    host=m.group(3), port=int(m.group(4)), database=m.group(5),
    ssl={"ca": None},
    autocommit=False
)
cur = conn.cursor()

# ── 1. Get all centers ordered alphabetically by name ────────────────────────
cur.execute("SELECT id, centerCode, centerName FROM bowling_centers ORDER BY centerName, id")
centers = cur.fetchall()

print("Current centers (alphabetical):")
for c in centers:
    print(f"  id={c[0]}  code={c[1]}  name={c[2]}")

# Build new code assignment: alphabetical order → 01, 02, 03...
# Deduplicate by name (keep lowest id)
seen_names = {}
ordered_centers = []
for cid, code, name in centers:
    key = name.strip().lower()
    if key not in seen_names:
        seen_names[key] = cid
        ordered_centers.append((cid, name))

# Assign new codes
new_code_map = {}  # centerName.lower() → new_code
id_to_new_code = {}  # center id → new_code
for i, (cid, name) in enumerate(ordered_centers):
    new_code = str(i + 1).zfill(2)
    new_code_map[name.strip().lower()] = new_code
    id_to_new_code[cid] = new_code

# Also map duplicate ids to the same code as their canonical name
for cid, code, name in centers:
    key = name.strip().lower()
    if cid not in id_to_new_code:
        # Duplicate name — find canonical id's new code
        canonical_id = seen_names[key]
        id_to_new_code[cid] = id_to_new_code[canonical_id]

print("\nNew center code assignments:")
for cid, name in ordered_centers:
    print(f"  {id_to_new_code[cid]}  {name}")

# ── 2. Drop unique constraint on centerCode if it exists ─────────────────────
cur.execute("SHOW INDEX FROM bowling_centers WHERE Key_name != 'PRIMARY'")
indexes = cur.fetchall()
for idx in indexes:
    idx_name = idx[2]  # Key_name column
    if "center_code" in idx_name.lower() or "centercode" in idx_name.lower():
        print(f"\nDropping index: {idx_name}")
        cur.execute(f"ALTER TABLE bowling_centers DROP INDEX `{idx_name}`")
        conn.commit()

# ── 3. Update center codes ────────────────────────────────────────────────────
for cid, new_code in id_to_new_code.items():
    cur.execute("UPDATE bowling_centers SET centerCode = %s WHERE id = %s", (new_code, cid))
conn.commit()
print(f"\nUpdated {len(id_to_new_code)} center code(s)")

# Re-add unique constraint
try:
    cur.execute("ALTER TABLE bowling_centers ADD UNIQUE KEY `bowling_centers_centerCode_unique` (centerCode)")
    conn.commit()
    print("Re-added unique constraint on centerCode")
except Exception as e:
    print(f"Note: Could not re-add unique constraint: {e}")
    conn.rollback()

# ── 4. Get all bowlers with their center and team info ────────────────────────
cur.execute("""
    SELECT b.id, b.scantronId, b.centerId, b.teamId, b.bowlerPosition,
           b.legalFirstName, b.legalLastName, t.teamCode
    FROM bowlers b
    JOIN teams t ON b.teamId = t.id
    ORDER BY b.centerId, b.teamId, CAST(b.bowlerPosition AS UNSIGNED), b.id
""")
bowlers = cur.fetchall()
print(f"\nProcessing {len(bowlers)} bowlers...")

# ── 5. Regenerate scantronIds ─────────────────────────────────────────────────
team_seq = {}  # (centerId, teamId) → sequential counter
id_map = {}    # old scantronId → new scantronId
updated = 0
skipped = 0
warned = 0

for row in bowlers:
    bid, old_sid, center_id, team_id, bowler_pos, first, last, team_code = row
    old_sid = str(old_sid or "")

    new_cc = id_to_new_code.get(center_id)
    if not new_cc:
        print(f"  SKIP (no center code) {first} {last} centerId={center_id}")
        skipped += 1
        continue

    # Extract L and EE from existing ID
    # Old 9-char: CC(2)+L(1)+EE(2)+TT(2)+BB(2)
    # Old 10-char (already regenerated): CC(2)+L(1)+EE(2)+TT(2)+X(1)+BB(2)
    if len(old_sid) >= 5:
        L = old_sid[2:3] or "1"
        EE = old_sid[3:5] or "26"
    else:
        L = "1"
        EE = "26"

    # X = bowling position within team (1-5)
    x_raw = re.sub(r'\D', '', str(bowler_pos or "1"))
    x = x_raw[:1] if x_raw else "1"

    # BB = sequential counter per team
    team_key = (center_id, team_id)
    seq = team_seq.get(team_key, 0) + 1
    team_seq[team_key] = seq
    BB = str(seq).zfill(2)

    # TT = team code padded to 2 digits
    TT = str(team_code or "01").zfill(2)

    new_id = f"{new_cc}{L}{EE}{TT}{x}{BB}"

    if len(new_id) != 10 or not new_id.isdigit():
        print(f"  WARN: '{new_id}' is not 10 digits for {first} {last} (CC={new_cc} L={L} EE={EE} TT={TT} X={x} BB={BB})")
        warned += 1
        skipped += 1
        continue

    if old_sid:
        id_map[old_sid] = new_id

    if new_id == old_sid:
        skipped += 1
        continue

    cur.execute("UPDATE bowlers SET scantronId = %s WHERE id = %s", (new_id, bid))
    print(f"  {first} {last}: {old_sid or 'null'} → {new_id}")
    updated += 1

conn.commit()

# ── 6. Update guest_pool_party_tokens ────────────────────────────────────────
cur.execute("SELECT id, token FROM guest_pool_party_tokens")
guest_tokens = cur.fetchall()
guest_updated = 0
for gid, tok in guest_tokens:
    tok = str(tok or "")
    if len(tok) < 2:
        continue
    suffix = tok[-1]  # letter suffix A, B, C...
    old_sid = tok[:-1]
    new_sid = id_map.get(old_sid)
    if new_sid:
        new_tok = new_sid + suffix
        cur.execute("UPDATE guest_pool_party_tokens SET token = %s WHERE id = %s", (new_tok, gid))
        guest_updated += 1
        print(f"  Guest token: {tok} → {new_tok}")

conn.commit()

print(f"\n✅ Done:")
print(f"   Bowlers updated:  {updated}")
print(f"   Bowlers skipped:  {skipped}")
print(f"   Warnings:         {warned}")
print(f"   Guest tokens updated: {guest_updated}")

# Sample output
cur.execute("SELECT scantronId, legalFirstName, legalLastName FROM bowlers LIMIT 10")
sample = cur.fetchall()
print("\nSample IDs after regeneration:")
for r in sample:
    print(f"  {r[0]}  {r[1]} {r[2]}")

cur.close()
conn.close()
