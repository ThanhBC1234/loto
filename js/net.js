/* ─────────────────────────────────────────────
   Đồng bộ đa thiết bị bằng PeerJS (WebRTC).
   Máy quản trò giữ ván; máy người chơi nối thẳng vào bằng mã phòng.
   Không cần server riêng, chỉ mượn broker công cộng của PeerJS để bắt tay.

   Bản tin:
     quản trò → người chơi : {t:'state', called:[…], last:n}
                             {t:'sheet', grid:[[…]]}      ← tờ riêng, quản trò phát
                             {t:'newgame'}                ← ván mới, xin tờ khác
                             {t:'winner', name:'…', cid:'…', line:'hàng dọc 3'}
     người chơi → quản trò : {t:'hello', name:'…', cid:'…'}
                             {t:'kinh',  name:'…', cid:'…', line:'hàng dọc 3'}
   ───────────────────────────────────────────── */

var Net = (function () {

  var PREFIX = 'lototet-';      // tránh trùng id với ứng dụng khác trên broker chung
  var peer = null;
  var conns = [];               // quản trò: các kết nối đang mở
  var conn = null;              // người chơi: kết nối tới quản trò
  var role = null;              // 'host' | 'guest'
  var h = {};                   // handlers
  var retry = 0;
  var joinTimer = null;

  function ready() { return typeof Peer !== 'undefined'; }

  function cleanup() {
    if (joinTimer) { clearTimeout(joinTimer); joinTimer = null; }
    try { if (peer) peer.destroy(); } catch (e) { }
    peer = null; conns = []; conn = null; role = null; retry = 0;
  }

  /* ── QUẢN TRÒ ── */
  function host(code, handlers) {
    cleanup();
    role = 'host'; h = handlers || {};
    if (!ready()) { if (h.fail) h.fail('nolib'); return; }

    peer = new Peer(PREFIX + code, { debug: 0 });

    peer.on('open', function () { if (h.status) h.status('online'); });

    peer.on('connection', function (c) {
      conns.push(c);
      c.on('open', function () {
        // gửi ngay toàn bộ ván cho người mới vào
        try { c.send({ t: 'state', called: h.state().called, last: h.state().last }); } catch (e) { }
      });
      c.on('data', function (m) {
        if (!m || !m.t) return;
        if (m.t === 'hello' && h.player) {
          c.__cid = m.cid || c.peer;
          h.player(m.name || 'Khách', c.__cid, c.peer, function (msg) {
            try { if (c.open) c.send(msg); } catch (e) { }
          });
        }
        if (m.t === 'kinh' && h.kinh) {
          h.kinh(m.name || 'Khách', m.cid || c.__cid, m.line);
          broadcast({ t: 'winner', name: m.name || 'Khách', cid: m.cid || c.__cid, line: m.line });
        }
      });
      c.on('close', function () {
        conns = conns.filter(function (x) { return x !== c; });
        if (h.leave) h.leave(c.__cid || c.peer);
      });
      c.on('error', function () { });
    });

    peer.on('disconnected', function () {
      if (h.status) h.status('wait');
      try { peer.reconnect(); } catch (e) { }
    });

    peer.on('error', function (err) {
      var t = err && err.type;
      if (t === 'unavailable-id') { if (h.taken) h.taken(); return; }
      if (t === 'network' || t === 'server-error' || t === 'socket-error') {
        if (h.status) h.status('wait');
        return;
      }
      if (h.status) h.status('bad');
    });
  }

  /* ── NGƯỜI CHƠI ── */
  function join(code, name, cid, handlers) {
    cleanup();
    role = 'guest'; h = handlers || {};
    if (!ready()) { if (h.fail) h.fail('nolib'); return; }

    peer = new Peer(null, { debug: 0 });

    peer.on('open', function () { link(code, name, cid); });

    peer.on('disconnected', function () {
      if (h.status) h.status('wait');
      try { peer.reconnect(); } catch (e) { }
    });

    peer.on('error', function (err) {
      var t = err && err.type;
      if (t === 'peer-unavailable') { if (h.fail) h.fail('noroom'); return; }
      if (h.status) h.status('wait');
    });

    joinTimer = setTimeout(function () {
      if (!conn || !conn.open) { if (h.fail) h.fail('timeout'); }
    }, 12000);
  }

  function link(code, name, cid) {
    conn = peer.connect(PREFIX + code, { reliable: true });

    conn.on('open', function () {
      retry = 0;
      if (joinTimer) { clearTimeout(joinTimer); joinTimer = null; }
      if (h.status) h.status('online');
      try { conn.send({ t: 'hello', name: name, cid: cid }); } catch (e) { }
    });

    conn.on('data', function (m) {
      if (!m || !m.t) return;
      if (m.t === 'state' && h.state) h.state(m.called || [], m.last);
      if (m.t === 'sheet' && h.sheet) h.sheet(m.grid);
      if (m.t === 'newgame' && h.newgame) h.newgame();
      if (m.t === 'winner' && h.winner) h.winner(m.name, m.cid, m.line);
    });

    conn.on('close', function () {
      if (h.status) h.status('wait');
      if (retry < 40) {
        retry++;
        setTimeout(function () { if (peer && !peer.destroyed) link(code, name, cid); }, 2500);
      } else if (h.fail) h.fail('lost');
    });

    conn.on('error', function () { });
  }

  function broadcast(msg) {
    for (var i = 0; i < conns.length; i++) {
      try { if (conns[i].open) conns[i].send(msg); } catch (e) { }
    }
  }

  function toHost(msg) {
    try { if (conn && conn.open) conn.send(msg); } catch (e) { }
  }

  return {
    ready: ready,
    host: host,
    join: join,
    broadcast: broadcast,
    toHost: toHost,
    leave: cleanup,
    role: function () { return role; },
    count: function () { return conns.length; }
  };
})();
