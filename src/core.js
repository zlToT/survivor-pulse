import { isTouch } from "./config.js";
import { boss, chest } from "./world.js";
import { hurt } from "./combat.js";
import { ui, win } from "./ui.js";

/* ================= CORE ================= */
/* =========================================================
       幸存者 · 脉冲  ——  单文件改造版
       结构：CORE / DATA / WORLD / WEAPONS / UPDATE / RENDER / UI / BOOT
       说明：逻辑与渲染分离，渲染只读 run 状态，便于将来换 WebGL
       ========================================================= */

    /* ================= CORE ================= */
    const cv = document.getElementById("c");
    const fx = document.getElementById("fx");
    let ctx = null, fctx = null;
    /* 用函数声明而不是 const：循环 import 时其它模块的顶层代码也能安全调用 */
    function $(id) { return document.getElementById(id); }
    const DPR_CAP = isTouch ? 1.5 : 2;
    const TAU = Math.PI * 2;
    let CW = 0, CH = 0, DPR = 1;

    const rnd = (a, b) => a + Math.random() * (b - a);
    const rndi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
    const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    function hexA(hex, a) {
      const n = parseInt(hex.slice(1), 16);
      return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
    }

    function resize() {
      CW = window.innerWidth;
      CH = window.innerHeight;
      DPR = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      for (const c of [cv, fx]) {
        c.width = Math.round(CW * DPR);
        c.height = Math.round(CH * DPR);
        c.style.width = CW + "px";
        c.style.height = CH + "px";
      }
      ctx = cv.getContext("2d");
      fctx = fx.getContext("2d");
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    addEventListener("resize", resize);
    addEventListener("orientationchange", () => setTimeout(resize, 120));

    /* ---------- 光晕贴图（预渲染，替代每帧渐变） ---------- */
    const texCache = {};
    function glowTex(col, r) {
      const q = r <= 3 ? 3 : r <= 6 ? 6 : r <= 12 ? 12 : r <= 24 ? 24 : 48;
      const key = col + "|" + q;
      if (texCache[key]) return texCache[key];
      const s = q * 2;
      const c = document.createElement("canvas");
      c.width = s;
      c.height = s;
      const g = c.getContext("2d");
      const gr = g.createRadialGradient(q, q, 0, q, q, q);
      gr.addColorStop(0, hexA(col, .95));
      gr.addColorStop(.35, hexA(col, .48));
      gr.addColorStop(1, hexA(col, 0));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(q, q, q, 0, TAU);
      g.fill();
      texCache[key] = c;
      return c;
    }
    const TEX = {
      spark: null, ring: null
    };
    function makeSprites() {
      TEX.spark = glowTex("#ffffff", 3);
    }

    /* ---------- 音频 ---------- */
    let AC = null;
    /* 设置与数据分两把钥匙：gws_set（开关 / 音量）、gws_data（金币 / 强化 / 角色 / 记录）。
       开发期不再给 key 加版本号，加减字段直接靠默认值兼容。 */
    const SET_KEY = "gws_set";
    const DATA_KEY = "gws_data";
    let muted = false;      /* 全部音效开关（true = 静音） */
    let dmgOn = 1;          /* 伤害数字：1 开 / 0 关 */
    const VOL = { m: .5, s: .5 };
    function persistSet() {
      try { localStorage.setItem(SET_KEY, JSON.stringify({ muted, dmg: dmgOn, volM: VOL.m, volS: VOL.s })); }
      catch (e) { saveOk = false; }
    }
    function loadSet() {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(SET_KEY) || "null"); } catch (e) { raw = null; }
      if (!raw) return;
      if (typeof raw.muted === "boolean") muted = raw.muted;
      if (typeof raw.dmg === "number" && isFinite(raw.dmg)) dmgOn = raw.dmg === 0 ? 0 : 1;
      if (typeof raw.volM === "number" && isFinite(raw.volM)) VOL.m = clamp(raw.volM, 0, 1);
      if (typeof raw.volS === "number" && isFinite(raw.volS)) VOL.s = clamp(raw.volS, 0, 1);
    }
    function setVol(k, v) {
      VOL[k] = clamp(v, 0, 1);
      persistSet();
      if (k === "m" && bgmGain) bgmGain.gain.value = muted ? 0 : VOL.m * BGM_MASTER;
    }
    /* ESM 里别的模块不能直接写 import 进来的 let，统一走 setter */
    function setMuted(v) {
      muted = !!v;
      if (bgmGain) bgmGain.gain.value = muted ? 0 : VOL.m * BGM_MASTER;
      persistSet();
    }
    function setDmg(v) {
      dmgOn = v ? 1 : 0;
      persistSet();
    }
    /* GM 调试状态（面板在 BLOCK8，这里提前声明给战斗逻辑用） */
    const gm = { open: false, god: false, noPopup: false, freeze: false, n: 1 };
    function audio() {
      if (!AC) {
        try {
          AC = new (window.AudioContext || window.webkitAudioContext)();
          bgmGain = AC.createGain();
          bgmGain.gain.value = muted ? 0 : VOL.m * BGM_MASTER;
          bgmGain.connect(AC.destination);
        } catch (e) { AC = null; }
      }
      if (AC && AC.state === "suspended") AC.resume();
      if (AC && !bgmTimer) bgmTimer = setInterval(bgmTick, 60);
    }
    function beep(f, d, type, gain, slide) {
      if (muted || !AC) return;
      const t = AC.currentTime;
      const o = AC.createOscillator();
      const g = AC.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(slide, 1), t + d);
      g.gain.setValueAtTime((gain || .1) * VOL.s * SFX_MASTER, t);
      g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g);
      g.connect(AC.destination);
      o.start(t);
      o.stop(t + d + .02);
    }

    /* ---------- BGM：程序化循环，无外部音频文件 ---------- */
    const BGM_MASTER = 0.50;   /* 音乐总增益（在音量滑条之外再乘一次；.16 时偏小声，翻倍到 .32） */
    const SFX_MASTER = 4.0;   /* 音效总增益（同理，滑条之外再乘 1.8） */
    const BGM_CFG = {
      calm: { bpm: 74, root: 55, pat: [0, 4, 2, 5, 1, 4, 3, 2] },
      drive: { bpm: 108, root: 65.4, pat: [0, 2, 4, 3, 5, 4, 2, 1] },
      boss: { bpm: 132, root: 49, pat: [0, 3, 1, 4, 2, 5, 3, 1] },
    };
    const BGM_SCALE = [0, 3, 5, 7, 10, 12];   /* 必须覆盖 BGM_CFG 的 pat 里最大级数 5，否则越界取到 undefined → NaN 音高 */
    let bgmGain = null, bgmTimer = null, bgmMode = "calm", bgmStep = 0, bgmNext = 0;
    function mtone(freq, t, dur, type, gain) {
      if (!AC || !bgmGain) return;
      /* AudioParam 传 NaN / Infinity 会抛 TypeError，先把非法值挡掉 */
      if (!isFinite(freq) || !isFinite(t) || !isFinite(dur)) return;
      const o = AC.createOscillator();
      const g = AC.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(gain, .0002), t + .012);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g);
      g.connect(bgmGain);
      o.start(t);
      o.stop(t + dur + .02);
    }
    function bgmTick() {
      if (!AC || !bgmGain) return;
      if (muted) { bgmNext = AC.currentTime; return; }
      bgmGain.gain.value = VOL.m * BGM_MASTER;
      const cfg = BGM_CFG[bgmMode] || BGM_CFG.calm;
      const step = 60 / cfg.bpm / 2;                 /* 八分音符 */
      while (bgmNext < AC.currentTime + .3) {
        const t = Math.max(bgmNext, AC.currentTime + .02);
        const s = bgmStep;
        const semi = BGM_SCALE[cfg.pat[s % cfg.pat.length]] || 0;
        const oct = (s % 16) >= 8 ? 2 : 1;
        /* 低音：每 4 步一次 */
        if (s % 4 === 0) mtone(cfg.root * (s % 16 === 8 ? .943 : 1), t, step * 3.2, "triangle", .085);
        /* 琶音主旋律 */
        mtone(cfg.root * 4 * Math.pow(2, semi / 12) * (oct === 2 ? 2 : 1), t, step * 1.5, "sine", .05);
        /* 弱拍点缀（高频短音） */
        if (s % 2 === 1) mtone(cfg.root * 16 * Math.pow(2, semi / 12), t, step * .32, "square", .012);
        bgmStep++;
        bgmNext = t + step;
      }
    }
    function bgmSetMode(m) {
      if (bgmMode === m) return;
      bgmMode = m || "calm";
      if (AC) bgmNext = AC.currentTime + .05;
    }
    /* 切到后台（或最小化、锁屏）时把音频上下文挂起，调度器一并停掉，
       否则隐藏期间 bgmTick 被节流、currentTime 又冻结，回来会一次性补放积压的音符 */
    let bgmHidden = false;
    function bgmPause() {
      if (bgmHidden) return;
      bgmHidden = true;
      if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
      if (AC && AC.state === "running") { try { AC.suspend(); } catch (e) { } }
    }
    function bgmResume() {
      if (!bgmHidden) return;
      bgmHidden = false;
      if (!AC) return;
      try { AC.resume(); } catch (e) { }
      bgmNext = AC.currentTime + .05;
      if (!bgmTimer) bgmTimer = setInterval(bgmTick, 60);
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) bgmPause(); else bgmResume();
    });
    addEventListener("pagehide", bgmPause);
    addEventListener("pageshow", bgmResume);
    const sfx = {
      shoot: () => beep(1500, .03, "square", .01, 900),
      hit: () => beep(340, .035, "square", .015, 150),
      kill: () => beep(560, .06, "triangle", .022, 180),
      orb: () => beep(1150, .045, "sine", .016, 1700),
      coin: () => beep(1600, .05, "triangle", .022, 2300),
      hurt: () => beep(150, .22, "sawtooth", .1, 50),
      dash: () => beep(720, .11, "sine", .04, 1500),
      level: () => { beep(660, .08, "sine", .05, 990); setTimeout(() => beep(990, .12, "sine", .05, 1400), 90); },
      chest: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, .12, "triangle", .045), i * 80)); },
      nova: () => beep(200, .18, "triangle", .04, 620),
      boom: () => beep(110, .16, "square", .045, 38),
      zap: () => beep(1400, .07, "sawtooth", .022, 380),
      boss: () => beep(85, .55, "sawtooth", .09, 40),
      win: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => beep(f, .2, "triangle", .05), i * 105)); },
      /* UI：所有按钮点击的短促“哒” */
      ui: () => { beep(1180, .04, "square", .026, 760); },
      /* UI：选卡（升级 / 宝箱）的清脆上行三连音 */
      pick: () => {
        beep(880, .07, "triangle", .05, 1046);
        setTimeout(() => beep(1174, .08, "triangle", .05, 1396), 55);
        setTimeout(() => beep(1568, .14, "sine", .045, 1760), 110);
      },
      /* UI：不可用 / 买不起 */
      nope: () => beep(200, .12, "square", .035, 120),
    };

    /* ---------- 存档：数据一份（gws_data），设置一份（gws_set） ---------- */
    let saveOk = true;
    function defSave() {
      /* 加减字段直接改这里：loadSave 用 Object.assign 补默认值，不再有版本号和旧档迁移 */
      return {
        coins: 0, up: {}, chars: { tri: 1 }, pick: "tri", map: "plain", diff: 0,
        bestTime: 0, bestKill: 0, bestCoin: 0, bestDmg: 0, bestCombo: 0,
        bestWpns: 0, bestSkills: 0,
        /* 每个「地图 : 难度」组合各存一份最佳（键形如 "plain:0"，8 份） */
        best: {},
        /* 成就累计值：kills 击杀 / runs 局数 / coin 金币 / boss Boss / chest 宝箱 / evo 进化 */
        tot: { kills: 0, runs: 0, coin: 0, boss: 0, chest: 0, evo: 0 },
        killTypes: {},          /* 各类型敌人累计击杀（图鉴 / 成就用） */
        easter: { noHit: 0, win: 0 },
        ach: {},                /* 已领取的成就 id */
      };
    }
    let save = defSave();
    function loadSave() {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(DATA_KEY) || "null"); } catch (e) { raw = null; }
      if (raw) save = Object.assign(defSave(), raw);
      if (!save.up) save.up = {};
      if (!save.chars) save.chars = {};
      if (typeof save.pick !== "string") save.pick = "tri";
      /* 地图与难度：值域外的一律退回默认 */
      if (save.map !== "plain" && save.map !== "ruin") save.map = "plain";
      if (typeof save.diff !== "number" || !isFinite(save.diff) || save.diff < 0 || save.diff > 3) save.diff = 0;
      ["bestTime", "bestKill", "bestCoin", "bestDmg", "bestCombo", "bestWpns", "bestSkills"].forEach(k => {
        if (typeof save[k] !== "number" || !isFinite(save[k])) save[k] = 0;
      });
      /* 累计值与成就容器：缺字段就补 0，脏数据直接丢掉重来 */
      if (!save.tot || typeof save.tot !== "object") save.tot = {};
      ["kills", "runs", "coin", "boss", "chest", "evo"].forEach(k => {
        if (typeof save.tot[k] !== "number" || !isFinite(save.tot[k])) save.tot[k] = 0;
      });
      if (!save.killTypes || typeof save.killTypes !== "object") save.killTypes = {};
      /* 分组合最佳：每项都补齐 5 个数字字段，脏数据当 0 */
      if (!save.best || typeof save.best !== "object") save.best = {};
      for (const k in save.best) {
        const r = save.best[k];
        if (!r || typeof r !== "object") { delete save.best[k]; continue; }
        ["t", "k", "c", "d", "m"].forEach(f => {
          if (typeof r[f] !== "number" || !isFinite(r[f])) r[f] = 0;
        });
      }
      if (!save.easter || typeof save.easter !== "object") save.easter = { noHit: 0, win: 0 };
      if (!save.ach || typeof save.ach !== "object") save.ach = {};
      if (typeof save.coins !== "number" || !isFinite(save.coins) || save.coins < 0) save.coins = 0;
      save.coins = Math.floor(save.coins);
      save.chars.tri = 1;
      loadSet();
      persist();
      persistSet();
    }
    function persist() {
      try { localStorage.setItem(DATA_KEY, JSON.stringify(save)); saveOk = true; }
      catch (e) { saveOk = false; }
    }

export { $, AC, CH, CW, DATA_KEY, DPR, DPR_CAP, SET_KEY, TAU, TEX, VOL, audio, beep, bgmSetMode, clamp, ctx, cv, defSave, dmgOn, fctx, fx, glowTex, gm, hexA, lerp, loadSave, makeSprites, muted, persist, pick, resize, rnd, rndi, save, saveOk, setDmg, setMuted, setVol, sfx, texCache };

