from pathlib import Path

src = Path('/home/ubuntu/vegas-sweeps-navigator/references/bowlvegas-updated-event-services-agreement.md')
out = Path('/home/ubuntu/vegas-sweeps-navigator/references/bowlers-orleans-bound-one-event-agreement.md')
text = src.read_text(encoding='utf-8')
replacements = [
    ('# BOWLVEGAS.COM EVENT MANAGEMENT SERVICES AGREEMENT', '# BOWLVEGAS.COM ONE-EVENT MANAGEMENT SERVICES AGREEMENT'),
    ('**B.O.B. November Event**', '**Bowlers Orleans Bound**'),
    ('B.O.B. November Event', 'Bowlers Orleans Bound'),
    ('[Insert date]', 'November 6, 2026', 1),
    ('[Insert date]', 'November 9, 2026', 1),
    ('[Insert date]', 'November 7, 2026', 1),
    ('[Insert dates or “Not included”]', 'November 8, 2026 or as confirmed by the event schedule', 1),
    ('[Insert date, time, and time zone]', 'November 6–9, 2026; support hours to be confirmed in the event schedule', 1),
    ('**$399.00**', '**$199.00**'),
    ('**$2.49 for each unique bowler who completes registration for the Event**', '**$1.99 for each unique bowler who completes registration for the Event**'),
    ('The launch pricing is a one-event accommodation and does not establish the standard price for future events.', 'This is a one-event new-client acquisition special. It applies only to Bowlers Orleans Bound and does not establish the standard price for future events.'),
    ('refund of the $399 launch setup fee', 'refund of the $199 new-client acquisition setup fee'),
    ('**Event:** B.O.B. November Event', '**Event:** Bowlers Orleans Bound'),
    ('B.O.B. November Event  \\  ', 'Bowlers Orleans Bound  \\  '),
    ('The B.O.B. November Event', 'The Bowlers Orleans Bound Event'),
    ('$399 launch setup fee', '$199 new-client acquisition setup fee'),
]
for item in replacements:
    if len(item) == 3:
        old, new, count = item
        text = text.replace(old, new, count)
    else:
        old, new = item
        text = text.replace(old, new)

# Ensure the standard future pricing section does not accidentally present the ordinary standard price as this event's price.
text = text.replace(
    '### 5.2 Future standard pricing\n\nUnless the Parties agree to a different written proposal, future events will be priced at:',
    '### 5.2 Future standard pricing\n\nThe $199/$1.99 amount is limited to this one-event acquisition special. Unless the Parties agree to a different written proposal, future events will be priced at:'
)
# Make the first drafting note explicit for this one-event agreement.
text = text.replace(
    'The Parties should confirm the legal name, authority, notice addresses, event dates, and signature information before execution.',
    'The Parties should confirm the legal name, authority, notice addresses, event details, and signature information before execution.'
)
out.write_text(text, encoding='utf-8')
print(out)
