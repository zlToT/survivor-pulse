import { isTouch } from "./config.js";
import { $, TAU, VOL, audio, clamp, dmgOn, muted, persist, pick, save, saveOk, setDmg, setMuted, setVol, sfx } from "./core.js";
import { ACH, ACH_CATS, CHARS, CHAR_BY_ID, DIFFS, ENEMY_LIST, ETYPE, FAMILIES, MAPS, MAX_LV, MAX_WPN, META, META_BY_KEY, META_CATS, PASSIVES, PAS_BY_ID, PSTAT, RUN_LEN, SKILLS, SKILL_BY_ID, WEAPONS, WPN_BY_ID, UNLOCK_GATE, WSTAT, skillsOf } from "./data.js";
import { addSkill, addWpn, boss, burst, cam, chest, dashCdMax, diffOf, enemies, hasFam, hasWpn, mapOf, player, resetRun, rift, run, setChest, setPaused, setState, skillOf, state, toast, wpnOf } from "./world.js";

/* ================= UI ================= */
/* ================= UI ================= */
    const ui = {
      timer: $("timer"), xpFill: $("xpFill"), lvTxt: $("lvTxt"),
      killTxt: $("killTxt"), coinTxt: $("coinTxt"),
      bossWrap: $("bossWrap"), bossName: $("bossName"), bossFill: $("bossFill"),
      hpFill: $("hpFill"), hpTxt: $("hpTxt"), dashFill: $("dashFill"), dashTxt: $("dashTxt"),
      wpnbar: $("wpnbar"), sklbar: $("sklbar"), pasbar: $("pasbar"),
      wpnCnt: $("wpnCnt"), sklCnt: $("sklCnt"), pasCnt: $("pasCnt"),
      dmgChip: $("dmgChip"), stage: $("stageTxt"), mm: $("mm"),
      overlay: $("overlay"), panel: $("panel"),
    };
    let hudCache = {};
    let pickedChar = "tri";
    let shopCat = "atk";   /* 局外强化当前分类：攻击型 / 防御型 / 功能型 */
    /* save 是 core 的绑定，顶层读会踩 TDZ，改成启动后调用 */
    function initPicked() {
      /* 读档：上次选的是谁就还是谁（角色已被解锁才认，否则退回默认角色） */
      pickedChar = save.pick && save.chars && save.chars[save.pick] ? save.pick : "tri";
    }

    /* 生成内联 SVG 图标 */
    function svgo(d) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
        'stroke-linecap="round" stroke-linejoin="round">' + d + "</svg>";
    }

    function setHud(key, el, val) {
      if (hudCache[key] === val) return;
      hudCache[key] = val;
      el.innerHTML = val;
    }

    function fmtTime(s) {
      s = Math.max(0, Math.ceil(s));
      const m = Math.floor(s / 60), r = s % 60;
      return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
    }

    let mmCtx = null;
    let mmScale = null;

    /* 小地图：以玩家为中心，R 半径内画出敌人 / 裂隙 / 宝箱 */
    function drawMinimap() {
      const c = ui.mm;
      if (!c) return;
      const S = isTouch ? 66 : 88;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(S * dpr)) {
        c.width = Math.round(S * dpr);
        c.height = Math.round(S * dpr);
      }
      if (!mmCtx) mmCtx = c.getContext("2d");
      const g = mmCtx;
      const R = S / 2;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, S, S);

      g.beginPath();
      g.arc(R, R, R - 1.5, 0, TAU);
      g.fillStyle = "rgba(8, 16, 30, .82)";
      g.fill();
      g.strokeStyle = "rgba(110, 200, 255, .3)";
      g.lineWidth = 1;
      g.stroke();

      if (!player) return;
      const span = 1500;               // 小地图半径覆盖的世界距离
      const k = (R - 4) / span;

      g.save();
      g.beginPath();
      g.arc(R, R, R - 2, 0, TAU);
      g.clip();

      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.dead) continue;
        const dx = (e.x - player.x) * k, dy = (e.y - player.y) * k;
        if (dx * dx + dy * dy > (R - 3) * (R - 3)) continue;
        if (e.boss) { g.fillStyle = "#ff5b7f"; g.fillRect(R + dx - 2.4, R + dy - 2.4, 4.8, 4.8); }
        else if (e.elite) { g.fillStyle = "#ffb454"; g.fillRect(R + dx - 1.8, R + dy - 1.8, 3.6, 3.6); }
        else { g.fillStyle = "rgba(255, 150, 170, .85)"; g.fillRect(R + dx - 1, R + dy - 1, 2, 2); }
      }

      if (rift) {
        const dx = (rift.x - player.x) * k, dy = (rift.y - player.y) * k;
        if (dx * dx + dy * dy < (R - 4) * (R - 4)) {
          g.fillStyle = "#a78bfa";
          g.beginPath(); g.arc(R + dx, R + dy, 3.2, 0, TAU); g.fill();
        }
      }
      if (chest) {
        const dx = (chest.x - player.x) * k, dy = (chest.y - player.y) * k;
        if (dx * dx + dy * dy < (R - 4) * (R - 4)) {
          g.fillStyle = "#ffd76a";
          g.fillRect(R + dx - 2, R + dy - 2, 4, 4);
        }
      }
      g.restore();

      g.fillStyle = "#7ee6ff";
      g.beginPath();
      g.arc(R, R, 2.6, 0, TAU);
      g.fill();
      g.strokeStyle = "rgba(126, 230, 255, .5)";
      g.lineWidth = 1;
      g.beginPath();
      g.arc(R, R, 5.5, 0, TAU);
      g.stroke();
    }

    function updateHud() {
      const rem = RUN_LEN - run.t;
      setHud("t", ui.timer, rem <= 0 ? "∞" : fmtTime(rem));
      ui.timer.style.color = rem <= 60 && rem > 0 ? "#ff7b8a" : "#fff";

      /* 生命 */
      ui.hpFill.style.width = (clamp(player.hp / run.maxHp, 0, 1) * 100).toFixed(1) + "%";
      setHud("hp", ui.hpTxt, Math.max(0, Math.ceil(player.hp)) + "/" + run.maxHp);

      /* 冲刺 */
      const dr = run.dashCd <= 0 ? 1 : 1 - run.dashCd / dashCdMax();
      ui.dashFill.style.width = (clamp(dr, 0, 1) * 100).toFixed(0) + "%";
      setHud("dtxt", ui.dashTxt, run.dashCd <= 0 ? "就绪" : run.dashCd.toFixed(1) + "s");

      /* 经验 */
      ui.xpFill.style.width = (clamp(run.xp / run.xpNeed, 0, 1) * 100).toFixed(1) + "%";
      setHud("lv", ui.lvTxt, "LV " + run.level + " " + Math.floor(run.xp) + "/" + run.xpNeed);

      /* 右下统计 */
      setHud("k", ui.killTxt, "" + run.kills);
      setHud("c", ui.coinTxt, "" + run.coins);
      setHud("dch", ui.dmgChip, dmgOn ? "伤害数字：开" : "伤害数字：关");

      /* 武器 / 技能 / 被动（图标配色与升级卡一致：武器色 / 所属武器色 / 银） */
      setHud("wc", ui.wpnCnt, run.wpns.length + " / " + MAX_WPN);
      let wb = "";
      for (const w of run.wpns) {
        const W = WPN_BY_ID[w.id];
        const cc = W.col;
        wb += '<div class="' + (w.evo ? "evo" : "") + '" style="color:' + cc +
          ";border-color:" + cc + '55;background:' + cc + '16">' + svgo(W.svg) +
          (w.evo ? '<b class="sv">★</b>' : "") + "<em>" + w.lv + "</em></div>";
      }
      setHud("w", ui.wpnbar, wb);

      let sb = "";
      for (const s of run.skills) {
        const S = SKILL_BY_ID[s.id];
        const cc = cardCol("s", s.id);
        sb += '<div class="' + (S.fam && !hasFam(S.fam) ? "other" : "") + (S.kind === "mount" ? " mount" : "") +
          '" style="color:' + cc + ";border-color:" + cc + '55;background:' + cc + '16">' +
          svgo(S.svg) + "<em>" + s.lv + "</em></div>";
      }
      setHud("sc", ui.sklCnt, "" + run.skills.length);
      setHud("s", ui.sklbar, sb);

      let pn = 0, pb = "";
      for (const P of PASSIVES) {
        const lv = run.pas[P.id] || 0;
        if (!lv) continue;
        pn++;
        pb += '<div style="color:' + SILVER + ";border-color:" + SILVER + '55;background:' + SILVER + '14">' +
          svgo(P.svg) + "<em>" + lv + "</em></div>";
      }
      setHud("pc", ui.pasCnt, pn + " / " + PASSIVES.length);
      setHud("p", ui.pasbar, pb);

      if (boss && !boss.dead) {
        ui.bossWrap.style.display = "block";
        setHud("bn", ui.bossName, boss.final ? "终局 Boss" : "精英 Boss");
        ui.bossFill.style.width = (clamp(boss.hp / boss.maxHp, 0, 1) * 100).toFixed(1) + "%";
      } else if (ui.bossWrap.style.display !== "none") {
        ui.bossWrap.style.display = "none";
      }

      drawMinimap();
    }

    /* 浮动层：只在对应面板显示，且不随内容滚动 */
    function setFloats(cls) {
      const hint = $("hint"), chip = $("coinChip");
      if (cls === "ttl") { hint.style.display = "flex"; } else { hint.style.display = "none"; }
      if (cls === "shop") {
        chip.innerHTML = "<span>持有金币</span><b>◇ " + save.coins + "</b>";
        chip.style.display = "flex";
      } else { chip.style.display = "none"; }
    }

    function showPanel(html, cls) {
      ui.panel.innerHTML = html;
      ui.overlay.className = cls || "";
      ui.overlay.style.display = "flex";
      setFloats(cls || "");
      /* 菜单/暂停时隐藏局内 HUD，避免压在遮罩上 */
      document.body.classList.toggle("panel-open", cls === "ttl" || cls === "shop" || cls === "wide");
    }

    function hidePanel() {
      ui.overlay.style.display = "none";
      ui.overlay.className = "";
      ui.panel.innerHTML = "";
      setFloats("");
      document.body.classList.remove("panel-open");
    }

    /* ---------- 标题 ---------- */
    /* ---------- 最佳记录：按「地图 : 难度」分开存（2 地图 × 4 难度 = 8 份） ---------- */
    function recKey(mapId, diff) {
      const m = mapId || save.map || "plain";
      const d = diff == null ? (save.diff | 0) : (diff | 0);
      return m + ":" + d;
    }

    function bestRec(mapId, diff) {
      const k = recKey(mapId, diff);
      let r = save.best[k];
      if (!r || typeof r !== "object") r = save.best[k] = { t: 0, k: 0, c: 0, d: 0, m: 0 };
      return r;
    }

    function bestSec(mapId, diff) {
      return bestRec(mapId, diff).t || 0;
    }

    /* 地图解锁：前一张地图的「4 个难度」全部活满 3 分钟，才解锁下一张 */
    function mapUnlocked(M) {
      const i = MAPS.indexOf(M);
      if (i <= 0) return true;
      const prev = MAPS[i - 1];
      if (prev.soon) return false;
      for (let d = 0; d < DIFFS.length; d++) if (bestSec(prev.id, d) < 180) return false;
      return true;
    }

    /* 地图胶囊的锁定提示文案 */
    function mapLockTip(M) {
      const i = MAPS.indexOf(M);
      if (M.soon) return "后续版本开放";
      const prev = MAPS[i - 1];
      return "先在「" + prev.nm + "」4 个难度各活满 3:00";
    }

    /* 难度解锁：前一档在「当前地图」活满 3 分钟（前后置关系） */
    function diffUnlocked(i, mapId) {
      if (i <= 0) return true;
      return bestSec(mapId || save.map || "plain", i - 1) >= 180;
    }

    function openTitle() {
      hidePanel();
      setState("title");
      setPaused(false);
      const cards = CHARS.map(c => {
        const owned = !!save.chars[c.id];
        const sel = pickedChar === c.id ? " sel" : "";
        const W = WPN_BY_ID[c.weapon];
        const sks = skillsOf(c.weapon).map(s => s.nm).join(" · ");
        return '<div class="char' + sel + (owned ? "" : " lock") + '" data-act="char" data-id="' + c.id + '">' +
          '<div class="ci" style="color:' + c.col + '">' + svgo(c.svg) + "</div>" +
          '<div class="cn">' + c.nm + "</div>" +
          '<div class="cw" style="color:' + c.col + '">初始武器【' + W.nm + "】</div>" +
          '<div class="ct" style="color:' + c.col + '">' + (c.trait || "") + "</div>" +
          '<div class="cd">' + sks + "</div>" +
          '<div class="cc">' + (owned ? (pickedChar === c.id ? "已选择" : "可选") : "◇ " + c.cost) + "</div></div>";
      }).join("");
      showPanel(
        '<div class="titlebox">' +
        '<h1>幸存者 · 脉冲</h1>' +
        '<p class="sub">15 分钟 · 自动开火 · 武器 / 技能 / 被动三层成长 · 宝箱解锁另两把武器</p>' +
        '<div class="stats">' +
        '<div><span>星尘金币</span><b>◇ ' + save.coins + "</b></div>" +
        '<div><span>最长生存</span><b>' + fmtTime(save.bestTime || 0) + "</b></div>" +
        '<div><span>最高击杀</span><b>' + (save.bestKill || 0) + "</b></div>" +
        "</div>" +
        (saveOk ? "" : '<p class="warn">⚠ 浏览器不允许本地存档，本次进度刷新后会丢失</p>') +
        '<div class="chars">' + cards + "</div>" +
        '<div class="maps">' +
        MAPS.map(M => {
          const lock = !mapUnlocked(M);
          const on = !lock && save.map === M.id ? " on" : "";
          const tip = lock ? mapLockTip(M) : M.ds;
          return '<button class="cap' + on + (lock ? " lock" : "") + '" data-act="map" data-id="' + M.id + '"' +
            ' style="--c:' + M.col + '" title="' + tip + '"' + (lock ? " disabled" : "") + ">" +
            (lock ? "🔒 " : "") + M.nm + "</button>";
        }).join("") +
        "</div>" +
        '<div class="maps dimg">' +
        DIFFS.map((D, i) => {
          const lock = !diffUnlocked(i);
          const on = !lock && (save.diff | 0) === i ? " on" : "";
          const tip = lock ? "先在「" + DIFFS[i - 1].nm + "」活满 3:00" : D.ds;
          return '<button class="cap' + on + (lock ? " lock" : "") + '" data-act="diff" data-id="' + i + '"' +
            ' style="--c:' + D.col + '" title="' + tip + '"' + (lock ? " disabled" : "") + ">" +
            (lock ? "🔒 " : "") + D.nm + "</button>";
        }).join("") +
        "</div>" +
        '<p class="mapds">' + (mapOf().ds) + " ｜ " + (diffOf().ds) + "</p>" +
        '<p class="mapbest">本组最佳 生存 ' + fmtTime(bestRec().t) + " ｜ 击杀 " + bestRec().k + "</p>" +
        '<button class="mbtn" data-act="start">开始作战</button>' +
        "</div>" +
        /* 图标行放在 .titlebox 外面：position:fixed 贴底，不受标题缩放影响 */
        '<div class="ticons">' +
        '<button class="ticon" data-act="shop" title="局外强化">' +
        svgo('<path d="M3.4 4.8h2.5l2.6 10.2h9.6l2.1-7.4H7.1"/><circle cx="9.8" cy="19.2" r="1.5"/><circle cx="17.4" cy="19.2" r="1.5"/>') + "</button>" +
        '<button class="ticon" data-act="codex" title="图鉴">' +
        svgo('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5z"/><path d="M8.5 3v18"/>') + "</button>" +
        '<button class="ticon" data-act="ach" title="成就">' +
        svgo('<path d="M8 3.5h8v4.5a4 4 0 0 1-8 0z"/><path d="M8 4.8H5.2v1.7A3.1 3.1 0 0 0 8 9.6"/><path d="M16 4.8h2.8v1.7A3.1 3.1 0 0 1 16 9.6"/><path d="M12 12.2v4.4"/><path d="M8.4 21h7.2"/><path d="M9.4 21c0-2.4 1.2-4.4 2.6-4.4s2.6 2 2.6 4.4"/>') + "</button>" +
        '<button class="ticon" data-act="settings" title="设置">' +
        svgo('<path d="M4 7h9M19 7h1M4 12h3M13 12h7M4 17h11M21 17h-1"/><circle cx="16" cy="7" r="2.1"/><circle cx="10" cy="12" r="2.1"/><circle cx="18" cy="17" r="2.1"/>') + "</button>" +
        "</div>",
        "ttl"
      );
      /* 视口太矮时整体等比缩小，保证内容不被底部固定图标行压住
         字体是后加载的，所以先算一次、下一帧与 150ms 后再各算一次 */
      fitTitle();
      requestAnimationFrame(fitTitle);
      setTimeout(fitTitle, 150);
    }

    /* 按可用高度算「标题页」缩放：图标行是 fixed 的，先量出它占掉的底部空间 */
    function fitTitle() {
      const tb = document.querySelector(".titlebox");
      const pn = $("panel");
      const ti = document.querySelector(".ticons");
      if (!tb || !pn) return;
      tb.style.zoom = "1";
      const cs = getComputedStyle(pn);
      const pt = parseFloat(cs.paddingTop) || 0;
      const pr = pn.getBoundingClientRect();
      const bottom = ti ? ti.getBoundingClientRect().top - 20 : innerHeight - 90;
      /* 内容顶边到图标行顶边之间，才是真正能用的高度 */
      const avail = Math.max(200, Math.min(pr.height - 10, bottom - pr.top - pt));
      const need = tb.scrollHeight;
      const k = need > avail ? Math.max(.5, avail / need) : 1;
      tb.style.zoom = (+k).toFixed(3);
    }

    /* 窗口尺寸变化时重算标题页缩放（只在标题页有效） */
    let titleRaf = 0;
    window.addEventListener("resize", () => {
      if (state !== "title") return;
      cancelAnimationFrame(titleRaf);
      titleRaf = requestAnimationFrame(fitTitle);
    });

    function openShop() {
      setState("shop");
      const cat = META_CATS.find(c => c.id === shopCat) || META_CATS[0];
      const cards = META.filter(m => m.cat === cat.id).map(m => {
        const lv = save.up[m.key] || 0;
        const maxed = lv >= m.max;
        const cost = maxed ? 0 : m.costs[lv];
        let pips = "";
        for (let i = 0; i < m.max; i++) pips += '<i class="' + (i < lv ? "on" : "") + '"></i>';
        return '<div class="mcard' + (maxed ? " maxed" : "") + '">' +
          (maxed ? '<b class="badge max">MAX</b>' : "") +
          '<div class="ico" style="color:' + m.col + ';border-color:' + m.col + '55;background:' + m.col + '18">' +
          svgo(m.ico) + "</div>" +
          '<div class="mn">' + m.nm + "</div>" +
          '<div class="pips">' + pips + "</div>" +
          '<div class="md">' + m.ds + "</div>" +
          '<button class="mbtn" data-act="buy" data-key="' + m.key + '"' + (maxed || save.coins < cost ? " disabled" : "") + ">" +
          (maxed ? "✓ 满级" : "◇ " + cost) + "</button></div>";
      }).join("");
      const tabs = META_CATS.map(c =>
        '<button class="segbtn' + (c.id === cat.id ? " on" : "") + '" data-act="shopcat" data-cat="' + c.id +
        '" style="--c:' + c.col + '">' + c.nm + "</button>").join("");
      showPanel(
        '<h1 class="sm">局外强化</h1>' +
        '<div class="segrow">' + tabs + "</div>" +
        '<p class="sub">' + cat.ds + "</p>" +
        '<div class="shop">' + cards + "</div>" +
        '<button class="mbtn alt" data-act="back">返回</button>',
        "shop"
      );
    }

    /* ---------- 图鉴 / 成就 / 设置（标题页三个入口） ---------- */
    const CODEX_TABS = [
      { id: "wpn", nm: "武器" }, { id: "skill", nm: "技能" },
      { id: "pas", nm: "被动" }, { id: "ene", nm: "敌人" },
    ];
    let codexTab = "wpn";

    function cxRow(col, icon, nm, ds, tag) {
      return '<div class="cxrow">' +
        '<div class="ico" style="color:' + col + ";border-color:" + col + '55;background:' + col + '18">' + icon + "</div>" +
        '<div class="cxt"><b style="color:' + col + '">' + nm + "</b><span>" + ds + "</span></div>" +
        (tag ? "<em>" + tag + "</em>" : "") + "</div>";
    }

    function openCodex() {
      setState("codex");
      let rows = "";
      if (codexTab === "wpn") {
        rows = WEAPONS.map(W => {
          const evo = W.evo ? "进化 " + W.evo.nm : "无进化";
          return cxRow(W.col, svgo(W.svg), W.nm, W.desc(1), evo);
        }).join("");
      } else if (codexTab === "skill") {
        rows = SKILLS.map(S => {
          const fam = S.fam ? FAMILIES[S.fam] : null;
          const col = fam ? fam.col : S.col;
          const kind = S.kind === "mount" ? "普攻挂载" : S.kind === "pass" ? "被动转化" : "主动技能";
          return cxRow(col, svgo(S.svg), S.nm, S.desc(1) + " · " + kind, fam ? fam.nm : "通用");
        }).join("");
      } else if (codexTab === "pas") {
        rows = PASSIVES.map(P => cxRow(SILVER, svgo(P.svg), P.nm, P.ds, "上限 " + P.max + " 级")).join("");
      } else {
        rows = ENEMY_LIST.map(E => {
          const T = ETYPE[E.id] || {};
          const n = save.killTypes[E.id] || 0;
          return cxRow(T.col || SILVER, svgo('<polygon points="12,3 20.5,19.5 3.5,19.5"/>'),
            E.nm, E.ds, n ? "击杀 " + n : "未遭遇");
        }).join("");
      }
      const tabs = CODEX_TABS.map(t =>
        '<button class="segbtn' + (t.id === codexTab ? " on" : "") + '" data-act="codextab" data-tab="' + t.id + '">' + t.nm + "</button>").join("");
      showPanel(
        '<h1 class="sm">图鉴</h1>' +
        '<div class="segrow">' + tabs + "</div>" +
        '<div class="codex">' + rows + "</div>" +
        '<button class="mbtn alt" data-act="back">返回</button>',
        "shop"
      );
    }

    /* 成就进度：全部从存档累计值换算 */
    function achVal(src) {
      switch (src) {
        case "kills": return save.tot.kills;
        case "boss": return save.tot.boss;
        case "types": return Object.keys(save.killTypes).length;
        case "combo": return save.bestCombo || 0;
        case "wpns": return save.bestWpns || 0;
        case "evo": return save.tot.evo;
        case "chars": return Object.keys(save.chars).length;
        case "skills": return save.bestSkills || 0;
        case "meta": { let n = 0; for (const k in save.up) n += save.up[k] || 0; return n; }
        case "runs": return save.tot.runs;
        case "chest": return save.tot.chest;
        case "dmg": return save.bestDmg || 0;
        case "noHit": return save.easter.noHit ? 1 : 0;
        case "win": return save.easter.win ? 1 : 0;
        default: return 0;
      }
    }

    function openAch() {
      setState("ach");
      const got = ACH.filter(a => save.ach[a.id]).length;
      const groups = ACH_CATS.map(c => {
        const list = ACH.filter(a => a.cat === c.id);
        const rows = list.map(a => {
          const val = Math.min(a.goal, achVal(a.src));
          const ok = val >= a.goal;
          const owned = !!save.ach[a.id];
          const pct = Math.max(4, Math.round(val / a.goal * 100));
          const btn = owned
            ? '<button class="mbtn tiny" disabled>✓ 已领取</button>'
            : ok
              ? '<button class="mbtn tiny hot" data-act="achtake" data-id="' + a.id + '">领取 ◇ ' + a.reward + "</button>"
              : '<button class="mbtn tiny" disabled>' + val + " / " + a.goal + "</button>";
          return '<div class="achrow' + (owned ? " done" : ok ? " ok" : "") + '">' +
            '<div class="aht"><b>' + a.nm + "</b><span>" + a.ds + "</span>" +
            '<i class="ahbar"><u style="width:' + pct + "%" + '"></u></i></div>' + btn + "</div>";
        }).join("");
        const done = list.filter(a => save.ach[a.id]).length;
        return '<div class="achgrp" style="--c:' + c.col + '">' +
          '<h2>' + c.nm + "<em>" + done + " / " + list.length + "</em></h2>" + rows + "</div>";
      }).join("");
      showPanel(
        '<h1 class="sm">成就</h1>' +
        '<p class="sub">已领取 ' + got + " / " + ACH.length + " · 达成后点「领取」拿星尘金币</p>" +
        '<div class="achbox">' + groups + "</div>" +
        '<button class="mbtn alt" data-act="back">返回</button>',
        "shop"
      );
    }

    function takeAch(id) {
      const a = ACH.find(x => x.id === id);
      if (!a || save.ach[id]) return;
      if (achVal(a.src) < a.goal) { sfx.nope(); return; }
      save.ach[id] = 1;
      save.coins += a.reward;
      persist();
      sfx.coin();
      openAch();
    }

    /* 设置四行：暂停面板与标题页共用 */
    function setRows() {
      return '<div class="setlist">' +
        '<div class="setrow' + (muted ? "" : " on") + '" data-act="mute"><span>全部音效</span><i class="sw"></i></div>' +
        '<div class="setrow' + (dmgOn ? " on" : "") + '" data-act="dmg"><span>伤害数字</span><i class="sw"></i></div>' +
        '<div class="setrow vol"><span>音乐音量</span><input type="range" min="0" max="100" step="5" data-vol="m" value="' + Math.round(VOL.m * 100) + '"></div>' +
        '<div class="setrow vol"><span>音效音量</span><input type="range" min="0" max="100" step="5" data-vol="s" value="' + Math.round(VOL.s * 100) + '"></div>' +
        "</div>";
    }

    function openSettings() {
      setState("set");
      showPanel(settingsHtml(), "wide");
    }

    /* ---------- 升级三选一：武器 30% / 技能 40% / 被动 30% ---------- */
    function pickInKind(k) {
      const own = run.char ? run.char.weapon : null;
      if (k === "w") {
        if (!run.wpns.length) return null;
        /* 本命角色自己的武器权重最高 */
        const bag = [];
        for (const w of run.wpns) {
          if (w.lv >= MAX_LV) continue;
          if (w.id === own) { bag.push(w, w, w, w); } else bag.push(w);
        }
        if (!bag.length) return null;
        return { kind: "w", id: pick(bag).id };
      }
      if (k === "s") {
        /* 自己武器的专属技能最高 > 通用技能 > 别的武器技能 */
        const bag = [];
        for (const s of SKILLS) {
          const cur = skillOf(s.id);
          if (cur && cur.lv >= MAX_LV) continue;
          if (!s.fam) bag.push(s, s, s);
          else if (hasFam(s.fam)) bag.push(s, s, s, s, s, s, s);
          else bag.push(s);
        }
        if (!bag.length) return null;
        return { kind: "s", id: pick(bag).id };
      }
      const ok = PASSIVES.filter(p => (run.pas[p.id] || 0) < p.max);
      if (!ok.length) return null;
      return { kind: "p", id: pick(ok).id };
    }

    function rollChoices() {
      const out = [];
      const kinds = ["w", "s", "p"], wts = [30, 40, 30];
      let guard = 0;
      while (out.length < 3 && guard++ < 240) {
        let r = Math.random() * 100, k = null;
        for (let i = 0; i < kinds.length; i++) {
          if (r < wts[i]) { k = kinds[i]; break; }
          r -= wts[i];
        }
        if (!k) k = "p";
        const c = pickInKind(k);
        if (c && !out.some(o => o.kind === c.kind && o.id === c.id)) { out.push(c); continue; }
        /* 抽到重复/无可用项：换一类补位，保证三张牌不重复 */
        for (const k2 of kinds) {
          if (k2 === k) continue;
          const c2 = pickInKind(k2);
          if (c2 && !out.some(o => o.kind === c2.kind && o.id === c2.id)) { out.push(c2); break; }
        }
      }
      return out;
    }

    /* 等级进度：五个格子；已有的实心，本次要拿到的那格额外高亮 */
    function pipsHtml(cur, max, gain, col) {
      let s = '<div class="pips" style="color:' + (col || "#cfd9e6") + '">';
      for (let i = 0; i < max; i++) {
        const on = i < cur ? "on" : "";
        const g = gain !== undefined && i >= cur && i < gain ? "gain" : "";
        s += '<i class="' + (on + " " + g).trim() + '"></i>';
      }
      return s + "</div>";
    }

    /* [旧值 → 新值] 数值行 */
    function statRow(fn, from, to) {
      const a = fn(from), b = fn(to);
      if (!a) return "";
      return '<div class="stat">' + a.map((p, i) =>
        "<span>" + p[0] + " <b>" + p[1] + "</b> → <b>" + b[i][1] + "</b></span>"
      ).join("") + "</div>";
    }

    /* 卡片配色：武器跟随武器色（蓝/紫/青），专属技能跟随所属武器色，通用技能金色，被动银色 */
    const SILVER = "#cfd9e6";
    const GOLD = "#ffd76a";

    function cardCol(kind, id) {
      if (kind === "w") return WPN_BY_ID[id].col;
      if (kind === "s") {
        const S = SKILL_BY_ID[id];
        return S.fam ? FAMILIES[S.fam].col : GOLD;
      }
      return SILVER;
    }

    const FIRE = '<div class="fire"><i></i><i></i><i></i></div>';

    /* act：卡片点击动作，升级三选一用 "pick"，宝箱里借用被动卡时传 "chest" */
    function choiceHtml(c, act) {
      const A = act || "pick";
      const cc = cardCol(c.kind, c.id);
      if (c.kind === "w") {
        const W = WPN_BY_ID[c.id];
        const cur = wpnOf(c.id);
        const lv = Math.min((cur ? cur.lv : 0) + 1, MAX_LV);
        const atMax = lv >= MAX_LV;
        const badge = !cur ? '<b class="badge new">NEW</b>' : atMax ? '<b class="badge max">MAX</b>' : "";
        return '<div class="pickc' + (atMax ? " maxed" : "") + '" data-act="' + A + '" data-kind="w" data-id="' + c.id + '">' +
          badge + (atMax ? FIRE : "") +
          '<div class="ico" style="color:' + cc + ';border-color:' + cc + '55;background:' + cc + '18">' + svgo(W.svg) + "</div>" +
          statRow(WSTAT[W.id], cur ? cur.lv : 0, lv) +
          '<div class="pn" style="color:' + cc + '">' + W.nm + "</div>" +
          '<div class="pt">武器</div>' +
          '<div class="pd">' + W.desc(lv) + "</div>" +
          pipsHtml(cur ? cur.lv : 0, MAX_LV, lv, cc) + "</div>";
      }
      if (c.kind === "s") {
        const S = SKILL_BY_ID[c.id];
        const cur = skillOf(c.id);
        const lv = Math.min((cur ? cur.lv : 0) + 1, MAX_LV);
        const atMax = lv >= MAX_LV;
        const OF = S.fam ? FAMILIES[S.fam] : null;
        const badge = !cur ? '<b class="badge new">NEW</b>' : atMax ? '<b class="badge max">MAX</b>' : "";
        return '<div class="pickc' + (atMax ? " maxed" : "") + '" data-act="' + A + '" data-kind="s" data-id="' + c.id + '">' +
          badge + (atMax ? FIRE : "") +
          (OF ? '<b class="own" style="background:linear-gradient(180deg,' + OF.col + ',' + OF.col + 'bb)">' + OF.nm + "+ 专属</b>"
            : '<b class="own" style="background:linear-gradient(180deg,#ffe08a,#f0b64a)">通用</b>') +
          '<div class="ico" style="color:' + cc + ';border-color:' + cc + '55;background:' + cc + '18">' + svgo(S.svg) + "</div>" +
          statRow(S.stat, cur ? cur.lv : 0, lv) +
          '<div class="pn" style="color:' + cc + '">' + S.nm + "</div>" +
          '<div class="pt">' + (S.kind === "mount" ? "技能 · 普攻挂载" : S.kind === "pass" ? "技能 · 通用被动" : OF ? "技能 · 专属" : "技能 · 通用") + "</div>" +
          '<div class="pd">' + S.desc(lv) + (S.fam && !hasFam(S.fam)
            ? '<span class="needw">需要' + OF.nm + '武器才会触发</span>' : "") + "</div>" +
          pipsHtml(cur ? cur.lv : 0, MAX_LV, lv, cc) + "</div>";
      }
      const P = PAS_BY_ID[c.id];
      const cl = run.pas[c.id] || 0;
      const lv = Math.min(cl + 1, P.max);
      const maxed = lv >= P.max;
      const badge = cl === 0 ? '<b class="badge new">NEW</b>'
        : maxed ? '<b class="badge max">MAX</b>' : "";
      /* 进化前置被动（增幅/扩散/疾行）：标注它服务的武器族，用族色 */
      const EF = EVO_FAM[P.id] ? FAMILIES[EVO_FAM[P.id]] : null;
      const tipLv = Math.min(cl + 1, P.max);
      const famTip = EF
        ? '<div class="evoFam" style="color:' + EF.col + '">' + EF.nm + "武器进化前置条件 · " +
          (tipLv >= EVO_PAS_LV ? "LV " + EVO_PAS_LV + " ✓" : "需 " + EVO_PAS_LV + " 级") + "</div>"
        : "";
      return '<div class="pickc' + (maxed ? " maxed" : "") + '" data-act="' + A + '" data-kind="p" data-id="' + c.id + '">' +
        badge + (maxed ? FIRE : "") +
        '<div class="ico" style="color:' + cc + ';border-color:' + cc + '55;background:' + cc + '18">' + svgo(P.svg) + "</div>" +
        statRow(PSTAT[P.id], cl, lv) +
        '<div class="pn" style="color:' + cc + '">' + P.nm + "</div>" +
        '<div class="pt">被动</div>' +
        '<div class="pd">' + P.ds + famTip + "</div>" +
        pipsHtml(cl, P.max, lv, cc) + "</div>";
    }

    function openLevelUp() {
      if (run.ended) return;
      setState("level");
      const cs = rollChoices();
      if (!cs.length) { run.pendingLevels = 0; setState("run"); return; }
      const left = run.rerolls === undefined ? 3 : run.rerolls;
      showPanel(
        '<h1 class="sm">升级！选择一份力量</h1>' +
        '<p class="sub">等级 ' + run.level + " ｜ 待选强化 " + run.pendingLevels + " 次</p>" +
        '<div class="picks">' + cs.map(c => choiceHtml(c)).join("") + "</div>" +
        '<button class="refbtn" data-act="reroll"' + (left <= 0 ? " disabled" : "") + ">刷新选项（剩余 " + left + "）</button>",
        "pick"
      );
    }

    function takeChoice(kind, id) {
      if (kind === "w") {
        const cur = wpnOf(id);
        addWpn(id, cur ? cur.lv + 1 : 1);
      } else if (kind === "s") {
        const cur = skillOf(id);
        addSkill(id, cur ? cur.lv + 1 : 1);
      } else {
        const P = PAS_BY_ID[id];
        run.pas[id] = Math.min(P.max, (run.pas[id] || 0) + 1);
      }
      run.pendingLevels = Math.max(0, (run.pendingLevels || 1) - 1);
      sfx.pick();
      if (run.pendingLevels > 0) openLevelUp();
      else { hidePanel(); setState("run"); }
    }

    /* ---------- 宝箱：解锁新武器 / 进化（进化 = 武器 LV3 + 指定被动 3 级） ---------- */
    const EVO_LV = 3;
    const EVO_PAS_LV = 1;

    /* 被动 → 武器族：这三种被动就是三把武器的进化前置（power→脉冲 / area→暗黑 / haste→弧刃） */
    const EVO_FAM = {};
    for (const w of WEAPONS) if (w.evo && w.evo.need) EVO_FAM[w.evo.need] = w.fam;

    /* 进化需要的被动是否到位 */
    function evoNeedOk(w) {
      const W = WPN_BY_ID[w.id];
      return !W.evo.need || (run.pas[W.evo.need] || 0) >= EVO_PAS_LV;
    }
    function evoNeedName(w) {
      const W = WPN_BY_ID[w.id];
      const P = W.evo.need ? PAS_BY_ID[W.evo.need] : null;
      return P ? P.nm : "";
    }
    /* 等级够了、但缺被动的武器（宝箱页底部提示用） */
    function evoBlocked() {
      const out = [];
      for (const w of run.wpns) {
        if (w.evo || w.lv < EVO_LV) continue;
        if (!evoNeedOk(w)) out.push({ W: WPN_BY_ID[w.id], need: evoNeedName(w) });
      }
      return out;
    }

    /* 武器解锁的时间门槛：第 2 把 1:30 起，第 3 把 8:00 起 */
    function unlockGateAt() {
      return UNLOCK_GATE[run.wpns.length + 1] || 0;
    }
    /* 当前时间最多允许持有几把武器 */
    function unlockedSlots() {
      let n = 1;
      for (const k of [2, 3]) if (run.t >= (UNLOCK_GATE[k] || 0)) n = k;
      return Math.min(MAX_WPN, n);
    }
    /* 还没到时间、暂时解不了的武器（宝箱页提示用） */
    function unlockLocked() {
      if (run.wpns.length >= MAX_WPN) return [];
      const gate = unlockGateAt();
      if (run.t >= gate) return [];
      return WEAPONS.filter(w => !hasWpn(w.id));
    }

    function chestOpts() {
      const out = [];
      /* 新武器解锁：受时间门槛限制，一次只放出一把 */
      const room = unlockedSlots() - run.wpns.length;
      if (room > 0) {
        for (const w of WEAPONS) {
          if (hasWpn(w.id)) continue;
          if (out.filter(o => o.kind === "unlock").length >= room) break;
          out.push({ kind: "unlock", id: w.id });
        }
      }
      /* 已有武器进化：LV 3 以上、未进化、对应被动到 3 级；
         被动没到数就把这张被动卡放进宝箱（族色标注），别让玩家干看着进化不了 */
      for (const w of run.wpns) {
        if (w.evo || w.lv < EVO_LV) continue;
        const W = WPN_BY_ID[w.id];
        if (evoNeedOk(w)) { out.push({ kind: "evo", id: w.id }); continue; }
        if (W.evo.need && !out.some(o => o.kind === "p" && o.id === W.evo.need)) out.push({ kind: "p", id: W.evo.need });
      }
      /* 宝箱密钥：额外一张「已有武器等级 +1」的强化卡，保证这个强化永远有存在感 */
      if (save.up.key) {
        const cand = run.wpns.filter(w => w.lv < MAX_LV).sort((a, b) => a.lv - b.lv)[0];
        if (cand) out.push({ kind: "wup", id: cand.id });
      }
      return out;
    }

    function openChest() {
      setChest(null);
      sfx.chest();
      const opts = chestOpts();
      if (!opts.length) {
        const heal = Math.min(run.maxHp - player.hp, 2);
        player.hp += heal;
        run.coins += 40;
        const locked = unlockLocked();
        const tail = locked.length
          ? " · 第 " + (unlockedSlots() + 1) + " 把武器 " + fmtTime(unlockGateAt()) + " 后解锁"
          : "";
        toast("宝箱：+40 金币" + (heal > 0 ? " / +" + heal + " 生命" : "") + tail, "#ffd166");
        return;
      }
      setState("chest");
      const blocked = evoBlocked();
      const locked = unlockLocked();
      const lines = [];
      if (blocked.length) lines.push("进化还差被动：" + blocked.map(b => b.W.evo.nm + " ← " + b.need + " " + EVO_PAS_LV + " 级").join(" ｜ "));
      if (locked.length) lines.push("第 " + (run.wpns.length + 1) + " 把武器 " + fmtTime(unlockGateAt()) + " 后解锁：" + locked.map(w => w.nm).join(" / "));
      const hintTxt = lines.length ? '<p class="evohint">' + lines.join("<br>") + "</p>" : "";
      /* 宝箱选项数：默认 3，局外「宝箱密钥」+1 */
      const cnt = 3 + (save.up.key || 0);
      showPanel(
        '<h1 class="sm">宝箱 · 进化</h1><p class="sub">解锁新武器，或让 LV ' + EVO_LV + " 以上 + 对应被动 " + EVO_PAS_LV + " 级的武器进化</p>" +
        '<div class="picks' + (opts.length > 3 ? " four" : "") + '">' +
        opts.slice(0, cnt).map(o => {
          /* 宝箱密钥：已有武器等级 +1 */
          if (o.kind === "wup") {
            const W = WPN_BY_ID[o.id];
            const w = run.wpns.find(x => x.id === o.id);
            return '<div class="pickc" data-act="chest" data-kind="wup" data-id="' + W.id + '">' +
              '<b class="badge new">UP</b>' +
              '<div class="ico" style="color:' + W.col + ';border-color:' + W.col + '55;background:' + W.col + '18">' + svgo(W.svg) + "</div>" +
              '<div class="stat">等级 <b>' + w.lv + " → " + (w.lv + 1) + "</b></div>" +
              '<div class="pn" style="color:' + W.col + '">' + W.nm + "</div>" +
              '<div class="pt">武器强化</div>' +
              '<div class="pd">' + W.desc(Math.min(MAX_LV, w.lv + 1)) + "</div>" +
              pipsHtml(MAX_LV, w.lv + 1, undefined, W.col) + "</div>";
          }
          /* 前置被动没到级：宝箱直接放出这张被动卡（族色标注） */
          if (o.kind === "p") return choiceHtml(o, "chest");
          const W = WPN_BY_ID[o.id];
          const isEvo = o.kind === "evo";
          const nm = isEvo ? W.evo.nm : W.nm;
          const ds = isEvo ? W.evo.ds : W.desc(1);
          const stat = isEvo ? "" : '<div class="stat">未拥有 <b>→ 解锁</b></div>';
          const need = isEvo && W.evo.need ? '<div class="evoNeed">' + evoNeedName(o) + " " + EVO_PAS_LV + " 级 ✓</div>" : "";
          return '<div class="pickc' + (isEvo ? " evo maxed" : "") + '" data-act="chest" data-kind="' + o.kind + '" data-id="' + W.id + '">' +
            (isEvo ? '<b class="badge max">EVO</b>' : '<b class="badge new">NEW</b>') +
            (isEvo ? FIRE : "") +
            '<div class="ico" style="color:' + W.col + ';border-color:' + W.col + '55;background:' + W.col + '18">' + svgo(W.svg) + "</div>" +
            stat +
            '<div class="pn" style="color:' + W.col + '">' + nm + "</div>" +
            '<div class="pt">' + (isEvo ? W.nm + " · 进化" : "解锁武器") + "</div>" +
            '<div class="pd">' + ds + "</div>" +
            need +
            (isEvo ? pipsHtml(MAX_LV, MAX_LV, undefined, W.col) : "") + "</div>";
        }).join("") + "</div>" + hintTxt,
        "pick"
      );
    }

    function takeChest(kind, id) {
      const W = WPN_BY_ID[id];
      sfx.pick();
      save.tot.chest++;
      if (kind === "wup") {
        /* 宝箱密钥：已有武器等级 +1 */
        const w = wpnOf(id);
        if (w && w.lv < MAX_LV) {
          w.lv++;
          burst(player.x, player.y, 30, W.col, 360, 3.4, .7, 1);
          sfx.chest();
          toast("武器强化：" + W.nm + " LV " + w.lv, W.col);
        }
      } else if (kind === "p") {
        /* 宝箱里放出的进化前置被动 */
        const P = PAS_BY_ID[id];
        run.pas[id] = Math.min(P.max, (run.pas[id] || 0) + 1);
        toast("被动：" + P.nm + " LV " + run.pas[id], SILVER);
      } else if (kind === "unlock") {
        addWpn(id, 1);
        burst(player.x, player.y, 40, W.col, 420, 4, .8, 1);
        cam.shake = 9;
        sfx.win();
        toast("解锁：" + W.nm, W.col);
        /* 之前升过级但没触发的专属技能，现在开始生效（按族判定） */
        const fam = W.fam;
        const newly = fam ? run.skills.filter(s => SKILL_BY_ID[s.id].fam === fam) : [];
        if (newly.length) setTimeout(() => toast("专属技能开始生效：" + newly.map(s => SKILL_BY_ID[s.id].nm).join(" · "), W.col), 760);
      } else {
        const cur = wpnOf(id);
        if (cur && !evoNeedOk(cur)) {
          sfx.nope();
          toast("还差被动【" + evoNeedName(cur) + "】" + EVO_PAS_LV + " 级（当前 " + (run.pas[WPN_BY_ID[id].evo.need] || 0) + " 级）", "#ffb27d");
          return;
        }
        if (cur) {
          cur.evo = true;
          cur.t = 0;
          save.tot.evo++;
          burst(player.x, player.y, 40, W.col, 420, 4, .8, 1);
          cam.shake = 10;
          sfx.win();
          toast("进化：" + W.evo.nm, W.col);
        }
      }
      hidePanel();
      setState("run");
      updateHud();
    }

    /* ---------- 暂停 / 结算 ---------- */
    /* 标题页也能进设置，那时没有 run，全部取兜底值 */
    function pauseHtml() {
      const R = run || { t: 0, level: 1, kills: 0, coins: 0 };
      return '<h1 class="sm">暂停</h1>' +
        setRows() +
        '<div class="stat"><span>生存</span><b>' + fmtTime(R.t) + "</b></div>" +
        '<div class="stat"><span>等级</span><b>LV ' + R.level + "</b></div>" +
        '<div class="stat"><span>击杀</span><b>' + R.kills + "</b></div>" +
        '<div class="stat"><span>金币</span><b>◇ ' + R.coins + "</b></div>" +
        '<div class="btnrow">' +
        '<button class="mbtn" data-act="resume">继续</button>' +
        '<button class="mbtn alt" data-act="quit">放弃本局</button>' +
        "</div>" +
        '<button class="linkbtn" data-act="title">返回标题</button>';
    }

    /* 标题页「设置」：只有四项开关，没有局内数据 */
    function settingsHtml() {
      return '<h1 class="sm">设置</h1>' +
        setRows() +
        '<button class="mbtn alt" data-act="back">返回</button>';
    }

    function openPause() {
      setState("paused");
      showPanel(pauseHtml(), "wide");
    }

    function togglePause() {
      if (state === "run") openPause();
      else if (state === "paused") {
        hidePanel();
        setState("run");
      }
    }

    function commitRun() {
      const gained = run.coins;
      /* 破纪录判定按「当前地图 : 当前难度」这一份记录来比，写之前先判 */
      const b = bestRec();
      const dmgNow = Math.round(run.dmg);
      const rec = {
        time: run.t > (b.t || 0),
        kill: run.kills > (b.k || 0),
        coin: gained > (b.c || 0),
        dmg: dmgNow > (b.d || 0),
        combo: run.comboMax > (b.m || 0),
      };
      b.t = Math.max(b.t || 0, run.t);
      b.k = Math.max(b.k || 0, run.kills);
      b.c = Math.max(b.c || 0, gained);
      b.d = Math.max(b.d || 0, dmgNow);
      b.m = Math.max(b.m || 0, run.comboMax);
      save.coins += gained;
      /* 标题页显示的是「全地图 / 全难度」的总最佳 */
      save.bestTime = Math.max(save.bestTime || 0, run.t);
      save.bestKill = Math.max(save.bestKill || 0, run.kills);
      save.bestCoin = Math.max(save.bestCoin || 0, gained);
      save.bestDmg = Math.max(save.bestDmg || 0, dmgNow);
      save.bestCombo = Math.max(save.bestCombo || 0, run.comboMax);
      save.bestWpns = Math.max(save.bestWpns || 0, run.wpns.length);
      save.bestSkills = Math.max(save.bestSkills || 0, run.skills.length);
      /* 成就累计值：只在这里结算，避免中途反复写档 */
      save.tot.kills += run.kills;
      save.tot.coin += gained;
      save.tot.runs += 1;
      /* 彩蛋：单局 3 分钟一次没受伤 / 通关 */
      if (run.t >= 180 && run.hits === 0) save.easter.noHit = 1;
      if (run.won) save.easter.win = 1;
      persist();
      return { gained, rec };
    }

    /* 结算行右侧的小字：破纪录标「新纪录」，否则显示历史最佳 */
    function bestTag(isNew, txt) {
      return isNew
        ? '<em class="hot">新纪录</em>'
        : '<em>' + txt + '</em>';
    }

    function resultPanel(winTag, title) {
      const res = commitRun();
      const gained = res.gained;
      const bonus = winTag ? 60 + Math.floor(run.t / 60) * 10 : 0;
      if (bonus) save.coins += bonus, persist();
      const b = bestRec();
      showPanel(
        '<h1 class="sm">' + title + "</h1>" +
        '<p class="mapds">' + mapOf().nm + " · " + diffOf().nm + "</p>" +
        '<div class="stat"><span>生存时间' + bestTag(res.rec.time, "最佳 " + fmtTime(b.t)) + "</span><b>" + fmtTime(run.t) + "</b></div>" +
        '<div class="stat"><span>等级</span><b>LV ' + run.level + "</b></div>" +
        '<div class="stat"><span>击杀' + bestTag(res.rec.kill, "最佳 " + b.k) + "</span><b>" + run.kills + "</b></div>" +
        '<div class="stat"><span>总伤害' + bestTag(res.rec.dmg, "最佳 " + b.d) + "</span><b>" + Math.round(run.dmg) + "</b></div>" +
        '<div class="stat"><span>承伤次数</span><b>' + run.hits + "</b></div>" +
        '<div class="stat"><span>最长连杀' + bestTag(res.rec.combo, "最佳 " + b.m) + "</span><b>" + run.comboMax + "</b></div>" +
        '<div class="stat"><span>本局金币</span><b>◇ ' + gained + "</b></div>" +
        (bonus ? '<div class="stat"><span>撤离奖励</span><b>◇ ' + bonus + "</b></div>" : "") +
        '<div class="btnrow">' +
        '<button class="mbtn" data-act="retry">再来一局</button>' +
        '<button class="mbtn alt" data-act="title">返回标题</button>' +
        "</div>",
        "wide"
      );
    }

    function gameOver() {
      if (run.ended) return;
      run.ended = true;
      setState("over");
      cam.shake = 22;
      burst(player.x, player.y, 60, "#ff5c7a", 500, 4, 1, 1);
      sfx.hurt();
      resultPanel(false, "作战失败");
    }

    function win() {
      if (run.ended) return;
      run.ended = true;
      run.won = true;
      setState("win");
      sfx.win();
      resultPanel(true, "撤离成功");
    }

    function startRun(charId) {
      audio();
      resetRun(charId);
      hudCache = {};
      hidePanel();
      setState("run");
      setPaused(false);
      updateHud();
      if (ui.stage) ui.stage.textContent = mapOf().nm + " · " + diffOf().nm;
      toast("生存 15:00 ｜ 击杀终局 Boss 可开启裂隙", "#9fe8ff");
      const cc = run.char, cw = WPN_BY_ID[cc.weapon];
      if (cc && cw) toast(cc.nm + " · 初始【" + cw.nm + "】", cc.col);
    }

    /* ---------- 面板事件 ---------- */
    /* 音量滑杆：拖动实时生效，松手播一声做试听 */
    ui.panel.addEventListener("input", e => {
      const el = e.target.closest("[data-vol]");
      if (!el) return;
      audio();
      setVol(el.dataset.vol, +el.value / 100);
    });
    ui.panel.addEventListener("change", e => {
      const el = e.target.closest("[data-vol]");
      if (!el) return;
      audio();
      if (el.dataset.vol === "s") sfx.coin(); else sfx.level();
    });

    ui.panel.addEventListener("click", e => {
      const el = e.target.closest("[data-act]");
      if (!el) return;
      const act = el.dataset.act;
      /* 所有面板按钮都带点击音；选卡 / 宝箱用更特殊的音 */
      audio();
      if (act !== "pick" && act !== "chest") sfx.ui();
      if (act === "start") startRun(pickedChar);
      else if (act === "shop") openShop();
      else if (act === "codex") openCodex();
      else if (act === "ach") openAch();
      else if (act === "settings") openSettings();
      else if (act === "codextab") { codexTab = el.dataset.tab; openCodex(); }
      else if (act === "achtake") takeAch(el.dataset.id);
      else if (act === "map") {
        if (save.map !== el.dataset.id) { save.map = el.dataset.id; persist(); openTitle(); }
      }
      else if (act === "diff") {
        const d = +el.dataset.id;
        if ((save.diff | 0) !== d) { save.diff = d; persist(); openTitle(); }
      }
      else if (act === "back") openTitle();
      else if (act === "char") {
        const id = el.dataset.id;
        if (save.chars[id]) { pickedChar = id; save.pick = id; persist(); openTitle(); }
        else {
          const c = CHAR_BY_ID[id];
          if (save.coins >= c.cost) {
            save.coins -= c.cost;
            save.chars[id] = 1;
            pickedChar = id;
            save.pick = id;
            persist();
            sfx.chest();
            openTitle();
          } else {
            el.style.borderColor = "#ff5c7a";
            setTimeout(() => el.style.borderColor = "", 400);
            sfx.nope();
          }
        }
      }
      else if (act === "buy") {
        const key = el.dataset.key, m = META_BY_KEY[key];
        const lv = save.up[key] || 0;
        const cost = m.costs[lv];
        if (lv < m.max && save.coins >= cost) {
          save.coins -= cost;
          save.up[key] = lv + 1;
          persist();
          sfx.coin();
          openShop();
        } else if (lv < m.max) {
          sfx.nope();
          const card = el.closest(".mcard");
          if (card) {
            card.style.borderColor = "#ff5c7a";
            setTimeout(() => card.style.borderColor = "", 400);
          }
        }
      }
      else if (act === "shopcat") { shopCat = el.dataset.cat; sfx.shoot(); openShop(); }
      else if (act === "pick") takeChoice(el.dataset.kind, el.dataset.id);
      else if (act === "reroll") {
        if (state === "level" && (run.rerolls || 0) > 0) {
          run.rerolls--;
          sfx.shoot();
          openLevelUp();
        }
      }
      else if (act === "chest") takeChest(el.dataset.kind, el.dataset.id);
      else if (act === "resume") togglePause();
      else if (act === "mute") {
        setMuted(!muted);
        if (!muted) { audio(); sfx.coin(); }
        showPanel(state === "set" ? settingsHtml() : pauseHtml(), "wide");
      }
      else if (act === "dmg") {
        setDmg(!dmgOn);
        showPanel(state === "set" ? settingsHtml() : pauseHtml(), "wide");
        updateHud();
      }
      else if (act === "quit") { commitRun(); openTitle(); }
      else if (act === "retry") startRun(run ? run.charId : pickedChar);
      else if (act === "title") openTitle();
    });

export { EVO_LV, EVO_PAS_LV, FIRE, GOLD, SILVER, cardCol, chestOpts, choiceHtml, commitRun, drawMinimap, fmtTime, gameOver, hidePanel, hudCache, initPicked, mmCtx, mmScale, openChest, openLevelUp, openPause, openShop, openTitle, pauseHtml, pickInKind, pickedChar, pipsHtml, resultPanel, rollChoices, setFloats, setHud, showPanel, startRun, statRow, svgo, takeChest, takeChoice, togglePause, ui, updateHud, win };





