// 動作確認スクリプト：node tests/e2e.mjs
// Android 相当の画面（タッチ）で、なぞる→メモ→再読み込み→消しゴム→PDF出力を確かめる。
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

// グローバルに入っている playwright も使えるよう require で読む
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(path.join(root, 'index.html')).href;
const outDir = path.join(root, 'tests', 'out');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 412, height: 860 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
const cdp = await ctx.newCDPSession(page);

/** span の中心座標 */
async function center(seg, i) {
  return page.evaluate(([seg, i]) => {
    const sp = document.querySelector(`[data-seg="${seg}"] [data-i="${i}"]`);
    sp.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = sp.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [seg, i]);
}

async function touchDrag(from, to, steps = 12) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let k = 1; k <= steps; k++) {
    const p = { x: from.x + ((to.x - from.x) * k) / steps, y: from.y + ((to.y - from.y) * k) / steps };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function touchTap(p) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const marks = () => page.evaluate(() => JSON.parse(localStorage.getItem('kokugo-marks:sample-dai2-gendaibun:p23')).marks);

// ---- 範囲計算の単体確認 ----
const unit = await page.evaluate(() => {
  const { paint, erase } = KM.marks;
  let ms = paint([], 'c1', 2, 6, 'yellow').marks; // 黄 [2,6)
  ms = paint(ms, 'c1', 4, 9, 'red').marks; // 赤が上書き → 黄 [2,4) 赤 [4,9)
  const a = ms.map((m) => `${m.color}${m.start}-${m.end}`).sort().join(',');
  ms = paint(ms, 'c1', 9, 11, 'red').marks; // 接する同色は結合 → 赤 [4,11)
  const b = ms.map((m) => `${m.color}${m.start}-${m.end}`).sort().join(',');
  ms = erase(ms, 'c1', 6, 8); // 中を消す → 赤 [4,6) [8,11)
  const c = ms.map((m) => `${m.color}${m.start}-${m.end}`).sort().join(',');
  const g = KM.text.units('𠮟る18行目が');
  return { a, b, c, g: g.map((u) => u.t) };
});
assert.equal(unit.a, 'red4-9,yellow2-4');
assert.equal(unit.b, 'red4-11,yellow2-4');
assert.equal(unit.c, 'red4-6,red8-11,yellow2-4');
assert.deepEqual(unit.g, ['𠮟', 'る', '18', '行', '目', 'が']); // サロゲートペア・結合文字・縦中横
console.log('✔ 範囲計算・文字単位');

// ---- 1. マーカーモード中は取り消し線が付かない／スクロールしない ----
await page.click('#markerBtn');
assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('viewer')).touchAction), 'none');
await page.click('[data-tool="red"]');

// ---- 2. 選択肢②「毅然とした中にも老いを感じさせる」をなぞる ----
const c2 = await page.evaluate(() => KM.app.S.rendered.segs.c2.units.join(''));
const s = c2.indexOf('毅然'), e = c2.indexOf('させる') + 3;
await touchDrag(await center('c2', s), await center('c2', e - 1));
let ms = await marks();
assert.equal(ms.length, 1);
assert.deepEqual([ms[0].seg, ms[0].start, ms[0].end, ms[0].color], ['c2', s, e, 'red']);
const struck = await page.evaluate(() => document.querySelectorAll('.choice.struck').length);
assert.equal(struck, 0, 'マーカー中は取り消し線が付かない');
console.log('✔ なぞった範囲：', c2.slice(s, e));

// 設問にも黄色
const q = await page.evaluate(() => KM.app.S.rendered.segs.q.units.join(''));
const qs = q.indexOf('最も適当'), qe = qs + 4;
await page.click('[data-tool="yellow"]');
await touchDrag(await center('q', qs), await center('q', qe - 1));
const qm = (await marks()).find((m) => m.seg === 'q');
assert.deepEqual([qm.start, qm.end], [qs, qe]);
console.log('✔ 設問にも引ける：', q.slice(qs, qe));

// ---- 3. タップでメモ ----
await touchTap(await center('c2', s + 2));
await page.waitForSelector('#memoSheet:not([hidden])');
await page.fill('#memoText', '本文に書いていない');
await page.click('#memoSave');
ms = await marks();
assert.equal(ms.find((m) => m.seg === 'c2').memo, '本文に書いていない');
console.log('✔ メモ保存');
await page.screenshot({ path: path.join(outDir, '1-marked.png') });

// ---- 4. 再読み込みしても残る ----
await page.reload();
const after = await page.evaluate(() => ({
  red: document.querySelectorAll('[data-seg="c2"] .mk-red').length,
  yellow: document.querySelectorAll('[data-seg="q"] .mk-yellow').length,
  memoDot: document.querySelectorAll('.has-memo').length,
}));
assert.deepEqual(after, { red: e - s, yellow: qe - qs, memoDot: 1 });
console.log('✔ 再読み込み後も残る', after);

// ---- 5. 一覧 ----
await page.click('#listBtn');
const items = await page.$$eval('#markList li', (lis) => lis.map((li) => li.innerText.replace(/\s+/g, ' ')));
assert.equal(items.length, 2);
assert.match(items[0], /設問/); // 設問 → 選択肢の順
assert.match(items[1], /選択肢②.*本文に書いていない/);
console.log('✔ 一覧：', items);
await page.screenshot({ path: path.join(outDir, '2-list.png') });
await page.click('#listClose');

// ---- 6. 消しゴム（真ん中だけ消す → 2つに分かれ、メモは両方に残る） ----
await page.click('#markerBtn');
await page.click('[data-tool="erase"]');
await touchDrag(await center('c2', s + 4), await center('c2', s + 6));
ms = (await marks()).filter((m) => m.seg === 'c2');
assert.equal(ms.length, 2);
assert.ok(ms.every((m) => m.memo === '本文に書いていない'));
console.log('✔ 消しゴム');

// ---- 7. 通常モードでは取り消し線 ----
await page.click('#markerBtn');
await page.tap('.choice[data-n="1"] .c-text');
assert.equal(await page.evaluate(() => document.querySelector('.choice[data-n="1"]').classList.contains('struck')), true);
console.log('✔ 通常モードの取り消し線');

// ---- 8. PDF（マーカーの色＋メモ一覧） ----
await page.evaluate(() => KM.print.build(KM.app.S.book, [0, 1], true));
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: path.join(outDir, 'export.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
await page.emulateMedia({ media: 'screen' });
console.log('✔ PDF 出力 → tests/out/export.pdf');

assert.deepEqual(errors, []);
await browser.close();
console.log('すべて成功');
