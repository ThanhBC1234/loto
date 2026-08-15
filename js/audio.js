/* ─────────────────────────────────────────────
   Tiếng động (Web Audio) và giọng đọc số (Speech Synthesis).
   Không dùng file âm thanh nào, mọi thứ sinh tại chỗ.
   ───────────────────────────────────────────── */

var Sfx = (function () {
  var ctx = null;
  var on = true;
  var voiceOn = true;

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

  /* Giọng đọc tiếng Việt, nếu máy có sẵn */
  var viVoice = null;
  function loadVoices() {
    if (!window.speechSynthesis) return;
    var vs = window.speechSynthesis.getVoices() || [];
    for (var i = 0; i < vs.length; i++) {
      if ((vs[i].lang || '').toLowerCase().indexOf('vi') === 0) { viVoice = vs[i]; break; }
    }
  }
  if (window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  return {
    setSound: function (v) { on = v; },
    setVoice: function (v) { voiceOn = v; if (!v && window.speechSynthesis) window.speechSynthesis.cancel(); },
    hasVoice: function () { return !!viVoice; },

    /* Chạm đậy nắp */
    tap: function () { beep(660, 0, 0.07, 'square', 0.07); },

    /* Bốc được một số */
    draw: function () { beep(392, 0, 0.1); beep(587, 0.09, 0.22); },

    /* Có người kinh */
    kinh: function () {
      var notes = [523, 659, 784, 1047, 1319];
      for (var i = 0; i < notes.length; i++) beep(notes[i], i * 0.11, 0.5, 'triangle', 0.16);
    },

    say: function (text) {
      if (!voiceOn || !window.speechSynthesis) return;
      try {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'vi-VN'; u.rate = 0.92; u.pitch = 1.05;
        if (viVoice) u.voice = viVoice;
        window.speechSynthesis.speak(u);
      } catch (e) { /* máy không hỗ trợ thì thôi */ }
    }
  };
})();
