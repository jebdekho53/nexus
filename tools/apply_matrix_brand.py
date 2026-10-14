"""Apply Matrix branding to HTML entry points and create the desktop icon."""
from pathlib import Path
import re
import json
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
payment_source=(root/'src/renderer/matrix-payments.js').read_text(encoding='utf-8')
payment_labels=dict(re.findall(r"(\w+):'([^']+)'",payment_source.split('const labels=Object.freeze(',1)[1].split(');',1)[0]))
(root/'src/renderer/matrix-build.js').write_text('globalThis.MATRIX_BUILD=Object.freeze('+json.dumps({'name':'Matrix','version':version})+');\n',encoding='utf-8')
for file in (root/'src/renderer').glob('*.html'):
    text=file.read_text(encoding='utf-8')
    text=re.sub(r'Xhamster\s*TS','Matrix',text,flags=re.I)
    text=re.sub(r'Tatkal Software','Matrix',text,flags=re.I)
    text=re.sub(r'\bBrahmos\b','Matrix',text,flags=re.I)
    text=re.sub(r'\bTS\b','Matrix',text)
    text=text.replace('@XhamsterTS','Matrix Workspace')
    text=re.sub(r'(<option\b[^>]*value="([^"]+)"[^>]*>)(.*?)(</option>)',lambda match:match[1]+payment_labels.get(match[2],match[3])+match[4],text,flags=re.S)
    text=text.replace('V1.0.74','V'+version)
    if 'matrix-build.js' not in text:
        text=text.replace('<script defer src="./matrix-brand.js">','<script defer src="./matrix-build.js"></script>\n    <script defer src="./matrix-brand.js">')
    if 'matrix-payments.js' not in text:
        text=text.replace('<script defer src="./matrix-brand.js">','<script defer src="./matrix-payments.js"></script>\n    <script defer src="./matrix-brand.js">')
    text=re.sub(r'<title>(.*?)</title>',lambda m:'<title>'+('Matrix' if m[1]=='Matrix' else 'Matrix · '+m[1].removeprefix('Matrix · '))+'</title>',text)
    if 'matrix-theme.css' not in text:
        text=text.replace('</head>','  <link rel="stylesheet" href="./matrix-theme.css">\n    <script defer src="./matrix-brand.js"></script>\n  </head>')
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
image.save(root/'resources/matrix.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
watermark=root/'src/renderer/assets/booking-box-D9W7nPM1.css'
watermark.write_text(watermark.read_text(encoding='utf-8').replace('Xhamster%20TS','Matrix'),encoding='utf-8')
(root/'src/renderer/icons/brahmos.svg').write_bytes((root/'src/renderer/assets/matrix-mark.svg').read_bytes())
print('Updated HTML entry points and Matrix desktop icons.')
