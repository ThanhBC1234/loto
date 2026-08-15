/* ─────────────────────────────────────────────
   Màn hình và luồng chơi.
   4 lối vào: quản trò có phòng · vào phòng · quản trò hô miệng · tờ rời.
   ───────────────────────────────────────────── */

(function () {

  var el = document.getElementById('app');

  var S = {
    screen: 'home',
    room: null,        // mã phòng, null nếu chơi rời
    isHost: false,
    name: '',
    sound: true,
    conn: 'wait',      // wait | online | bad
    called: [],
    last: null,
    rhyme: 'Bấm bốc số để mở màn.',
    grid: null,
    marks: null,
    players: [],       // quản trò: [{cid, name, on}]
    wins: [],          // quản trò: [{name, line}]
    claimed: {},       // người chơi: những đường đã hô rồi
    note: '',
    joining: false,
    joinErr: '',
    code: '',
    sheets: {},        // quản trò: mã máy → tờ đã phát, không phát trùng
    cid: '',
    hostErr: ''
  };

  /* ── bộ nhớ máy ── */
  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) { localStorage.removeItem(k); return null; }
      localStorage.setItem(k, v); return v;
    } catch (e) { return null; }
  }
  function myId() {
    var k = ls('loto:cid');
    if (!k) { k = 'm' + Math.random().toString(36).slice(2, 11); ls('loto:cid', k); }
    return k;
  }
  function marksKey() { return 'loto:marks:' + (S.room || 'roi') + ':' + S.cid; }
  function cardKey() { return 'loto:card:' + (S.room || 'roi') + ':' + S.cid; }
  function saveMarks() { ls(marksKey(), JSON.stringify(Array.from(S.marks))); }
  function loadMarks() {
    try { return new Set(JSON.parse(ls(marksKey()) || '[]')); } catch (e) { return new Set(); }
  }
  function clearMarks() { ls(marksKey(), null); }
  function loadMarksForGrid(grid) {
    var next = Game.cardKey(grid), prev = ls(cardKey());
    if (prev && prev !== next) { clearMarks(); S.claimed = {}; }
    ls(cardKey(), next);
    return loadMarks();
  }
  function clearSavedCard() { clearMarks(); ls(cardKey(), null); }

  /* Quản trò: giữ ván trong máy để tải lại trang không mất phòng */
  function hostSave() {
    if (!S.isHost || !S.room) return;
    ls('loto:host', JSON.stringify({
      code: S.room, called: S.called, last: S.last,
      sheets: S.sheets, wins: S.wins, at: Date.now()
    }));
  }
  function hostLoad() {
    try {
      var v = JSON.parse(ls('loto:host') || 'null');
      if (!v || !v.code) return null;
      if (Date.now() - (v.at || 0) > 12 * 3600 * 1000) return null;  // quá cũ thì bỏ
      return v;
    } catch (e) { return null; }
  }
  function hostClear() { ls('loto:host', null); }

  /* ── tiện ích ── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function q(sel) { return el.querySelector(sel); }
  function connText() {
    if (S.conn === 'online') return S.isHost
      ? 'Phòng đang mở · ' + Net.count() + ' máy đang nối'
      : 'Đã nối với quản trò';
    if (S.conn === 'bad') return 'Mất kết nối. Thử tải lại trang.';
    return S.isHost ? 'Đang mở phòng…' : 'Đang nối lại, giữ nguyên trang này…';
  }
  function connDot() { return S.conn === 'online' ? 'ok' : S.conn === 'bad' ? 'bad' : 'wait'; }
  function connHtml() {
    return '<div class="conn" id="conn"><span class="dot ' + connDot() + '"></span>' +
      esc(connText()) + '</div>';
  }

  /* ═══════════ MÀN HÌNH CHÍNH ═══════════ */
  function viewHome() {
    var warn = Net.ready() ? '' :
      '<p class="err">Không tải được thư viện kết nối. Hai chế độ có mã phòng sẽ không chạy — ' +
      'kiểm tra mạng rồi tải lại trang. Hai chế độ không cần mã vẫn dùng bình thường.</p>';

    var saved = hostLoad();
    var resume = saved
      ? stub('resume', '↩️', 'Mở lại phòng ' + esc(saved.code),
          'Ván đang dở với ' + (saved.called || []).length + ' số đã ra. Người chơi tự nối lại, giữ nguyên tờ cũ.')
      : '';

    return '' +
      '<div class="marquee">' +
        '<h1>Lô Tô</h1>' +
        '<p>Hội chợ trong túi áo</p>' +
        '<div class="bulbs">' +
          [0, 1, 2, 3, 4].map(function (i) {
            return '<span class="bulb" style="animation-delay:' + (i * 0.18) + 's"></span>';
          }).join('') +
        '</div>' +
      '</div>' +
      warn + resume +
      '<div class="lbl">Cả nhóm cùng một ván</div>' +
      stub('host', '🎤', 'Tôi làm quản trò',
        'Mở phòng, lấy mã, bốc số. Số ra hiện thẳng trên máy mọi người.') +
      stub('join', '🎟️', 'Tôi vào phòng',
        'Nhập mã 5 ký tự quản trò đọc, nhận một tờ lô tô riêng.') +
      '<div class="lbl">Không cần mã phòng</div>' +
      stub('solocaller', '🥁', 'Bốc số để hô miệng',
        'Một máy bốc số, quản trò hô lớn. Máy khác chỉ cầm tờ.') +
      stub('solocard', '📄', 'Chỉ lấy một tờ lô tô',
        'Nghe hô tới đâu tự đậy nắp tới đó.') +
      '<div class="lbl">Thiết lập</div>' +
      '<div class="toggle"><span>Tiếng động và nhạc kinh</span>' +
        '<button class="sw' + (S.sound ? ' on' : '') + '" data-act="sw-sound" aria-label="Bật tắt âm thanh"></button></div>' +
      '<p class="note">Luật ván này: tờ 5 hàng × 5 cột, cả 25 ô đều có số. ' +
        'Đủ 5 nắp trên một hàng ngang, một hàng dọc hoặc một đường xéo là kinh — tất cả 12 đường.<br>' +
        'Quản trò phát cho mỗi người một tờ riêng, không ai trùng ai và không đổi tờ được.<br>' +
        'Máy quản trò giữ ván, nên quản trò cần để tab này mở suốt buổi. ' +
        'Số được chuyển qua một máy chủ công cộng, ai cũng chơi được dù dùng 4G hay Wi-Fi khác nhau — ' +
        'chỉ nên đọc mã phòng cho đúng người trong nhóm.</p>';
  }

  function stub(act, ic, tt, sb) {
    return '<button class="stub" data-act="' + act + '">' +
      '<span class="ic">' + ic + '</span><span class="tx">' +
      '<span class="tt">' + tt + '</span><span class="sb">' + sb + '</span>' +
      '</span></button>';
  }

  /* ═══════════ QUẢN TRÒ ═══════════ */
  function viewCaller() {
    var left = 90 - S.called.length;

    var head;
    if (S.isHost) {
      var open = S.conn === 'online' && S.room;
      head = '<div class="codebar"><div><div class="k">Mã phòng</div>' +
        '<div class="v' + (open ? '' : ' sm pending') + '">' +
          (open ? esc(S.room) : (S.conn === 'bad' ? 'Không mở được' : 'Đang mở…')) +
        '</div></div>' +
        '<div class="k right">' +
          (open ? 'Đọc mã này cho cả nhóm nhập vào'
                : S.conn === 'bad' ? 'Chưa nối được máy chủ chuyển tiếp'
                : 'Chờ mã hiện ra rồi hãy đọc cho cả nhóm') +
        '</div></div>' + connHtml() +
        (S.conn === 'bad'
          ? '<p class="err">Không nối được máy chủ chuyển tiếp. Kiểm tra mạng rồi bấm "Về trang đầu" và mở phòng lại.</p>'
          : '');
    } else {
      head = '<div class="codebar"><div><div class="k">Chế độ</div>' +
        '<div class="v sm">Hô miệng</div></div>' +
        '<div class="k right">Máy này bốc số, bạn hô lớn cho cả nhóm</div></div>';
    }

    var board = '';
    for (var n = 1; n <= 90; n++) {
      var cls = n === S.last ? ' last' : (S.called.indexOf(n) !== -1 ? ' on' : '');
      board += '<div class="bn' + cls + '">' + n + '</div>';
    }

    var lists = '';
    if (S.room) {
      lists = '<div class="lbl">Ai đã kinh</div>' + (S.wins.length
        ? '<div class="list">' + S.wins.map(function (w) {
            return '<div class="item"><span>' + esc(w.name) + '</span>' +
              '<span class="tag">' + esc(w.line) + '</span></div>';
          }).join('') + '</div>'
        : '<div class="empty">Chưa ai kinh. Ai hô kinh trên máy của họ thì tên sẽ hiện ngay ở đây.</div>');

      lists += '<div class="lbl">Người trong phòng</div>' + (S.players.length
        ? '<div class="list">' + S.players.map(function (p) {
            return '<div class="item"><span>' + esc(p.name) + '</span>' +
              '<span class="tag">' + (p.on ? 'đang nối' : 'rớt mạng') + '</span></div>';
          }).join('') + '</div>'
        : '<div class="empty">Chưa ai vào. Đọc mã ' + esc(S.room || '') + ' cho cả nhóm.</div>');
    }

    return '' +
      '<button class="back" data-act="back">← Về trang đầu</button>' + head +
      '<div class="drum"><div class="chip ' + (S.last ? 'pop' : 'empty') + '">' +
        '<span>' + (S.last === null ? 'chưa bốc' : S.last) + '</span></div></div>' +
      '<div class="rhyme">' + esc(S.rhyme) + '</div>' +
      '<div class="count">' + S.called.length + ' số đã ra · còn ' + left + '</div>' +
      '<button class="btn btn-neon" data-act="draw"' +
        ((left <= 0 || (S.isHost && S.conn !== 'online')) ? ' disabled' : '') + '>' +
        (left > 0 ? 'Bốc số' : 'Hết số rồi') + '</button>' +
      '<div class="gap"></div>' +
      '<button class="btn btn-ghost" data-act="reset">Ván mới</button>' +
      '<div class="lbl">Bảng số đã ra</div><div class="board">' + board + '</div>' +
      lists +
      '<p class="note">' + (S.room
        ? 'Số bốc ra hiện gần như tức thì trên máy người chơi. Lỡ tải lại trang cũng không sao — về trang đầu bấm "Mở lại phòng ' + esc(S.room) + '" là ván trở lại nguyên vẹn.'
        : 'Nhớ hô rõ và chậm, người chơi tự đậy nắp trên tờ của họ.') + '</p>';
  }

  /* ═══════════ VÀO PHÒNG ═══════════ */
  function viewJoin() {
    return '' +
      '<button class="back" data-act="back">← Về trang đầu</button>' +
      '<div class="lbl">Mã quản trò đọc</div>' +
      '<input class="field code" id="fcode" maxlength="5" autocomplete="off" ' +
        'autocapitalize="characters" placeholder="•••••" aria-label="Mã phòng" value="' + esc(S.code) + '">' +
      '<div class="lbl">Tên của bạn</div>' +
      '<input class="field" id="fname" maxlength="20" placeholder="Gọi bạn là gì?" ' +
        'aria-label="Tên người chơi" value="' + esc(S.name) + '">' +
      (S.joinErr ? '<p class="err">' + esc(S.joinErr) + '</p>' : '') +
      '<button class="btn btn-gold" data-act="enter"' + (S.joining ? ' disabled' : '') + '>' +
        (S.joining ? 'Đang tìm phòng…' : (S.joinErr ? 'Thử lại' : 'Vào phòng, nhận tờ')) + '</button>' +
      '<p class="note">Mã gồm 5 ký tự, ký tự đầu là A, B hoặc C. ' +
        'Nếu quản trò vừa mở lại phòng thì chờ vài giây rồi thử lại.</p>';
  }

  /* ═══════════ TỜ LÔ TÔ ═══════════ */
  function viewCard() {
    var head = S.room
      ? '<div class="codebar"><div><div class="k">Đang trong phòng</div>' +
        '<div class="v">' + esc(S.room) + '</div></div>' +
        '<div class="k right">' + esc(S.name || 'Khách') + '</div></div>' + connHtml()
      : '<div class="codebar"><div><div class="k">Tờ rời</div>' +
        '<div class="v sm">Tự đậy nắp</div></div>' +
        '<div class="k right">Tải lại trang nếu muốn tờ khác</div></div>';

    if (!S.grid) {
      return '<button class="back" data-act="back">← Về trang đầu</button>' + head +
        '<div class="sheet"><div class="waiting">Quản trò đang phát tờ cho bạn…</div></div>' +
        '<p class="note">Mỗi người một tờ riêng do quản trò phát, không ai trùng ai.</p>';
    }

    var heads = '';
    for (var c = 0; c < 5; c++) heads += '<div class="ch">' + Game.colLabel(c) + '</div>';

    var winCells = winMap();

    var cells = '';
    for (var r = 0; r < 5; r++) {
      for (var c2 = 0; c2 < 5; c2++) {
        var n = S.grid[r][c2], key = r + '-' + c2;
        var on = S.marks.has(key);
        var lit = S.room && !on && S.called.indexOf(n) !== -1;
        var rot = ((r * 7 + c2 * 13) % 17) - 8;
        cells += '<button class="cell num' + (lit ? ' called' : '') + (winCells[key] ? ' win' : '') +
          '" data-act="cell" data-r="' + r + '" data-c="' + c2 + '" ' +
          'aria-label="Số ' + n + (on ? ', đã đậy' : '') + '">' +
          '<span class="n">' + n + '</span>' +
          (on ? '<span class="cap" style="transform:rotate(' + rot + 'deg)"></span>' : '') +
          '</button>';
      }
    }

    return '' +
      '<button class="back" data-act="back">← Về trang đầu</button>' + head +
      '<div class="sheet">' +
        '<div class="sheethead"><b>Lô tô</b><i>25 ô · ngang dọc xéo đều ăn</i></div>' +
        '<div class="colhead">' + heads + '</div>' +
        '<div class="grid" id="grid">' + cells + '</div>' +
      '</div>' +
      '<div id="claim">' + claimHtml() + '</div>' +
      '<p class="note">Chạm vào số để đậy nắp, chạm lần nữa để gỡ.' +
        (S.room ? ' Chỉ đậy được số quản trò đã bốc — số đó nhấp nháy viền đỏ trên tờ. Tờ này là của riêng bạn suốt ván, tải lại trang vẫn còn nguyên.'
                : ' Nghe quản trò hô tới đâu, đậy tới đó.') + '</p>' +
      '<div class="dock"><div class="inner" id="dock">' + dockHtml() + '</div></div>';
  }

  function lineInfo() {
    if (!S.grid) return [];
    return Game.lineStates(S.grid, S.marks, S.called, !!S.room);
  }
  function winMap() {
    var m = {};
    lineInfo().forEach(function (L) {
      if (L.full) L.cells.forEach(function (rc) { m[rc[0] + '-' + rc[1]] = 1; });
    });
    return m;
  }
  /* Đường đã đủ nhưng chưa hô */
  function openLine() {
    var a = lineInfo();
    for (var i = 0; i < a.length; i++) if (a[i].full && !S.claimed[a[i].label]) return a[i];
    return null;
  }
  function bestLine() {
    var a = lineInfo(), b = null;
    for (var i = 0; i < a.length; i++) if (!b || a[i].ok > b.ok) b = a[i];
    return b;
  }

  /* Nút hô kinh cỡ lớn ngay dưới tờ, không bị thanh trình duyệt che */
  function claimHtml() {
    var L = openLine();
    if (!L) return '';
    return '<button class="btn btn-neon claimbtn" data-act="kinh">KINH! — ' + esc(L.label) + '</button>';
  }

  function dockHtml() {
    var L = openLine(), b = bestLine();
    var msg = S.note ? S.note
      : L ? 'Đủ rồi! Bấm nút KINH.'
      : (b && b.ok > 0) ? 'Gần nhất: ' + b.label + ' · ' + b.ok + '/5'
      : S.room ? S.called.length + ' số đã ra'
      : 'Đủ 5 nắp một đường là kinh';
    return '<div class="lastnum' + (S.last === null ? ' dim' : '') + '">' +
        (S.last === null ? 'chờ' : S.last) + '</div>' +
      '<div class="dockmeta"><div class="a">' + (S.room ? 'Số vừa ra' : 'Tự chấm') + '</div>' +
        '<div class="b">' + esc(msg) + '</div></div>' +
      '<button class="btn btn-neon btn-sm" data-act="kinh" style="flex:none;min-width:92px"' +
        (L ? '' : ' disabled') + '>KINH!</button>';
  }

  /* ── vẽ lại ── */
  var drawnScreen = null;
  function render() {
    var html = S.screen === 'home' ? viewHome()
      : S.screen === 'caller' ? viewCaller()
      : S.screen === 'join' ? viewJoin()
      : viewCard();
    el.innerHTML = html;
    if (drawnScreen !== S.screen) { window.scrollTo(0, 0); drawnScreen = S.screen; }
  }

  /* Cập nhật nhẹ, không dựng lại cả tờ (giữ nguyên nắp đã đậy) */
  function patchCard() {
    if (S.screen !== 'card') return;
    var g = q('#grid'); if (!g) return;

    var winCells = winMap();
    var btns = g.querySelectorAll('.cell.num');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var r = +b.dataset.r, c = +b.dataset.c, n = S.grid[r][c], key = r + '-' + c;
      var on = S.marks.has(key);
      b.classList.toggle('called', !!(S.room && !on && S.called.indexOf(n) !== -1));
      b.classList.toggle('win', !!winCells[key]);
      b.setAttribute('aria-label', 'Số ' + n + (on ? ', đã đậy' : ''));
      var cap = b.querySelector('.cap');
      if (on && !cap) {
        var s = document.createElement('span');
        s.className = 'cap';
        s.style.transform = 'rotate(' + (((r * 7 + c * 13) % 17) - 8) + 'deg)';
        b.appendChild(s);
      } else if (!on && cap) { cap.remove(); }
    }
    var cl = q('#claim'); if (cl) cl.innerHTML = claimHtml();
    var dk = q('#dock'); if (dk) dk.innerHTML = dockHtml();
  }

  function patchConn() {
    var c = q('#conn');
    if (c) c.innerHTML = '<span class="dot ' + connDot() + '"></span>' + esc(connText());
  }

  var noteTimer = null;
  function toast(msg) {
    S.note = msg;
    var d = q('#dock'); if (d) d.innerHTML = dockHtml();
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(function () {
      S.note = '';
      var d2 = q('#dock'); if (d2) d2.innerHTML = dockHtml();
    }, 4500);
  }

  /* ═══════════ MÀN KINH ═══════════ */
  function showKinh(label, who) {
    var box = document.createElement('div');
    box.className = 'kinh';
    box.innerHTML = '<div><h2>Kinh!</h2><p>' +
      (who ? esc(who) + ' kinh ' + esc(label) + '.'
           : 'Bạn đủ 5 nắp trên ' + esc(label) + '. Hô lớn lên cho cả nhóm nghe.') +
      '</p><button class="btn btn-gold">Chơi tiếp</button></div>';
    var bits = [];
    for (var i = 0; i < 34; i++) {
      var s = document.createElement('span'), sz = 10 + Math.random() * 12;
      s.className = 'conf';
      s.style.left = (Math.random() * 100) + 'vw';
      s.style.width = sz + 'px'; s.style.height = sz + 'px';
      s.style.animationDuration = (2.2 + Math.random() * 2) + 's';
      s.style.animationDelay = (Math.random() * 1.1) + 's';
      document.body.appendChild(s); bits.push(s);
    }
    function close() { box.remove(); bits.forEach(function (b) { b.remove(); }); }
    box.addEventListener('click', close);
    document.body.appendChild(box);
    setTimeout(close, 9000);
  }

  /* ═══════════ QUẢN TRÒ: MỞ PHÒNG ═══════════ */
  var hostTries = 0;

  function openHostRoom(saved) {
    if (!Net.ready()) return;
    hostTries = 0;
    S.isHost = true; S.conn = 'wait';
    if (saved) {
      S.called = saved.called || [];
      S.last = (saved.last === undefined ? null : saved.last);
      S.sheets = saved.sheets || {};
      S.wins = saved.wins || [];
      S.rhyme = 'Phòng đã mở lại. Bốc tiếp thôi.';
    } else {
      S.called = []; S.last = null; S.sheets = {};
      S.wins = [];
      S.rhyme = 'Bấm bốc số để mở màn.';
    }
    S.players = []; S.hostErr = '';
    tryHost(saved ? saved.code : null);
    S.screen = 'caller';
    render();
  }

  function tryHost(fixedCode) {
    S.room = fixedCode || null;
    Net.host(fixedCode, {
      state: function () { return { called: S.called, last: S.last }; },
      code: function (c) {
        S.room = c; hostSave();
        if (S.screen === 'caller') render();
      },
      status: function (st) {
        S.conn = st;
        if (S.screen === 'caller') render();
      },
      fail: function (why) {
        S.conn = 'bad'; S.hostErr = why;
        if (S.screen === 'caller') render();
      },
      player: function (name, cid, pid, reply) {
        if (!S.sheets[cid]) {
          var used = Object.keys(S.sheets).map(function (k) { return Game.cardKey(S.sheets[k]); });
          S.sheets[cid] = Game.makeUniqueCard(used);
          hostSave();
        }
        reply({ t: 'sheet', grid: S.sheets[cid] });
        var found = false;
        S.players = S.players.map(function (p) {
          if (p.cid === cid) { found = true; return { cid: cid, name: name, on: true }; }
          return p;
        });
        if (!found) S.players.push({ cid: cid, name: name, on: true });
        if (S.screen === 'caller') render();
      },
      leave: function (cid) {
        S.players = S.players.map(function (p) {
          return p.cid === cid ? { cid: p.cid, name: p.name, on: false } : p;
        });
        if (S.screen === 'caller') render();
      },
      kinh: function (name, cid, line) {
        var grid = S.sheets[cid], winningLine = null;
        for (var i = 0; i < Game.LINES.length; i++) {
          if (Game.LINES[i].label === line) { winningLine = Game.LINES[i]; break; }
        }
        if (!grid || !winningLine) return false;
        var valid = winningLine.cells.every(function (rc) {
          return S.called.indexOf(grid[rc[0]][rc[1]]) !== -1;
        });
        if (!valid) return false;
        var duplicate = S.wins.some(function (w) { return w.cid === cid && w.line === line; });
        if (duplicate) return false;
        var player = S.players.filter(function (p) { return p.cid === cid; })[0];
        name = player ? player.name : name;
        S.wins.push({ cid: cid, name: name, line: line });
        hostSave();
        Sfx.kinh();
        if (S.screen === 'caller') render();
        showKinh(line, name);
        return name;
      }
    });
  }

  function doDraw() {
    var n = Game.drawFrom(S.called);
    if (n === null) return;
    S.called = S.called.concat([n]);
    S.last = n;
    S.rhyme = Game.rhyme() + ' con ' + Game.viNum(n) + '!';
    Sfx.draw();
    if (S.room) { Net.broadcast({ t: 'state', called: S.called, last: S.last }); hostSave(); }
    render();
  }

  function doReset() {
    if (S.called.length && !window.confirm('Xoá hết số đã bốc, phát tờ mới cho cả phòng?')) return;
    S.called = []; S.last = null; S.wins = []; S.sheets = {};
    S.rhyme = 'Ván mới. Bấm bốc số để mở màn.';
    if (S.room) {
      Net.broadcast({ t: 'state', called: [], last: null });
      Net.broadcast({ t: 'newgame' });
      hostSave();
    }
    render();
  }

  /* ═══════════ NGƯỜI CHƠI ═══════════ */
  function doEnter() {
    var fc = q('#fcode'), fn = q('#fname');
    var code = ((fc ? fc.value : S.code) || '').trim().toUpperCase();
    S.code = code;
    S.name = ((fn ? fn.value : S.name) || '').trim();
    if (code.length !== 5) { S.joinErr = 'Mã phòng gồm 5 ký tự.'; render(); return; }
    if (!Net.validCode(code)) {
      S.joinErr = 'Mã này không đúng dạng. Ký tự đầu phải là A, B hoặc C — đọc lại mã trên máy quản trò.';
      render(); return;
    }
    if (!Net.ready()) { S.joinErr = 'Chưa tải được thư viện kết nối. Kiểm tra mạng rồi tải lại trang.'; render(); return; }

    S.joining = true; S.joinErr = ''; S.conn = 'wait';
    S.room = code; S.isHost = false; S.grid = null; S.claimed = {};
    S.marks = loadMarks(); S.called = []; S.last = null;
    render();

    Net.join(code, S.name || 'Khách', S.cid, {
      status: function (st) {
        S.conn = st;
        if (st === 'online' && S.screen !== 'card') {
          S.joining = false; S.screen = 'card';
          render();
        } else if (S.screen === 'card') { patchConn(); }
        else { render(); }
      },
      sheet: function (grid) {
        S.grid = grid;
        S.marks = loadMarksForGrid(grid);
        render();
      },
      newgame: function () {
        clearSavedCard();
        S.grid = null; S.marks = new Set(); S.claimed = {};
        S.called = []; S.last = null;
        render();
        Net.toHost({ t: 'hello', name: S.name || 'Khách', cid: S.cid });
      },
      state: function (called, last) {
        var isNew = (last !== null && last !== undefined && last !== S.last);
        S.called = called || [];
        S.last = (last === undefined ? null : last);
        if (isNew) Sfx.draw();
        if (S.screen === 'card') patchCard(); else render();
      },
      winner: function (name, cid, line) {
        if (cid && cid === S.cid) return;
        toast(name + ' vừa kinh ' + line);
      },
      fail: function (why) {
        S.joining = false; S.screen = 'join'; S.room = null;
        S.grid = null; S.marks = null; S.claimed = {};
        S.called = []; S.last = null;
        S.joinErr =
          why === 'noroom' ? 'Nối được máy chủ nhưng không thấy phòng ' + code +
            '. Mã có thể sai, hoặc máy quản trò đã đóng trang. Nhờ quản trò đọc lại mã.'
          : why === 'broker' ? 'Không nối được máy chủ chuyển tiếp. Kiểm tra mạng của máy bạn rồi thử lại.'
          : why === 'badcode' ? 'Mã này không đúng dạng. Ký tự đầu phải là A, B hoặc C.'
          : 'Chưa tải được thư viện kết nối. Kiểm tra mạng rồi tải lại trang.';
        Net.leave();
        render();
      }
    });
  }

  function doCell(r, c) {
    var key = r + '-' + c, n = S.grid[r][c];
    if (S.marks.has(key)) { S.marks.delete(key); saveMarks(); patchCard(); return; }
    if (S.room && S.called.indexOf(n) === -1) {   // chưa bốc thì chưa được đậy
      toast('Số ' + n + ' chưa được bốc.');
      return;
    }
    S.marks.add(key); Sfx.tap(); saveMarks(); patchCard();
  }

  function doKinh() {
    var L = openLine();
    if (!L) return;
    S.claimed[L.label] = true;
    Sfx.kinh();
    showKinh(L.label, null);
    if (S.room) Net.toHost({ t: 'kinh', name: S.name || 'Khách', cid: S.cid, line: L.label });
    patchCard();
  }

  function goHome() {
    Net.leave();
    S.screen = 'home'; S.room = null; S.isHost = false; S.conn = 'wait';
    S.called = []; S.last = null; S.wins = []; S.players = []; S.sheets = {};
    S.grid = null; S.marks = null; S.claimed = {}; S.joining = false; S.joinErr = ''; S.note = '';
    render();
  }

  /* ═══════════ SỰ KIỆN ═══════════ */
  el.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) return;
    var a = t.dataset.act;

    if (a === 'host') { hostClear(); return openHostRoom(null); }
    if (a === 'resume') return openHostRoom(hostLoad());
    if (a === 'join') { S.screen = 'join'; S.joinErr = ''; return render(); }
    if (a === 'solocaller') {
      S.room = null; S.isHost = false; S.called = []; S.last = null;
      S.rhyme = 'Bấm bốc số để mở màn.'; S.screen = 'caller'; return render();
    }
    if (a === 'solocard') {
      S.room = null; S.grid = Game.makeCard(); S.marks = new Set(); S.claimed = {};
      clearMarks(); S.called = []; S.last = null; S.screen = 'card'; return render();
    }
    if (a === 'sw-sound') { S.sound = !S.sound; Sfx.setSound(S.sound); Sfx.tap(); return render(); }

    if (a === 'back') return goHome();
    if (a === 'draw') return doDraw();
    if (a === 'reset') return doReset();
    if (a === 'enter') return doEnter();
    if (a === 'cell') return doCell(+t.dataset.r, +t.dataset.c);
    if (a === 'kinh') return doKinh();
  });

  el.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && S.screen === 'join') { e.preventDefault(); doEnter(); }
  });

  el.addEventListener('input', function (e) {
    if (e.target.id === 'fcode') {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      S.code = e.target.value;
    }
    if (e.target.id === 'fname') S.name = e.target.value;
  });

  /* Quản trò lỡ tay đóng tab thì hỏi lại một câu */
  window.addEventListener('beforeunload', function (e) {
    if (S.isHost && S.room && Net.count() > 0) {
      e.preventDefault(); e.returnValue = '';
      return '';
    }
  });

  /* ── khởi động ── */
  S.cid = myId();
  Sfx.setSound(S.sound);
  render();

})();
