(function () {
  const KM = window.KM;
  const $ = (id) => document.getElementById(id);
  const esc = KM.text.esc;

  const PRESETS = ['本文に書いていない', '言い過ぎ', '因果関係が逆', '比喩の説明が逆', '主体が違う', '部分的には正しい', '根拠はここ'];

  const S = {
    books: [],
    book: null,
    pageIdx: 0,
    rendered: null, // { html, segs, order }
    rec: null, // { segHash, marks, struck }
    marking: false,
    tool: 'yellow',
    segEls: {}, // seg → 区画の要素
    segSpans: {}, // seg → 文字の span 配列
    memoId: null,
    memoColor: null,
  };

  const viewer = $('viewer');
  const paper = $('paper');

  /* ================= 問題セット・ページ ================= */

  function allBooks() {
    const imported = KM.store.loadBooks().filter((b) => b.id !== KM.SAMPLE_BOOK.id);
    return [KM.SAMPLE_BOOK, ...imported];
  }

  function fillBookSel() {
    S.books = allBooks();
    $('bookSel').innerHTML = S.books.map((b) => `<option value="${esc(b.id)}">${esc(b.title || b.id)}</option>`).join('');
  }

  function openBook(bookId, pageIdx) {
    S.book = S.books.find((b) => b.id === bookId) || S.books[0];
    $('bookSel').value = S.book.id;
    $('pageSel').innerHTML = S.book.pages
      .map((p, i) => `<option value="${i}">${esc(p.label || '')}${p.folio != null ? `（${esc(p.folio)}）` : ''}</option>`)
      .join('');
    openPage(Math.max(0, Math.min(pageIdx || 0, S.book.pages.length - 1)));
  }

  function page() {
    return S.book.pages[S.pageIdx];
  }

  function openPage(idx) {
    S.pageIdx = idx;
    $('pageSel').value = String(idx);
    $('prevBtn').disabled = idx <= 0;
    $('nextBtn').disabled = idx >= S.book.pages.length - 1;
    KM.store.saveCurrent({ book: S.book.id, page: idx });

    S.rendered = KM.text.renderPage(page());
    paper.innerHTML = S.rendered.html;
    S.segEls = {};
    S.segSpans = {};
    paper.querySelectorAll('[data-seg]').forEach((el) => {
      S.segEls[el.dataset.seg] = el;
      S.segSpans[el.dataset.seg] = Array.from(el.querySelectorAll('[data-i]'));
    });

    S.rec = KM.store.loadPage(S.book.id, page().id);
    const changed = Object.keys(S.rec.segHash).filter(
      (seg) => S.rendered.segs[seg] && S.rec.segHash[seg] !== S.rendered.segs[seg].hash
    );
    if (changed.length && S.rec.marks.some((m) => changed.includes(m.seg))) {
      toast('問題文が変更されているため、マーカーの位置がずれている可能性があります（' + changed.map(KM.text.segLabel).join('、') + '）');
    }
    paintAll();
    applyStruck();
    viewer.scrollTo({ left: 0, top: 0 });
  }

  /* ================= 描画 ================= */

  function paintAll() {
    for (const seg of Object.keys(S.segEls)) paintSeg(seg);
    updateCount();
  }

  function paintSeg(seg) {
    if (!S.segEls[seg]) return;
    KM.print.paintSegEl(S.segEls[seg], S.rec.marks.filter((m) => m.seg === seg));
  }

  function applyStruck() {
    paper.querySelectorAll('.choice').forEach((el) => {
      el.classList.toggle('struck', S.rec.struck.includes(+el.dataset.n));
    });
  }

  function updateCount() {
    $('listCount').textContent = S.rec.marks.length ? String(S.rec.marks.length) : '';
  }

  function save() {
    const segHash = {};
    for (const [seg, v] of Object.entries(S.rendered.segs)) segHash[seg] = v.hash;
    S.rec.segHash = segHash;
    if (!KM.store.savePage(S.book.id, page().id, S.rec)) toast('保存できませんでした（端末の保存容量を確認してください）');
  }

  /* ================= モード切り替え ================= */

  function setMarking(on) {
    S.marking = on;
    document.body.classList.toggle('marking', on);
    $('markerBtn').setAttribute('aria-pressed', String(on));
    $('palette').hidden = !on;
    clearPreview();
    drag = null;
  }

  function setTool(tool) {
    S.tool = tool;
    document.querySelectorAll('.palette .tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
  }

  /* ================= タッチでなぞる ================= */

  let drag = null; // { x0, y0, moved, seg, anchor, cur, startMark }
  let pan = null; // 2本指でのスクロール
  let preview = [];

  /** 指の下にある文字を探す。行間に落ちたときは左右を少しずつ探す */
  function hitTest(x, y, onlySeg) {
    const probes = [0, -5, 5, -10, 10, -15, 15];
    for (const dx of probes) {
      for (const dy of [0, -4, 4]) {
        const r = hitAt(x + dx, y + dy);
        if (r && (!onlySeg || r.seg === onlySeg)) return r;
      }
    }
    return null;
  }

  function hitAt(x, y) {
    let el = document.elementFromPoint(x, y);
    if (!el || !paper.contains(el)) return null;
    if (el.closest('rt')) el = el.closest('ruby').querySelector('[data-i]');
    const span = el && el.closest('[data-i]');
    if (!span) return null;
    const segEl = span.closest('[data-seg]');
    if (!segEl) return null;
    return { seg: segEl.dataset.seg, i: +span.dataset.i, span };
  }

  function clearPreview() {
    for (const sp of preview) sp.classList.remove('pv-yellow', 'pv-red', 'pv-blue', 'pv-erase');
    preview = [];
  }

  function showPreview() {
    clearPreview();
    if (!drag || drag.seg == null) return;
    const spans = S.segSpans[drag.seg];
    const s = Math.min(drag.anchor, drag.cur), e = Math.max(drag.anchor, drag.cur);
    for (let i = s; i <= e; i++) {
      spans[i].classList.add('pv-' + S.tool);
      preview.push(spans[i]);
    }
  }

  function touchCenter(e) {
    const a = e.touches[0], b = e.touches[1];
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  viewer.addEventListener('touchstart', (e) => {
    if (!S.marking) return;
    e.preventDefault(); // スクロール・長押しメニュー・クリックの発生を止める
    if (e.touches.length >= 2) {
      // 2本指：なぞりを取り消して画面を動かす
      clearPreview();
      drag = null;
      const c = touchCenter(e);
      pan = { x: c.x, y: c.y, left: viewer.scrollLeft, top: viewer.scrollTop };
      return;
    }
    if (pan) return;
    const t = e.touches[0];
    drag = { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, moved: false, seg: null, anchor: null, cur: null, startMark: null };
    const hit = hitTest(t.clientX, t.clientY);
    if (hit) {
      drag.seg = hit.seg;
      drag.anchor = drag.cur = hit.i;
      drag.startMark = hit.span.dataset.m || null;
      showPreview();
    }
  }, { passive: false });

  viewer.addEventListener('touchmove', (e) => {
    if (!S.marking) return;
    e.preventDefault();
    if (pan) {
      if (e.touches.length >= 2) {
        const c = touchCenter(e);
        viewer.scrollLeft = pan.left - (c.x - pan.x);
        viewer.scrollTop = pan.top - (c.y - pan.y);
      }
      return;
    }
    if (!drag) return;
    const t = e.touches[0];
    drag.x = t.clientX;
    drag.y = t.clientY;
    if (Math.hypot(t.clientX - drag.x0, t.clientY - drag.y0) > 8) drag.moved = true;
    if (drag.moved) edgeScroll(t.clientX);
    updateDrag();
  }, { passive: false });

  function updateDrag() {
    const hit = hitTest(drag.x, drag.y, drag.seg);
    if (!hit) return;
    if (drag.seg == null) {
      drag.seg = hit.seg;
      drag.anchor = hit.i;
    }
    if (hit.i !== drag.cur) {
      drag.cur = hit.i;
      showPreview();
    }
  }

  /** 画面の端までなぞったら、その方向へ少し送る（縦書きは左へ進む） */
  function edgeScroll(x) {
    const w = viewer.clientWidth, edge = 14; // 余白（20px）の中に指が来たときだけ
    if (x < edge) viewer.scrollLeft -= 14;
    else if (x > w - edge) viewer.scrollLeft += 14;
  }

  viewer.addEventListener('touchend', (e) => {
    if (!S.marking) return;
    e.preventDefault();
    if (pan) {
      if (e.touches.length === 0) pan = null;
      return;
    }
    const d = drag;
    drag = null;
    clearPreview();
    if (!d || d.seg == null) return;

    // なぞらずにタップ：マーカーの上ならメモを開く
    if (!d.moved && d.startMark && S.tool !== 'erase') {
      openMemo(d.startMark);
      return;
    }
    const s = Math.min(d.anchor, d.cur), en = Math.max(d.anchor, d.cur) + 1;
    if (S.tool === 'erase') {
      S.rec.marks = KM.marks.erase(S.rec.marks, d.seg, s, en);
    } else {
      S.rec.marks = KM.marks.paint(S.rec.marks, d.seg, s, en, S.tool).marks;
    }
    save();
    paintSeg(d.seg);
    updateCount();
  }, { passive: false });

  viewer.addEventListener('touchcancel', () => {
    drag = null;
    pan = null;
    clearPreview();
  });

  /* ================= 通常モード：消去法の取り消し線 ================= */

  paper.addEventListener('click', (e) => {
    if (S.marking) return; // マーカーモード中は取り消し線を付けない
    const choice = e.target.closest('.choice');
    if (!choice) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return; // 文字を選択しているときは何もしない
    const n = +choice.dataset.n;
    const i = S.rec.struck.indexOf(n);
    if (i >= 0) S.rec.struck.splice(i, 1);
    else S.rec.struck.push(n);
    save();
    applyStruck();
  });

  /* ================= 指摘メモ ================= */

  function findMark(id) {
    return S.rec.marks.find((m) => m.id === id);
  }

  function openMemo(id) {
    const m = findMark(id);
    if (!m) return;
    S.memoId = id;
    S.memoColor = m.color;
    $('memoWhere').textContent = KM.text.segLabel(m.seg) + '　' + KM.print.COLOR_NAME[m.color];
    $('memoChip').className = 'sw sw-' + m.color;
    $('memoExcerpt').innerHTML = `<span class="bg-${m.color}">${esc(KM.print.excerpt(S.rendered, m))}</span>`;
    $('memoText').value = m.memo || '';
    syncRecolor();
    $('memoSheet').hidden = false;
    setTimeout(() => $('memoText').focus(), 50);
  }

  function syncRecolor() {
    document.querySelectorAll('[data-recolor]').forEach((b) => b.classList.toggle('on', b.dataset.recolor === S.memoColor));
  }

  function closeMemo() {
    $('memoSheet').hidden = true;
    S.memoId = null;
    $('memoText').blur();
  }

  $('memoPresets').innerHTML = PRESETS.map((p) => `<button type="button">${esc(p)}</button>`).join('');
  $('memoPresets').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const ta = $('memoText');
    ta.value = ta.value ? ta.value + '／' + b.textContent : b.textContent;
  });
  document.querySelectorAll('[data-recolor]').forEach((b) =>
    b.addEventListener('click', () => {
      S.memoColor = b.dataset.recolor;
      syncRecolor();
    })
  );
  $('memoSave').addEventListener('click', () => {
    const m = findMark(S.memoId);
    if (m) {
      m.memo = $('memoText').value.trim();
      m.color = S.memoColor;
      save();
      paintSeg(m.seg);
      if (!$('listPanel').hidden) renderList();
    }
    closeMemo();
  });
  $('memoCancel').addEventListener('click', closeMemo);
  $('memoDelete').addEventListener('click', () => {
    const m = findMark(S.memoId);
    if (m) {
      S.rec.marks = S.rec.marks.filter((x) => x.id !== m.id);
      save();
      paintSeg(m.seg);
      updateCount();
      if (!$('listPanel').hidden) renderList();
    }
    closeMemo();
  });
  $('memoSheet').addEventListener('click', (e) => {
    if (e.target === $('memoSheet')) closeMemo();
  });

  /* ================= 一覧 ================= */

  function renderList() {
    const p = page();
    $('listTitle').textContent = `${p.label || ''}${p.folio != null ? `（${p.folio}ページ）` : ''}のマーカー`;
    const list = KM.marks.sorted(S.rec.marks, S.rendered.order);
    if (!list.length) {
      $('markList').innerHTML = '<li class="empty">このページにはまだマーカーがありません。</li>';
      return;
    }
    $('markList').innerHTML = list
      .map(
        (m) => `<li data-id="${esc(m.id)}">
          <span class="where"><i class="sw sw-${m.color}"></i>${esc(KM.print.COLOR_NAME[m.color])}・${esc(KM.text.segLabel(m.seg))}</span>
          <span class="ex bg-${m.color}">${esc(KM.print.excerpt(S.rendered, m))}</span>
          <span class="memo${m.memo ? '' : ' none'}">${m.memo ? esc(m.memo) : '（メモなし）'}</span>
          <div class="li-actions"><button data-act="jump">本文で見る</button><button data-act="memo">メモを書く</button></div>
        </li>`
      )
      .join('');
  }

  function jumpTo(m) {
    const spans = (S.segSpans[m.seg] || []).slice(m.start, m.end);
    if (!spans.length) return;
    spans[0].scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    spans.forEach((sp) => {
      sp.classList.remove('flash');
      void sp.offsetWidth;
      sp.classList.add('flash');
    });
    setTimeout(() => spans.forEach((sp) => sp.classList.remove('flash')), 2600);
  }

  $('listBtn').addEventListener('click', () => {
    renderList();
    $('listPanel').hidden = false;
  });
  $('listClose').addEventListener('click', () => ($('listPanel').hidden = true));
  $('markList').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const m = findMark(li.dataset.id);
    if (!m) return;
    const act = (e.target.closest('[data-act]') || {}).dataset?.act || 'jump';
    if (act === 'memo') {
      openMemo(m.id);
    } else {
      $('listPanel').hidden = true;
      jumpTo(m);
    }
  });

  /* ================= メニュー・PDF・読み込み ================= */

  $('menuBtn').addEventListener('click', () => ($('menuSheet').hidden = false));
  $('menuClose').addEventListener('click', () => ($('menuSheet').hidden = true));
  $('menuSheet').addEventListener('click', (e) => {
    if (e.target === $('menuSheet')) $('menuSheet').hidden = true;
  });

  $('printBtn').addEventListener('click', () => {
    const range = document.querySelector('input[name="pRange"]:checked').value;
    const idxs = range === 'all' ? S.book.pages.map((_, i) => i) : [S.pageIdx];
    $('menuSheet').hidden = true;
    KM.print.print(S.book, idxs, $('pMemo').checked);
  });

  $('clearPageBtn').addEventListener('click', () => {
    if (!S.rec.marks.length) return toast('マーカーはありません');
    if (!confirm('このページのマーカーとメモをすべて消します。よろしいですか？')) return;
    S.rec.marks = [];
    save();
    paintAll();
    $('menuSheet').hidden = true;
  });

  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const book = validateBook(JSON.parse(await file.text()));
      const books = KM.store.loadBooks().filter((b) => b.id !== book.id);
      books.push(book);
      KM.store.saveBooks(books);
      fillBookSel();
      openBook(book.id, 0);
      $('menuSheet').hidden = true;
      toast(`「${book.title}」を読み込みました`);
    } catch (err) {
      toast('読み込めませんでした：' + err.message);
    }
  });

  function validateBook(b) {
    if (!b || typeof b !== 'object') throw new Error('JSONの形が違います');
    if (!Array.isArray(b.pages) || !b.pages.length) throw new Error('pages がありません');
    b.id = String(b.id || 'book-' + Date.now());
    b.title = String(b.title || b.id);
    b.pages.forEach((p, i) => {
      if (typeof p.question !== 'string') throw new Error(`${i + 1}ページ目に question がありません`);
      if (!Array.isArray(p.choices)) p.choices = [];
      p.id = String(p.id || 'p' + (i + 1));
    });
    return b;
  }

  /* ================= その他 ================= */

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3500);
  }

  $('markerBtn').addEventListener('click', () => setMarking(!S.marking));
  document.querySelectorAll('.palette .tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('bookSel').addEventListener('change', (e) => openBook(e.target.value, 0));
  $('pageSel').addEventListener('change', (e) => openPage(+e.target.value));
  $('prevBtn').addEventListener('click', () => S.pageIdx > 0 && openPage(S.pageIdx - 1));
  $('nextBtn').addEventListener('click', () => S.pageIdx < S.book.pages.length - 1 && openPage(S.pageIdx + 1));
  window.addEventListener('afterprint', () => ($('printRoot').innerHTML = ''));

  // 起動
  fillBookSel();
  setTool('yellow');
  const cur = KM.store.loadCurrent();
  openBook(cur ? cur.book : KM.SAMPLE_BOOK.id, cur ? cur.page : 0);

  KM.app = { S, openPage, openMemo, setMarking, setTool }; // テスト用
})();
