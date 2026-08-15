/* ─────────────────────────────────────────────
   Đồng bộ qua máy chủ chuyển tiếp công cộng (MQTT trên WebSocket).
   Máy quản trò đẩy số lên máy chủ, máy người chơi lấy về.
   Máy nào vào được internet là chạy — không còn phụ thuộc việc hai máy
   có nối thẳng được với nhau hay không.

   Ký tự đầu của mã phòng cho biết dùng máy chủ nào, nhờ vậy người chơi
   luôn về đúng chỗ quản trò đang đứng.

   Chủ đề (topic) dùng cho mỗi phòng loto/<mã>/… :
     host        quản trò còn đó hay không   (giữ lại, có di chúc)
     state       số đã bốc                   (giữ lại)
     sheet/<máy> tờ phát riêng cho từng máy  (giữ lại)
     ctl         lệnh ván mới
     win         ai vừa kinh
     ev          người chơi gửi lên quản trò
   ───────────────────────────────────────────── */

var Net = (function () {

  var BROKERS = [
    { tag: 'A', url: 'wss://broker.emqx.io:8084/mqtt' },
    { tag: 'B', url: 'wss://broker.hivemq.com:8884/mqtt' },
    { tag: 'C', url: 'wss://test.mosquitto.org:8081/mqtt' }
  ];

  var cli = null;
  var role = null;          // 'host' | 'guest'
  var h = {};
  var code = null;
  var T = null;
  var seen = {};            // quản trò: mã máy đang trong phòng
  var myCid = null;
  var tries = 0;
  var timer = null;
  var settled = false;

  function ready() { return typeof mqtt !== 'undefined'; }

  function topics(c) {
    var b = 'loto/' + c;
    return { host: b + '/host', state: b + '/state', ctl: b + '/ctl',
             win: b + '/win', ev: b + '/ev', sheet: b + '/sheet/' };
  }

  function brokerOf(c) {
    for (var i = 0; i < BROKERS.length; i++) if (BROKERS[i].tag === c.charAt(0)) return i;
    return -1;
  }

  function cid8() { return 'lt' + Math.random().toString(16).slice(2, 10); }

  function clear() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (cli) { try { cli.end(true); } catch (e) { } }
    cli = null; role = null; code = null; T = null; seen = {}; settled = false; tries = 0;
  }

  function send(topic, obj, retain) {
    if (!cli) return;
    try { cli.publish(topic, JSON.stringify(obj), { qos: 0, retain: !!retain }); } catch (e) { }
  }

  /* ═══════════ QUẢN TRÒ ═══════════ */

  /* fullCode = null → mở phòng mới, tự chọn máy chủ nào nối được
     fullCode có sẵn → mở lại đúng phòng cũ, phải dùng đúng máy chủ đó */
  function host(fullCode, handlers) {
    clear();
    role = 'host'; h = handlers || {};
    if (!ready()) { if (h.fail) h.fail('nolib'); return; }
    tries = fullCode ? brokerOf(fullCode) : 0;
    if (tries < 0) { if (h.fail) h.fail('badcode'); return; }
    hostTry(fullCode, !fullCode);
  }

  function hostTry(fullCode, mayHop) {
    if (tries >= BROKERS.length) { if (h.fail) h.fail('broker'); return; }
    var B = BROKERS[tries];
    code = fullCode || (B.tag + Game.newCode());
    T = topics(code);

    if (h.status) h.status('wait');

    cli = mqtt.connect(B.url, {
      clientId: 'loto_' + cid8(),
      clean: true, keepalive: 30,
      connectTimeout: 9000, reconnectPeriod: 3000,
      will: { topic: T.host, payload: JSON.stringify({ on: false }), qos: 0, retain: true }
    });

    var hopped = false;
    function hop() {
      if (hopped || !mayHop) return;
      hopped = true;
      try { cli.end(true); } catch (e) { }
      tries++;
      hostTry(null, true);
    }
    timer = setTimeout(function () {
      if (!settled) { if (mayHop) hop(); else if (h.fail) h.fail('broker'); }
    }, 11000);

    cli.on('connect', function () {
      settled = true;
      if (timer) { clearTimeout(timer); timer = null; }
      cli.subscribe(T.ev, { qos: 0 });
      send(T.host, { on: true }, true);
      if (h.state) send(T.state, { t: 'state', called: h.state().called, last: h.state().last }, true);
      if (h.code) h.code(code);
      if (h.status) h.status('online');
    });

    cli.on('message', function (topic, buf) {
      if (topic !== T.ev) return;
      var m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
      if (!m || !m.t) return;

      if (m.t === 'hello' && h.player) {
        seen[m.cid] = 1;
        h.player(m.name || 'Khách', m.cid, m.cid, function (msg) {
          send(T.sheet + m.cid, msg, true);
        });
      }
      if (m.t === 'bye') { delete seen[m.cid]; if (h.leave) h.leave(m.cid); }
      if (m.t === 'kinh' && h.kinh) {
        h.kinh(m.name || 'Khách', m.cid, m.line);
        send(T.win, { name: m.name || 'Khách', cid: m.cid, line: m.line, at: Date.now() });
      }
    });

    cli.on('reconnect', function () { if (h.status) h.status('wait'); });
    cli.on('offline', function () { if (h.status) h.status('wait'); });
    cli.on('error', function () { if (!settled) hop(); });
    cli.on('close', function () { if (!settled) hop(); });
  }

  /* ═══════════ NGƯỜI CHƠI ═══════════ */
  function join(fullCode, name, myId, handlers) {
    clear();
    role = 'guest'; h = handlers || {}; myCid = myId;
    if (!ready()) { if (h.fail) h.fail('nolib'); return; }

    var bi = brokerOf(fullCode);
    if (bi < 0) { if (h.fail) h.fail('badcode'); return; }

    code = fullCode; T = topics(code);
    var roomSeen = false;

    cli = mqtt.connect(BROKERS[bi].url, {
      clientId: 'loto_' + cid8(),
      clean: true, keepalive: 30,
      connectTimeout: 9000, reconnectPeriod: 3000,
      will: { topic: T.ev, payload: JSON.stringify({ t: 'bye', cid: myCid }), qos: 0, retain: false }
    });

    timer = setTimeout(function () {
      if (!roomSeen && h.fail) h.fail(settled ? 'noroom' : 'broker');
    }, 12000);

    cli.on('connect', function () {
      settled = true;
      cli.subscribe([T.host, T.state, T.ctl, T.win, T.sheet + myCid], { qos: 0 });
    });

    cli.on('message', function (topic, buf) {
      var txt = buf.toString();
      if (!txt) return;                       // tin đã bị xoá
      var m; try { m = JSON.parse(txt); } catch (e) { return; }

      if (topic === T.host) {
        if (m.on) {
          if (!roomSeen) {
            roomSeen = true;
            if (timer) { clearTimeout(timer); timer = null; }
            if (h.status) h.status('online');
            send(T.ev, { t: 'hello', name: name, cid: myCid });
          } else if (h.status) h.status('online');
        } else if (roomSeen && h.status) h.status('wait');
        return;
      }
      if (topic === T.state && h.state) { h.state(m.called || [], m.last); return; }
      if (topic === T.sheet + myCid && h.sheet) { h.sheet(m.grid || m); return; }
      if (topic === T.ctl) {
        if (m.t === 'newgame' && h.newgame) h.newgame();
        return;
      }
      if (topic === T.win && h.winner) { h.winner(m.name, m.cid, m.line); return; }
    });

    cli.on('reconnect', function () { if (roomSeen && h.status) h.status('wait'); });
    cli.on('offline', function () { if (roomSeen && h.status) h.status('wait'); });
    cli.on('error', function () { if (!settled && h.fail) h.fail('broker'); });
  }

  /* ═══════════ GỬI TIN ═══════════ */
  function broadcast(msg) {
    if (!cli || role !== 'host') return;
    if (msg.t === 'state') { send(T.state, msg, true); return; }
    if (msg.t === 'newgame') {
      Object.keys(seen).forEach(function (c) {      // thu hồi tờ cũ
        try { cli.publish(T.sheet + c, '', { qos: 0, retain: true }); } catch (e) { }
      });
      send(T.ctl, { t: 'newgame' });
      return;
    }
    send(T.ctl, msg);
  }

  function toHost(msg) {
    if (!cli || role !== 'guest') return;
    send(T.ev, msg);
  }

  function leave() {
    if (cli && role === 'host' && T) send(T.host, { on: false }, true);
    if (cli && role === 'guest' && T && myCid) send(T.ev, { t: 'bye', cid: myCid });
    setTimeout(clear, 120);
  }

  return {
    ready: ready,
    host: host,
    join: join,
    broadcast: broadcast,
    toHost: toHost,
    leave: leave,
    role: function () { return role; },
    count: function () { return Object.keys(seen).length; },
    codeLen: function () { return 5; },
    validCode: function (c) { return c.length === 5 && brokerOf(c) >= 0; }
  };
})();
