from pathlib import Path

p = Path('public/index.html')
s = p.read_text(encoding='utf-8')

old = '.zoom-far .veh-arrow{top:-4px;font-size:10px;width:12px;height:12px;margin-left:-6px;transform-origin:50% 21px}'
new = '.zoom-far .veh-arrow{top:-8px;font-size:16px;width:18px;height:18px;margin-left:-9px;transform-origin:50% 50%;z-index:5}'
assert old in s, 'zoom-far arrow override not found'
s = s.replace(old, new, 1)

old = '  el.classList.toggle("zoom-far",z<=11);'
new = '  el.classList.toggle("zoom-far",z<=9);'
assert old in s, 'zoom-far threshold not found'
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
