#!/usr/bin/env python3
"""Convert the ODH builtin Collins data into the WordPop data layout.

Usage: python3 -I tools/build-data.py <odh-bg-data-dir> <out-data-dir>

<odh-bg-data-dir> is the bg/data directory of an unpacked ODH extension
(part1.json ... part8.json and wordforms.json).

Output:
  <out>/collins/<shard>.json  entries whose lowercased key starts with <shard>
                              (a-z, or "_" for anything else)
  <out>/wordforms.json        inflected/derived form -> base form
"""
import glob
import json
import os
import sys


def shard_of(key):
    c = key[:1].lower()
    return c if 'a' <= c <= 'z' else '_'


def main(src, out):
    entries = {}
    for path in sorted(glob.glob(os.path.join(src, 'part*.json'))):
        with open(path, encoding='utf-8') as f:
            entries.update(json.load(f))

    shards = {}
    for key, value in entries.items():
        shards.setdefault(shard_of(key), {})[key] = value

    os.makedirs(os.path.join(out, 'collins'), exist_ok=True)
    for name, data in sorted(shards.items()):
        with open(os.path.join(out, 'collins', name + '.json'), 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'), sort_keys=True)

    with open(os.path.join(src, 'wordforms.json'), encoding='utf-8') as f:
        wordforms = json.load(f)
    with open(os.path.join(out, 'wordforms.json'), 'w', encoding='utf-8') as f:
        json.dump(wordforms, f, ensure_ascii=False, separators=(',', ':'), sort_keys=True)

    print(f'{len(entries)} entries in {len(shards)} shards; {len(wordforms)} word forms')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
