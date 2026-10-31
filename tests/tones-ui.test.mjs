// Interação real na tela Tones (Chrome headless): clica, edita, salva, compara A/B, usa capo e confere persistência.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage, hasChrome, serverUp } from './browser/cdp.mjs';

const URL_ = 'http://127.0.0.1:8731/#/tones';

const SCRIPT = `(async()=>{
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms)), $=(s)=>document.querySelector(s), $$=(s)=>[...document.querySelectorAll(s)];
  const click=async(s)=>{const e=typeof s==='string'?$(s):s; if(!e) throw new Error('não achei '+s); e.click(); await sleep(60)};
  const setRange=async(sel,v)=>{const e=$(sel); e.value=v; e.dispatchEvent(new Event('input',{bubbles:true})); await sleep(60)};
  const setText=async(sel,v)=>{const e=$(sel); e.value=v; e.dispatchEvent(new Event('input',{bubbles:true})); await sleep(60)};
  const A=window.corda.audio, S=window.corda.store, out={};
  out.carousel=$$('.tn-inst').length; out.tab0=$('[data-tab][aria-selected=true]').dataset.tab;
  await click('[data-inst="b:metal"]'); out.afterInst=A.preset.id; out.ctxState=A.ctx?.state;
  await click('[data-tab="efeitos"]'); await setRange('input[data-p="drive.amount"]',0.9);
  out.driveAmount=A.preset.drive.amount; out.dirtyBadge=!!$('.tn-now .badge');
  await click('[data-act="saveNew"]'); await setText('#tnSaveName','Meu teste'); await click('[data-act="saveAs"]');
  const mine=S.get('tones.presets',[]); out.custom=mine.length; out.customName=mine[0]?.name; out.currentKind=A.preset.kind; out.customAmount=mine[0]?.drive.amount;
  await click('[data-tab="presets"]'); const id=mine[0].id;
  await click('[data-fav="'+id+'"]'); out.fav=S.get('favorites.tones',[]).includes(id);
  await click('[data-setab="a:'+id+'"]'); await click('[data-setab="b:b:jazz"]');
  out.ab=S.get('tones.ab'); await click('[data-ab="b"]'); out.abB=A.preset.id; await click('[data-ab="a"]'); out.abA=A.preset.id;
  await click('[data-rename="'+id+'"]'); await setText('[data-ren="'+id+'"]','Renomeado'); await click('[data-rename="'+id+'"]'); out.renamed=S.get('tones.presets')[0].name;
  await click('[data-dup="'+id+'"]'); out.afterDup=S.get('tones.presets').length;
  await click('[data-filter="mine"]'); out.mineRows=$$('.tn-row').length;
  await click('[data-del="'+id+'"]'); out.delArmed=!!$('[data-del="'+id+'"]')?.textContent.includes('Confirmar'); await click('[data-del="'+id+'"]'); out.afterDel=S.get('tones.presets').length; out.favCleaned=!S.get('favorites.tones',[]).includes(id);
  await click('[data-filter="all"]'); await setText('#tnQ','jazz'); out.searchRows=$$('.tn-row').length;
  await click('[data-tab="transpor"]'); await setText('#tnProg','Bm F#m G A'); out.sugg=$('.tn-sugg')?.textContent||''; out.key=$('.chip.on')?.textContent||'';
  await click('[data-capo="2"]'); out.capo=S.get('settings.capo'); out.shapes=$$('.tn-pair .row.wrap')[1]?.textContent.replace(/\\s+/g,' ').trim();
  await click('[data-shift="1"]'); await click('[data-shift="1"]'); out.shift=$('.big-num')?.textContent; out.shiftedChords=$$('section.panel')[2]?.querySelectorAll('.tn-chord').length;
  await click('[data-tab="afinador"]'); const sel=$('#tnTuning'); sel.value='dropd'; sel.dispatchEvent(new Event('change',{bubbles:true})); await sleep(60);
  out.tuneStrings=$$('.tn-str b').map(b=>b.textContent).join('');
  await click('[data-ref="45"]'); await click('[data-tab="timbres"]'); await click('[data-preset="b:rock"]'); await click('[data-test="arp"]'); await sleep(300);
  out.level=typeof A.level()==='number'; S.flush(); out.final=A.preset.id; out.errs=window.__errs.slice();
  return JSON.stringify(out);
})()`;

test('tela Tones: fluxo completo de uso, sem erros e com persistência', async (t) => {
  if (!hasChrome() || !(await serverUp(URL_.split('#')[0]))) return t.skip('Chrome ou servidor local indisponível');
  const page = await openPage(URL_, 9338);
  try {
    const r = JSON.parse(await page.evaluate(SCRIPT));
    assert.deepEqual(r.errs, [], 'console limpo');
    assert.equal(r.carousel, 6); assert.equal(r.tab0, 'timbres'); assert.equal(r.afterInst, 'b:metal');
    assert.equal(r.driveAmount, 0.9); assert.ok(r.dirtyBadge, 'mostra "modificado"');
    assert.equal(r.custom, 1); assert.equal(r.customName, 'Meu teste'); assert.equal(r.currentKind, 'custom'); assert.equal(r.customAmount, 0.9);
    assert.ok(r.fav); assert.equal(r.ab.b, 'b:jazz'); assert.equal(r.abB, 'b:jazz'); assert.ok(r.abA.startsWith('c:'), 'A volta ao preset do usuário');
    assert.equal(r.renamed, 'Renomeado'); assert.equal(r.afterDup, 2); assert.equal(r.mineRows, 2);
    assert.ok(r.delArmed, 'exclusão pede confirmação'); assert.equal(r.afterDel, 1); assert.ok(r.favCleaned);
    assert.equal(r.searchRows, 1, 'busca "jazz"');
    assert.match(r.key, /Tom provável/); assert.match(r.sugg, /2ª casa/); assert.equal(r.capo, 2); assert.equal(r.shapes, "AmEmFG", "capo 2: Bm F#m G A viram Am Em F G"); assert.equal(r.shift, '+2'); assert.equal(r.shiftedChords, 4);
    assert.equal(r.tuneStrings, 'EBGDAD', 'Drop D: 6ª corda vira D');
    assert.ok(r.level); assert.equal(r.final, 'b:rock');
    await page.reload();                                                          // persistência real
    const after = await page.evaluate(`JSON.stringify({id:corda.audio.preset.id,custom:corda.store.get('tones.presets',[]).length,capo:corda.store.get('settings.capo'),errs:window.__errs})`);
    const p = JSON.parse(after);
    assert.equal(p.id, 'b:rock'); assert.equal(p.custom, 1); assert.equal(p.capo, 2); assert.deepEqual(p.errs, []);
  } finally { page.close(); }
});
