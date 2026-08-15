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
    voice: true,
    conn: 'wait',      // wait | online | bad
    called: [],
    last: null,
    rhyme: 'Bấm bốc số để mở màn.',
    grid: null,
    marks: null,
    players: [],
    wins: [],
    note: '',          // dòng chữ tạm dưới thanh dock
    joining: false,
    joinErr: '',
    code: ''
  };

  var hostTries = 0;

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
    return 'Đang bắt tay…';
  }
  function connDot() { return S.conn === 'online' ? 'ok' : S.conn === 'bad' ? 'bad' : 'wait'; }

  /* ═══════════ MÀN HÌNH CHÍNH ═══════════ */
  function viewHome() {
    var warn = Net.ready() ? '' :
      '<p class="err">Không tải được thư viện kết nối. Hai chế độ có mã phòng sẽ không chạy — ' +
      'kiểm tra mạng rồi tải lại trang. Hai chế độ không cần mã vẫn dùng bình thường.</p>';

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
      warn +
      '<div class="lbl">Cả nhóm cùng một ván</div>' +
      stub('host', '🎤', 'Tôi làm quản trò',
        'Mở phòng, lấy mã, bốc số. Số ra hiện thẳng trên máy mọi người.') +
      stub('join', '🎟️', 'Tôi vào phòng',
        'Nhập mã 4 ký tự quản trò đọc, nhận một tờ lô tô riêng.') +
      '<div class="lbl">Không cần mã phòng</div>' +
      stub('solocaller', '🥁', 'Bốc số để hô miệng',
        'Một máy bốc số, quản trò hô lớn. Máy khác chỉ cầm tờ.') +
      stub('solocard', '📄', 'Chỉ lấy một tờ lô tô',
        'Nghe hô tới đâu tự đậy nắp tới đó.') +
      '<div class="lbl">Thiết lập</div>' +
      '<div class="toggle"><span>Giọng đọc số tiếng Việt</span>' +
        '<button class="sw' + (S.voice ? ' on' : '') + '" data-act="sw-voice" aria-label="Bật tắt giọng đọc"></button></div>' +
      '<div class="toggle"><span>Tiếng động và nhạc kinh</span>' +
        '<button class="sw' + (S.sound ? ' on' : '') + '" data-act="sw-sound" aria-label="Bật tắt âm thanh"></button></div>' +
      '<p class="note">Luật ván này: tờ 9 hàng × 9 cột, 45 số, mỗi hàng 5 số. ' +
        'Đủ 5 nắp trên một hàng ngang là kinh.<br>' +
        'Máy quản trò giữ ván, nên quản trò cần để tab này mở suốt buổi.</p>';
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

    var head = S.room
      ? '<div class="codebar"><div><div class="k">Mã phòng</div>' +
        '<div class="v">' + esc(S.room) + '</div></div>' +
        '<div class="k right">Đọc mã này cho cả nhóm nhập vào</div></div>' +
        '<div class="conn"><span class="dot ' + connDot() + '"></span>' + esc(connText()) + '</div>'
      : '<div class="codebar"><div><div class="k">Chế độ</div>' +
        '<div class="v sm">Hô miệng</div></div>' +
        '<div class="k right">Máy này bốc số, bạn hô lớn cho cả nhóm</div></div>';

    var board = '';
    for (var n = 1; n <= 90; n++) {
      var cls = n === S.last ? ' last' : (S.called.indexOf(n) !== -1 ? ' on' : '');
      board += '<div class="bn' + cls + '">' + n + '</div>';
    }

    var wins = '';
    if (S.room) {
      wins = '<div class="lbl">Ai đã kinh</div>' + (S.wins.length
        ? '<div class="list">' + S.wins.map(function (w) {
            return '<div class="item"><span>' + esc(w.name) + '</span>' +
              '<span class="tag">kinh hàng ' + (w.row + 1) + '</span></div>';
          }).join('') + '</div>'
        : '<div class="empty">Chưa ai kinh. Ai hô kinh trên máy của họ thì tên sẽ hiện ngay ở đây.</div>');

      wins += '<div class="lbl">Người trong phòng</div>' + (S.players.length
        ? '<div class="list">' + S.players.map(function (p) {
            return '<div class="item"><span>' + esc(p.name) + '</span>' +
              '<span class="tag">' + (p.on ? 'đang nối' : 'rớt mạng') + '</span></div>';
          }).join('') + '</div>'
        : '<div class="empty">Chưa ai vào. Đọc mã ' + esc(S.room || '') + ' cho cả nhóm.</div>');
    }

    return '' +
      '<button class="back" data-act="back">← Về trang đầu</button>' + head +
      '<div class="drum"><div class="chip ' + (S.last ? 'pop' : 'empty') + '" id="chip">' +
        '<span>' + (S.last === null ? 'chưa bốc' : S.last) + '</span></div></div>' +
      '<div class="rhyme">' + esc(S.rhyme) + '</div>' +
      '<div class="count">' + S.called.length + ' số đã ra · còn ' + left + '</div>' +
      '<button class="btn btn-neon" data-act="draw"' + (left <= 0 ? ' disabled' : '') + '>' +
        (left > 0 ? 'Bốc số' : 'Hết số rồi') + '</button>' +
      '<div class="gap"></div>' +
      '<button class="btn btn-ghost" data-act="reset">Ván mới</button>' +
      '<div class="lbl">Bảng số đã ra</div><div class="board">' + board + '</div>' +
      wins +
      '<p class="note">' + (S.room
        ? 'Số bốc ra hiện gần như tức thì trên máy người chơi. Nếu ai đó rớt mạng, họ mở lại link và nhập mã là nhận đủ số đã ra.'
        : 'Nhớ hô rõ và chậm, người chơi tự đậy nắp trên tờ của họ.') + '</p>';
  }

  /* ═══════════ VÀO PHÒNG ═══════════ */
  function viewJoin() {
    return '' +
      '<button class="back" data-act="back">← Về trang đầu</button>' +
      '<div class="lbl">Mã quản trò đọc</div>' +
      '<input class="field code" id="fcode" maxlength="4" autocomplete="off" ' +
        'autocapitalize="characters" placeholder="••••" aria-label="Mã phòng" value="' + esc(S.code) + '">' +
      '<div class="lbl">Tên của bạn</div>' +
      '<input class="field" id="fname" maxlength="20" placeholder="Gọi bạn là gì?" ' +
        'aria-label="Tên người chơi" value="' + esc(S.name) + '">' +
      (S.joinErr ? '<p class="err">' + esc(S.joinErr) + '</p>' : '') +
      '<button class="btn btn-gold" data-act="enter"' + (S.joining ? ' disabled' : '') + '>' +
        (S.joining ? 'Đang tìm phòng…' : 'Vào phòng, nhận tờ') + '</button>';
  }

  /* ═══════════ TỜ LÔ TÔ ═══════════ */
  function viewCard() {
    var head = S.room
      ? '<div class="codebar"><div><div class="k">Đang trong phòng</div>' +
        '<div class="v">' + esc(S.room) + '</div></div>' +
        '<button class="btn btn-ghost btn-sm" data-act="newsheet">Đổi tờ</button></div>' +
        '<div class="conn"><span class="dot ' + connDot() + '"></span>' + esc(connText()) + '</div>'
      : '<div class="codebar"><div><div class="k">Tờ rời</div>' +
        '<div class="v sm">Tự đậy nắp</div></div>' +
        '<button class="btn btn-ghost btn-sm" data-act="newsheet">Đổi tờ</button></div>';

    var cells = '';
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        var n = S.grid[r][c];
        if (n === null) { cells += '<div class="cell blank"></div>'; continue; }
        var on = S.marks.has(r + '-' + c);
        var lit = S.room && !on && S.called.indexOf(n) !== -1;
        var rot = ((r * 7 + c * 13) % 17) - 8;
        cells += '<button class="cell num' + (lit ? ' called' : '') + '" data-act="cell" ' +
          'data-r="' + r + '" data-c="' + c + '" aria-label="Số ' + n + (on ? ', đã đậy' : '') + '">' +
          '<span class="n">' + n + '</span>' +
          (on ? '<span class="cap" style="transform:rotate(' + rot + 'deg)"></span>' : '') +
          '</button>';
      }
    }

    return '' +
      '<button class="back" data-act="back">← Về trang đầu</button>' + head +
      '<div class="sheet">' +
        '<div class="sheethead"><b>Lô tô</b><i>9 hàng · 45 số · kinh hàng ngang</i></div>' +
        '<div class="grid" id="grid">' + cells + '</div>' +
        '<div class="rowsflag" id="flags">' + flagsHtml() + '</div>' +
      '</div>' +
      '<p class="note">Chạm vào số để đậy nắp, chạm lần nữa để gỡ.' +
        (S.room ? ' Số quản trò vừa bốc sẽ nhấp nháy viền đỏ trên tờ.'
                : ' Nghe quản trò hô tới đâu, đậy tới đó.') + '</p>' +
      '<div class="dock"><div class="inner" id="dock">' + dockHtml() + '</div></div>';
  }

  function rowInfo() {
    return Game.rowStates(S.grid, S.marks, S.called, !!S.room);
  }
  function readyRow() {
    var rs = rowInfo();
    for (var i = 0; i < rs.length; i++) if (rs[i].full) return i;
    return -1;
  }
  function flagsHtml() {
    return rowInfo().map(function (s, r) {
      var cls = s.full ? ' full' : (s.marked ? ' p' : '');
      return '<div class="rf' + cls + '" title="Hàng ' + (r + 1) + ': ' + s.marked + '/' + s.total + '"></div>';
    }).join('');
  }
  function dockHtml() {
    var rr = readyRow();
    var b = S.note ? S.note
      : rr >= 0 ? 'Hàng ' + (rr + 1) + ' đủ 5 nắp!'
      : S.room ? S.called.length + ' số đã ra'
      : 'Đậy đủ 5 nắp một hàng là kinh';
    return '<div class="lastnum' + (S.last === null ? ' dim' : '') + '">' +
        (S.last === null ? 'chờ' : S.last) + '</div>' +
      '<div class="dockmeta"><div class="a">' + (S.room ? 'Số vừa ra' : 'Tự chấm') + '</div>' +
        '<div class="b">' + esc(b) + '</div></div>' +
      '<button class="btn btn-neon btn-sm" data-act="kinh" style="flex:none;min-width:92px"' +
        (rr < 0 ? ' disabled' : '') + '>KINH!</button>';
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
    var btns = g.querySelectorAll('.cell.num');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var r = +b.dataset.r, c = +b.dataset.c, n = S.grid[r][c];
      var on = S.marks.has(r + '-' + c);
      var lit = S.room && !on && S.called.indexOf(n) !== -1;
      b.classList.toggle('called', !!lit);
      var cap = b.querySelector('.cap');
      if (on && !cap) {
        var s = document.createElement('span');
        s.className = 'cap';
        s.style.transform = 'rotate(' + (((r * 7 + c * 13) % 17) - 8) + 'deg)';
        b.appendChild(s);
      } else if (!on && cap) { cap.remove(); }
    }
    q('#flags').innerHTML = flagsHtml();
    q('#dock').innerHTML = dockHtml();
  }

  function toast(msg) {
    S.note = msg;
    if (S.screen === 'card') { var d = q('#dock'); if (d) d.innerHTML = dockHtml(); }
    setTimeout(function () {
      S.note = '';
      if (S.screen === 'card') { var d2 = q('#dock'); if (d2) d2.innerHTML = dockHtml(); }
    }, 6000);
  }

  /* ═══════════ MÀN KINH ═══════════ */
  function showKinh(row, who) {
    var box = document.createElement('div');
    box.className = 'kinh';
    box.innerHTML = '<div><h2>Kinh!</h2><p>' +
      (who ? esc(who) + ' kinh hàng ' + (row + 1) + '.' : 'Hàng ' + (row + 1) + ' đã đủ 5 nắp. Hô lớn lên cho cả nhóm nghe.') +
      '</p><button class="btn btn-gold">Chơi tiếp</button></div>';
    var bits = [];
    for (var i = 0; i < 34; i++) {
      var s = document.createElement('span');
      var sz = 10 + Math.random() * 12;
      s.className = 'conf';
      s.style.left = (Math.random() * 100) + 'vw';
      s.style.width = sz + 'px'; s.style.height = sz + 'px';
      s.style.animationDuration = (2.2 + Math.random() * 2) + 's';
      s.style.animationDelay = (Math.random() * 1.1) + 's';
      document.body.appendChild(s); bits.push(s);
    }
    function close() {
      box.remove();
      bits.forEach(function (b) { b.remove(); });
    }
    box.addEventListener('click', close);
    document.body.appendChild(box);
    setTimeout(close, 9000);
  }

  /* ═══════════ HÀNH ĐỘNG ═══════════ */

  function openHostRoom() {
    if (!Net.ready()) return;
    hostTries = 0;
    S.isHost = true; S.conn = 'wait';
    S.called = []; S.last = null; S.wins = []; S.players = [];
    S.rhyme = 'Bấm bốc số để mở màn.';
    tryHost();
    S.screen = 'caller';
    render();
  }

  function tryHost() {
    var code = Game.newCode();
    S.room = code;
    Net.host(code, {
      state: function () { return { called: S.called, last: S.last }; },
      status: function (st) { S.conn = st; if (S.screen === 'caller') render(); },
      taken: function () {
        if (hostTries++ < 5) tryHost();
        else { S.conn = 'bad'; render(); }
      },
      fail: function () { S.conn = 'bad'; render(); },
      player: function (name, id) {
        var found = false;
        S.players = S.players.map(function (p) {
          if (p.id === id) { found = true; return { id: id, name: name, on: true }; }
          return p;
        });
        if (!found) S.players.push({ id: id, name: name, on: true });
        if (S.screen === 'caller') render();
      },
      leave: function (id) {
        S.players = S.players.map(function (p) {
          return p.id === id ? { id: p.id, name: p.name, on: false } : p;
        });
        if (S.screen === 'caller') render();
      },
      kinh: function (name, row) {
        S.wins.push({ name: name, row: row });
        Sfx.kinh(); Sfx.say(name + ' kinh rồi!');
        if (S.screen === 'caller') render();
        showKinh(row, name);
      }
    });
  }

  function doDraw() {
    var n = Game.drawFrom(S.called);
    if (n === null) return;
    S.called = S.called.concat([n]);
    S.last = n;
    var line = Game.rhyme();
    S.rhyme = line + ' con ' + Game.viNum(n) + '!';
    Sfx.draw(); Sfx.say(line + ' con ' + Game.viNum(n));
    if (S.room) Net.broadcast({ t: 'state', called: S.called, last: S.last });
    render();
  }

  function doReset() {
    if (S.called.length && !window.confirm('Xoá hết số đã bốc và bắt đầu ván mới?')) return;
    S.called = []; S.last = null; S.wins = [];
    S.rhyme = 'Ván mới. Bấm bốc số để mở màn.';
    if (S.room) Net.broadcast({ t: 'state', called: [], last: null });
    render();
  }

  function doEnter() {
    var fc = q('#fcode'), fn = q('#fname');
    var code = ((fc ? fc.value : S.code) || '').trim().toUpperCase();
    S.code = code;
    S.name = ((fn ? fn.value : S.name) || '').trim();
    if (code.length !== 4) { S.joinErr = 'Mã phòng gồm 4 ký tự.'; render(); return; }
    if (!Net.ready()) { S.joinErr = 'Chưa tải được thư viện kết nối. Kiểm tra mạng rồi tải lại trang.'; render(); return; }

    S.joining = true; S.joinErr = ''; render();

    Net.join(code, S.name || 'Khách', {
      status: function (st) {
        S.conn = st;
        if (st === 'online' && S.screen !== 'card') {
          S.joining = false; S.room = code; S.isHost = false;
          S.grid = Game.makeCard(); S.marks = new Set();
          S.called = []; S.last = null; S.screen = 'card';
        }
        render();
      },
      state: function (called, last) {
        var isNew = last !== null && last !== S.last;
        S.called = called || [];
        S.last = (last === undefined ? null : last);
        if (isNew && S.last !== null) { Sfx.draw(); Sfx.say('Con ' + Game.viNum(S.last)); }
        if (S.screen === 'card') patchCard(); else render();
      },
      winner: function (name, row) {
        if (name === (S.name || 'Khách')) return;
        toast(name + ' vừa kinh hàng ' + (row + 1));
      },
      fail: function (why) {
        S.joining = false; S.screen = 'join';
        S.joinErr = why === 'noroom' || why === 'timeout'
          ? 'Không vào được phòng ' + code + '. Kiểm tra lại mã, và chắc chắn máy quản trò vẫn đang mở.'
          : why === 'lost' ? 'Mất kết nối với quản trò. Thử vào lại phòng.'
          : 'Chưa tải được thư viện kết nối. Kiểm tra mạng rồi tải lại trang.';
        Net.leave();
        render();
      }
    });
  }

  function doCell(r, c) {
    if (S.grid[r][c] === null) return;
    var key = r + '-' + c;
    if (S.marks.has(key)) S.marks.delete(key);
    else { S.marks.add(key); Sfx.tap(); }
    patchCard();
  }

  function doKinh() {
    var rr = readyRow();
    if (rr < 0) return;
    Sfx.kinh(); Sfx.say('Kinh! Kinh rồi!');
    showKinh(rr, null);
    if (S.room) Net.toHost({ t: 'kinh', name: S.name || 'Khách', row: rr });
  }

  function doNewSheet() {
    if (S.marks.size && !window.confirm('Lấy tờ khác? Các nắp đang đậy sẽ mất.')) return;
    S.grid = Game.makeCard(); S.marks = new Set();
    render();
  }

  function goHome() {
    Net.leave();
    S.screen = 'home'; S.room = null; S.isHost = false; S.conn = 'wait';
    S.called = []; S.last = null; S.wins = []; S.players = [];
    S.joining = false; S.joinErr = ''; S.note = '';
    render();
  }

  /* ═══════════ SỰ KIỆN ═══════════ */
  el.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var a = t.dataset.act;

    if (a === 'host') return openHostRoom();
    if (a === 'join') { S.screen = 'join'; S.joinErr = ''; return render(); }
    if (a === 'solocaller') {
      S.room = null; S.isHost = false; S.called = []; S.last = null;
      S.rhyme = 'Bấm bốc số để mở màn.'; S.screen = 'caller'; return render();
    }
    if (a === 'solocard') {
      S.room = null; S.grid = Game.makeCard(); S.marks = new Set();
      S.called = []; S.last = null; S.screen = 'card'; return render();
    }
    if (a === 'sw-voice') { S.voice = !S.voice; Sfx.setVoice(S.voice); return render(); }
    if (a === 'sw-sound') { S.sound = !S.sound; Sfx.setSound(S.sound); Sfx.tap(); return render(); }

    if (a === 'back') return goHome();
    if (a === 'draw') return doDraw();
    if (a === 'reset') return doReset();
    if (a === 'enter') return doEnter();
    if (a === 'cell') return doCell(+t.dataset.r, +t.dataset.c);
    if (a === 'kinh') return doKinh();
    if (a === 'newsheet') return doNewSheet();
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

  window.addEventListener('beforeunload', function () {
    if (S.isHost && Net.count() > 0) Net.leave();
  });

  /* ── khởi động ── */
  Sfx.setSound(S.sound);
  Sfx.setVoice(S.voice);
  render();

})();
