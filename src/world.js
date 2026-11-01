import { isTouch } from "./config.js";
import { CH, CW, TAU, clamp, gm, pick, rnd, save, sfx } from "./core.js";
import { CHARS, CHAR_BY_ID, DIFFS, ETYPE, MAPS, MAX_LV, MAX_WPN, PICKUPS, PICKUP_KINDS, SKILL_BY_ID, WPN_BY_ID, XP_TABLE } from "./data.js";

/* ================= WORLD ================= */
/* ================= WORLD ================= */
    const cam = { x: 0, y: 0, shake: 0, flash: 0 };
    let state = "title", paused = false;
    function setState(v) { state = v; }
    function setPaused(v) { paused = v; }
    let run = null, player = null;
    let enemies = [], bullets = [], ebullets = [], gems = [], pickups = [];
    let particles = [], rings = [], bolts = [], strikes = [], torps = [], wells = [];
    let orbs = [], arcs = [], gales = [], booms = [], cms = [];
    /* 通用技能新增：fires 火海地块 / meteors 天降陨石 */
    let fires = [], meteors = [];
    /* 地图「崩塌回廊」的可破坏物（无墙，全是能打碎的东西） */
    let props = [];
let waves = [];
    let hints = [], boss = null, rift = null, chest = null;
    /* 跨模块赋值走 setter：ESM 里 import 进来的绑定不能直接写 */
    export function setChest(v) { chest = v; }
    /* 跨模块赋值走 setter：ESM 里 import 进来的绑定不能直接写 */
    export function setRift(v) { rift = v; }
    /* 跨模块赋值走 setter：ESM 里 import 进来的绑定不能直接写 */
    export function setBoss(v) { boss = v; }
    let dmgNums = [];
    let budget = 0, tlIdx = 0, pPool = [], hintY = 0;
    /* 跨模块赋值走 setter：ESM 里 import 进来的绑定不能直接写 */
    export function setTlIdx(v) { tlIdx = v; }
    const PMAX = isTouch ? 1300 : 2400;
    const MAX_ENEMY = 260;

    function nextXpNeed(l) {
      if (l <= XP_TABLE.length) return XP_TABLE[l - 1];
      return XP_TABLE[XP_TABLE.length - 1] + (l - XP_TABLE.length) * 10;
    }
    function charOf(id) { return CHAR_BY_ID[id] || CHARS[0]; }

    /* ---------- 倍率（全部由被动/局外/角色实时计算） ---------- */
    function hasWpn(id) { return run.wpns.some(w => w.id === id); }
    /* 武器族：技能按族归属，只要持有该族任意一把武器就能触发 */
    function hasFam(fam) { return !!fam && run.wpns.some(w => (WPN_BY_ID[w.id] || {}).fam === fam); }
    function hasSkill(id) { return run.skills.some(s => s.id === id); }
    function wpnOf(id) { return run.wpns.find(w => w.id === id) || null; }
    function skillOf(id) { return run.skills.find(s => s.id === id) || null; }

    /* 全局伤害：增幅 / 局外火控；匠心只加武器层 */
    function dmgMul(isWpn) {
      let m = (1 + .10 * (run.pas.power || 0)) * (1 + .06 * (save.up.dmg || 0));
      if (isWpn) m *= (1 + .12 * (run.pas.craft || 0));
      return m;
    }
    /* 超频只影响技能冷却，不影响普攻 */
    function skillCdMul() { return Math.max(.35, (1 - .06 * (run.pas.rapid || 0)) * (1 - .08 * (save.up.scdr || 0))); }
    /* 扩散：脉冲系（脉冲炮 / 连锁闪电 / 暴击飞弹）完全不吃 */
    function areaMul(src) {
      if (src === "pulse") return 1;
      return 1 + .08 * (run.pas.area || 0);
    }
    function moveSpd() { return 258 * (1 + .10 * (run.pas.haste || 0)) * (1 + .05 * (save.up.spd || 0)) * run.char.spd * ((run.char.tr && run.char.tr.spd) || 1); }
    function luckVal() { return (save.up.luck || 0); }
    function critC() { return Math.min(.75, .05 + .08 * (save.up.crit || 0) + ((run.char.tr && run.char.tr.crit) || 0)); }
    function critD() { return 2 + .20 * (save.up.critd || 0); }
    function magnetR() { return 170 * (1 + .30 * (save.up.magnet || 0)); }
    function dashCdMax() { return 2.6 * (1 - .10 * (save.up.cdr || 0)); }
    function hpScale() { const m = run.t / 60; return (1 + .55 * m + .10 * m * m) * diffHp(); }

    /* ---------- 地图 / 难度（局外选的，重开才生效） ---------- */
    function mapOf() { return MAPS.find(m => m.id === (save.map || "plain")) || MAPS[0]; }
    function diffOf() { const d = DIFFS[save.diff || 0]; return d || DIFFS[0]; }
    function diffHp() { return diffOf().hp; }
    function diffSpd() { return diffOf().spd; }
    function diffCoin() { return diffOf().coin; }
    function diffXp() { return diffOf().xp; }

    /* ---------- 可破坏物（崩塀回廊） ---------- */
    const PROP_KINDS = [
      { k: "crate", r: 52, hp: 52, col: "#c9894c" },
      { k: "pillar", r: 66, hp: 120, col: "#8b96a8" },
      { k: "shard", r: 42, hp: 30, col: "#7ea6c9" },
    ];
    /* 无限地图按区块懒生成：玩家走到哪，脚下区块才铺残骸（概率很低，不密密麻麻） */
    const PROP_CHUNK = 760;
    let propChunks = {};

    function genPropChunk(cx, cy, per) {
      const key = cx + ":" + cy;
      if (propChunks[key]) return;
      propChunks[key] = 1;
      /* 每块平均 per 个，实际 0 / 1 / 2 抖动，保持稀疏 */
      let n = 0;
      if (Math.random() < per) n += 1;
      if (Math.random() < per * .35) n += 1;
      for (let i = 0; i < n; i++) {
        const x = cx * PROP_CHUNK + PROP_CHUNK * (rnd(.18, .82));
        const y = cy * PROP_CHUNK + PROP_CHUNK * (rnd(.18, .82));
        /* 出生点附近留白，别把玩家卡死在箱子里 */
        if (Math.hypot(x, y) < 260) continue;
        const T = PROP_KINDS[(Math.random() * PROP_KINDS.length) | 0];
        let bad = false;
        for (const p of props) {
          if (p.dead) continue;
          if (Math.hypot(p.x - x, p.y - y) < p.r + T.r + 40) { bad = true; break; }
        }
        if (bad) continue;
        props.push({
          x, y, r: T.r, hp: T.hp, maxHp: T.hp, kind: T.k, col: T.col,
          rot: rnd(0, TAU), hit: 0, dead: false,
        });
      }
    }

    /* 每帧按玩家所在区块补齐 3×3 邻域，并清掉太远的旧残骸 */
    function refillProps() {
      const per = mapOf().props;
      if (!per) return;
      const cx = Math.floor(player.x / PROP_CHUNK), cy = Math.floor(player.y / PROP_CHUNK);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) genPropChunk(cx + i, cy + j, per);
      }
      if (props.length > 40) {
        for (let i = props.length - 1; i >= 0; i--) {
          const p = props[i];
          if (p.dead || Math.hypot(p.x - player.x, p.y - player.y) > 2400) props.splice(i, 1);
        }
      }
    }
    /* 把实体推出可破坏物（挡玩家也挡怪，但没有墙） */
    function separateProps(o) {
      for (const p of props) {
        if (p.dead) continue;
        const dx = o.x - p.x, dy = o.y - p.y;
        const rr = p.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < .0001) continue;
        const d = Math.sqrt(d2);
        o.x = p.x + dx / d * rr;
        o.y = p.y + dy / d * rr;
      }
    }
    function breakProp(p) {
      p.dead = true;
      burst(p.x, p.y, 16, p.col, 300, 3.2, .55, 1);
      sfx.hit();
      /* 碎块爆东西：经验球 + 偶尔金币 */
      const cnt = 2 + (Math.random() < .5 ? 1 : 0);
      for (let i = 0; i < cnt; i++) {
        dropOrb(p.x + rnd(-14, 14), p.y + rnd(-14, 14), 0, 2 + Math.round(Math.random() * 2));
      }
      if (Math.random() < .55) dropOrb(p.x + rnd(-10, 10), p.y + rnd(-10, 10), 1, 1 + Math.round(Math.random() * 2));
    }

    /* ---------- 局内重置 ---------- */
    function addWpn(id, lv) {
      let w = wpnOf(id);
      if (w) { w.lv = clamp(Math.max(w.lv, lv), 1, MAX_LV); return w; }
      if (run.wpns.length >= MAX_WPN) return null;
      w = { id, lv: clamp(lv || 1, 1, MAX_LV), t: .35, evo: false };
      run.wpns.push(w);
      return w;
    }
    function addSkill(id, lv) {
      const S = SKILL_BY_ID[id];
      if (!S) return null;
      let s = skillOf(id);
      if (s) { s.lv = clamp(Math.max(s.lv, lv), 1, MAX_LV); return s; }
      s = { id, lv: clamp(lv || 1, 1, MAX_LV), t: .5 };
      run.skills.push(s);
      return s;
    }

    function resetRun(charId) {
      const c = charOf(charId);
      run = {
        t: 0, level: 1, xp: 0, xpNeed: nextXpNeed(1), kills: 0, coins: 0, score: 0,
        dmg: 0, hits: 0, combo: 0, comboMax: 0, healAcc: 0, won: false,
        charId: c.id, char: c, wpns: [], skills: [], pas: {},
        maxHp: 5 + (save.up.hp || 0) + c.hp,
        invuln: 1.4, dashT: 0, dashCd: 0, dashX: 0, dashY: 0,
        revive: save.up.revive ? 1 : 0, guardT: 0, rerolls: 3,
        /* 再生血清：首跳间隔就是它的周期（10/8/6 秒） */
        regenT: save.up.regen ? Math.max(4, 10 - 2 * (save.up.regen - 1)) : 20,
        pendingLevels: 0,
        exitOpen: false, ended: false,
        /* 一局里同一种 Boss 只出一次（GM 跳关 + 时间轴同时触发时不会刷出两只） */
        bossDone: { small: false, final: false },
      };
      player = { x: 0, y: 0, vx: 0, vy: 0, r: 11, ang: 0, hp: run.maxHp, trail: [] };
      enemies = []; bullets = []; ebullets = []; gems = []; particles = [];
      rings = []; bolts = []; strikes = []; torps = []; wells = []; hints = []; dmgNums = [];
      orbs = []; arcs = []; gales = []; booms = []; cms = []; pickups = [];
      fires = []; meteors = [];
      boss = null; rift = null; chest = null;
      props = []; waves = [];
      budget = 0; tlIdx = 0; pPool.length = 0;
      cam.x = -CW / 2; cam.y = -CH / 2; cam.shake = 0; cam.flash = 0;
      /* 地图决定地形：平原空着，崩塌回廊按区块铺可破坏残骸 */
      propChunks = {};
      props = [];
      refillProps();
      addWpn(c.weapon, 1 + (save.up.wlvl || 0));
      /* 开局就给一点密度：10 只小怪 + 2 只冲锋兵，避免前 30 秒无事可做 */
      for (let i = 0; i < 10; i++) {
        const p = spawnPos();
        enemies.push(makeEnemy("drift", p.x, p.y));
      }
      for (let i = 0; i < 2; i++) {
        const p = spawnPos(-40);
        enemies.push(makeEnemy("rusher", p.x, p.y));
      }
    }

    /* ---------- 粒子 ---------- */
    function pAdd(x, y, vx, vy, life, col, r, type) {
      let p;
      if (particles.length >= PMAX) p = particles.shift();
      else p = pPool.pop() || {};
      p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.max = life; p.col = col; p.r = r; p.type = type || 0;
      particles.push(p);
      return p;
    }
    function burst(x, y, n, col, spd, r, life, type) {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), s = rnd(spd * .22, spd);
        pAdd(x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(life * .55, life), col, rnd(r * .55, r), type || 0);
      }
    }
    function trailPuff(x, y, col) {
      pAdd(x + rnd(-3, 3), y + rnd(-3, 3), rnd(-25, 25), rnd(-25, 25), rnd(.16, .34), col, rnd(1.6, 3), 0);
    }
    function toast(txt, col) {
      hints.push({ txt, col: col || "#9fe8ff", life: 2.3, y: CH * (.2 + (hintY = (hintY + 1) % 3) * .045) });
      if (hints.length > 4) hints.shift();
    }

    /* ---------- 敌人 ---------- */
    function spawnPos(pad) {
      const a = rnd(0, TAU);
      const d = Math.max(CW, CH) * .62 + rnd(60, 200) + (pad || 0);
      return { x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d };
    }
    function makeEnemy(type, x, y, hpK) {
      const T = ETYPE[type];
      const k = hpK === undefined ? hpScale() : hpK;
      const hp = T.hp * k;
      return {
        type, x, y, vx: 0, vy: 0, r: T.r, hp, maxHp: hp, spd: T.spd * rnd(.9, 1.1) * diffSpd(),
        xp: T.xp, coin: T.coin, dmg: T.dmg, col: T.col, sides: T.sides,
        rot: rnd(0, TAU), hitCd: 0, flash: 0, ft: rnd(.8, 2.2), ph: rnd(0, TAU),
        dead: false, boss: false, elite: false, orbitDir: Math.random() < .5 ? 1 : -1,
      };
    }
    function waveWeights(m) {
      const w = { drift: 1 };
      if (m >= .5) w.rusher = .8;
      if (m >= 2) w.shooter = .32;
      if (m >= 3) w.splitter = .4;
      if (m >= 4) w.tank = .15;
      if (m >= 6) w.orbiter = .3;
      if (m >= 8) { w.drift = 1.5; w.rusher = 1.15; w.tank = .24; w.shooter = .42; }
      if (m >= 11) { w.splitter = .6; w.orbiter = .4; }
      return w;
    }
    function pickWeighted(w) {
      let tot = 0;
      for (const k in w) tot += w[k];
      let n = Math.random() * tot;
      for (const k in w) { n -= w[k]; if (n <= 0) return k; }
      return "drift";
    }
    function director(dt) {
      if (gm.freeze) return;
      const m = run.t / 60;
      const cap = Math.min(MAX_ENEMY, 70 + m * 32);
      budget += (1.6 + m * 1.15) * dt;
      const pool = waveWeights(m);
      let guard = 0;
      while (budget >= 1 && guard++ < 30) {
        if (enemies.length >= cap) { budget = 0; break; }
        budget -= 1;
        const p = spawnPos();
        const t = pickWeighted(pool);
        if (t === "drift") {
          for (let i = 0; i < 2; i++)
            enemies.push(makeEnemy("drift", p.x + rnd(-55, 55), p.y + rnd(-55, 55)));
        } else enemies.push(makeEnemy(t, p.x, p.y));
      }
    }
    function horde(n) {
      const base = rnd(0, TAU);
      toast("⚠ 怪潮来袭", "#ff9a9a");
      sfx.boom();
      for (let i = 0; i < n; i++) {
        const d = Math.max(CW, CH) * .55 + 60 + i * 13;
        const a = base + rnd(-.55, .55);
        const t = Math.random() < .78 ? "drift" : (Math.random() < .5 ? "rusher" : "orbiter");
        enemies.push(makeEnemy(t, player.x + Math.cos(a) * d, player.y + Math.sin(a) * d));
      }
    }
    /* 小规模增援：和怪潮同方向堆叠，但没有警告音与横幅 */
    function surge(n) {
      const base = rnd(0, TAU);
      for (let i = 0; i < n; i++) {
        const d = Math.max(CW, CH) * .58 + 40 + i * 9;
        const a = base + rnd(-.7, .7);
        const t = Math.random() < .84 ? "drift" : "rusher";
        enemies.push(makeEnemy(t, player.x + Math.cos(a) * d, player.y + Math.sin(a) * d));
      }
    }
    function spawnElite() {
      const p = spawnPos(40);
      const e = makeEnemy("elite", p.x, p.y);
      e.elite = true;
      enemies.push(e);
      toast("⭐ 精英出现 · 掉落宝箱", "#ff8fc0");
      sfx.boss();
    }
    function spawnBoss(final) {
      /* 同一种 Boss 一局只出一次：否则用 GM 跳到 12:00 之后再走到 14:00，会同时看到两只一样的 */
      const key = final ? "final" : "small";
      if (!run) return;
      if (!run.bossDone) run.bossDone = { small: false, final: false };
      if (run.bossDone[key]) return;
      run.bossDone[key] = true;
      const p = spawnPos(120);
      const hp = final ? 7000 : 2200;
      boss = {
        type: "boss", x: p.x, y: p.y, vx: 0, vy: 0, r: final ? 56 : 40,
        hp, maxHp: hp, spd: final ? 54 : 62, dmg: 3, col: final ? "#ff3d6e" : "#ff8f4d",
        sides: final ? 3 : 6, rot: 0, hitCd: 0, flash: 0, ft: 2.2, ph: 0,
        dead: false, boss: true, elite: false, final: !!final,
        atkT: 2.2, chargeT: 5.5, charge: 0,
        phase: 1, waveT: 4.5, sumT: 7, fanT: 5.5, sumN: 0,
      };
      enemies.push(boss);
      cam.shake = 14;
      sfx.boss();
      toast(final ? "☠ 终局 Boss 降临" : "☠ 小型 Boss", "#ff6b8a");
    }
    /* 怪物阵法：0 横排推进 / 1 菱形 / 2 圆环，按规律从 Boss 身边挤出 */
    function spawnFormation(b, kind) {
      const ang = Math.atan2(player.y - b.y, player.x - b.x);
      const ox = Math.cos(ang), oy = Math.sin(ang);
      const nx = -oy, ny = ox;
      const put = (dx, dy, type) => {
        const x = b.x + dx, y = b.y + dy;
        const e = makeEnemy(type, x, y);
        e.hp = e.maxHp = Math.round(e.maxHp * .9);
        enemies.push(e);
      };
      if (kind === 0) {
        for (let i = -2; i <= 2; i++) {
          put(ox * 90 + nx * i * 62, oy * 90 + ny * i * 62, i % 2 ? "drift" : "rusher");
        }
      } else if (kind === 1) {
        const R = 130;
        for (let i = 0; i < 4; i++) {
          const a = ang + i * Math.PI / 2;
          put(Math.cos(a) * R, Math.sin(a) * R, "drift");
        }
      } else {
        for (let i = 0; i < 8; i++) {
          const a = ang + i / 8 * TAU;
          put(Math.cos(a) * 150, Math.sin(a) * 150, i % 3 ? "drift" : "rusher");
        }
      }
      burst(b.x, b.y, 18, "#ff8a5c", 240, 3, .5, 0);
      cam.shake = Math.max(cam.shake, 4);
    }
    function nearestEnemy(x, y, range) {
      let best = null, bd = range * range;
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }
    function enemiesInRadius(x, y, r) {
      const out = [];
      for (const e of enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - x, e.y - y) < r + e.r) out.push(e);
      }
      return out;
    }

    /* ---------- 掉落 ---------- */
    function dropOrb(x, y, kind, val) {
      gems.push({ x, y, vx: rnd(-70, 70), vy: rnd(-70, 70), kind, val, ph: rnd(0, TAU), pull: false, age: 0 });
    }
    function dropLoot(e) {
      const lk = luckVal();
      dropOrb(e.x, e.y, 0, e.xp);
      if (e.coin > 0) dropOrb(e.x + rnd(-6, 6), e.y + rnd(-6, 6), 1, e.coin + (lk > 0 && Math.random() < .25 * lk ? 1 : 0));
      if (lk > 0 && Math.random() < .06 * lk) dropOrb(e.x, e.y, 1, 2);
      /* 补给：精英/Boss 必掉，普通怪小概率掉（幸运提升概率）；精英猎手额外多掉 */
      if (e.boss || e.elite) {
        dropPickup(e.x + rnd(-26, 26), e.y + rnd(-26, 26), pick(PICKUP_KINDS));
        if (e.boss) dropPickup(e.x + rnd(-40, 40), e.y + rnd(-40, 40), pick(PICKUP_KINDS));
        for (let i = 0; i < (save.up.hunter || 0); i++) {
          dropPickup(e.x + rnd(-56, 56), e.y + rnd(-56, 56), pick(PICKUP_KINDS));
        }
      } else {
        const bonus = 1 + .35 * lk;
        if (Math.random() < .012 * bonus) dropPickup(e.x, e.y, "heal");
        else if (Math.random() < .008 * bonus) dropPickup(e.x, e.y, "magnet");
        else if (Math.random() < .006 * bonus) dropPickup(e.x, e.y, "bomb");
      }
    }
    function dropPickup(x, y, kind) {
      const T = PICKUPS[kind];
      if (!T) return;
      if (pickups.length > 28) pickups.shift();
      pickups.push({
        kind, x, y, r: T.r, col: T.col, vx: rnd(-50, 50), vy: rnd(-50, 50),
        ph: rnd(0, TAU), life: 26, pull: false,
      });
    }

export { MAX_ENEMY, PMAX, addSkill, addWpn, breakProp, hasFam, arcs, areaMul, bolts, booms, boss, budget, bullets, burst, cam, charOf, chest, cms, critC, critD, dashCdMax, diffCoin, diffHp, diffOf, diffSpd, diffXp, director, dmgMul, dmgNums, dropLoot, dropOrb, dropPickup, ebullets, enemies, enemiesInRadius, fires, gales, gems, hasSkill, hasWpn, hintY, hints, horde, hpScale, luckVal, magnetR, makeEnemy, mapOf, meteors, moveSpd, nearestEnemy, nextXpNeed, orbs, pAdd, pPool, particles, paused, pickups, pickWeighted, player, props, refillProps, resetRun, rift, rings, run, separateProps, setPaused, setState, skillCdMul, skillOf, spawnBoss, spawnElite, spawnFormation, spawnPos, state, strikes, surge, tlIdx, toast, torps, trailPuff, waves, waveWeights, wells, wpnOf };



