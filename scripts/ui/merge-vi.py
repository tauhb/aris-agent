"""Gộp một phần bản dịch vào packages/aris-ui-locale-vi/locales/vi.json.

Dùng: python3 scripts/ui/merge-vi.py <namespace> <tệp-tsv>
Mỗi dòng của tệp TSV: khoá<TAB>bản dịch. Khoá phải có trong bản tiếng Anh đã ghim.
"""
import json, sys, pathlib

root = pathlib.Path(__file__).resolve().parents[2] / 'packages/aris-ui-locale-vi/locales'
en = json.loads((root / 'en.snapshot.json').read_text())
vi_path = root / 'vi.json'
vi = json.loads(vi_path.read_text())

ns, tsv = sys.argv[1], sys.argv[2]
known = en[ns]['en']
out = vi.setdefault(ns, {})
for line in pathlib.Path(tsv).read_text().splitlines():
    if not line.strip():
        continue
    key, _, text = line.partition('\t')
    if key not in known:
        sys.exit(f'{ns}: khoá lạ "{key}"')
    out[key] = text.replace('\\n', '\n')
vi[ns] = {k: out[k] for k in known if k in out}
vi_path.write_text(json.dumps(dict(sorted(vi.items())), ensure_ascii=False, indent=1) + '\n')
print(f'{ns}: {len(vi[ns])}/{len(known)}')
