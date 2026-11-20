#!/usr/bin/env python3
"""Publish verbatim paragraphs from MLB's official scoring-change page, not inferred stats."""
import argparse
import datetime
import json
import pathlib
import re
import urllib.request
from html.parser import HTMLParser

SOURCE = 'https://www.mlb.com/official-information/scoring-changes'

class Blocks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []
        self.depth = 0
        self.text = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1
        if tag in ('p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6') and not self.skip:
            if not self.depth:
                self.text = []
            self.depth += 1
        if tag == 'br' and self.depth:
            self.text.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip = max(0, self.skip - 1)
        if tag in ('p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6') and self.depth:
            self.depth -= 1
            if not self.depth:
                self.blocks.append(''.join(self.text).strip())

    def handle_data(self, text):
        if self.depth and not self.skip:
            self.text.append(text)


def parse(html):
    parser = Blocks()
    parser.feed(html)
    year = None
    rows = []
    seen = set()
    for block in parser.blocks:
        heading = re.search(r'\b(20\d{2})\s+Regular Season\b', block)
        if heading:
            year = heading.group(1)
        for item in re.split(r'\n(?=\s*\d{3}\.\s)', block):
            match = re.match(r'^\s*(\d{3})\.\s+(.+)', item, re.S)
            if not match or year is None:
                continue
            # Keep official wording, including typos; only normalize whitespace.
            text = re.sub(r'\s+', ' ', match.group(2)).strip()
            key = (year, match.group(1), text)
            if key in seen:
                continue
            seen.add(key)
            rows.append({'season': year, 'id': match.group(1), 'text': text, 'source': SOURCE})
    if not rows:
        raise ValueError('No numbered official paragraphs with a season heading found. Parser review required.')
    return rows


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--output', default='_site/data/official.json')
    config = args.parse_args()
    result = {'source': SOURCE, 'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'rows': [], 'status': 'unavailable'}
    try:
        request = urllib.request.Request(SOURCE, headers={'User-Agent': 'SCORCHNG-source-verification/1.0'})
        with urllib.request.urlopen(request, timeout=60) as response:
            html = response.read().decode('utf-8')
        result['rows'] = parse(html)
        result['status'] = 'official-text'
        result['note'] = 'Verbatim official paragraphs, not independently reconciled to individual plays. Numeric stat deltas and probabilities are not inferred.'
    except Exception as error:
        result['warning'] = str(error)
        print('::warning::Official scoring data unavailable; publishing an explicit gap, not invented rows: ' + str(error))
    target = pathlib.Path(config.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f"Official text collection: {result['status']}, {len(result['rows'])} paragraphs")

if __name__ == '__main__':
    main()
