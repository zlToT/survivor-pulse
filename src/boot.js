import { isTouch } from "./config.js";
import { $, CH, CW, DPR, audio, clamp, ctx, fctx, gm, loadSave, makeSprites, persist, resize, save, sfx } from "./core.js";
import { FAMILIES, MAX_LV, PASSIVES, PAS_BY_ID, SKILLS, WEAPONS, WPN_BY_ID } from "./data.js";
import { addSkill, addWpn, areaMul, boss, critC, critD, dashCdMax, dmgMul, ebullets, enemies, luckVal, magnetR, moveSpd, player, run, setBoss, skillCdMul, skillOf, spawnBoss, spawnElite, state, toast, wpnOf } from "./world.js";
import { gainXp, joy, keys, setDashReq, update } from "./update.js";
import { render } from "./render.js";
import { EVO_LV, EVO_PAS_LV, initPicked, openTitle, togglePause, updateHud } from "./ui.js";

/* ================= BOOT ================= */
let lastT = 0;

export function bootGame() {
/* ================= BOOT ================= */
    const joyEl = $("joy");
    const joyKnob = joyEl.querySelector("i");
    const dashBtn = $("dashBtn");

    function joyStart(x, y, id) {
      joy.active = true; joy.id = id;
      joy.cx = x; joy.cy = y; joy.dx = 0; joy.dy = 0; joy.mag = 0;
      joyEl.style.display = "block";
      joyEl.style.left = x + "px";
      joyEl.style.top = y + "px";
      joyKnob.style.transform = "translate(-50%,-50%)";
    }
    function joyMove(x, y) {
      if (!joy.active) return;
      const R = 52;
      let dx = x - joy.cx, dy = y - joy.cy;
      const m = Math.hypot(dx, dy);
      if (m > R) { dx = dx / m * R; dy = dy / m * R; }
      joy.dx = dx / R; joy.dy = dy / R; joy.mag = Math.min(1, m / R);
      joyKnob.style.transform = "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))";
    }
    function joyEnd() {
      joy.active = false; joy.id = null;
      joy.dx = 0; joy.dy = 0; joy.mag = 0;
      joyEl.style.display = "none";
    }

    addEventListener("keydown", e => {
      const k = (e.key || "").toLowerCase();
      keys[k] = true;
      if (e.code === "Space") { e.preventDefault(); setDashReq(true); }
      if (k === "escape" || k === "p") {
        if (state === "run" || state === "paused") togglePause();
      }
      if (k === "shift") setDashReq(true);
    });
    addEventListener("keyup", e => { keys[(e.key || "").toLowerCase()] = false; });
    addEventListener("mousedown", e => {
      audio();
      if (e.button === 2 && state === "run") { e.preventDefault(); setDashReq(true); }
    });
    addEventListener("contextmenu", e => e.preventDefault());

    const surface = document.getElementById("fx");
    surface.addEventListener("touchstart", e => {
      audio();
      if (state !== "run") return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (!joy.active && t.clientX < innerWidth * .58) joyStart(t.clientX, t.clientY, t.identifier);
      }
    }, { passive: false });
    surface.addEventListener("touchmove", e => {
      if (!joy.active) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === joy.id) joyMove(t.clientX, t.clientY);
      }
    }, { passive: false });
    surface.addEventListener("touchend", e => {
      for (const t of e.changedTouches) {
        if (t.identifier === joy.id) joyEnd();
      }
    });
    surface.addEventListener("touchcancel", () => joyEnd());

    if (dashBtn) {
      dashBtn.addEventListener("touchstart", e => { e.preventDefault(); setDashReq(true); }, { passive: false });
      dashBtn.addEventListener("mousedown", e => { e.preventDefault(); setDashReq(true); });
    }

    $("pauseBtn").addEventListener("click", () => {
      audio();
      sfx.ui();
      if (state === "run" || state === "paused") togglePause();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && state === "run") togglePause();
    });

    /* ================= GM 调试面板 ================= */
    /* 开关：false → 左下角不显示 GM 按钮与面板 */
    const GM_ENABLED = true;


    function gmPill(label, act, on) {
      return '<button class="gm-pill' + (on ? " on" : "") + '" data-gm="' + act + '">' + label + "</button>";
    }

    /* ---------- 玩家属性汇总（GM 面板顶部 / 控制台） ---------- */
    function playerStats() {
      const rows = [];
      const add = (nm, v) => rows.push({ 属性: nm, 数值: v });
      if (!run || !player) return rows;
      add("生命", Math.max(0, Math.ceil(player.hp)) + " / " + run.maxHp);
      add("移速", moveSpd().toFixed(0) + " px/s");
      if (run.char && run.char.trait) add("角色特质", run.char.trait);
      add("暴击率", (critC() * 100).toFixed(0) + "%");
      add("暴击伤害", (critD() * 100).toFixed(0) + "%");
      const wDmg = (dmgMul(true) - 1) * 100, sDmg = (dmgMul(false) - 1) * 100;
      if (wDmg > .01) add("武器伤害加成", "+" + wDmg.toFixed(0) + "%");
      if (sDmg > .01) add("技能伤害加成", "+" + sDmg.toFixed(0) + "%");
      const cd = (1 - skillCdMul()) * 100;
      if (cd > .01) add("技能冷却缩减", "-" + cd.toFixed(0) + "%");
      const ar = (areaMul("dark") - 1) * 100;
      if (ar > .01) add("技能范围加成", "+" + ar.toFixed(0) + "%");
      if (luckVal()) add("幸运", "+" + luckVal() + "（掉落 / 宝箱品质）");
      if (save.up.magnet) add("拾取范围", magnetR().toFixed(0) + " px");
      if (save.up.cdr) add("冲刺冷却", dashCdMax().toFixed(2) + " s");
      if (save.up.xp) add("经验获取", "+" + (10 * save.up.xp) + "%");
      if (save.up.coin) add("金币获取", "+" + (20 * save.up.coin) + "%");
      if (run.revive) add("免死", "剩 " + run.revive + " 次");
      if (run.rerolls) add("刷新次数", "剩 " + run.rerolls + " 次");
      for (const w of run.wpns) {
        const W = WPN_BY_ID[w.id];
        add("攻速 · " + W.nm, W.aspd(w.lv).toFixed(2) + " 次/秒" + (w.evo ? " · 已进化" : ""));
      }
      return rows;
    }

    function statHtml() {
      const rows = playerStats();
      if (!rows.length) return '<div class="gm-nm"><span>先点「开始作战」进入一局</span></div>';
      return '<div class="gm-stats">' +
        rows.map(r => '<div class="gm-stat"><span>' + r.属性 + "</span><b>" + r.数值 + "</b></div>").join("") +
        "</div>";
    }

    function dumpStats() {
      const rows = playerStats();
      console.log("%c[GM] 玩家属性 · " + rows.length + " 项", "color:#8fe3ff;font-weight:700");
      console.table(rows);
      return rows;
    }

    function gmRenderStats() {
      const gs = $("gmStats");
      if (!gs) return;
      gs.innerHTML = '<div class="gs-head"><span>玩家属性</span><button data-act="dump">打印日志</button></div>' + statHtml();
    }

    function gmRender() {
      if (!GM_ENABLED) return;
      if (!run) {
        $("gmBody").innerHTML = '<div class="gm-nm"><span>先点「开始作战」进入一局，再调这些数值</span></div>';
        return;
      }
      const wHtml = WEAPONS.map(w => {
        const cur = wpnOf(w.id);
        return '<div class="gm-nm"><span>' + w.nm + "</span><b>" +
          (cur ? "LV " + cur.lv + (cur.evo ? " · 已进化" : "") : "未持有") + "</b></div>" +
          '<div class="gm-row">' +
          gmPill("+1 级", "w+:" + w.id) +
          gmPill("满级", "wmax:" + w.id) +
          gmPill("进化 " + w.evo.nm, "wevo:" + w.id) + "</div>";
      }).join("");

      const sHtml = SKILLS.map(S => {
        const cur = skillOf(S.id);
        const own = S.fam ? FAMILIES[S.fam].nm + " 专属" : "通用";
        return '<div class="gm-nm"><span>' + S.nm + " · " + own + "</span><b>" +
          (cur ? "LV " + cur.lv : "未持有") + "</b></div>" +
          '<div class="gm-row">' +
          gmPill("+1 级", "s+:" + S.id) +
          gmPill("满级", "smax:" + S.id) + "</div>";
      }).join("");

      const pHtml = PASSIVES.map(P => {
        const lv = run.pas[P.id] || 0;
        return '<div class="gm-nm"><span>' + P.nm + "</span><b>" +
          (lv ? "LV " + lv + " / " + P.max : "未持有") + "</b></div>" +
          '<div class="gm-row">' +
          gmPill("+1 级", "p+:" + P.id) +
          gmPill("满级", "pmax:" + P.id) + "</div>";
      }).join("");

      $("gmBody").innerHTML =
        "<h4>状态</h4>" +
        '<div class="gm-row">' +
        gmPill(gm.god ? "无敌：开" : "无敌：关", "god", gm.god) +
        gmPill("加 1 分钟", "add60") +
        gmPill("跳 Boss 战", "boss") +
        gmPill(gm.noPopup ? "禁升级弹窗：开" : "禁升级弹窗：关", "nopop", gm.noPopup) +
        gmPill(gm.freeze ? "冻结刷怪：开" : "冻结刷怪：关", "freeze", gm.freeze) +
        "</div>" +
        "<h4>等级 / 经验 / 金币</h4>" +
        '<div class="gm-row">' +
        gmPill("升 1 级", "lv1") +
        gmPill("升 5 级", "lv5") +
        gmPill("经验 +10", "xp10") +
        gmPill("经验 +100", "xp100") +
        gmPill("金币 +500", "coin500") +
        gmPill("无限金币", "coinMax") +
        "</div>" +
        "<h4>武器（满级 = LV " + MAX_LV + "，进化需武器 LV " + EVO_LV + " + 对应被动 " + EVO_PAS_LV + " 级）</h4>" + wHtml +
        "<h4>技能</h4>" +
        '<div class="gm-row">' + gmPill("★ 全部技能满级", "sallmax") + "</div>" + sHtml +
        "<h4>被动</h4>" +
        '<div class="gm-row">' + gmPill("★ 全部被动满级", "pallmax") + "</div>" + pHtml +
        "<h4>刷怪</h4>" +
        '<div class="gm-row">' +
        gmPill("刷精英", "elite") +
        gmPill("刷小 Boss", "bossS") +
        gmPill("刷终局 Boss", "bossF") +
        gmPill("清空敌人", "clear") +
        "</div>" +
        '<div class="gm-row" style="margin-top:6px">' +
        [1, 5, 20].map(k => gmPill("数量 " + k, "n:" + k, gm.n === k)).join("") +
        "</div>";
    }

    function gmApply(act) {
      if (!run && (act.indexOf("w") === 0 || act.indexOf("s") === 0 || act.indexOf("p") === 0)) return;
      if (act === "god") gm.god = !gm.god;
      else if (act === "dump") { dumpStats(); toast("属性已打印到控制台", "#8fe3ff"); }
      else if (act === "nopop") gm.noPopup = !gm.noPopup;
      else if (act === "freeze") gm.freeze = !gm.freeze;
      else if (act === "add60") {
        if (state === "run") { run.t += 60; toast("GM：时间 +60 秒", "#8ef0b8"); }
      } else if (act === "boss") {
        if (state === "run") { run.t = Math.max(run.t, 830); if (!boss) spawnBoss(true); }
      } else if (act === "lv1" || act === "lv5") {
        const times = act === "lv1" ? 1 : 5;
        for (let i = 0; i < times; i++) gainXp(run.xpNeed - run.xp + 1);
      } else if (act === "xp10") gainXp(10);
      else if (act === "xp100") gainXp(100);
      else if (act === "coin500") { save.coins += 500; persist(); }
      else if (act === "coinMax") { save.coins = 999999; persist(); toast("GM：金币 999999", "#ffd76a"); }
      else if (act === "elite") { if (state === "run") for (let i = 0; i < gm.n; i++) spawnElite(); }
      else if (act === "bossS") { if (state === "run" && !boss) spawnBoss(false); }
      else if (act === "bossF") { if (state === "run" && !boss) spawnBoss(true); }
      else if (act === "clear") {
        enemies.length = 0;
        setBoss(null);
        ebullets.length = 0;
        toast("GM：清空敌人", "#8ef0b8");
      } else if (act.indexOf("n:") === 0) gm.n = Number(act.slice(2));
      else if (act.indexOf("w+:") === 0) {
        const id = act.slice(3), cur = wpnOf(id);
        if (cur) cur.lv = clamp(cur.lv + 1, 1, MAX_LV);
        else if (!addWpn(id, 1)) toast("GM：武器栏已满", "#ff8b9c");
      } else if (act.indexOf("wmax:") === 0) {
        const id = act.slice(5);
        if (!addWpn(id, MAX_LV)) toast("GM：武器栏已满", "#ff8b9c");
      } else if (act.indexOf("wevo:") === 0) {
        const id = act.slice(5), cur = wpnOf(id) || addWpn(id, EVO_LV);
        if (cur) { cur.lv = Math.max(cur.lv, EVO_LV); cur.evo = true; cur.t = 0; }
      } else if (act.indexOf("s+:") === 0) {
        const id = act.slice(3), cur = skillOf(id);
        if (cur) cur.lv = clamp(cur.lv + 1, 1, MAX_LV); else addSkill(id, 1);
      } else if (act.indexOf("smax:") === 0) addSkill(act.slice(5), MAX_LV);
      else if (act === "sallmax") {
        /* 一键：所有技能满级 */
        for (const S of SKILLS) addSkill(S.id, MAX_LV);
        toast("GM：全部技能满级", "#8ef0b8");
      } else if (act === "pallmax") {
        /* 一键：所有被动满级 */
        for (const P of PASSIVES) run.pas[P.id] = P.max;
        toast("GM：全部被动满级", "#8ef0b8");
      }
      else if (act.indexOf("p+:") === 0) {
        const id = act.slice(3), P = PAS_BY_ID[id];
        run.pas[id] = Math.min(P.max, (run.pas[id] || 0) + 1);
      } else if (act.indexOf("pmax:") === 0) {
        const id = act.slice(5), P = PAS_BY_ID[id];
        run.pas[id] = P.max;
      }
      sfx.ui();
      updateHud();
      gmRender();
    }

    function gmToggle(force) {
      if (!GM_ENABLED) return;
      gm.open = force === undefined ? !gm.open : !!force;
      $("gmPanel").classList.toggle("on", gm.open);
      $("gmStats").classList.toggle("on", gm.open);
      document.body.classList.toggle("gm-open", gm.open);
      if (gm.open) { gmRender(); gmRenderStats(); dumpStats(); }
    }

    if (GM_ENABLED) {
      document.body.classList.add("gm-on");
      $("gmBtn").addEventListener("click", () => { audio(); gmToggle(); });
      $("gmClose").addEventListener("click", () => { sfx.ui(); gmToggle(false); });
      $("gmPanel").addEventListener("click", e => {
        const el = e.target.closest("[data-gm]");
        if (el) gmApply(el.dataset.gm);
      });
      $("gmStats").addEventListener("click", e => {
        const el = e.target.closest("[data-act]");
        if (!el) return;
        audio();
        if (el.dataset.act === "dump") { dumpStats(); toast("属性已打印到控制台", "#8fe3ff"); }
      });
    }

    /* ---------- 主循环 ---------- */

    function loop(t) {
      requestAnimationFrame(loop);
      if (!lastT) lastT = t;
      let dt = (t - lastT) / 1000;
      lastT = t;
      if (dt > .06) dt = .06;
      if (state === "run") update(dt);
      if (state === "title" || state === "shop") {
        /* 标题页 / 局外强化是独立菜单：与局内战场无关，不绘制战场 */
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.fillStyle = "#06070d";
        ctx.fillRect(0, 0, CW, CH);
        fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        fctx.clearRect(0, 0, CW, CH);
      } else {
        render();
      }
    }

    resize();
    makeSprites();
    if (isTouch) document.body.classList.add("touch");
    loadSave();
    initPicked();
    openTitle();
    requestAnimationFrame(loop);
}



