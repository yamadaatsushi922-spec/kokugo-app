/*
 * マーカーの範囲計算（DOMに依存しない純粋な処理）
 * mark = { id, seg, start, end, color, memo, createdAt }  ※ start は含む、end は含まない
 * 不変条件：同じ区画の中でマーカー同士は重ならない（1文字に色は1つ）。
 */
(function () {
  const KM = (window.KM = window.KM || {});

  let counter = 0;
  function newId() {
    return 'm' + Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 5);
  }

  const overlaps = (a, s, e) => a.start < e && s < a.end;
  const touches = (a, s, e) => a.start <= e && s <= a.end;

  /** m から [s,e) を取り除いた残り（0〜2個）。右側の切れ端には新しい id を付ける */
  function subtract(m, s, e) {
    const res = [];
    if (m.start < s) res.push({ ...m, end: s });
    if (e < m.end) res.push({ ...m, start: e, id: res.length ? newId() : m.id });
    return res;
  }

  function uniq(a) {
    return [...new Set(a.filter(Boolean))];
  }

  /** 色を塗る。同じ色で重なる・接するものは1つにまとめ、ほかの色は上書きする */
  function paint(marks, seg, s, e, color) {
    let start = s, end = e, keepId = null, createdAt = Date.now();
    const memos = [];
    const out = [];
    for (const m of marks) {
      if (m.seg !== seg) { out.push(m); continue; }
      if (m.color === color && touches(m, s, e)) {
        start = Math.min(start, m.start);
        end = Math.max(end, m.end);
        memos.push(m.memo);
        if (!keepId) keepId = m.id;
        createdAt = Math.min(createdAt, m.createdAt || createdAt);
        continue;
      }
      if (overlaps(m, s, e)) out.push(...subtract(m, s, e));
      else out.push(m);
    }
    const mark = { id: keepId || newId(), seg, start, end, color, memo: uniq(memos).join(' / '), createdAt };
    out.push(mark);
    return { marks: out, mark };
  }

  /** 消しゴム */
  function erase(marks, seg, s, e) {
    const out = [];
    for (const m of marks) {
      if (m.seg === seg && overlaps(m, s, e)) out.push(...subtract(m, s, e));
      else out.push(m);
    }
    return out;
  }

  /** 区画の順（設問→選択肢→図表）、その中は位置の順に並べる */
  function sorted(marks, order) {
    const rank = (seg) => {
      const i = order.indexOf(seg);
      return i < 0 ? 999 : i;
    };
    return [...marks].sort((a, b) => rank(a.seg) - rank(b.seg) || a.start - b.start);
  }

  KM.marks = { newId, paint, erase, sorted, subtract };
})();
