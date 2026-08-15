/* ─────────────────────────────────────────────
   Luật: tờ 5 hàng × 5 cột, cả 25 ô đều có số.
   Cột 1 lấy số 1–18, cột 2 lấy 19–36, cột 3 lấy 37–54,
   cột 4 lấy 55–72, cột 5 lấy 73–90.
   Kinh khi đủ 5 nắp trên một hàng ngang, một hàng dọc,
   hoặc một đường xéo → tất cả 12 đường.
   ───────────────────────────────────────────── */

var Game = (function () {

  var COLS = [[1, 18], [19, 36], [37, 54], [55, 72], [73, 90]];

  function ri(n) { return Math.floor(Math.random() * n); }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = ri(i + 1), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* 12 đường ăn tiền, dựng sẵn một lần */
  var LINES = (function () {
    var L = [], r, c, i, cells;
    for (r = 0; r < 5; r++) {
      cells = [];
      for (c = 0; c < 5; c++) cells.push([r, c]);
      L.push({ label: 'hàng ngang ' + (r + 1), cells: cells });
    }
    for (c = 0; c < 5; c++) {
      cells = [];
      for (r = 0; r < 5; r++) cells.push([r, c]);
      L.push({ label: 'hàng dọc ' + (c + 1), cells: cells });
    }
    cells = []; for (i = 0; i < 5; i++) cells.push([i, i]);
    L.push({ label: 'đường xéo trái', cells: cells });
    cells = []; for (i = 0; i < 5; i++) cells.push([i, 4 - i]);
    L.push({ label: 'đường xéo phải', cells: cells });
    return L;
  })();

  /* Một tờ: mỗi cột 5 số riêng của dải cột đó, xếp tăng dần từ trên xuống */
  function makeCard() {
    var grid = [], r, c;
    for (r = 0; r < 5; r++) grid.push([0, 0, 0, 0, 0]);
    for (c = 0; c < 5; c++) {
      var pool = [];
      for (var n = COLS[c][0]; n <= COLS[c][1]; n++) pool.push(n);
      var pick = shuffle(pool).slice(0, 5).sort(function (a, b) { return a - b; });
      for (r = 0; r < 5; r++) grid[r][c] = pick[r];
    }
    return grid;
  }

  function cardKey(g) {
    var s = '';
    for (var r = 0; r < 5; r++) for (var c = 0; c < 5; c++) s += g[r][c] + ',';
    return s;
  }

  /* Tờ mới chắc chắn không trùng bất kỳ tờ nào đã phát */
  function makeUniqueCard(usedKeys) {
    for (var i = 0; i < 80; i++) {
      var g = makeCard();
      if (usedKeys.indexOf(cardKey(g)) === -1) return g;
    }
    return makeCard();
  }

  /* Tình trạng 12 đường.
     Nắp chỉ được tính khi số đó đã thực sự được bốc (chế độ có phòng). */
  function lineStates(grid, marks, called, needCalled) {
    var out = [];
    for (var i = 0; i < LINES.length; i++) {
      var L = LINES[i], ok = 0;
      for (var k = 0; k < L.cells.length; k++) {
        var r = L.cells[k][0], c = L.cells[k][1];
        if (!marks.has(r + '-' + c)) continue;
        if (needCalled && called.indexOf(grid[r][c]) === -1) continue;
        ok++;
      }
      out.push({ label: L.label, cells: L.cells, ok: ok, full: ok === 5 });
    }
    return out;
  }

  var CHARS = 'ACDEFGHJKLMNPQRTUVWXY34679';
  function newCode() {
    var s = '';
    for (var i = 0; i < 4; i++) s += CHARS[ri(CHARS.length)];
    return s;
  }

  function drawFrom(called) {
    var pool = [];
    for (var n = 1; n <= 90; n++) if (called.indexOf(n) === -1) pool.push(n);
    if (!pool.length) return null;
    return pool[ri(pool.length)];
  }

  var RHYMES = [
    'Cờ ra con mấy, con mấy cờ ra…',
    'Bà con cô bác, đậy lẹ tay vô…',
    'Chờ hoài chờ mãi, cờ ra là con…',
    'Trong thùng lăn lóc, chui ra một con…',
    'Ai mà trúng nhé, la lớn lên nha…',
    'Lắc qua lắc lại, rớt ra con…',
    'Nghe cho kỹ nhé, kẻo lỡ mất con…'
  ];
  function rhyme() { return RHYMES[ri(RHYMES.length)]; }

  var ONES = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  function viNum(n) {
    if (n < 10) return ONES[n];
    var t = Math.floor(n / 10), u = n % 10;
    var base = t === 1 ? 'mười' : ONES[t] + ' mươi';
    if (u === 0) return base;
    if (u === 1) return base + (t === 1 ? ' một' : ' mốt');
    if (u === 4) return base + (t === 1 ? ' bốn' : ' tư');
    if (u === 5) return base + ' lăm';
    return base + ' ' + ONES[u];
  }

  function colLabel(c) { return COLS[c][0] + '–' + COLS[c][1]; }

  return {
    COLS: COLS, LINES: LINES,
    makeCard: makeCard, cardKey: cardKey, makeUniqueCard: makeUniqueCard,
    lineStates: lineStates, colLabel: colLabel,
    newCode: newCode, drawFrom: drawFrom, rhyme: rhyme, viNum: viNum
  };
})();
