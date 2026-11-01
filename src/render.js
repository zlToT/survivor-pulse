import { isTouch } from "./config.js";
import { CH, CW, DPR, TAU, clamp, ctx, fctx, glowTex, hexA, lerp, rnd } from "./core.js";
import { CHARS } from "./data.js";
import { arcs, bolts, booms, bullets, cam, chest, cms, dmgNums, ebullets, enemies, fires, gales, gems, hints, mapOf, meteors, orbs, particles, pickups, player, props, rift, rings, run, state, strikes, torps, waves, wells } from "./world.js";

/* ================= RENDER ================= */
/* ================= RENDER ================= */
    const polyCache = {};

    /* 地图网格边长（世界像素）：攻击距离按格数定义时用它换算 */
    const CELL = 90;

    /* 玩家周围的引力透镜扭曲：把网格顶点朝玩家方向拉，并叠加一层外扩波动 */
    const GW_R = 330;
    const GW_R2 = GW_R * GW_R;
    const GW_STEP = isTouch ? 34 : 22;
    const gwA = [0, 0];
    function gwWarp(sx, sy, px, py, T) {
      const dx = sx - px, dy = sy - py;
      const d2 = dx * dx + dy * dy;
      if (d2 >= GW_R2) { gwA[0] = sx; gwA[1] = sy; return false; }
      const d = Math.sqrt(d2) || 1;
      const t = 1 - d / GW_R;
      const amp = 15 * t * t + 2.4 * t * Math.sin(d * .05 - T * 2.6);
      gwA[0] = sx - dx / d * amp;
      gwA[1] = sy - dy / d * amp;
      return true;
    }

    function unitPoly(sides) {
      let p = polyCache[sides];
      if (!p) {
        p = new Path2D();
        for (let i = 0; i < sides; i++) {
          const a = -Math.PI / 2 + i * TAU / sides;
          const x = Math.cos(a), y = Math.sin(a);
          if (i) p.lineTo(x, y); else p.moveTo(x, y);
        }
        p.closePath();
        polyCache[sides] = p;
      }
      return p;
    }

    const alphaCache = {};
    function colA(col, a) {
      const q = clamp(Math.round(a * 12), 0, 12);
      const key = col + q;
      let v = alphaCache[key];
      if (!v) { v = hexA(col, q / 12); alphaCache[key] = v; }
      return v;
    }

    /* ---------- 星空外域背景 ---------- */
    /* 底图与暗角按「地图 + 画布尺寸」缓存成离屏 canvas，避免每帧 createRadialGradient */
    const BG_FALLBACK = { base: "#070b1a", nebA: "#2b4b8f", nebB: "#6d3fa8", grid: "#7fb4ff", node: "#bfe4ff" };
    let bgBaseC = null, bgBaseKey = "", bgVigC = null, bgVigKey = "";
    const starTex = {};
    /* 星云在世界上每 1560px 循环一次：位置比例 / 半径 / 取哪层色 */
    const NEB_PERIOD = 1560;
    const NEB = [
      [.16, .24, 640, 0],
      [.66, .16, 520, 1],
      [.44, .78, 700, 1],
      [.86, .62, 420, 0],
    ];

    /* 无缝星点贴图：靠边的点在对边补一份，平铺时看不出接缝 */
    function starTile(col, n, rad, alpha) {
      const key = col + "|" + n + "|" + rad + "|" + alpha;
      if (starTex[key]) return starTex[key];
      const S = 320, c = document.createElement("canvas");
      c.width = c.height = S;
      const g = c.getContext("2d");
      g.fillStyle = hexA(col, alpha);
      for (let i = 0; i < n; i++) {
        const x = rnd(S), y = rnd(S), r = rad * (.55 + rnd(1.1));
        for (let dx = -S; dx <= S; dx += S) {
          for (let dy = -S; dy <= S; dy += S) {
            const px = x + dx, py = y + dy;
            /* 只画落在本贴图范围内（含边界溢出 4px）的点，避免重复 */
            if (px < -4 || px > S + 4 || py < -4 || py > S + 4) continue;
            g.beginPath();
            g.arc(px, py, r, 0, TAU);
            g.fill();
          }
        }
      }
      starTex[key] = c;
      return c;
    }

    function bgBase(BG) {
      const key = BG.base + "|" + BG.nebA + "|" + CW + "x" + CH;
      if (bgBaseKey === key && bgBaseC) return bgBaseC;
      const c = document.createElement("canvas");
      c.width = CW;
      c.height = CH;
      const g = c.getContext("2d");
      const gr = g.createRadialGradient(CW * .5, CH * .42, 0, CW * .5, CH * .42, Math.max(CW, CH) * .8);
      gr.addColorStop(0, hexA(BG.nebA, .16));
      gr.addColorStop(.52, hexA(BG.base, .92));
      gr.addColorStop(1, BG.base);
      g.fillStyle = gr;
      g.fillRect(0, 0, CW, CH);
      bgBaseC = c;
      bgBaseKey = key;
      return c;
    }

    /* 四周压暗：让网格与星点往边缘自然沉下去，中心更亮 */
    function bgVignette(BG) {
      const key = BG.base + "|" + CW + "x" + CH;
      if (bgVigKey === key && bgVigC) return bgVigC;
      const c = document.createElement("canvas");
      c.width = CW;
      c.height = CH;
      const g = c.getContext("2d");
      const gr = g.createRadialGradient(CW * .5, CH * .5, Math.min(CW, CH) * .32, CW * .5, CH * .5, Math.max(CW, CH) * .8);
      gr.addColorStop(0, hexA(BG.base, 0));
      gr.addColorStop(1, hexA(BG.base, .85));
      g.fillStyle = gr;
      g.fillRect(0, 0, CW, CH);
      bgVigC = c;
      bgVigKey = key;
      return c;
    }

    /* 星点三层视差 + 星云：按世界坐标循环铺，无限地图也看不到边 */
    function bgSpace(ox, oy, BG, T) {
      const cx = ox + CW / 2, cy = oy + CH / 2;
      const layers = [
        [starTile(BG.node, 34, .95, .62), .1],
        [starTile(BG.node, 64, .66, .45), .2],
        [starTile(BG.grid, 96, .54, .27), .34],
      ];
      for (let i = 0; i < layers.length; i++) {
        const tex = layers[i][0], p = layers[i][1], S = tex.width;
        const offX = ((-cx * p) % S + S) % S, offY = ((-cy * p) % S + S) % S;
        for (let x = offX - S; x < CW; x += S) for (let y = offY - S; y < CH; y += S) ctx.drawImage(tex, x, y);
      }
      const texA = glowTex(BG.nebA, 48), texB = glowTex(BG.nebB, 48);
      for (let i = 0; i < NEB.length; i++) {
        const n = NEB[i];
        let px = (((n[0] * NEB_PERIOD - cx * .45) % NEB_PERIOD) + NEB_PERIOD) % NEB_PERIOD - NEB_PERIOD / 2;
        let py = (((n[1] * NEB_PERIOD - cy * .45) % NEB_PERIOD) + NEB_PERIOD) % NEB_PERIOD - NEB_PERIOD / 2;
        px += CW / 2;
        py += CH / 2;
        const rr = n[2];
        const tex = n[3] ? texB : texA;
        ctx.globalAlpha = .17 + .05 * Math.sin(T * .32 + i * 1.7);
        for (let dx = -NEB_PERIOD; dx <= NEB_PERIOD; dx += NEB_PERIOD) {
          const sx = px + dx - rr / 2;
          if (sx > CW || sx + rr < 0) continue;
          for (let dy = -NEB_PERIOD; dy <= NEB_PERIOD; dy += NEB_PERIOD) {
            const sy = py + dy - rr / 2;
            if (sy > CH || sy + rr < 0) continue;
            ctx.drawImage(tex, sx, sy, rr, rr);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawWorld(ox, oy) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, CW, CH);
      const M = mapOf();
      const BG = (M && M.bg) || BG_FALLBACK;
      const T0 = performance.now() * .001;
      ctx.fillStyle = BG.base;
      ctx.fillRect(0, 0, CW, CH);
      ctx.drawImage(bgBase(BG), 0, 0);
      bgSpace(ox, oy, BG, T0);

      /* 网格（玩家附近空间扭曲：引力透镜 + 波动） */
      const G = CELL;
      const pxs = player ? player.x - ox : CW / 2, pys = player ? player.y - oy : CH / 2;
      const T = T0;
      ctx.strokeStyle = hexA(BG.grid, .055);
      ctx.lineWidth = 1;
      ctx.beginPath();
      const gx0 = Math.floor(ox / G) * G, gy0 = Math.floor(oy / G) * G;
      for (let x = gx0; x < ox + CW + G; x += G) {
        const sx = x - ox;
        const dxp = sx - pxs;
        if (Math.abs(dxp) >= GW_R) { ctx.moveTo(sx, 0); ctx.lineTo(sx, CH); continue; }
        const half = Math.sqrt(GW_R2 - dxp * dxp);
        const y0 = Math.max(0, pys - half), y1 = Math.min(CH, pys + half);
        ctx.moveTo(sx, 0); ctx.lineTo(sx, y0);
        gwWarp(sx, y0, pxs, pys, T); ctx.lineTo(gwA[0], gwA[1]);
        for (let y = y0 + GW_STEP; y < y1; y += GW_STEP) { gwWarp(sx, y, pxs, pys, T); ctx.lineTo(gwA[0], gwA[1]); }
        gwWarp(sx, y1, pxs, pys, T); ctx.lineTo(gwA[0], gwA[1]);
        ctx.lineTo(sx, CH);
      }
      for (let y = gy0; y < oy + CH + G; y += G) {
        const sy = y - oy;
        const dyp = sy - pys;
        if (Math.abs(dyp) >= GW_R) { ctx.moveTo(0, sy); ctx.lineTo(CW, sy); continue; }
        const half = Math.sqrt(GW_R2 - dyp * dyp);
        const x0 = Math.max(0, pxs - half), x1 = Math.min(CW, pxs + half);
        ctx.moveTo(0, sy); ctx.lineTo(x0, sy);
        gwWarp(x0, sy, pxs, pys, T); ctx.lineTo(gwA[0], gwA[1]);
        for (let x = x0 + GW_STEP; x < x1; x += GW_STEP) { gwWarp(x, sy, pxs, pys, T); ctx.lineTo(gwA[0], gwA[1]); }
        gwWarp(x1, sy, pxs, pys, T); ctx.lineTo(gwA[0], gwA[1]);
        ctx.lineTo(CW, sy);
      }
      ctx.stroke();

      /* 星图主网格：每 4 格一条更亮的线，交点上点星图节点（离玩家越近越亮） */
      const MG = G * 4;
      ctx.strokeStyle = hexA(BG.grid, .105);
      ctx.beginPath();
      for (let x = Math.floor(ox / MG) * MG; x < ox + CW + MG; x += MG) {
        const sx = x - ox;
        ctx.moveTo(sx, 0); ctx.lineTo(sx, CH);
      }
      for (let y = Math.floor(oy / MG) * MG; y < oy + CH + MG; y += MG) {
        const sy = y - oy;
        ctx.moveTo(0, sy); ctx.lineTo(CW, sy);
      }
      ctx.stroke();

      ctx.fillStyle = BG.node;
      for (let x = Math.floor(ox / MG) * MG; x < ox + CW + MG; x += MG) {
        const sx = x - ox;
        for (let y = Math.floor(oy / MG) * MG; y < oy + CH + MG; y += MG) {
          const sy = y - oy;
          const dx = sx - pxs, dy = sy - pys;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 900) continue;
          ctx.globalAlpha = .16 + .34 * (1 - d / 900);
          ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
        }
      }
      ctx.globalAlpha = 1;

      /* 四周压暗，让网格与星点向边缘沉下去 */
      ctx.drawImage(bgVignette(BG), 0, 0);

      /* 引力场波纹：以玩家为中心的两圈极淡脉冲环 */
      const pulse = .5 + .5 * Math.sin(T * 1.9);
      ctx.strokeStyle = hexA(BG.node, .03 + .03 * pulse);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(pxs, pys, GW_R * (.62 + .03 * pulse), 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(pxs, pys, GW_R * (.97 + .02 * pulse), 0, TAU); ctx.stroke();

      ctx.save();
      ctx.translate(-ox, -oy);

      /* 可破坏物（崩塌回廊）：碎石 / 木箱 / 石柱，被打时闪白 */
      for (const pr of props) {
        if (pr.dead) continue;
        const sx = pr.x - ox, sy = pr.y - oy;
        if (sx < -80 || sx > CW + 80 || sy < -80 || sy > CH + 80) continue;
        const hurtK = pr.hit > 0 ? Math.min(1, pr.hit) : 0;
        const k = 1 - hurtK * .45;
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(pr.rot);
        ctx.fillStyle = colA(pr.col, .20);
        ctx.strokeStyle = colA(pr.col, .62 + hurtK * .35);
        ctx.lineWidth = 1.6;
        if (pr.kind === "crate") {
          const s = pr.r * 1.55;
          ctx.beginPath(); ctx.rect(-s / 2, -s / 2, s, s); ctx.fill(); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-s / 2, -s / 2); ctx.lineTo(s / 2, s / 2);
          ctx.moveTo(s / 2, -s / 2); ctx.lineTo(-s / 2, s / 2);
          ctx.strokeStyle = colA(pr.col, .30); ctx.lineWidth = 1; ctx.stroke();
        } else if (pr.kind === "pillar") {
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = i / 6 * TAU, rr = pr.r * (i % 2 ? .78 : 1);
            if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
            else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = colA(pr.col, .26); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 0, pr.r * .48, 0, TAU); ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -pr.r * k); ctx.lineTo(pr.r * .9, pr.r * .6 * k);
          ctx.lineTo(-pr.r * .9, pr.r * .6 * k); ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
        ctx.restore();
        /* 血条：只有受损才显示 */
        if (pr.hp < pr.maxHp) {
          const w = pr.r * 1.6, pct = Math.max(0, pr.hp / pr.maxHp);
          const by = pr.y - pr.r - 14;
          ctx.fillStyle = "rgba(0,0,0,.55)";
          ctx.fillRect(pr.x - w / 2, by, w, 4);
          ctx.fillStyle = colA(pr.col, .9);
          ctx.fillRect(pr.x - w / 2, by, w * pct, 4);
        }
      }

      /* 引力井 */
      for (const w of wells) {
        const ph = (w.t * 2) % 1;
        ctx.strokeStyle = colA("#a78bfa", .55 * (w.t / 2.3) + .15);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r * (1 + ph * .18), 0, TAU); ctx.stroke();
        const tex = glowTex("#a78bfa", 48);
        ctx.globalAlpha = .32;
        ctx.drawImage(tex, w.x - w.r, w.y - w.r, w.r * 2, w.r * 2);
        ctx.globalAlpha = 1;
      }

      /* 经验 / 金币 */
      for (const g of gems) {
        const s = g.kind === 0 ? 4.2 : 4.8;
        const bob = Math.sin(g.ph) * 1.6;
        if (g.kind === 0) {
          ctx.fillStyle = "#5eead4";
          ctx.beginPath();
          ctx.moveTo(g.x, g.y - s + bob); ctx.lineTo(g.x + s, g.y + bob); ctx.lineTo(g.x, g.y + s + bob); ctx.lineTo(g.x - s, g.y + bob);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = "#ffd76a";
          ctx.fillRect(g.x - s * .75, g.y - s * .75 + bob, s * 1.5, s * 1.5);
        }
      }

      /* 补给：生命（十字）/ 磁力（磁铁）/ 湮灭弹（方块），快消失时闪烁 */
      for (const p of pickups) {
        if (p.x < ox - 60 || p.x > ox + CW + 60 || p.y < oy - 60 || p.y > oy + CH + 60) continue;
        const fade = p.life < 4 ? (.35 + .65 * Math.abs(Math.sin(p.life * 7))) : 1;
        if (fade <= 0) continue;
        const bob = Math.sin(p.ph) * 2.2;
        const tex = glowTex(p.col, 24);
        ctx.globalAlpha = .5 * fade;
        ctx.drawImage(tex, p.x - 26, p.y - 26 + bob, 52, 52);
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.col;
        ctx.strokeStyle = "rgba(255,255,255,.85)";
        ctx.lineWidth = 1.6;
        if (p.kind === "heal") {
          const s = 5.4;
          ctx.fillRect(p.x - s, p.y - s * .38 + bob, s * 2, s * .76);
          ctx.fillRect(p.x - s * .38, p.y - s + bob, s * .76, s * 2);
        } else if (p.kind === "magnet") {
          ctx.beginPath();
          ctx.arc(p.x, p.y + bob, 5.4, Math.PI * .15, Math.PI * .85, true);
          ctx.strokeStyle = p.col;
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(p.x - 5.1, p.y + bob - 1.6);
          ctx.lineTo(p.x - 5.1, p.y + bob + 2.6);
          ctx.moveTo(p.x + 5.1, p.y + bob - 1.6);
          ctx.lineTo(p.x + 5.1, p.y + bob + 2.6);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2.4;
          ctx.stroke();
        } else {
          /* 湮灭弹：外环 + 内部旋转三角，避免和金币方块撞形 */
          ctx.beginPath();
          ctx.arc(p.x, p.y + bob, 7.4, 0, TAU);
          ctx.strokeStyle = p.col;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.save();
          ctx.translate(p.x, p.y + bob);
          ctx.rotate(p.ph * .8);
          ctx.beginPath();
          for (let k = 0; k < 3; k++) {
            const a = -Math.PI / 2 + k * TAU / 3;
            const px = Math.cos(a) * 4.2, py = Math.sin(a) * 4.2;
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = p.col;
          ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }

      /* 敌人 */
      for (const e of enemies) {
        if (e.dead) continue;
        if (e.x < ox - 80 || e.x > ox + CW + 80 || e.y < oy - 80 || e.y > oy + CH + 80) continue;
        const p = unitPoly(e.sides);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot);
        ctx.scale(e.r, e.r);
        ctx.beginPath();
        if (e.flash > 0) {
          ctx.fillStyle = "#ffffff";
          ctx.fill(p);
        } else {
          ctx.fillStyle = e._fc || (e._fc = colA(e.col, .18));
          ctx.fill(p);
          ctx.lineWidth = 2.2 / e.r;
          ctx.strokeStyle = e.col;
          ctx.stroke(p);
          /* 冰封棱镜：冻住的目标盖一层冰壳 */
          if (e.freeze > 0) {
            ctx.fillStyle = colA("#8ee6ff", .38);
            ctx.fill(p);
            ctx.lineWidth = 3 / e.r;
            ctx.strokeStyle = "#d8f6ff";
            ctx.stroke(p);
          }
        }
        ctx.restore();
        if (e.freeze > 0) {
          const ft = glowTex("#a7ecff", 24);
          ctx.globalAlpha = .34;
          ctx.drawImage(ft, e.x - e.r * 2.1, e.y - e.r * 2.1, e.r * 4.2, e.r * 4.2);
          ctx.globalAlpha = 1;
        }
        if (e.boss) {
          const tex = glowTex(e.col, 48);
          ctx.globalAlpha = .3;
          ctx.drawImage(tex, e.x - e.r * 2, e.y - e.r * 2, e.r * 4, e.r * 4);
          ctx.globalAlpha = 1;
        } else if (e.elite) {
          const tex = glowTex(e.col, 24);
          ctx.globalAlpha = .25;
          ctx.drawImage(tex, e.x - e.r * 1.6, e.y - e.r * 1.6, e.r * 3.2, e.r * 3.2);
          ctx.globalAlpha = 1;
        }
      }

      /* 敌弹 */
      for (const b of ebullets) {
        ctx.fillStyle = b.col;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = colA(b.col, .5);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 2.5, 0, TAU); ctx.stroke();
      }

      /* 我方子弹 */
      for (const b of bullets) {
        ctx.strokeStyle = colA(b.col, .55);
        ctx.lineWidth = b.r * 1.8;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * .016, b.y - b.vy * .016);
        ctx.stroke();
        ctx.fillStyle = "#eaf6ff";
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * .7, 0, TAU); ctx.fill();
      }

      /* 暗黑球体：半透明球 + 内旋粒子 + 外圈 */
      for (const o of orbs) {
        const pulse = .78 + .22 * Math.sin(o.t * 12);
        ctx.fillStyle = colA(o.col, .2 * pulse);
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = colA(o.col, .55 * pulse);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, TAU); ctx.stroke();
        ctx.fillStyle = "#2b1a4d";
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r * .72, 0, TAU); ctx.fill();
        ctx.strokeStyle = colA("#c4b5fd", .85);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = o.t * 5 + k * TAU / 3;
          ctx.moveTo(o.x + Math.cos(a) * o.r * .2, o.y + Math.sin(a) * o.r * .2);
          ctx.lineTo(o.x + Math.cos(a) * o.r * .62, o.y + Math.sin(a) * o.r * .62);
        }
        ctx.stroke();
      }

      /* 刀光弧 */
      for (const a of arcs) {
        const k = clamp(a.t / a.life, 0, 1);
        const al = (1 - k) * .9;
        /* 刀光与人物之间那层淡淡的白光 */
        const g2 = ctx.createRadialGradient(a.x, a.y, a.r * .18, a.x, a.y, a.r * .95);
        g2.addColorStop(0, "rgba(255,255,255,0)");
        g2.addColorStop(.65, "rgba(255,255,255," + (.05 * (1 - k)).toFixed(3) + ")");
        g2.addColorStop(1, "rgba(255,255,255," + (.13 * (1 - k)).toFixed(3) + ")");
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.arc(a.x, a.y, a.r * .95, a.a0 + a.spin * k, a.a0 + a.a1 + a.spin * k);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = colA(a.col, al);
        ctx.lineWidth = a.w * (1 - k * .55);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, a.a0 + a.spin * k, a.a0 + a.a1 + a.spin * k);
        ctx.stroke();
        ctx.strokeStyle = colA("#ffffff", al * .5);
        ctx.lineWidth = Math.max(1, a.w * .35 * (1 - k));
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r * .88, a.a0 + a.spin * k, a.a0 + a.a1 + a.spin * k);
        ctx.stroke();
      }

      /* 疾风斩旋风 */
      for (const g of gales) {
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.ph);
        ctx.strokeStyle = colA("#7ef7c8", .8);
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const a0 = k * TAU / 3;
          ctx.arc(0, 0, g.r * .82, a0, a0 + 1.5);
        }
        ctx.stroke();
        ctx.strokeStyle = colA("#d9fff4", .5);
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, 0, g.r * .45, 0, TAU); ctx.stroke();
        ctx.restore();
      }

      /* Boss 冲击波：扩散环 + 内圈拖影 */
      for (const w of waves) {
        const k = 1 - w.r / w.max;
        const tex = glowTex(w.col || "#ff8a5c", 96);
        ctx.globalAlpha = .18 * k;
        ctx.drawImage(tex, w.x - w.r * .55, w.y - w.r * .55, w.r * 1.1, w.r * 1.1);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colA(w.col || "#ff8a5c", .28 + .5 * k);
        ctx.lineWidth = 3 + 5 * k;
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke();
        ctx.strokeStyle = colA("#ffd9a0", .10 + .22 * k);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r * .93, 0, TAU); ctx.stroke();
      }

      /* 回旋斩 */
      for (const b of booms) {
        ctx.save();
        ctx.translate(b.x, b.y);
        const spin = b.t * 14;
        ctx.strokeStyle = colA("#ffd76a", .85);
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(0, 0, b.r, -1.1 + spin, 1.1 + spin);
        ctx.stroke();
        ctx.strokeStyle = colA("#fff4c2", .55);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, b.r * .72, -1 + spin, 1 + spin);
        ctx.stroke();
        ctx.restore();
      }

      /* 鱼雷 */
      for (const t of torps) {
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(Math.atan2(t.vy, t.vx));
        ctx.fillStyle = "#c4b5fd";
        ctx.beginPath();
        ctx.moveTo(11, 0); ctx.lineTo(-7, 6); ctx.lineTo(-7, -6);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      /* 冲击波 */
      for (const g of rings) {
        if (g.t < 0) continue;
        const a = 1 - g.t / g.life;
        ctx.strokeStyle = colA("#5ce1ff", .7 * a);
        ctx.lineWidth = 4 * a + 1;
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, TAU); ctx.stroke();
      }

      /* 焚地火海 */
      if (fires.length) {
        const emberT = glowTex("#ff5a22", 96), coreT = glowTex("#ffd98a", 64);
        for (const f of fires) {
          const k = 1 - f.t / f.life;
          const pulse = .86 + .14 * Math.sin(f.t * 11 + f.ph);
          const rr = f.r * (1.04 + .06 * Math.sin(f.t * 9 + f.ph));
          ctx.globalAlpha = .9 * k * pulse;
          ctx.drawImage(emberT, f.x - rr, f.y - rr, rr * 2, rr * 2);
          ctx.globalAlpha = .82 * k;
          const cr = rr * .6;
          ctx.drawImage(coreT, f.x - cr, f.y - cr, cr * 2, cr * 2);
          ctx.globalAlpha = 1;
          /* 跳动的火舌 */
          for (let i = 0; i < 5; i++) {
            const a = f.ph * 5 + i * 1.257 + f.t * 2.4;
            const rad = f.r * (.55 + .32 * Math.sin(f.t * 8 + i * 2));
            const bx = f.x + Math.cos(a) * rad, by = f.y + Math.sin(a) * rad * .82;
            const h = 13 + 11 * Math.sin(f.t * 13 + i * 1.7);
            ctx.fillStyle = colA("#ffb44f", .55 * k);
            ctx.beginPath();
            ctx.moveTo(bx - 5.5, by); ctx.lineTo(bx, by - h); ctx.lineTo(bx + 5.5, by);
            ctx.fill();
          }
        }
      }

      /* 陨石：地面预警圈 + 空中拖尾 */
      for (const m of meteors) {
        const k = Math.min(1, m.t / m.delay);
        ctx.strokeStyle = colA("#ffb066", .5 * (1 - k) + .18);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.stroke();
        ctx.strokeStyle = colA("#ffd9a8", .3 * (1 - k) + .1);
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (1 - k * .8), 0, TAU); ctx.stroke();
        if (!m.fired) {
          const fy = m.y - (1 - k) * 620;
          const tex = glowTex("#ff9a4d", 40);
          ctx.globalAlpha = .9;
          ctx.drawImage(tex, m.x - 34, fy - 34, 68, 68);
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#ffd9a8";
          ctx.beginPath(); ctx.arc(m.x, fy, 13, 0, TAU); ctx.fill();
          ctx.strokeStyle = colA("#ff8a4c", .5);
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(m.x, fy - 12); ctx.lineTo(m.x, fy - 70); ctx.stroke();
        }
      }

      /* 天降打击标记 */
      for (const s of strikes) {
        if (s.t < 0) {
          const k = clamp(1 + s.t / .5, 0, 1);
          ctx.strokeStyle = colA("#bfe9ff", .8 * (1 - k) + .15);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (.4 + k * .6), 0, TAU); ctx.stroke();
        }
      }

      /* 宝箱 */
      if (chest) {
        ctx.save();
        ctx.translate(chest.x, chest.y);
        ctx.rotate(Math.sin(chest.t * 2) * .18);
        ctx.fillStyle = "#ffd76a";
        ctx.fillRect(-11, -9, 22, 18);
        ctx.fillStyle = "#8a5a00";
        ctx.fillRect(-11, -2, 22, 4);
        ctx.restore();
        const tex = glowTex("#ffd76a", 24);
        ctx.globalAlpha = .4 + Math.sin(chest.t * 4) * .15;
        ctx.drawImage(tex, chest.x - 34, chest.y - 34, 68, 68);
        ctx.globalAlpha = 1;
      }

      /* 撤离裂隙 */
      if (rift) {
        const rr = rift.r + Math.sin(rift.t * 3) * 4;
        const tex = glowTex("#7ef7c8", 48);
        ctx.globalAlpha = .5;
        ctx.drawImage(tex, rift.x - rr * 1.8, rift.y - rr * 1.8, rr * 3.6, rr * 3.6);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#7ef7c8";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(rift.x, rift.y, rr, 0, TAU); ctx.stroke();
        ctx.strokeStyle = colA("#7ef7c8", .5);
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(rift.x, rift.y, rr * .7, rift.t * 2, rift.t * 2 + 2.4); ctx.stroke();
      }

      /* 玩家 */
      drawPlayer();

      ctx.restore();
    }

    function drawPlayer() {
      if (!player) return;
      const C = run.char || CHARS[0];
      const blink = run.invuln > 0 && Math.floor(run.invuln * 14) % 2 === 0;
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.ang + Math.PI / 2);
      const tex = glowTex(C.col, 24);
      ctx.globalAlpha = .45;
      ctx.drawImage(tex, -40, -40, 80, 80);
      ctx.globalAlpha = blink ? .35 : 1;
      const p = unitPoly(C.sides || 3);
      ctx.beginPath();
      ctx.scale(player.r, player.r);
      ctx.fillStyle = C.col;
      ctx.fill(p);
      ctx.lineWidth = 2.4 / player.r;
      ctx.strokeStyle = "#eaf6ff";
      ctx.stroke(p);
      ctx.restore();
      ctx.globalAlpha = 1;

      /* 角色特征饰环：井核为重力环，电弧为电光弧 */
      if (C.id === "core") {
        ctx.strokeStyle = colA("#a78bfa", .55);
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 13, 0, TAU); ctx.stroke();
      } else if (C.id === "arc") {
        ctx.strokeStyle = colA("#5eead4", .75);
        ctx.lineWidth = 2.2;
        const a0 = run.t * 6;
        ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 11, a0, a0 + 1.5); ctx.stroke();
        ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 11, a0 + Math.PI, a0 + Math.PI + 1.5); ctx.stroke();
      }

      /* 生命环 */
      if (run.maxHp > 0) {
        const a0 = -Math.PI / 2, a1 = a0 + TAU * (player.hp / run.maxHp);
        ctx.strokeStyle = colA(player.hp <= 2 ? "#ff5c7a" : "#7ef7c8", .75);
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 7, a0, a1); ctx.stroke();
      }
    }

    function drawFx(ox, oy) {
      fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      fctx.clearRect(0, 0, CW, CH);
      fctx.save();
      fctx.translate(-ox, -oy);
      fctx.globalCompositeOperation = "lighter";

      for (const p of particles) {
        const a = clamp(p.life / p.max, 0, 1);
        fctx.fillStyle = colA(p.col, a * (p.type === 1 ? .95 : .8));
        const r = p.r * (p.type === 1 ? a * 1.2 + .3 : 1);
        if (r < 2.2) {
          fctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        } else {
          fctx.beginPath(); fctx.arc(p.x, p.y, r, 0, TAU); fctx.fill();
        }
      }

      fctx.strokeStyle = "#bfe9ff";
      fctx.lineCap = "round";
      for (const b of bolts) {
        const a = 1 - b.t / b.life;
        fctx.strokeStyle = colA("#bfe9ff", .85 * a);
        fctx.lineWidth = 1.8 + a * 2;
        fctx.beginPath();
        const seg = 4;
        for (let i = 0; i <= seg; i++) {
          const t = i / seg;
          const jx = i === 0 || i === seg ? 0 : rnd(-9, 9);
          const jy = i === 0 || i === seg ? 0 : rnd(-9, 9);
          const x = lerp(b.x1, b.x2, t) + jx;
          const y = lerp(b.y1, b.y2, t) + jy;
          if (i) fctx.lineTo(x, y); else fctx.moveTo(x, y);
        }
        fctx.stroke();
      }

      /* 玩家低血警示 */
      if (player && player.hp <= 2) {
        const a = .10 + Math.sin(performance.now() / 200) * .05;
        fctx.fillStyle = "rgba(255,40,80," + a + ")";
        fctx.fillRect(ox, oy, CW, CH);
      }
      /* 伤害数字 */
      if (dmgNums.length) {
        fctx.textAlign = "center";
        fctx.textBaseline = "middle";
        fctx.font = "700 " + (isTouch ? 12 : 14) + "px ui-monospace,Menlo,Consolas,monospace";
        for (const d of dmgNums) {
          const a = clamp(d.life / d.max, 0, 1);
          fctx.globalAlpha = a;
          fctx.fillStyle = "#000";
          fctx.fillText(d.txt, d.x + 1, d.y + 1);
          fctx.fillStyle = d.col;
          fctx.fillText(d.txt, d.x, d.y);
        }
        fctx.globalAlpha = 1;
        fctx.textBaseline = "alphabetic";
      }

      /* 暴击飞弹：弧线拖尾 + 亮核 */
      for (const m of cms) {
        fctx.strokeStyle = "rgba(255,143,163,.45)";
        fctx.lineWidth = 2.2;
        fctx.beginPath();
        const k = Math.min(1, m.t / m.life);
        for (let i = 0; i <= 6; i++) {
          const kk = Math.max(0, k - i * .045);
          const u = 1 - kk;
          const px = u * u * m.sx + 2 * u * kk * m.cx + kk * kk * m.x;
          const py = u * u * m.sy + 2 * u * kk * m.cy + kk * kk * m.y;
          if (i === 0) fctx.moveTo(px, py); else fctx.lineTo(px, py);
        }
        fctx.stroke();
        fctx.fillStyle = "#ffd7de";
        fctx.beginPath(); fctx.arc(m.x, m.y, 3.4, 0, TAU); fctx.fill();
        fctx.fillStyle = "rgba(255,77,109,.55)";
        fctx.beginPath(); fctx.arc(m.x, m.y, 6.4, 0, TAU); fctx.fill();
      }

      fctx.restore();
      fctx.globalCompositeOperation = "source-over";

      if (cam.flash > 0) {
        fctx.fillStyle = "rgba(255,70,110," + (cam.flash * .22) + ")";
        fctx.fillRect(0, 0, CW, CH);
      }

      /* 中央提示 */
      /* 中央提示：面板打开时不画，避免压到菜单文字 */
      if (state === "run") {
        for (const h of hints) {
          const a = clamp(h.life, 0, 1);
          fctx.globalAlpha = a;
          fctx.font = (isTouch ? 15 : 18) + "px " + "ui-monospace,Menlo,Consolas,monospace";
          fctx.textAlign = "center";
          fctx.fillStyle = h.col;
          fctx.fillText(h.txt, CW / 2, h.y);
          fctx.globalAlpha = 1;
        }
      }
    }

    function render() {
      /* 只有跑动时才有镜头抖动；暂停/死亡/结算画面必须静止 */
      const sh = state === "run" ? cam.shake : 0;
      const sx = (Math.random() - .5) * sh;
      const sy = (Math.random() - .5) * sh;
      drawWorld(cam.x + sx, cam.y + sy);
      drawFx(cam.x + sx, cam.y + sy);
    }

export { CELL, GW_R, GW_R2, GW_STEP, alphaCache, colA, drawFx, drawPlayer, drawWorld, gwA, gwWarp, polyCache, render, unitPoly };



