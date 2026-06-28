#!/usr/bin/env python3
"""Extract core translations from translations.js into homy/lang/*.js"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'homy' / 'static' / 'js' / 'translations.js'
OUT = ROOT / 'homy' / 'lang'


def extract_locale_block(text: str, locale_key: str) -> str | None:
    pat = rf"'{re.escape(locale_key)}':\s*\{{"
    m = re.search(pat, text)
    if not m:
        return None
    start = m.end() - 1
    depth = 0
    for i in range(start, len(text)):
        c = text[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def main() -> None:
    text = SRC.read_text(encoding='utf-8')
    OUT.mkdir(parents=True, exist_ok=True)
    for locale_key, filename in (('en-US', 'enUS.js'), ('de-DE', 'deDE.js')):
        block = extract_locale_block(text, locale_key)
        if not block:
            raise SystemExit(f'Missing locale block: {locale_key}')
        content = (
            f'/* Homy core UI — {locale_key} */\n'
            '(function () {\n'
            "    'use strict';\n"
            '    if (!window.i18n) return;\n'
            f"    window.i18n.registerModuleTranslations('app', '{locale_key}', {block});\n"
            '})();\n'
        )
        path = OUT / filename
        path.write_text(content, encoding='utf-8')
        print(f'Wrote {path} ({len(content)} bytes)')


if __name__ == '__main__':
    main()
