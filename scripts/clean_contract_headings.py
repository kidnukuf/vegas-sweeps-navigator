from pathlib import Path
import re

path = Path('/home/ubuntu/vegas-sweeps-navigator/references/bowlvegas-updated-event-services-agreement.md')
text = path.read_text(encoding='utf-8')
lines = []
for line in text.splitlines():
    if line.startswith('#'):
        line = re.sub(r'^(#{1,6})\s+\d+(?:\.\d+)*\.?\s+', r'\1 ', line)
    lines.append(line)
path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
