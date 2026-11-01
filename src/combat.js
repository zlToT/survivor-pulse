import { CH, CW, TAU, clamp, dmgOn, lerp, rnd, save, sfx } from "./core.js";
import { ETYPE, SKILL_BY_ID, WPN_BY_ID, pulsePattern } from "./data.js";
import { MAX_ENEMY, arcs, areaMul, bolts, booms, boss, breakProp, bullets, burst, cam, chest, cms, critC, critD, dmgMul, dmgNums, dropLoot, ebullets, enemies, fires, gales, hasFam, hasSkill, makeEnemy, meteors, nearestEnemy, orbs, pAdd, pPool, particles, player, props, rift, rings, run, setBoss, setChest, setRift, skillCdMul, skillOf, strikes, toast, torps, wells } from "./world.js";
import { hitPlayer } from "./update.js";
import { CELL } from "./render.js";

/* ================= COMBAT ================= */
/* ================= WEAPONS / COMBAT ================= */

    const DEFAULT_HIT = { src: "skill", crit: true };

    /* 一次伤害结算：暴击 / 飘字 / 击退 / 暴击飞弹挂载
       opt = { src:"pulse"|"dark"|"blade"|"skill", wpn:bool, crit:false 关闭暴击, noProc:true 不再触发飞弹, slow:秒 } */
    function hurt(e, dmg, dirx, diry, knock, opt) {
      if (!e || e.dead) return 0;
      const o = opt || DEFAULT_HIT;
      let d = dmg, crit = false;
      if (o.crit !== false && Math.random() < critC()) { crit = true; d *= critD(); }
      if (e.freeze > 0) d *= 1.25;   /* 冰封棱镜：冻结目标易伤 */
      e.hp -= d;
      run.dmg += d;
      /* 血契汲取：把伤害按比例攒成生命 */
      const lc = skillOf("leech");
      if (lc) {
        run.healAcc = (run.healAcc || 0) + d * (.04 + .012 * lc.lv);
        while (run.healAcc >= 1 && player.hp < run.maxHp) {
          run.healAcc -= 1;
          player.hp = Math.min(run.maxHp, player.hp + 1);
          burst(player.x, player.y, 5, "#ff9db0", 150, 2.4, .35, 0);
        }
        if (run.healAcc > 3) run.healAcc = 3;
      }
      e.flash = .12;
      if (o.slow) e.slowT = Math.max(e.slowT || 0, o.slow);
      if (dmgOn && d >= .5) {
        dmgNums.push({
          x: e.x + rnd(-6, 6), y: e.y - e.r - 4, vy: crit ? -74 : -46,
          txt: d >= 10 ? Math.round(d) : d.toFixed(1),
          col: crit ? "#ff4d6d" : e.boss ? "#ffd76a" : "#fff3c4",
          crit, life: crit ? .8 : .62, max: crit ? .8 : .62,
        });
        if (dmgNums.length > 70) dmgNums.shift();
      }
      if (crit) {
        burst(e.x, e.y, 9, "#ff4d6d", 280, 3.2, .34, 1);
        for (let i = 0; i < 3; i++) pAdd(e.x, e.y, rnd(-160, 160), rnd(-160, 160), .34, "#ff8fa3", 2.8, 1);
        cam.shake = Math.max(cam.shake, 2.2);
        if (sfx.crit) sfx.crit();
      }
      if (knock && (dirx || diry)) {
        const l = Math.hypot(dirx, diry) || 1;
        e.vx += dirx / l * knock; e.vy += diry / l * knock;
      }
      /* 暴击飞弹：只有脉冲武器的伤害暴击才触发 */
      if (crit && o.src === "pulse" && !o.noProc && hasSkill("cmissile")) spawnCritMissile(e, d);
      if (e.hp <= 0) killEnemy(e);
      else if (Math.random() < .55) burst(e.x, e.y, crit ? 4 : 2, "#eaf4ff", 140, 2.2, .18, 0);
      return crit ? 1 : 0;
    }

    /* 暴击飞弹：弧线绕行后回击同一目标 */
    function spawnCritMissile(target, dmg) {
      if (cms.length >= 8) cms.shift();
      const sm = skillOf("cmissile");
      const base = dmg * (.5 + .05 * (sm ? sm.lv - 1 : 0));
      const sx = player.x, sy = player.y;
      const mx = (sx + target.x) / 2, my = (sy + target.y) / 2;
      const nx = -(target.y - sy), ny = (target.x - sx);
      const nl = Math.hypot(nx, ny) || 1;
      const side = Math.random() < .5 ? 1 : -1;
      const bend = rnd(80, 140) * side;
      cms.push({
        sx, sy, cx: mx + nx / nl * bend, cy: my + ny / nl * bend,
        t: 0, life: .38, target, dmg: base, x: sx, y: sy,
      });
    }

    function killEnemy(e) {
      if (e.dead) return;
      e.dead = true;
      run.kills++;
      run.combo++;
      if (run.combo > run.comboMax) run.comboMax = run.combo;
      /* 图鉴 / 成就累计：按敌人类型记击杀数，Boss 另记一笔 */
      save.killTypes[e.type] = (save.killTypes[e.type] || 0) + 1;
      if (e.boss) save.tot.boss++;
      run.score += e.boss ? 5000 : e.elite ? 300 : 10;
      dropLoot(e);
      burst(e.x, e.y, e.boss ? 110 : e.elite ? 48 : 16, e.col,
        e.boss ? 560 : 280, e.boss ? 6 : 3, e.boss ? .95 : .5, 1);
      cam.shake = Math.max(cam.shake, e.boss ? 18 : e.elite ? 7 : 1.4);
      if (e.boss) {
        setBoss(null);
        sfx.boom();
        toast(e.final ? "Boss 击破 · 裂隙开启" : "Boss 击破", "#ffd166");
        if (e.final) {
          run.exitOpen = true;
          const a = rnd(0, TAU), d = rnd(180, 300);
          setRift({ x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d, r: 46, t: 0 });
          toast("▶ 前往裂隙撤离（或继续挑战）", "#7ef7c8");
        }
      } else {
        if (e.type === "splitter") {
          for (let i = 0; i < 3; i++) {
            if (enemies.length >= MAX_ENEMY) break;
            const m = makeEnemy("mini", e.x + rnd(-16, 16), e.y + rnd(-16, 16), e.hp / ETYPE.splitter.hp * .35);
            m.spd *= 1.4;
            enemies.push(m);
          }
        }
        if (e.elite) {
          setChest({ x: e.x, y: e.y, t: 0, r: 18 });
          toast("宝箱掉落", "#ffd166");
        }
        if (Math.random() < .1) sfx.kill();
      }
    }

    /* 可破坏物：玩家所有伤害都能打碎（崩塀回廊）
       hit：可选的「本次已命中」数组（同一次挥砍 / 同一发弹体不重复扣血） */
    function hurtProps(x, y, r, dmg, hit) {
      if (!props.length) return;
      for (const p of props) {
        if (p.dead || (hit && hit.indexOf(p) >= 0)) continue;
        const dx = p.x - x, dy = p.y - y;
        if (dx * dx + dy * dy < (p.r + r) * (p.r + r)) {
          if (hit) hit.push(p);
          p.hp -= dmg; p.hit = 1;
          if (p.hp <= 0) breakProp(p);
        }
      }
    }

    /* 扇形判定版（弧刃刀光）：只打朝向前方的残骸 */
    function hurtPropsArc(cx, cy, ang, half, radius, dmg, hit) {
      if (!props.length) return;
      for (const p of props) {
        if (p.dead || (hit && hit.indexOf(p) >= 0)) continue;
        const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
        if (d > radius + p.r) continue;
        let da = Math.atan2(dy, dx) - ang;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        if (Math.abs(da) > half + Math.atan2(p.r, Math.max(d, 1))) continue;
        if (hit) hit.push(p);
        p.hp -= dmg; p.hit = 1;
        if (p.hp <= 0) breakProp(p);
      }
    }

    function damageArea(x, y, r, dmg, knock, exclude, opt) {
      let n = 0;
      for (const e of enemies) {
        if (e.dead || e === exclude) continue;
        const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
        if (d < r + e.r) {
          const inv = d > .001 ? 1 / d : 0;
          hurt(e, dmg, dx * inv, dy * inv, knock || 0, opt);
          n++;
        }
      }
      hurtProps(x, y, r, dmg);
      return n;
    }

    /* ---------- 普攻：武器释放的动作 ---------- */
    /* 弹道展开：与弹道来源无关，只看数量 —— 0, -1, +1, -2, +2 … */
    function spreadK(i) { return i === 0 ? 0 : (i % 2 === 1 ? -1 : 1) * Math.ceil(i / 2); }

    function atkPulse(w) {
      const range = 6 * CELL;   /* 射程：6 格 */
      const tg = nearestEnemy(player.x, player.y, range);
      if (!tg) return;
      const base = Math.atan2(tg.y - player.y, tg.x - player.x);
      player.ang = base;
      const dmg = WPN_BY_ID.pulse.dmg(w.lv) * dmgMul(true) * (w.evo ? .7 : 1);
      /* 弹道 = 1（自身）+ 脉冲炮每级 +1；千针进化后整体翻倍并带穿透
         展开规则与来源无关：第 1 道正中，之后按 左1 右1 左2 右2 … 依次加档 */
      const n = pulsePattern() + (save.up.proj || 0);
      const step = .085 * areaMul("pulse");
      for (let i = 0; i < n; i++) {
        const a = base + spreadK(i) * step;
        bullets.push({
          x: player.x + Math.cos(a) * 16, y: player.y + Math.sin(a) * 16,
          vx: Math.cos(a) * 900, vy: Math.sin(a) * 900,
          r: 4, dmg, pierce: (w.evo ? 1 : 0) + (save.up.pierce || 0), hit: [], life: range / 900, col: "#4fc3ff",
          opt: { src: "pulse", wpn: true },
        });
      }
      sfx.shoot();
    }

    function atkDark(w) {
      const tg = nearestEnemy(player.x, player.y, 4 * CELL);
      const base = tg ? Math.atan2(tg.y - player.y, tg.x - player.x) : player.ang;
      player.ang = base;
      const sp = 300;
      const range = 4 * CELL;   /* 射程：4 格 */
      orbs.push({
        x: player.x + Math.cos(base) * 18, y: player.y + Math.sin(base) * 18,
        vx: Math.cos(base) * sp, vy: Math.sin(base) * sp,
        r: (15 + .5 * w.lv) * areaMul("dark") * (w.evo ? 1.4 : 1),
        dmg: WPN_BY_ID.dark.dmg(w.lv) * dmgMul(true),
        hit: [], trav: 0, max: range, t: 0, col: "#a78bfa", evo: w.evo, ph: rnd(0, TAU),
      });
      sfx.nova();
    }

    function arcHit(cx, cy, ang, half, radius, dmg, hit, opt, knock) {
      for (const e of enemies) {
        if (e.dead || hit.indexOf(e) >= 0) continue;
        const dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy);
        if (d > radius + e.r) continue;
        let da = Math.atan2(dy, dx) - ang;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        if (Math.abs(da) > half) continue;
        hit.push(e);
        hurt(e, dmg, dx, dy, knock || 30, opt);
      }
    }

    /* 刀光视觉：字段与 RENDER 里 arcs 循环一致（a0/a1/spin/w） */
    function pushArc(x, y, ang, half, r, col, life, w, dirSign) {
      arcs.push({
        x, y, r,
        a0: ang - half,
        a1: half * 2,
        w: w || 13,
        spin: (dirSign || 0) * half * .45,
        t: 0,
        life: life || .2,
        col,
      });
    }

    function atkBlade(w) {
      const dir = player.ang;
      const dmg = WPN_BY_ID.blade.dmg(w.lv) * dmgMul(true) * (w.evo ? 1.4 : 1);
      const radius = 2 * CELL;   /* 射程：2 格 */
      const half = Math.PI / 4;   /* 90° 刀光 */
      const hit = [];
      const phit = [];
      pushArc(player.x, player.y, dir, half, radius, "#6ee7a8", .22, 14, -1);
      arcHit(player.x, player.y, dir, half, radius, dmg, hit, { src: "blade", wpn: true });
      hurtPropsArc(player.x, player.y, dir, half, radius, dmg, phit);
      if (w.evo) {
        /* 双月：左右两侧各补一刀 120° 弧，半径比基础长 25% */
        const sideR = radius * 1.28;
        for (const sgn of [-1, 1]) {
          const a = dir + sgn * Math.PI / 2;
          pushArc(player.x, player.y, a, Math.PI / 3, sideR, "#7ef7c8", .24, 13, sgn);
          arcHit(player.x, player.y, a, Math.PI / 3, sideR, dmg * .8, hit, { src: "blade", wpn: true });
          hurtPropsArc(player.x, player.y, a, Math.PI / 3, sideR, dmg * .8, phit);
        }
      }
      /* 双剑滑斩：朝移动反方向再补一刀 */
      const dsl = skillOf("dual");
      if (dsl) {
        const back = dir + Math.PI;
        const bdmg = dmg * (.6 + .08 * dsl.lv);
        pushArc(player.x, player.y, back, Math.PI / 3.2, radius * .92, "#8be0c0", .24, 11, 1);
        arcHit(player.x, player.y, back, Math.PI / 3.2, radius * .92, bdmg, [], { src: "blade", wpn: true }, 46);
        hurtPropsArc(player.x, player.y, back, Math.PI / 3.2, radius * .92, bdmg, phit);
      }
      sfx.zap();
    }

    /* ---------- 技能释放 ---------- */
    /* 脉冲炮没有独立出手：它只是给普攻追加弹道，逻辑在 atkPulse 里 */

    function castGale(s) {
      const dist = 480 + 40 * s.lv;
      const sp = 560;
      const a = player.ang;
      gales.push({
        x: player.x + Math.cos(a) * 20, y: player.y + Math.sin(a) * 20,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 30 * areaMul("blade"),
        dmg: (3.6 + 1.5 * s.lv) * dmgMul(false),
        trav: 0, max: dist, hit: [], ph: rnd(0, TAU),
      });
      sfx.zap();
    }

    function castBoomerang(s) {
      const dist = 320 + 30 * s.lv;
      booms.push({
        x: player.x, y: player.y, ang: player.ang, sp: 520,
        r: 30 * areaMul("blade"), trav: 0, max: dist, back: false,
        dmg: (4.5 + 1.6 * s.lv) * dmgMul(false), hitOut: [], hitBack: [], t: 0,
      });
      sfx.shoot();
    }

    function castWell(s) {
      const r = (68 + 14 * s.lv) * areaMul("dark");
      const dmg = (1.2 + .8 * s.lv) * dmgMul(false);
      const tg = nearestEnemy(player.x, player.y, 760);
      const x = tg ? tg.x : player.x + Math.cos(rnd(0, TAU)) * 200;
      const y = tg ? tg.y : player.y + Math.sin(rnd(0, TAU)) * 200;
      wells.push({ x, y, r, t: 2.3, tick: 0, dmg, evo: false, pull: 340 + r * 1.4, opt: { src: "dark" } });
      burst(x, y, 18, "#a78bfa", 220, 3, .5, 0);
      sfx.nova();
    }

    function castNova(s) {
      const r = (96 + 24 * s.lv) * areaMul("blade");
      const dmg = (2.4 + 1.3 * s.lv) * dmgMul(false);
      rings.push({ x: player.x, y: player.y, r: 12, max: r, dmg, life: .5, t: 0, evo: false, fired: false, hit: [], opt: { src: "blade" } });
      cam.shake = Math.max(cam.shake, 4);
      sfx.nova();
    }

    function castChain(s) {
      const jumps = 2 + s.lv;
      const dmg = (7 + 3 * s.lv) * dmgMul(false);
      let cur = nearestEnemy(player.x, player.y, 560);
      if (!cur) return;
      const used = [];
      let fx0 = player.x, fy0 = player.y;
      for (let i = 0; i < jumps && cur; i++) {
        used.push(cur);
        bolts.push({ x1: fx0, y1: fy0, x2: cur.x, y2: cur.y, t: 0, life: .16 });
        hurt(cur, dmg, 0, 0, 0, { src: "pulse" });
        /* 连锁闪电会炸到落点附近的残骸 */
        hurtProps(cur.x, cur.y, 30, dmg);
        burst(cur.x, cur.y, 6, "#9ae6ff", 210, 2.6, .28, 0);
        fx0 = cur.x; fy0 = cur.y;
        let nxt = null, bd = 320 * 320;
        for (const e of enemies) {
          if (e.dead || used.indexOf(e) >= 0) continue;
          const d = (e.x - fx0) * (e.x - fx0) + (e.y - fy0) * (e.y - fy0);
          if (d < bd) { bd = d; nxt = e; }
        }
        cur = nxt;
      }
      sfx.zap();
    }

    function castOrbital(s) {
      const n = 1 + s.lv;
      const r = (78 + 8 * s.lv) * areaMul("dark");
      const dmg = (9 + 4 * s.lv) * dmgMul(false);
      const cands = [];
      for (const e of enemies) {
        if (e.dead) continue;
        cands.push({ e, d: (e.x - player.x) ** 2 + (e.y - player.y) ** 2 });
      }
      cands.sort((a, b) => a.d - b.d);
      const k = Math.min(n, cands.length);
      for (let i = 0; i < k; i++) {
        strikes.push({ x: cands[i].e.x, y: cands[i].e.y, r, dmg, t: -.5 - i * .1, life: .45, fired: false, hit: [], opt: { src: "dark" } });
      }
      if (!k) {
        strikes.push({ x: player.x + rnd(-260, 260), y: player.y + rnd(-260, 260), r, dmg, t: -.5, life: .45, fired: false, hit: [], opt: { src: "dark" } });
      }
      sfx.shoot();
    }

    function castTorpedo(s) {
      const n = 1 + Math.floor(s.lv / 2);
      const dmg = (14 + 6 * s.lv) * dmgMul(false);
      const r = 100 * areaMul("dark");
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU);
        torps.push({
          x: player.x, y: player.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200,
          dmg, r, t: 5.5, col: "#c4b5fd", ph: rnd(0, TAU), opt: { src: "dark" },
        });
      }
      sfx.boom();
    }

    /* ---------- 通用技能（fam 为空，任何武器都能用） ---------- */
    /* 陨石天罚：找敌群最密处，落一颗大陨石 */
    function castMeteor(s) {
      const r = 150 + 14 * s.lv;
      const dmg = (22 + 10 * s.lv) * dmgMul(false);
      let best = null, bestN = -1;
      for (const e of enemies) {
        if (e.dead) continue;
        if ((e.x - player.x) ** 2 + (e.y - player.y) ** 2 > 900 * 900) continue;
        let n = 0;
        for (const o of enemies) {
          if (o.dead) continue;
          if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < r * r) n++;
        }
        if (n > bestN) { bestN = n; best = e; }
      }
      const tx = best ? best.x : player.x + Math.cos(player.ang) * 260;
      const ty = best ? best.y : player.y + Math.sin(player.ang) * 260;
      meteors.push({ x: tx, y: ty, r, dmg, t: 0, delay: .62, life: .5, fired: false, hit: [], opt: { src: "skill" } });
      cam.shake = Math.max(cam.shake, 2);
      sfx.shoot();
    }

    /* 冰封棱镜：以自身为心的冰爆 + 冻结 */
    function castFrost(s) {
      const r = 120 + 16 * s.lv;
      const dmg = (6 + 3 * s.lv) * dmgMul(false);
      const fz = .9 + .12 * s.lv;
      rings.push({ x: player.x, y: player.y, r: 12, max: r, dmg, life: .42, t: 0, evo: false, fired: false, hit: [], opt: { src: "skill" } });
      for (const e of enemies) {
        if (e.dead) continue;
        if ((e.x - player.x) ** 2 + (e.y - player.y) ** 2 > r * r) continue;
        e.freeze = Math.max(e.freeze || 0, fz);
      }
      for (let i = 0; i < 26; i++) {
        const a = rnd(0, TAU), sp = rnd(120, 330);
        pAdd(player.x, player.y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(.4, .8), "#a7ecff", 3, 1);
      }
      cam.shake = Math.max(cam.shake, 3);
      sfx.nova();
    }

    /* 焚地火海：朝面前铺三段持续燃烧的地块 */
    function castFlare(s) {
      const r = 72;
      const dmg = (2.2 + 1.1 * s.lv) * dmgMul(false);
      const a = player.ang;
      for (let i = 1; i <= 3; i++) {
        fires.push({
          x: player.x + Math.cos(a) * i * CELL, y: player.y + Math.sin(a) * i * CELL,
          r, t: 0, life: 2.6, tick: 0, dmg, ph: rnd(0, TAU), opt: { src: "skill" },
        });
      }
      sfx.nova();
    }

    /* 普攻表 / 技能表 */
    const ATK = { pulse: atkPulse, dark: atkDark, blade: atkBlade };
    const CAST = {
      chain: castChain,
      well: castWell, torpedo: castTorpedo, orbital: castOrbital,
      nova: castNova, gale: castGale, boomerang: castBoomerang,
      meteor: castMeteor, frost: castFrost, flare: castFlare,
    };

    /* 普攻：只由武器攻速（次/秒）决定，没有冷却；技能：由技能冷却决定（超频只影响技能） */
    function updateAttacks(dt) {
      for (const w of run.wpns) {
        const W = WPN_BY_ID[w.id];
        w.t -= dt;
        if (w.t > 0) continue;
        if (!nearestEnemy(player.x, player.y, 320)) { w.t = .1; continue; }
        w.t = Math.max(.04, 1 / (W.aspd(w.lv) * (1 + .06 * (save.up.aspd || 0))));
        ATK[w.id](w);
      }
      for (const s of run.skills) {
        const S = SKILL_BY_ID[s.id];
        if (S.kind === "mount" || S.kind === "pass") continue;
        /* 武器专属技能：没拿到对应武器时可以升级，但不触发效果 */
        if (S.fam && !hasFam(S.fam)) { s.t = 0; continue; }
        s.t -= dt;
        if (s.t > 0) continue;
        if (!nearestEnemy(player.x, player.y, s.id === "nova" ? 200 : 560) && s.id !== "boomerang" && s.id !== "gale") {
          s.t = .12; continue;
        }
        s.t = Math.max(.1, S.cd(s.lv) * skillCdMul());
        CAST[s.id](s);
      }
    }

    /* ---------- 战斗实体更新 ---------- */
    function updateCombat(dt) {
      /* 子弹 */
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        let dead = b.life <= 0;
        if (!dead) {
          for (const e of enemies) {
            if (e.dead || b.hit.indexOf(e) >= 0) continue;
            const dx = e.x - b.x, dy = e.y - b.y;
            if (dx * dx + dy * dy < (e.r + b.r) * (e.r + b.r)) {
              hurt(e, b.dmg, b.vx, b.vy, 60, b.opt);
              b.hit.push(e);
              burst(b.x, b.y, 4, b.col, 170, 2.4, .22, 0);
              if (b.pierce-- <= 0) { dead = true; break; }
            }
          }
        }
        if (!dead) {
          for (const p of props) {
            if (p.dead) continue;
            const dx = p.x - b.x, dy = p.y - b.y;
            if (dx * dx + dy * dy < (p.r + b.r) * (p.r + b.r)) {
              p.hp -= b.dmg; p.hit = 1;
              if (p.hp <= 0) breakProp(p);
              burst(b.x, b.y, 3, p.col, 150, 2, .2, 0);
              dead = true;
              break;
            }
          }
        }
        if (dead) { bullets.splice(i, 1); }
        else if (b.x < cam.x - 120 || b.x > cam.x + CW + 120 || b.y < cam.y - 120 || b.y > cam.y + CH + 120) bullets.splice(i, 1);
      }

      /* 暗黑球体：飞满射程才消散，每个敌人只判 1 次 */
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        const sp = Math.hypot(o.vx, o.vy) || 1;
        /* 奇点球返程：朝人物「当前位置」飞回来，不是回到释放点 */
        if (o.back) {
          const dx = player.x - o.x, dy = player.y - o.y;
          const d = Math.hypot(dx, dy) || 1;
          o.vx = dx / d * sp; o.vy = dy / d * sp;
        }
        o.x += o.vx * dt; o.y += o.vy * dt;
        o.trav += sp * dt; o.t += dt;
        for (const e of enemies) {
          if (e.dead || o.hit.indexOf(e) >= 0) continue;
          const dx = e.x - o.x, dy = e.y - o.y;
          if (dx * dx + dy * dy < (e.r + o.r) * (e.r + o.r)) {
            o.hit.push(e);
            hurt(e, o.dmg, o.vx, o.vy, 40, { src: "dark", wpn: true, slow: o.evo ? 1.4 : 0 });
            burst(o.x, o.y, 5, o.col, 200, 2.6, .26, 0);
          }
        }
        /* 暗黑球体同样能打碎残骸（每个球体各算一次） */
        hurtProps(o.x, o.y, o.r, o.dmg, o.phit || (o.phit = []));
        if (Math.random() < .75) {
          pAdd(o.x + rnd(-o.r, o.r) * .8, o.y + rnd(-o.r, o.r) * .8,
            rnd(-30, 30), rnd(-30, 30), .34, "#c4b5fd", o.r * .24, 1);
        }
        /* 返程飞回人物身上就消失 */
        if (o.back && Math.hypot(player.x - o.x, player.y - o.y) < player.r + o.r) {
          burst(o.x, o.y, 8, "#c4b5fd", 220, 2.6, .34, 1);
          orbs.splice(i, 1);
          continue;
        }
        if (o.trav >= o.max || o.t > 3) {
          /* 奇点球：飞满射程后转身返回人物，返程再判一次（二段伤害） */
          if (o.evo && !o.back) {
            o.back = true;
            o.trav = 0; o.t = 0; o.hit = []; o.phit = [];
            burst(o.x, o.y, 12, "#c4b5fd", 260, 3, .4, 1);
          } else {
            burst(o.x, o.y, 10, o.col, 240, 3, .4, 1);
            orbs.splice(i, 1);
          }
        }
      }

      /* 刀光（伤害在挥砍瞬间结算，这里只做视觉寿命） */
      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i];
        a.t += dt;
        if (a.t >= a.life) arcs.splice(i, 1);
      }

      /* 疾风斩：中程旋风，到最大距离消失 */
      for (let i = gales.length - 1; i >= 0; i--) {
        const g = gales[i];
        const sp = Math.hypot(g.vx, g.vy) || 1;
        g.x += g.vx * dt; g.y += g.vy * dt;
        g.trav += sp * dt; g.ph += dt * 9;
        for (const e of enemies) {
          if (e.dead || g.hit.indexOf(e) >= 0) continue;
          if (Math.hypot(e.x - g.x, e.y - g.y) < e.r + g.r) {
            g.hit.push(e);
            hurt(e, g.dmg, g.vx, g.vy, 30, { src: "blade" });
          }
        }
        hurtProps(g.x, g.y, g.r, g.dmg, g.phit || (g.phit = []));
        for (let k = 0; k < 2; k++) {
          const a = g.ph + k * Math.PI;
          pAdd(g.x + Math.cos(a) * g.r * .85, g.y + Math.sin(a) * g.r * .85,
            rnd(-60, 60), rnd(-60, 60), .3, "#7ef7c8", 2.4, 1);
        }
        if (g.trav >= g.max) {
          burst(g.x, g.y, 8, "#7ef7c8", 200, 2.6, .34, 1);
          gales.splice(i, 1);
        }
      }

      /* 回旋斩：去程 / 回程各判 1 次，回程是飞回人物身上 */
      for (let i = booms.length - 1; i >= 0; i--) {
        const b = booms[i];
        b.t += dt;
        if (b.back) {
          /* 返程：锁定人物当前位置追回来 */
          const dx = player.x - b.x, dy = player.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          b.dirx = dx / d; b.diry = dy / d;
        } else {
          b.dirx = Math.cos(b.ang); b.diry = Math.sin(b.ang);
        }
        b.x += b.dirx * b.sp * dt;
        b.y += b.diry * b.sp * dt;
        b.trav += b.sp * dt;
        if (!b.back && b.trav >= b.max) { b.back = true; b.trav = 0; }
        if (b.back && Math.hypot(player.x - b.x, player.y - b.y) < player.r + b.r * .6) {
          booms.splice(i, 1);
          continue;
        }
        for (const e of enemies) {
          if (e.dead || b.hitOut.indexOf(e) >= 0 || b.hitBack.indexOf(e) >= 0) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
            (b.back ? b.hitBack : b.hitOut).push(e);
            hurt(e, b.dmg, b.dirx, b.diry, 40, { src: "blade" });
          }
        }
        hurtProps(b.x, b.y, b.r, b.dmg, b.back ? (b.phitBack || (b.phitBack = [])) : (b.phitOut || (b.phitOut = [])));
        pAdd(b.x, b.y, rnd(-40, 40), rnd(-40, 40), .26, "#ffd76a", 2.6, 1);
        if (b.t > 4) booms.splice(i, 1);
      }

      /* 暴击飞弹：贝塞尔弧线绕行后回击原目标 */
      for (let i = cms.length - 1; i >= 0; i--) {
        const m = cms[i];
        m.t += dt;
        const k = Math.min(1, m.t / m.life);
        const tg = m.target;
        const alive = tg && !tg.dead;
        const tx = alive ? tg.x : m.cx, ty = alive ? tg.y : m.cy;
        const u = 1 - k;
        m.x = u * u * m.sx + 2 * u * k * m.cx + k * k * tx;
        m.y = u * u * m.sy + 2 * u * k * m.cy + k * k * ty;
        pAdd(m.x, m.y, rnd(-26, 26), rnd(-26, 26), .2, "#ff8fa3", 2.2, 1);
        if (k >= 1) {
          if (alive) {
            hurt(tg, m.dmg, tx - m.sx, ty - m.sy, 30, { src: "pulse", noProc: true });
            burst(tg.x, tg.y, 7, "#ff8fa3", 220, 2.8, .3, 1);
          }
          cms.splice(i, 1);
        }
      }

      /* 引力井：拉扯 + 跳伤 */
      for (let i = wells.length - 1; i >= 0; i--) {
        const w = wells[i];
        w.t -= dt; w.tick += dt;
        for (const e of enemies) {
          if (e.dead) continue;
          const dx = w.x - e.x, dy = w.y - e.y, d = Math.hypot(dx, dy) || 1;
          if (d < w.r * 1.9 && !e.boss) {
            const f = w.pull * dt * (1 - d / (w.r * 1.9));
            e.x += dx / d * f; e.y += dy / d * f;
          }
        }
        if (w.tick >= .26) {
          w.tick = 0;
          damageArea(w.x, w.y, w.r, w.dmg, 0, null, w.opt);
          for (let k = 0; k < 3; k++) {
            const a = rnd(0, TAU);
            pAdd(w.x + Math.cos(a) * w.r * .8, w.y + Math.sin(a) * w.r * .8,
              -Math.cos(a) * 120, -Math.sin(a) * 120, .3, "#c4b5fd", 2.4, 0);
          }
        }
        if (w.t <= 0) {
          if (w.evo) {
            damageArea(w.x, w.y, w.r * 1.15, w.dmg * 3, 260);
            rings.push({ x: w.x, y: w.y, r: 10, max: w.r * 1.5, dmg: 0, life: .35, t: 0, fired: true, hit: [] });
            cam.shake = Math.max(cam.shake, 5);
            sfx.boom();
          }
          wells.splice(i, 1);
        }
      }

      /* 冲击波 */
      for (let i = rings.length - 1; i >= 0; i--) {
        const g = rings[i];
        g.t += dt;
        if (g.t < 0) continue;
        g.r = lerp(12, g.max, Math.min(1, g.t / g.life));
        if (!g.fired) {
          g.fired = true;
          damageArea(g.x, g.y, g.max, g.dmg, 0, null, g.opt);
        }
        for (const e of enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.x - g.x, e.y - g.y);
          if (Math.abs(d - g.r) < 26) {
            const inv = d > .001 ? 1 / d : 0;
            e.vx += (e.x - g.x) * inv * 320 * dt * 8;
            e.vy += (e.y - g.y) * inv * 320 * dt * 8;
          }
        }
        if (g.t >= g.life) rings.splice(i, 1);
      }

      /* 闪电 / 天降打击 */
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        b.t += dt;
        if (b.t >= b.life) bolts.splice(i, 1);
      }
      for (let i = strikes.length - 1; i >= 0; i--) {
        const s = strikes[i];
        s.t += dt;
        if (s.t >= 0 && !s.fired) {
          s.fired = true;
          damageArea(s.x, s.y, s.r, s.dmg, 200, null, s.opt);
          burst(s.x, s.y, 12, "#bfe9ff", 300, 3, .4, 1);
          rings.push({ x: s.x, y: s.y, r: 8, max: s.r, dmg: 0, life: .28, t: 0, fired: true, hit: [] });
        }
        if (s.t >= s.life) strikes.splice(i, 1);
      }

      /* 火海：每 0.4 秒烫一次 */
      for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i];
        f.t += dt;
        f.tick -= dt;
        if (f.tick <= 0) {
          f.tick = .4;
          damageArea(f.x, f.y, f.r, f.dmg, 0, null, f.opt);
          pAdd(f.x + rnd(-f.r * .6, f.r * .6), f.y + rnd(-f.r * .6, f.r * .6),
            rnd(-18, 18), rnd(-80, -34), rnd(.3, .6), "#ff9a4d", 3.6, 1);
        }
        if (f.t >= f.life) fires.splice(i, 1);
      }

      /* 陨石：落点预警 → 砸下 → 冲击环 */
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.t += dt;
        if (!m.fired && m.t >= m.delay) {
          m.fired = true;
          damageArea(m.x, m.y, m.r, m.dmg, 340, null, m.opt);
          burst(m.x, m.y, 26, "#ffb066", 430, 4, .6, 1);
          rings.push({ x: m.x, y: m.y, r: 10, max: m.r, dmg: 0, life: .34, t: 0, fired: true, hit: [] });
          cam.shake = Math.max(cam.shake, 9);
          sfx.boom();
        }
        if (m.t >= m.delay + m.life) meteors.splice(i, 1);
      }

      /* 鱼雷 */
      for (let i = torps.length - 1; i >= 0; i--) {
        const t = torps[i];
        t.t -= dt;
        const tg = nearestEnemy(t.x, t.y, 900);
        if (tg) {
          const a = Math.atan2(tg.y - t.y, tg.x - t.x);
          const va = Math.atan2(t.vy, t.vx);
          let da = a - va;
          while (da > Math.PI) da -= TAU;
          while (da < -Math.PI) da += TAU;
          const na = va + clamp(da, -3.2 * dt, 3.2 * dt);
          const sp = Math.hypot(t.vx, t.vy);
          t.vx = Math.cos(na) * sp; t.vy = Math.sin(na) * sp;
        }
        t.x += t.vx * dt; t.y += t.vy * dt;
        pAdd(t.x, t.y, rnd(-40, 40), rnd(-40, 40), .3, "#c4b5fd", 2.6, 0);
        let boom = t.t <= 0;
        for (const e of enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - t.x, e.y - t.y) < e.r + 8) { boom = true; break; }
        }
        if (boom) {
          damageArea(t.x, t.y, t.r, t.dmg, 380, null, t.opt);
          rings.push({ x: t.x, y: t.y, r: 8, max: t.r, dmg: 0, life: .3, t: 0, fired: true, hit: [] });
          burst(t.x, t.y, 16, "#a78bfa", 320, 3.4, .45, 1);
          cam.shake = Math.max(cam.shake, 4);
          sfx.boom();
          torps.splice(i, 1);
        }
      }

      /* 敌方弹幕 */
      for (let i = ebullets.length - 1; i >= 0; i--) {
        const b = ebullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.t -= dt;
        if (b.t <= 0) { ebullets.splice(i, 1); continue; }
        if (Math.hypot(b.x - player.x, b.y - player.y) < player.r + b.r) {
          hitPlayer(b.dmg);
          ebullets.splice(i, 1); continue;
        }
        if (b.x < cam.x - 200 || b.x > cam.x + CW + 200 || b.y < cam.y - 200 || b.y > cam.y + CH + 200) ebullets.splice(i, 1);
      }
    }

    /* ---------- 粒子更新 ---------- */
    function updateParticles(dt) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          if (pPool.length < 800) { pPool.push(p); }
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.type === 1) { p.vx *= .93; p.vy *= .93; }
        else { p.vx *= .985; p.vy *= .985; }
      }
    }

export { ATK, CAST, DEFAULT_HIT, arcHit, atkBlade, atkDark, atkPulse, castBoomerang, castChain, castGale, castNova, castOrbital, castTorpedo, castWell, damageArea, hurt, killEnemy, pushArc, spawnCritMissile, spreadK, updateAttacks, updateCombat, updateParticles };

