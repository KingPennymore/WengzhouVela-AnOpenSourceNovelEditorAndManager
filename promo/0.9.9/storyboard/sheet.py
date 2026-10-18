# Contact sheet of the storyboard frames: python3 promo/0.9.9/storyboard/sheet.py → storyboard/contact-sheet.jpg
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
here=Path(__file__).parent
frames=sorted((here/'frames').glob('*.jpg'),key=lambda p:(int(''.join(c for c in p.stem if c.isdigit())),p.stem))
cols,tw,th,pad,lab=4,640,360,16,34
rows=(len(frames)+cols-1)//cols
sheet=Image.new('RGB',(cols*(tw+pad)+pad,rows*(th+lab+pad)+pad),(24,22,20))
d=ImageDraw.Draw(sheet)
try:font=ImageFont.truetype('DejaVuSans-Bold.ttf',24)
except OSError:font=ImageFont.load_default()
for i,f in enumerate(frames):
    x,y=pad+(i%cols)*(tw+pad),pad+(i//cols)*(th+lab+pad)
    sheet.paste(Image.open(f).convert('RGB').resize((tw,th),Image.LANCZOS),(x,y+lab))
    d.text((x,y+4),f.stem,fill=(230,222,205),font=font)
sheet.save(here/'contact-sheet.jpg',quality=88)
print(here/'contact-sheet.jpg',len(frames))
