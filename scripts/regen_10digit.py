"""
regen_10digit.py

Regenerates all bowler scantronIds to the correct 10-digit format:
  CC(2) + LL(2) + EE(2) + TT(2) + BB(2) = 10 digits

Old 9-digit IDs: CC(2)+L(1)+EE(2)+TT(2)+BB(2)
New 10-digit IDs: CC(2)+LL(2)+EE(2)+TT(2)+BB(2)

The league code L is padded to 2 digits (LL), e.g. "1" → "01".
Everything else stays the same.

Also updates guest_pool_party_tokens.token accordingly.

Run: python3 scripts/regen_10digit.py
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

# Get all bowlers with their current scantronId
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

id_map = {}  # old 9-digit → new 10-digit
updated = 0
skipped = 0
warned = 0

# Sequential counter per team
team_seq = {}

for row in bowlers:
    bid, old_sid, center_id, team_id, first, last, team_code = row
    old_sid = str(old_sid or "")

    cc = center_map.get(center_id, "")
    if not cc:
        print(f"  SKIP (no center) {first} {last}")
        skipped += 1
        continue

    # Extract LL and EE from existing 9-digit ID
    # Old format: CC(2)+L(1)+EE(2)+TT(2)+BB(2) = 9 digits
    if len(old_sid) == 9 and old_sid.isdigit():
        L = old_sid[2:3]   # single digit league
        EE = old_sid[3:5]
    elif len(old_sid) == 10 and old_sid.isdigit():
        # Already 10-digit — extract LL and EE
        L = old_sid[2:4]
        EE = old_sid[4:6]
    else:
        L = "1"
        EE = "26"

    # Pad league to 2 digits
    LL = L.zfill(2)
    TT = str(team_code or "01").zfill(2)

    # BB = sequential counter per team
    team_key = (center_id, team_id)
    seq = team_seq.get(team_key, 0) + 1
    team_seq[team_key] = seq
    BB = str(seq).zfill(2)

    new_id = f"{cc}{LL}{EE}{TT}{BB}"

    if len(new_id) != 10 or not new_id.isdigit():
        print(f"  WARN: '{new_id}' is not 10 digits for {first} {last}")
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

# Update guest_pool_party_tokens — token is bowlerId + letter suffix
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
print(f"   Bowlers updated:       {updated}")
print(f"   Bowlers skipped:       {skipped}")
print(f"   Warnings:              {warned}")
print(f"   Guest tokens updated:  {guest_updated}")

cur.execute("SELECT scantronId, LENGTH(scantronId) as len, legalFirstName, legalLastName FROM bowlers LIMIT 10")
sample = cur.fetchall()
print("\nSample IDs after update:")
for r in sample:
    print(f"  {r[0]}  (len={r[1]})  {r[2]} {r[3]}")

cur.close()
conn.close()
