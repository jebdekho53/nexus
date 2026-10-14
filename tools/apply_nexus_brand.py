"""Apply Nexus branding to HTML entry points and create the desktop icon."""
from pathlib import Path
import re
import json
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
payment_source=(root/'src/renderer/nexus-payments.js').read_text(encoding='utf-8')
payment_labels=dict(re.findall(r"(\w+):'([^']+)'",payment_source.split('const labels=Object.freeze(',1)[1].split(');',1)[0]))
(root/'src/renderer/nexus-build.js').write_text('globalThis.NEXUS_BUILD=Object.freeze('+json.dumps({'name':'Nexus','version':version})+');\n',encoding='utf-8')
for file in (root/'src/renderer').glob('*.html'):
    text=file.read_text(encoding='utf-8')
    text=re.sub(r'Xhamster\s*TS','Nexus',text,flags=re.I)
    text=re.sub(r'Tatkal Software','Nexus',text,flags=re.I)
    text=re.sub(r'\bBrahmos\b','Nexus',text,flags=re.I)
    text=re.sub(r'\bTS\b','Nexus',text)
    text=text.replace('@XhamsterTS','Nexus Workspace')
    text=re.sub(r'(<option\b[^>]*value="([^"]+)"[^>]*>)(.*?)(</option>)',lambda match:match[1]+payment_labels.get(match[2],match[3])+match[4],text,flags=re.S)
    text=text.replace('V1.0.74','V'+version)
    if 'nexus-build.js' not in text:
        text=text.replace('<script defer src="./nexus-brand.js">','<script defer src="./nexus-build.js"></script>\n    <script defer src="./nexus-brand.js">')
    if 'nexus-payments.js' not in text:
        text=text.replace('<script defer src="./nexus-brand.js">','<script defer src="./nexus-payments.js"></script>\n    <script defer src="./nexus-brand.js">')
    text=re.sub(r'<title>(.*?)</title>',lambda m:'<title>'+('Nexus' if m[1]=='Nexus' else 'Nexus · '+m[1].removeprefix('Nexus · '))+'</title>',text)
    if 'nexus-theme.css' not in text:
        text=text.replace('</head>','  <link rel="stylesheet" href="./nexus-theme.css">\n    <script defer src="./nexus-brand.js"></script>\n  </head>')
    if file.name=='splash.html':
        text=re.sub(r'<video\b.*?</video>','<video class="bg" muted loop playsinline aria-hidden="true"></video>',text,flags=re.S)
        if '<video' not in text:text=text.replace('<div class="splash">','<div class="splash">\n      <video class="bg" muted loop playsinline aria-hidden="true"></video>')
        text=text.replace('Running security checks…','Preparing your workspace…')
    file.write_text(text,encoding='utf-8')

image=Image.new('RGBA',(256,256),(0,0,0,0));draw=ImageDraw.Draw(image)
draw.rounded_rectangle((4,4,252,252),radius=60,fill='#162a29',outline='#3e7661',width=4)
draw.polygon([(72,180),(72,76),(96,76),(160,156),(160,76),(184,76),(184,180),(160,180),(96,100),(96,180)],fill='#80edc5')
draw.polygon([(72,76),(96,76),(184,180),(160,180)],fill='#d9fff0')
draw.ellipse((180,48,204,72),fill='#80edc5')
image.save(root/'resources/icon.png')
image.save(root/'resources/nexus.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
watermark=root/'src/renderer/assets/booking-box-D9W7nPM1.css'
watermark.write_text(watermark.read_text(encoding='utf-8').replace('Xhamster%20TS','Nexus'),encoding='utf-8')
(root/'src/renderer/icons/brahmos.svg').write_bytes((root/'src/renderer/assets/nexus-mark.svg').read_bytes())
print('Updated HTML entry points and Nexus desktop icons.')
