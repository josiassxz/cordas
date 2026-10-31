# Converte o dataset vldsavelyev/guitar_tab (alphaTex) em um índice de busca + pacotes só com as faixas de GUITARRA.
# Uso LOCAL: python3 -I tools/build-tabs.py data-local/raw/extracted data-local/tabs   (data-local/ fica fora do Git)
import re, sys, json, gzip, pathlib, unicodedata
src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
GUITAR = set(range(24, 32))   # MIDI GM 24–31: nylon, aço, jazz, limpa, abafada, overdrive, distorção, harmônicos
SHARD = 400
def fold(s): return ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(c) != 'Mn')
def notes_in(body): return len(re.findall(r'(?<![\w.])\d+\.\d', body))
songs, skipped = [], 0
for f in sorted(src.glob('**/*.tex')):
    t = f.read_text(errors='ignore')
    head, *tracks = re.split(r'\\track\s*\n', t)
    title = (re.search(r'\\title "([^"]*)"', head) or [None, ''])[1].strip(); sub = (re.search(r'\\subtitle "([^"]*)"', head) or [None, ''])[1].strip()
    tempo = int((re.search(r'\\tempo (\d+)', head) or [None, 100])[1])
    stem = f.stem; artist, _, ftitle = stem.partition('_-_'); artist = artist.replace('_', ' ').strip(); ftitle = (ftitle or stem).replace('_', ' ').strip()
    keep = []
    for tr in tracks:
        m = re.match(r'\\instrument (\d+)\s*\n\\tuning ([^\n]+)\n\\frets (\d+)\s*\n(.*)', tr, re.S)
        if not m: continue
        inst, tun, frets, body = int(m[1]), m[2].split(), int(m[3]), m[4]
        if inst not in GUITAR or len(tun) != 6: continue
        n = notes_in(body)
        if n < 8: continue
        keep.append({'instrument': inst, 'tuning': tun, 'frets': frets, 'notes': n, 'text': body.strip()})
    if not keep: skipped += 1; continue
    songs.append({'artist': artist, 'title': title or ftitle, 'sub': sub, 'file': f.name, 'tempo': tempo, 'tracks': keep})
index, shard, cur = [], {}, 0
for i, s in enumerate(songs):
    k = i // SHARD
    index.append([i, s['artist'], s['title'], s['tempo'], len(s['tracks']), k, fold(f"{s['artist']} {s['title']} {s['sub']}")])
    shard[i] = s
    if (i + 1) % SHARD == 0 or i == len(songs) - 1:
        (out / f'shard-{k:03d}.json.gz').write_bytes(gzip.compress(json.dumps(shard, ensure_ascii=False, separators=(',', ':')).encode(), 6)); shard = {}
(out / 'index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')))
print('músicas com guitarra:', len(songs), '| sem faixa de guitarra:', skipped, '| shards:', (len(songs) - 1) // SHARD + 1)
