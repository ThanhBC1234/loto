/* ─────────────────────────────────────────────
   Luật lô tô: tờ 9 hàng × 9 cột, mỗi hàng 5 số → 45 số.
   Cột 1 chứa 1–9, cột 2 chứa 10–19 … cột 9 chứa 80–90.
   ───────────────────────────────────────────── */

var Game = (function () {

  var COLS = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 49],
              [50, 59], [60, 69], [70, 79], [80, 90]];

  function ri(n) { return Math.floor(Math.random() * n); }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = ri(i + 1), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* Sinh một tờ lô tô ngẫu nhiên hợp lệ */
  function makeCard() {
    // Số lượng số của từng cột, tổng 45, mỗi cột 3–7
    var caps = [5, 5, 5, 5, 5, 5, 5, 5, 5];
    for (var k = 0; k < 40; k++) {
      var i = ri(9), j = ri(9);
      if (i !== j && caps[i] < 7 && caps[j] > 3) { caps[i]++; caps[j]--; }
    }

    // Chọn 5 cột cho mỗi hàng, ưu tiên cột còn nhiều chỗ trống nhất
    var grid = [], rem = caps.slice(), r, c;
    for (r = 0; r < 9; r++) grid.push([null, null, null, null, null, null, null, null, null]);

    for (r = 0; r < 9; r++) {
      var order = [];
      for (c = 0; c < 9; c++) order.push({ i: c, v: rem[c], k: Math.random() });
      order.sort(function (a, b) { return b.v - a.v || a.k - b.k; });
      for (var p = 0; p < 5; p++) { grid[r][order[p].i] = 0; rem[order[p].i]--; }
    }

    // Rót số thật vào các ô đã chọn, tăng dần từ trên xuống
    for (c = 0; c < 9; c++) {
      var lo = COLS[c][0], hi = COLS[c][1], pool = [];
      for (var n = lo; n <= hi; n++) pool.push(n);
      var chosen = shuffle(pool).slice(0, caps[c]).sort(function (a, b) { return a - b; });
      var idx = 0;
      for (r = 0; r < 9; r++) if (grid[r][c] === 0) grid[r][c] = chosen[idx++];
    }
    return grid;
  }

  /* Số viết bằng chữ, để giọng đọc phát âm cho tự nhiên */
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

  /* Mã phòng 4 ký tự, đã bỏ các ký tự dễ đọc nhầm (0/O, 1/I, S/5…) */
  var CHARS = 'ACDEFGHJKLMNPQRTUVWXY34679';
  function newCode() {
    var s = '';
    for (var i = 0; i < 4; i++) s += CHARS[ri(CHARS.length)];
    return s;
  }

  /* Bốc một số chưa ra */
  function drawFrom(called) {
    var pool = [];
    for (var n = 1; n <= 90; n++) if (called.indexOf(n) === -1) pool.push(n);
    if (!pool.length) return null;
    return pool[ri(pool.length)];
  }

  /* Tình trạng từng hàng của tờ.
     needCalled = true → chỉ tính nắp đậy trên số đã được bốc thật */
  function rowStates(grid, marks, called, needCalled) {
    var out = [];
    for (var r = 0; r < 9; r++) {
      var total = 0, marked = 0, ok = 0;
      for (var c = 0; c < 9; c++) {
        var n = grid[r][c];
        if (n === null) continue;
        total++;
        if (marks.has(r + '-' + c)) {
          marked++;
          if (!needCalled || called.indexOf(n) !== -1) ok++;
        }
      }
      out.push({ total: total, marked: marked, ok: ok, full: total > 0 && ok === total });
    }
    return out;
  }

  return {
    makeCard: makeCard,
    viNum: viNum,
    rhyme: rhyme,
    newCode: newCode,
    drawFrom: drawFrom,
    rowStates: rowStates
  };
})();
