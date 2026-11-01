/*
 * 文字の位置付け（区画ごとに 0 から数える）
 *
 * - 1文字（書記素）＝1つの <span data-i="n">。サロゲートペアや結合文字の途中で切れない。
 * - 2桁までの半角数字は縦中横の1単位として扱う（例：「18」で1文字分）。
 * - ルビ（<rt>）と解答番号の四角は数えない。
 */
(function () {
  const KM = (window.KM = window.KM || {});

  const segmenter =
    typeof Intl !== 'undefined' && Intl.Segmenter
      ? new Intl.Segmenter('ja', { granularity: 'grapheme' })
      : null;

  function graphemes(s) {
    return segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  /** マークアップを字句に分ける */
  function parse(src) {
    const out = [];
    let bold = false, under = false, buf = '', i = 0;
    const flush = () => {
      if (buf) out.push({ type: 'text', text: buf, bold, under });
      buf = '';
    };
    while (i < src.length) {
      if (src.startsWith('**', i)) { flush(); bold = !bold; i += 2; continue; }
      if (src.startsWith('__', i)) { flush(); under = !under; i += 2; continue; }
      if (src.startsWith('[[', i)) {
        const j = src.indexOf(']]', i);
        if (j > 0) { flush(); out.push({ type: 'box', text: src.slice(i + 2, j) }); i = j + 2; continue; }
      }
      if (src[i] === '{') {
        const j = src.indexOf('}', i), k = src.indexOf('|', i);
        if (j > 0 && k > 0 && k < j) {
          flush();
          out.push({ type: 'ruby', base: src.slice(i + 1, k), rt: src.slice(k + 1, j), bold, under });
          i = j + 1;
          continue;
        }
      }
      buf += src[i];
      i++;
    }
    flush();
    return out;
  }

  /** 文字単位に分ける */
  function units(text) {
    const g = graphemes(text);
    const res = [];
    for (let i = 0; i < g.length; ) {
      if (/^[0-9]$/.test(g[i])) {
        let j = i;
        while (j < g.length && /^[0-9]$/.test(g[j])) j++;
        if (j - i <= 2) res.push({ t: g.slice(i, j).join(''), tcy: true });
        else for (let k = i; k < j; k++) res.push({ t: g[k] });
        i = j;
      } else {
        res.push({ t: g[i] });
        i++;
      }
    }
    return res;
  }

  function tcyHtml(text) {
    return units(text).map((u) => (u.tcy ? `<span class="tcy">${esc(u.t)}</span>` : esc(u.t))).join('');
  }

  /** 1区画を描画。html と、文字の配列 units を返す */
  function renderSeg(src) {
    let idx = 0, html = '';
    const plain = [];
    const span = (u) => {
      plain.push(u.t);
      return `<span data-i="${idx++}"${u.tcy ? ' class="tcy"' : ''}>${esc(u.t)}</span>`;
    };
    for (const tk of parse(src || '')) {
      if (tk.type === 'box') {
        html += `<span class="ansbox">${tcyHtml(tk.text)}</span>`;
        continue;
      }
      const inner =
        tk.type === 'text'
          ? units(tk.text).map(span).join('')
          : `<ruby>${units(tk.base).map(span).join('')}<rt>${esc(tk.rt)}</rt></ruby>`;
      const cls = [tk.bold && 'b', tk.under && 'u'].filter(Boolean).join(' ');
      html += cls ? `<span class="${cls}">${inner}</span>` : inner;
    }
    return { html, units: plain };
  }

  /** FNV-1a（本文が変わったかの検出用） */
  function hash(arr) {
    let h = 0x811c9dc5;
    const s = arr.join('\u0001');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }

  const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

  function segLabel(seg) {
    if (seg === 'q') return '設問';
    let m = /^c(\d+)$/.exec(seg);
    if (m) return '選択肢' + (CIRCLED[m[1] - 1] || m[1]);
    m = /^f(\d+)$/.exec(seg);
    if (m) return '図表' + m[1] + 'の説明';
    return seg;
  }

  /**
   * 1ページ（1問）を描画する。
   * 区画ID: q=設問, c1..cn=選択肢, f1..fn=図表の説明文
   */
  function renderPage(page) {
    const segs = {};
    const order = [];
    const seg = (id, src) => {
      const r = renderSeg(src);
      segs[id] = { units: r.units, hash: hash(r.units) };
      order.push(id);
      return r.html;
    };
    let html = '';
    html += `<div class="q-head"><span class="qnum">${tcyHtml(page.label || '')}</span>` +
      `<div class="q-text seg" data-seg="q">${seg('q', page.question)}</div></div>`;
    html += '<div class="choices">';
    (page.choices || []).forEach((c, i) => {
      html += `<div class="choice" data-n="${i + 1}"><span class="cnum">${CIRCLED[i] || i + 1}</span>` +
        `<div class="c-text seg" data-seg="c${i + 1}">${seg('c' + (i + 1), c)}</div></div>`;
    });
    html += '</div>';
    (page.figures || []).forEach((f, i) => {
      const id = 'f' + (i + 1);
      html += `<figure class="fig">` +
        (f.image ? `<div class="fig-img"><img src="${esc(f.image)}" alt=""></div>` : '') +
        `<figcaption class="seg" data-seg="${id}">${seg(id, f.caption)}</figcaption></figure>`;
    });
    return { html, segs, order };
  }

  KM.text = { graphemes, parse, units, renderSeg, renderPage, hash, segLabel, esc, CIRCLED };
})();
