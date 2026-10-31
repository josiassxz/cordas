import re,sys,collections,pathlib
root=pathlib.Path(sys.argv[1]); inst=collections.Counter(); nstr=collections.Counter(); n=0; tr=0; header=collections.Counter(); keys=collections.Counter()
for f in root.glob('**/*.tex'):
    t=f.read_text(errors='ignore'); n+=1
    for m in re.finditer(r'\\track[^\n]*\n((?:\\[a-z]+[^\n]*\n)+)',t):
        blk=m.group(1); tr+=1
        i=re.search(r'\\instrument (\w+)',blk); inst[i.group(1) if i else None]+=1
        u=re.search(r'\\tuning ([^\n]+)',blk); nstr[len(u.group(1).split()) if u else 0]+=1
        for k in re.findall(r'\\([a-z]+)',blk): keys[k]+=1
    for k in re.findall(r'^\\([a-z]+)',t.split('\\track')[0],re.M): header[k]+=1
print('arquivos',n,'faixas',tr); print('instrumentos',inst.most_common(18)); print('cordas',nstr.most_common()); print('chaves de faixa',keys.most_common(12)); print('cabeçalho',header.most_common(8))
