/*
 * 端末内（localStorage）への保存
 *   kokugo-marks:<問題セットID>:<ページID> → { version, segHash, marks, struck }
 *   kokugo-books                         → 読み込んだ問題セットの配列
 *   kokugo-current                       → 最後に開いていた問題セットとページ
 */
(function () {
  const KM = (window.KM = window.KM || {});

  const markKey = (bookId, pageId) => `kokugo-marks:${bookId}:${pageId}`;

  function read(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadPage(bookId, pageId) {
    const r = read(markKey(bookId, pageId), null);
    return {
      version: 1,
      segHash: (r && r.segHash) || {},
      marks: (r && Array.isArray(r.marks) ? r.marks : []),
      struck: (r && Array.isArray(r.struck) ? r.struck : []),
    };
  }

  function savePage(bookId, pageId, rec) {
    return write(markKey(bookId, pageId), { version: 1, segHash: rec.segHash, marks: rec.marks, struck: rec.struck });
  }

  const loadBooks = () => read('kokugo-books', []);
  const saveBooks = (books) => write('kokugo-books', books);
  const loadCurrent = () => read('kokugo-current', null);
  const saveCurrent = (cur) => write('kokugo-current', cur);

  KM.store = { loadPage, savePage, loadBooks, saveBooks, loadCurrent, saveCurrent, markKey };
})();
