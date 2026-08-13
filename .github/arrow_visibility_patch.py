from pathlib import Path

p = Path('public/index.html')
s = p.read_text(encoding='utf-8')

old = '''  transform:rotate(var(--bearing,0deg));
  transform-origin:50% 31px;
  transition:transform .25s ease;
  pointer-events:none;'''
new = '''  transform:rotate(var(--bearing,0deg));
  transform-origin:50% 50%;
  transition:transform .25s ease;
  pointer-events:none;
  z-index:5;'''
assert old in s, 'arrow transform block not found'
s = s.replace(old, new, 1)

old = '.veh-wrap.no-bearing .veh-arrow{display:none}'
assert old in s, 'no-bearing hide rule not found'
s = s.replace(old, '.veh-wrap.no-bearing .veh-arrow{display:grid}', 1)

old = '  transition:transform .12s ease,opacity .12s ease;\n}'
assert old in s, 'vehicle block not found'
s = s.replace(old, '  transition:transform .12s ease,opacity .12s ease;\n  z-index:2;\n}', 1)

assert 'title="Fahrtrichtung">▲</span>' in s
p.write_text(s, encoding='utf-8')
