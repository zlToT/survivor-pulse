import { CH, CW, TAU, bgmSetMode, gm, lerp, rnd, save, sfx } from "./core.js";
import { PICKUPS, RUN_LEN, TIMELINE } from "./data.js";
import { boss, burst, cam, chest, dashCdMax, diffCoin, diffXp, director, dmgNums, ebullets, enemies, gems, hints, magnetR, moveSpd, nearestEnemy, nextXpNeed, pickups, player, props, refillProps, rift, run, separateProps, setRift, setTlIdx, spawnFormation, state, tlIdx, toast, trailPuff, waves } from "./world.js";
import { damageArea, updateAttacks, updateCombat, updateParticles } from "./combat.js";
import { gameOver, openChest, openLevelUp, updateHud, win } from "./ui.js";

/* ================= UPDATE ================= */
/* ================= UPDATE ================= */
    const keys = {};
    const joy = { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0, mag: 0 };
    let dashReq = false;
    function setDashReq(v) { dashReq = v; }

    function inputDir() {
      let x = 0, y = 0;
      if (keys["a"] || keys["arrowleft"]) x -= 1;
      if (keys["d"] || keys["arrowright"]) x += 1;
      if (keys["w"] || keys["arrowup"]) y -= 1;
      if (keys["s"] || keys["arrowdown"]) y += 1;
      if (joy.active) { x += joy.dx; y += joy.dy; }
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      return { x, y, m: Math.min(1, m) };
    }

    function updatePlayer(dt) {
      run.invuln = Math.max(0, run.invuln - dt);
      if (run.guardT > 0) run.guardT = Math.max(0, run.guardT - dt);
      /* 局外：再生血清（每 10/8/6 秒回 1 点生命） */
      if (save.up.regen) {
        run.regenT -= dt;
        if (run.regenT <= 0) {
          run.regenT = Math.max(4, 10 - 2 * (save.up.regen - 1));
          if (player.hp < run.maxHp) {
            player.hp = Math.min(run.maxHp, player.hp + 1);
            burst(player.x, player.y, 8, "#86efac", 120, 2, .5, 1);
          }
        }
      }
      run.dashCd = Math.max(0, run.dashCd - dt);
      if (run.dashT > 0) run.dashT -= dt;

      const d = inputDir();
      if (dashReq && run.dashCd <= 0) {
        dashReq = false;
        const ang = d.m > .1 ? Math.atan2(d.y, d.x) : player.ang;
        run.dashT = .17 + .15 * (save.up.dodge || 0);
        run.dashCd = dashCdMax();
        player.vx = Math.cos(ang) * moveSpd() * 3.6;
        player.vy = Math.sin(ang) * moveSpd() * 3.6;
        burst(player.x, player.y, 16, "#7ef7c8", 300, 3, .4, 1);
        cam.shake = Math.max(cam.shake, 3);
        sfx.dash();
      }
      dashReq = false;

      const sp = moveSpd();
      const k = 1 - Math.exp(-(run.dashT > 0 ? 3 : 13) * dt);
      player.vx = lerp(player.vx, d.x * sp, k);
      player.vy = lerp(player.vy, d.y * sp, k);
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      /* 崩塌回廊：可破坏物挡路（没有墙，打碎就通行） */
      separateProps(player);

      const tg = nearestEnemy(player.x, player.y, 900);
      if (tg) player.ang = Math.atan2(tg.y - player.y, tg.x - player.x);

      if (Math.abs(player.vx) + Math.abs(player.vy) > 40 && Math.random() < .85) {
        trailPuff(player.x - player.vx * .02, player.y - player.vy * .02, "#4fc3ff");
        if (Math.random() < .35) trailPuff(player.x - player.vx * .04, player.y - player.vy * .04, "#7fd8ff");
      }

      if (run.pas.regen) {
        run.regenT -= dt;
        if (run.regenT <= 0) {
          run.regenT = 25;
          if (player.hp < run.maxHp) { player.hp++; toast("再生 +1", "#7ef7c8"); }
        }
      }
    }

    function hitPlayer(dmg) {
      if (run.invuln > 0 || run.ended || run.dashT > 0) return;
      if (gm.god) return;
      run.invuln = 1.05;
      run.hits++;
      run.combo = 0;
      /* 角色特质：坚壁（受击减伤）+ 局外：纳米镀层 / 应激护盾 */
      const taken = (run.char.tr && run.char.tr.taken) || 1;
      const armor = 1 - .06 * (save.up.armor || 0);
      const guard = run.guardT > 0 ? 1 - .3 * (save.up.guard || 0) : 1;
      player.hp -= dmg * taken * armor * guard;
      if (save.up.guard) run.guardT = 1.5;
      cam.shake = Math.max(cam.shake, 10);
      cam.flash = .55;
      burst(player.x, player.y, 26, "#ff5c7a", 340, 3.2, .6, 1);
      sfx.hurt();
      if (player.hp <= 0) {
        if (run.revive > 0) {
          run.revive--;
          player.hp = Math.max(1, Math.ceil(run.maxHp / 2));
          run.invuln = 2.6;
          toast("复活协议启动", "#7ef7c8");
          cam.shake = 20;
        } else gameOver();
      }
    }

    function shootAt(sx, sy, ang, spd, dmg, r, col) {
      ebullets.push({ x: sx, y: sy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, dmg, r: r || 5, t: 4.5, col: col || "#ff7bb0" });
    }
    function bulletRing(x, y, n, spd, dmg, col) {
      for (let i = 0; i < n; i++) shootAt(x, y, i / n * TAU + Math.random() * .1, spd, dmg, 5, col);
    }
    /* 锁定扇形弹幕：以玩家为轴心的扇面齐射 */
    function fanShot(x, y, ang, n, spread, spd, dmg, col) {
      for (let i = 0; i < n; i++) {
        const k = n > 1 ? i / (n - 1) - .5 : 0;
        shootAt(x, y, ang + k * spread, spd, dmg, 6, col);
      }
    }

    function updateEnemies(dt) {
      const px = player.x, py = player.y;
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e.dead) { enemies.splice(i, 1); continue; }
        if (e.flash > 0) e.flash -= dt;
        e.rot += dt * (e.type === "orbiter" ? 2.6 : .55);
        /* 冰封棱镜：冻结期间不移动也不出手 */
        if (e.freeze > 0) e.freeze -= dt;
        const frozen = e.freeze > 0;

        const dx = px - e.x, dy = py - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const nx = dx / d, ny = dy / d;

        if (frozen) {
          /* 冻住：跳过移动与出手 */
        } else if (!e.boss) {
          switch (e.type) {
            case "rusher":
              e.x += (nx * e.spd + Math.cos(run.t * 5 + e.ph) * 46) * dt;
              e.y += (ny * e.spd + Math.sin(run.t * 5 + e.ph) * 46) * dt;
              break;
            case "shooter":
              if (d > 330) { e.x += nx * e.spd * dt; e.y += ny * e.spd * dt; }
              else if (d < 230) { e.x -= nx * e.spd * .8 * dt; e.y -= ny * e.spd * .8 * dt; }
              e.ft -= dt;
              if (e.ft <= 0 && d < 760) { e.ft = 2.1; shootAt(e.x, e.y, Math.atan2(dy, dx), 260, 1, 5.5, "#d8b4fe"); }
              break;
            case "orbiter": {
              const ang = Math.atan2(py - e.y, px - e.x);
              const tx = px - Math.cos(ang) * 300, ty = py - Math.sin(ang) * 300;
              const ta = ang + Math.PI / 2 * e.orbitDir;
              e.x += (Math.cos(ta) * e.spd * .8 + (tx - e.x) * .6) * dt;
              e.y += (Math.sin(ta) * e.spd * .8 + (ty - e.y) * .6) * dt;
              e.ft -= dt;
              if (e.ft <= 0) { e.ft = 2.6; shootAt(e.x, e.y, ang, 300, 1, 5, "#5eead4"); }
              break;
            }
            case "tank":
              e.x += nx * e.spd * dt; e.y += ny * e.spd * dt;
              e.ft -= dt;
              if (e.ft <= 0 && d < 520) { e.ft = 3.4; bulletRing(e.x, e.y, 6, 190, 1, "#8ab4f8"); }
              break;
            case "elite":
              e.x += nx * e.spd * dt; e.y += ny * e.spd * dt;
              e.ft -= dt;
              if (e.ft <= 0) {
                e.ft = 2.9;
                bulletRing(e.x, e.y, 10, 220, 1, "#ff8fc0");
                cam.shake = Math.max(cam.shake, 2);
              }
              break;
            default:
              e.x += nx * e.spd * dt; e.y += ny * e.spd * dt;
          }
        } else {
          /* Boss：三阶段（冲击波 / 阵法召唤 / 锁定扇形弹幕） */
          e.rot += dt * .8;
          const chase = e.spd * (e.charge > 0 ? 2.4 : 1);
          e.x += nx * chase * dt; e.y += ny * chase * dt;
          const ratio = e.hp / e.maxHp;
          const ph = ratio > .66 ? 1 : ratio > .33 ? 2 : 3;
          if (ph !== e.phase) {
            e.phase = ph;
            if (ph > 1) {
              e.spd *= 1.12;
              e.atkT = .5; e.waveT = .8; e.sumT = 1.6; e.fanT = 2.4;
              toast("Boss 进入第 " + ph + " 阶段", ph === 3 ? "#ff6b8a" : "#ffb45c");
              cam.shake = Math.max(cam.shake, 7);
              bulletRing(e.x, e.y, ph * 6, 200, 1, e.col);
            }
          }
          e.atkT -= dt;
          if (e.atkT <= 0) {
            e.atkT = ph === 1 ? 2.2 : ph === 2 ? 1.8 : 1.5;
            bulletRing(e.x, e.y, e.final ? 14 : 9, e.final ? 260 : 210, 1, e.col);
            e.charge = .9;
          }
          if (e.charge > 0) e.charge -= dt;
          /* 冲击波：环形扩散，扫过一次伤害 */
          e.waveT -= dt;
          if (e.waveT <= 0) {
            e.waveT = ph >= 2 ? (e.final ? 6 : 7.5) : 9;
            waves.push({ x: e.x, y: e.y, r: 26, max: e.final ? 460 : 320, spd: 300, dmg: ph >= 3 ? 2 : 1, hit: false, col: e.col });
            cam.shake = Math.max(cam.shake, 5);
          }
          /* 怪物阵法：成排 / 菱形 / 圆环推进 */
          e.sumT -= dt;
          if (e.sumT <= 0 && ph >= 2) {
            e.sumT = ph === 3 ? 8 : 10.5;
            e.sumN = ((e.sumN | 0) + 1) % 3;
            spawnFormation(e, e.sumN);
          }
          /* 锁定扇形弹幕 */
          e.fanT -= dt;
          if (e.fanT <= 0 && ph >= 2) {
            e.fanT = ph === 3 ? 4.4 : 6;
            const ang = Math.atan2(player.y - e.y, player.x - e.x);
            fanShot(e.x, e.y, ang, e.final ? 7 : 5, 1.05, 300, 1, "#ff8a5c");
            e.charge = .45;
          }
          if (e.final && e.hp < e.maxHp * .5 && !e.enraged) {
            e.enraged = true;
            e.spd *= 1.2;
            e.atkT = .6;
            toast("Boss 狂暴", "#ff6b8a");
          }
        }

        /* 击退速度衰减 */
        if (e.vx || e.vy) {
          e.x += e.vx * dt; e.y += e.vy * dt;
          const damp = Math.exp(-7 * dt);
          e.vx *= damp; e.vy *= damp;
          if (Math.abs(e.vx) < 2) e.vx = 0;
          if (Math.abs(e.vy) < 2) e.vy = 0;
        }

        /* 玩家碰撞 */
        if (d < e.r + player.r - 1) {
          hitPlayer(e.dmg);
          e.vx -= nx * 170;
          e.vy -= ny * 170;
          e.x += nx * 4; e.y += ny * 4;
        }
        /* 可破坏物也挡怪 */
        separateProps(e);
      }
    }

    function gainXp(v) {
      run.xp += v * (1 + .10 * (save.up.xp || 0)) * diffXp();
      let up = 0;
      while (run.xp >= run.xpNeed) {
        run.xp -= run.xpNeed;
        run.level++;
        run.xpNeed = nextXpNeed(run.level);
        up++;
      }
      if (up) {
        run.pendingLevels = (run.pendingLevels || 0) + up;
        sfx.level();
        cam.flash = .22;
        if (state === "run" && !gm.noPopup) openLevelUp();
      }
    }

    function updateGems(dt) {
      const mr = magnetR();
      for (let i = gems.length - 1; i >= 0; i--) {
        const g = gems[i];
        g.age += dt; g.ph += dt * 5;
        const dx = player.x - g.x, dy = player.y - g.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < mr || g.pull) {
          g.pull = true;
          const sp = 300 + (mr - d) * 1.6;
          g.x += dx / d * sp * dt;
          g.y += dy / d * sp * dt;
        } else {
          g.x += g.vx * dt; g.y += g.vy * dt;
          const damp = Math.exp(-4 * dt);
          g.vx *= damp; g.vy *= damp;
        }
        if (d < player.r + 14 || (g.pull && d < 26)) {
          if (g.kind === 0) { gainXp(g.val); sfx.orb(); burst(g.x, g.y, 3, "#5eead4", 120, 2, .22, 0); }
          else {
            run.coins += Math.round(g.val * (1 + .2 * (save.up.coin || 0)) * diffCoin());
            sfx.coin();
            burst(g.x, g.y, 3, "#ffd76a", 120, 2, .22, 0);
          }
          gems.splice(i, 1);
        }
      }
    }

    /* ---------- 补给：生命 / 磁力 / 湮灭弹 ---------- */
    function updatePickups(dt) {
      for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        p.life -= dt;
        p.ph += dt * 4;
        const dx = player.x - p.x, dy = player.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        /* 靠近就吸过来，手感更顺 */
        if (d < magnetR() * 1.2) p.pull = true;
        if (p.pull) {
          const sp = 260 + (magnetR() * 1.2 - d) * 1.4;
          p.x += dx / d * sp * dt;
          p.y += dy / d * sp * dt;
        } else {
          p.x += p.vx * dt; p.y += p.vy * dt;
          const damp = Math.exp(-4 * dt);
          p.vx *= damp; p.vy *= damp;
        }
        if (d < player.r + p.r + 6) {
          applyPickup(p);
          burst(p.x, p.y, 10, p.col, 240, 3, .4, 0);
          pickups.splice(i, 1);
          continue;
        }
        if (p.life <= 0) pickups.splice(i, 1);
      }
    }
    function applyPickup(p) {
      if (p.kind === "heal") {
        const before = player.hp;
        player.hp = Math.min(run.maxHp, player.hp + 1);
        sfx.coin();
        toast("+" + (player.hp - before) + " 生命", "#ff9aaa");
      } else if (p.kind === "magnet") {
        for (const g of gems) g.pull = true;
        sfx.zap();
        toast("磁力脉冲 · 收取全场掉落", "#c4a8ff");
      } else {
        damageArea(player.x, player.y, 520, 26 * (1 + .10 * (run.pas.power || 0)), 260, null, { src: "skill" });
        cam.shake = 12;
        cam.flash = .3;
        sfx.boom();
        burst(player.x, player.y, 46, "#ffa94d", 520, 5, .7, 1);
        toast("湮灭弹 · 清场", "#ffc078");
      }
    }

    function updateTimeline() {      while (tlIdx < TIMELINE.length && run.t >= TIMELINE[tlIdx].t) {
        const ev = TIMELINE[tlIdx];
        setTlIdx(tlIdx + 1);
        if (ev.txt) toast(ev.txt);
        if (ev.fn) ev.fn();
      }
      if (!run.exitOpen && run.t >= RUN_LEN) {
        run.exitOpen = true;
        const a = rnd(0, TAU), d = rnd(170, 260);
        setRift({ x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d, r: 46, t: 0 });
        toast("时间到 · 裂隙开启（进入可撤离 / 或继续挑战）", "#7ef7c8");
        sfx.win();
      }
    }

    function updateCamera(dt) {
      const tx = player.x - CW / 2, ty = player.y - CH / 2;
      const k = 1 - Math.exp(-9 * dt);
      cam.x = lerp(cam.x, tx, k);
      cam.y = lerp(cam.y, ty, k);
      cam.shake = Math.max(0, cam.shake - dt * 42);
      cam.flash = Math.max(0, cam.flash - dt * 2.4);
    }

    function update(dt) {
      run.t += dt;
      updatePlayer(dt);
      refillProps();
      director(dt);
      updateEnemies(dt);
      updateAttacks(dt);
      updateCombat(dt);
      updateGems(dt);
      updatePickups(dt);
      updateTimeline();
      updateParticles(dt);
      for (const p of props) if (p.hit > 0) p.hit -= dt * 4;
      /* Boss 冲击波：环形扩散，扫到玩家算一次伤害 */
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.r += w.spd * dt;
        const d = Math.hypot(player.x - w.x, player.y - w.y);
        if (!w.hit && Math.abs(d - w.r) < player.r + 12) { w.hit = true; hitPlayer(w.dmg); }
        if (w.r > w.max) waves.splice(i, 1);
      }
      for (let i = dmgNums.length - 1; i >= 0; i--) {
        const d = dmgNums[i];
        d.life -= dt;
        d.y += d.vy * dt;
        d.vy *= .94;
        if (d.life <= 0) dmgNums.splice(i, 1);
      }
      for (let i = hints.length - 1; i >= 0; i--) {
        hints[i].life -= dt;
        if (hints[i].life <= 0) hints.splice(i, 1);
      }
      updateCamera(dt);
      updateHud();
      if (rift) {
        rift.t += dt;
        if (Math.hypot(player.x - rift.x, player.y - rift.y) < rift.r * .8) win();
      }
      if (chest) {
        chest.t += dt;
        if (Math.hypot(player.x - chest.x, player.y - chest.y) < chest.r + player.r) openChest();
      }
      /* BGM 跟随战况：普通→推进，Boss 在场→紧张，非战斗→平静 */
      bgmSetMode(state === "run" ? (boss && !boss.dead ? "boss" : "drive") : "calm");
    }

export { bulletRing, dashReq, gainXp, hitPlayer, inputDir, joy, keys, setDashReq, shootAt, update, updateCamera, updateEnemies, updateGems, updatePickups, updatePlayer, updateTimeline };


