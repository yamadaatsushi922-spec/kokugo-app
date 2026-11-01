/*
 * PDF出力（ブラウザの印刷 →「PDF として保存」）
 * - 問題ページは A4 縦書きで、マーカーの色をそのまま付ける。
 * - 指摘メモの一覧は、選んだときだけ別ページとして最後に付ける。
 */
(function () {
  const KM = (window.KM = window.KM || {});
  const COLOR_NAME = { yellow: '重要', red: 'ダメ・引っかけ', blue: '根拠' };

  /** 描画済みの区画に、マーカーの class を付ける（画面と印刷で共通） */
  function paintSegEl(segEl, marks) {
    const spans = segEl.querySelectorAll('[data-i]');
    spans.forEach((sp) => {
      sp.classList.remove('mk-yellow', 'mk-red', 'mk-blue', 'mk-s', 'mk-e', 'has-memo');
      delete sp.dataset.m;
    });
    for (const m of marks) {
      const end = Math.min(m.end, spans.length);
      for (let i = m.start; i < end; i++) {
        spans[i].classList.add('mk-' + m.color);
        spans[i].dataset.m = m.id;
      }
      if (m.start < end) {
        spans[m.start].classList.add('mk-s');
        spans[end - 1].classList.add('mk-e');
        if (m.memo) spans[end - 1].classList.add('has-memo');
      }
    }
  }

  function paintAll(rootEl, marks) {
    rootEl.querySelectorAll('[data-seg]').forEach((el) => {
      const seg = el.dataset.seg;
      paintSegEl(el, marks.filter((m) => m.seg === seg));
    });
  }

  function excerpt(rendered, m) {
    const seg = rendered.segs[m.seg];
    return seg ? seg.units.slice(m.start, m.end).join('') : '';
  }

  function build(book, pageIdxs, withMemo) {
    const esc = KM.text.esc;
    const root = document.getElementById('printRoot');
    root.innerHTML = '';
    const memoGroups = [];

    for (const idx of pageIdxs) {
      const page = book.pages[idx];
      const rendered = KM.text.renderPage(page);
      const rec = KM.store.loadPage(book.id, page.id);

      const sec = document.createElement('section');
      sec.className = 'pr-page';
      sec.innerHTML = `<article class="paper">${rendered.html}</article>` +
        (page.folio != null ? `<div class="folio">― ${esc(page.folio)} ―</div>` : '');
      root.appendChild(sec);
      paintAll(sec, rec.marks);

      if (rec.marks.length) {
        memoGroups.push({ page, rendered, marks: KM.marks.sorted(rec.marks, rendered.order) });
      }
    }

    if (withMemo) {
      const sec = document.createElement('section');
      sec.className = 'memo-page';
      let html = `<h1>指摘メモ一覧　${esc(book.title || '')}</h1>`;
      if (!memoGroups.length) html += '<p>マーカーはありません。</p>';
      for (const g of memoGroups) {
        html += `<h2>${esc(g.page.label || '')}${g.page.folio != null ? `（${esc(g.page.folio)}ページ）` : ''}</h2>`;
        html += '<table><thead><tr><th class="no">No</th><th class="col">色</th><th class="where">場所</th><th>引いた箇所</th><th>メモ</th></tr></thead><tbody>';
        g.marks.forEach((m, i) => {
          html += `<tr><td class="no">${i + 1}</td>` +
            `<td class="col"><i class="sw sw-${m.color}"></i>${COLOR_NAME[m.color] || ''}</td>` +
            `<td class="where">${esc(KM.text.segLabel(m.seg))}</td>` +
            `<td class="ex"><span class="bg-${m.color}">${esc(excerpt(g.rendered, m))}</span></td>` +
            `<td>${esc(m.memo || '')}</td></tr>`;
        });
        html += '</tbody></table>';
      }
      sec.innerHTML = html;
      root.appendChild(sec);
    }
    return root;
  }

  function print(book, pageIdxs, withMemo) {
    build(book, pageIdxs, withMemo);
    // 描画が終わってから印刷画面を開く
    requestAnimationFrame(() => setTimeout(() => window.print(), 50));
  }

  KM.print = { build, print, paintSegEl, paintAll, excerpt, COLOR_NAME };
})();
