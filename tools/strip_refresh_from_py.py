#!/usr/bin/env python3
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'homy' / 'modules'
pattern = re.compile(r"\n\s*['\"]default_refresh_interval['\"]:\s*\d+,?\n")

for py in root.glob('*/*.py'):
    text = py.read_text(encoding='utf-8')
    new = pattern.sub('\n', text)
    if new != text:
        py.write_text(new, encoding='utf-8')
        print(f'cleaned {py.name}')
