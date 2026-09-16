from pathlib import Path
from io import BytesIO
import json

import qrcode
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

OUTPUT_DIR = Path("/home/ubuntu/qr-test-event-output")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

EVENT_ID = 3390003
EVENT_NAME = "Test for qr"
BASE_URL = "https://www.bowlvegas.com/scan/banquet/"

ROWS = [
    {"bowlerId": 1680001, "firstName": "George", "lastName": "Washington", "scantronId": "1801260101", "token": "d02e22a98bdc474aa1e83de38da7ece0", "under21": False},
    {"bowlerId": 1680002, "firstName": "Martha", "lastName": "Washington", "scantronId": "1801260102", "token": "d65aafb238184a7aaef346b2defa2247", "under21": False},
    {"bowlerId": 1680003, "firstName": "John", "lastName": "Adams", "scantronId": "1801260103", "token": "2516b9cf58f84589987adc8d96020ced", "under21": False},
    {"bowlerId": 1680004, "firstName": "Abigail", "lastName": "Adams", "scantronId": "1801260104", "token": "b4d75d797f214a58a321d90138a3e03c", "under21": False},
    {"bowlerId": 1680005, "firstName": "Thomas", "lastName": "Jefferson", "scantronId": "1801260201", "token": "aaabad82283a48cfa2466c7e6be445ad", "under21": True},
    {"bowlerId": 1680006, "firstName": "Martha", "lastName": "Jefferson", "scantronId": "1801260202", "token": "b038c1ff210f4ce7a43511cdab7d85eb", "under21": False},
    {"bowlerId": 1680007, "firstName": "James", "lastName": "Madison", "scantronId": "1801260203", "token": "ddf15ccdb07d4f2590304cc5cfb6a670", "under21": False},
    {"bowlerId": 1680008, "firstName": "Dolley", "lastName": "Madison", "scantronId": "1801260204", "token": "ef98a671338245c5a754bcb4355e70eb", "under21": False},
    {"bowlerId": 1680009, "firstName": "James", "lastName": "Monroe", "scantronId": "0301260301", "token": "623569df953a455c8f188a195f453091", "under21": False},
    {"bowlerId": 1680010, "firstName": "Elizabeth", "lastName": "Monroe", "scantronId": "0301260302", "token": "1c7cdc84874241bfbb813dc8b57ee41b", "under21": True},
]

for row in ROWS:
    row["payload"] = BASE_URL + row["token"]
    row["banquetUsed"] = False

# Create a manifest showing exactly which live tokens are represented.
(OUTPUT_DIR / "test-qr-event-10-bowler-manifest.json").write_text(
    json.dumps({"eventId": EVENT_ID, "eventName": EVENT_NAME, "mode": "banquet", "codes": ROWS}, indent=2),
    encoding="utf-8",
)

font_paths = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
]
font_path = next((p for p in font_paths if Path(p).exists()), None)
def font(size):
    return ImageFont.truetype(font_path, size) if font_path else ImageFont.load_default()

# Generate high-resolution QR cells for a printable 2 x 5 sheet.
cell_w, cell_h = 1536, 1200
margin = 56
contact = Image.new("RGB", (cell_w * 2, cell_h * 5), "white")
draw = ImageDraw.Draw(contact)

for index, row in enumerate(ROWS):
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=16, border=5)
    qr.add_data(row["payload"])
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    qr_img.thumbnail((980, 850), Image.Resampling.LANCZOS)

    x = (index % 2) * cell_w
    y = (index // 2) * cell_h
    draw.rectangle((x, y, x + cell_w - 1, y + cell_h - 1), outline=(210, 210, 210), width=4)
    draw.text((x + margin, y + 28), f"{index + 1}. {row['firstName']} {row['lastName']}", fill=(12, 26, 50), font=font(48))
    draw.text((x + margin, y + 92), f"Test for qr · Banquet Entry · Event {EVENT_ID}", fill=(70, 80, 95), font=font(27))
    age_text = "UNDER 21 — VERIFY AGE STATUS" if row["under21"] else "21+"
    age_color = (174, 32, 32) if row["under21"] else (20, 100, 45)
    draw.text((x + margin, y + 135), age_text, fill=age_color, font=font(30))
    qr_x = x + (cell_w - qr_img.width) // 2
    qr_y = y + 220
    contact.paste(qr_img, (qr_x, qr_y))
    draw.text((x + margin, y + cell_h - 88), f"Scantron ID {row['scantronId']} · Banquet QR", fill=(75, 85, 100), font=font(24))
    draw.text((x + margin, y + cell_h - 52), row["token"], fill=(110, 120, 135), font=font(18))

contact_path = OUTPUT_DIR / "test-qr-event-10-bowler-banquet-qrcodes.png"
contact.save(contact_path, dpi=(300, 300))

pdf_path = OUTPUT_DIR / "test-qr-event-10-bowler-banquet-qrcodes.pdf"
pdf = canvas.Canvas(str(pdf_path), pagesize=letter)
page_w, page_h = letter
pdf.setTitle("Test for qr — 10 Legitimate Bowler Banquet QR Codes")
pdf.setAuthor("Bowl Vegas")
# Draw the contact sheet scaled to fit letter with a small header.
pdf.setFont("Helvetica-Bold", 13)
pdf.drawString(36, page_h - 30, "Test for qr — 10 Legitimate Bowler Banquet QR Codes")
pdf.setFont("Helvetica", 8)
pdf.drawString(36, page_h - 43, "Event ID 3390003 · Generated from active, unredeemed bowler banquet tokens")
pdf.drawImage(ImageReader(contact_path), 36, 36, width=page_w - 72, height=page_h - 92, preserveAspectRatio=True, anchor="c")
pdf.save()

print(json.dumps({"pdf": str(pdf_path), "png": str(contact_path), "manifest": str(OUTPUT_DIR / "test-qr-event-10-bowler-manifest.json"), "count": len(ROWS)}))
