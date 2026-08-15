/* ─────────────────────────────────────────────
   Tiếng động, sinh tại chỗ bằng Web Audio.
   Không dùng file âm thanh nào.
   ───────────────────────────────────────────── */

var Sfx = (function () {
  var ctx = null;
  var on = true;

  function ac() {
    if (!on) return null;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }

  function beep(freq, at, dur, type, vol) {
    var c = ac(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, c.currentTime + at);
    g.gain.setValueAtTime(0, c.currentTime + at);
    g.gain.linearRampToValueAtTime(vol || 0.13, c.currentTime + at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + at);
    o.stop(c.currentTime + at + dur + 0.05);
  }

  return {
    setSound: function (v) { on = v; },

    /* Chạm đậy nắp */
    tap: function () { beep(660, 0, 0.07, 'square', 0.07); },

    /* Bốc được một số */
    draw: function () { beep(392, 0, 0.1); beep(587, 0.09, 0.22); },

    /* Có người kinh */
    kinh: function () {
      var notes = [523, 659, 784, 1047, 1319];
      for (var i = 0; i < notes.length; i++) beep(notes[i], i * 0.11, 0.5, 'triangle', 0.16);
    }
  };
})();
