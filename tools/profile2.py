import re,sys,collections,pathlib,random
root=pathlib.Path(sys.argv[1]); fx=collections.Counter(); cmd=collections.Counter(); odd=collections.Counter(); dur=collections.Counter(); files=list(root.glob('**/*.tex')); random.seed(1); random.shuffle(files)
for f in files[:3000]:
    t=f.read_text(errors='ignore')
    for m in re.findall(r'\{([^}]*)\}',t):
        for w in m.split(';') if ';' in m else [m]: fx[w.strip().split()[0] if w.strip() else '']+=1
    for m in re.findall(r'\\([a-z]+)',t): cmd[m]+=1
    body=re.sub(r'\{[^}]*\}','',t); body=re.sub(r'\\[^\n]*\n','',body)
    for tok in re.split(r'\s+',body):
        if not tok or tok=='|' or tok=='.': continue
        if re.fullmatch(r':\d+',tok): dur[tok]+=1; continue
        if re.fullmatch(r'(\d+|x)\.\d(\.\d+)?|r(\.\d+)?|-\.\d(\.\d+)?|\([\dx.\s]+\)(\.\d+)?|\(\d+\.\d(\s+\d+\.\d)*\)(\.\d+)?',tok): continue
        odd[re.sub(r'\d+','N',tok)[:20]]+=1
print('efeitos',fx.most_common(30)); print('cmds',cmd.most_common(20)); print('durações',dur.most_common(8)); print('tokens estranhos',odd.most_common(25))
