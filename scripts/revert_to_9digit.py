"""
revert_to_9digit.py

Regenerates all bowler scantronIds to the correct 9-digit format:
  CC(2) + L(1) + EE(2) + TT(2) + BB(2) = 9 digits

Current IDs are 10 digits (CC+L+EE+TT+X+BB). We remove X (position 8, index 7)
to get back to CC(2)+L(1)+EE(2)+TT(2)+BB(2).

Also updates guest_pool_party_tokens.token accordingly.

Run: python3 scripts/revert_to_9digit.py
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

# Get all bowlers
cur.execute("""
    SELECT b.id, b.scantronId, b.centerId, b.teamId, b.legalFirstName, b.legalLastName, t.teamCode
    FROM bowlers b
    JOIN teams t ON b.teamId = t.id
    ORDER BY b.centerId, b.teamId, b.id
""")
bowlers = cur.fetchall()
print(f"Processing {len(bowlers)} bowlers...")

# Build centerId → centerCode map
cur.execute("SELECT id, centerCode FROM bowling_centers")
centers = cur.fetchall()
center_map = {c[0]: str(c[1]).zfill(2) for c in centers}

id_map = {}  # old 10-digit → new 9-digit
updated = 0
skipped = 0
warned = 0

# Sequential counter per team (centerId, teamId)
team_seq = {}

for row in bowlers:
    bid, old_sid, center_id, team_id, first, last, team_code = row
    old_sid = str(old_sid or "")

    cc = center_map.get(center_id, "")
    if not cc:
        print(f"  SKIP (no center) {first} {last}")
        skipped += 1
        continue

    # Extract L and EE from existing ID
    if len(old_sid) >= 5:
        L = old_sid[2:3] or "1"
        EE = old_sid[3:5] or "26"
    else:
        L = "1"
        EE = "26"

    TT = str(team_code or "01").zfill(2)

    # BB = sequential counter per team
    team_key = (center_id, team_id)
    seq = team_seq.get(team_key, 0) + 1
    team_seq[team_key] = seq
    BB = str(seq).zfill(2)

    new_id = f"{cc}{L}{EE}{TT}{BB}"

    if len(new_id) != 9 or not new_id.isdigit():
        print(f"  WARN: '{new_id}' is not 9 digits for {first} {last}")
        warned += 1
        skipped += 1
        continue

    if old_sid:
        id_map[old_sid] = new_id

    if new_id == old_sid:
        skipped += 1
        continue

    cur.execute("UPDATE bowlers SET scantronId = %s WHERE id = %s", (new_id, bid))
    print(f"  {first} {last}: {old_sid} → {new_id}")
    updated += 1

conn.commit()

# Update guest_pool_party_tokens
cur.execute("SELECT id, token FROM guest_pool_party_tokens")
guest_tokens = cur.fetchall()
guest_updated = 0
for gid, tok in guest_tokens:
    tok = str(tok or "")
    if len(tok) < 2:
        continue
    suffix = tok[-1]
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

cur.execute("SELECT scantronId, legalFirstName, legalLastName FROM bowlers LIMIT 10")
sample = cur.fetchall()
print("\nSample IDs after revert:")
for r in sample:
    print(f"  {r[0]}  {r[1]} {r[2]}")

cur.close()
conn.close()
