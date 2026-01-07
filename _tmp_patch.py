from pathlib import Path
p=Path('ENDPOINT_TRACKING_SHEET.md')
text=p.read_text(encoding='utf-8')
needle = "| `/admin/achievements/unlock` | POST | achievements.js |"
idx = text.find(needle)
if idx == -1:
    raise SystemExit('needle not found')
insert = "| `/admin/achievements/user/:userId` | GET | achievements.js | ÐY\"õ | Jan 2026 | Added: fetch achievements for a specific user |\n"
text = text[:idx+len(needle)] + " ƒo. | Dec 2025 | - |\n" + insert + text[idx+len(needle)+1:]
p.write_text(text, encoding='utf-8')
print('updated tracking sheet')
