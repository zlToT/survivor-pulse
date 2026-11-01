import { boss, horde, skillOf, spawnBoss, spawnElite, surge, wpnOf } from "./world.js";

/* ================= DATA ================= */
/* ================= DATA ================= */
    const RUN_LEN = 900;            // 15:00
    const MAX_WPN = 3;              // 三把武器：脉冲 / 暗黑 / 弧刃
    const MAX_LV = 5;               // 武器与技能的等级上限（与被动一致）
    const XP_TABLE = [7, 9, 13, 17, 21, 26, 31, 38, 44, 52, 60, 69, 78];

    /* ---------- 武器族：技能归属的最小单位（可跨武器复用） ---------- */
    const FAMILIES = {
      pulse: { id: "pulse", nm: "脉冲族", col: "#4fc3ff" },
      dark:  { id: "dark",  nm: "暗黑族", col: "#a78bfa" },
      blade: { id: "blade", nm: "弧刃族", col: "#6ee7a8" },
    };

    /* 第 N 把武器最早可以在第几秒通过宝箱解锁（1 把在身 → 找第 2 把 …） */
    const UNLOCK_GATE = { 2: 90, 3: 480 };

    /* ---------- 局外永久强化 ---------- */
    const META = [
      /* 攻击型 */
      { key: "dmg", cat: "atk", nm: "火控矩阵", ds: "全局伤害 +6%", max: 5, costs: [60, 120, 200, 300, 420], col: "#ffa94d", ico: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5.2 5.2l2.8 2.8M16 16l2.8 2.8M18.8 5.2L16 8M8 16l-2.8 2.8"/>' },
      { key: "crit", cat: "atk", nm: "瞄准镜", ds: "暴击率 +8%", max: 5, costs: [110, 200, 310, 450, 620], col: "#ff7a9c", ico: '<circle cx="12" cy="12" r="7.4"/><circle cx="12" cy="12" r="2.1"/><path d="M12 1.8v4.2M12 18v4.2M1.8 12H6M18 12h4.2"/>' },
      { key: "critd", cat: "atk", nm: "弱点解析", ds: "暴击伤害 +20%", max: 7, costs: [130, 240, 380, 560, 780, 1060, 1380], col: "#ff5c8a", ico: '<path d="M12 2.6l2.9 6.1 6.7.9-4.9 4.6 1.2 6.6L12 17.7l-5.9 3.1 1.2-6.6L2.4 9.6l6.7-.9z"/>' },
      { key: "pierce", cat: "atk", nm: "破甲弹头", ds: "普攻穿透 +1", max: 2, costs: [150, 320], col: "#ff8a5c", ico: '<path d="M4 20L16 8"/><path d="M14 4l6 0 0 6"/><path d="M4 14v6h6"/>' },
      { key: "proj", cat: "atk", nm: "扩容弹匣", ds: "普攻弹道 +1", max: 2, costs: [200, 420], col: "#ffb066", ico: '<rect x="4" y="9" width="12" height="6" rx="2"/><path d="M16 10h3l2 2-2 2h-3"/>' },
      { key: "aspd", cat: "atk", nm: "过载核心", ds: "攻击速度 +6%", max: 5, costs: [90, 180, 280, 400, 540], col: "#ff9f45", ico: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>' },

      /* 防御型 */
      { key: "hp", cat: "def", nm: "装甲核心", ds: "最大生命 +1", max: 3, costs: [80, 160, 260], col: "#ff6b81", ico: '<path d="M12 3l7.5 4.5v9L12 21 4.5 16.5v-9z"/><path d="M12 9v6M9 12h6"/>' },
      { key: "revive", cat: "def", nm: "复活协议", ds: "每局 1 次免死", max: 1, costs: [500], col: "#7ef7c8", ico: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>' },
      { key: "armor", cat: "def", nm: "纳米镀层", ds: "受到伤害 -6%", max: 5, costs: [80, 170, 260, 360, 480], col: "#7dd3fc", ico: '<path d="M12 3l7.5 4.5v6c0 4.6-3.1 7.4-7.5 9-4.4-1.6-7.5-4.4-7.5-9v-6z"/><path d="M9 12l2.2 2.2L15.5 10"/>' },
      { key: "regen", cat: "def", nm: "再生血清", ds: "每 10 秒回复 1 点生命", max: 3, costs: [140, 260, 400], col: "#86efac", ico: '<path d="M12 3v6"/><path d="M8 9h8l2 5a6 6 0 01-12 0z"/><path d="M10.5 15h3"/>' },
      { key: "dodge", cat: "def", nm: "闪避矩阵", ds: "冲刺无敌帧 +0.15 秒", max: 2, costs: [180, 360], col: "#a5b4fc", ico: '<path d="M5 12h9M10 7l5 5-5 5"/><path d="M18 5v14"/>' },
      { key: "guard", cat: "def", nm: "应激护盾", ds: "受击后减伤 30%（1.5 秒）", max: 2, costs: [220, 440], col: "#c4b5fd", ico: '<path d="M12 3l7.5 4.5v6c0 4.6-3.1 7.4-7.5 9-4.4-1.6-7.5-4.4-7.5-9v-6z"/><path d="M12 7.4v4.6M12 14.8v1.4"/>' },

      /* 功能型 */
      { key: "spd", cat: "util", nm: "推进器", ds: "移动速度 +5%", max: 5, costs: [50, 100, 170, 250, 350], col: "#6ce0ff", ico: '<path d="M5 6l7 6-7 6M13 6l7 6-7 6"/>' },
      { key: "xp", cat: "util", nm: "数据链路", ds: "经验获取 +10%", max: 4, costs: [80, 150, 240, 350], col: "#4fc3ff", ico: '<rect x="4.5" y="4.5" width="15" height="15" rx="2.5"/><rect x="9" y="9" width="6" height="6" rx="1"/>' },
      { key: "luck", cat: "util", nm: "幸运符", ds: "幸运 +1（掉落 / 宝箱）", max: 3, costs: [120, 220, 340], col: "#ffd76a", ico: '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>' },
      { key: "magnet", cat: "util", nm: "磁力线圈", ds: "拾取范围 +30%", max: 3, costs: [90, 170, 260], col: "#b18cff", ico: '<path d="M6 4v8a6 6 0 0012 0V4"/><path d="M6 8h4M14 8h4"/>' },
      { key: "cdr", cat: "util", nm: "超频单元", ds: "冲刺冷却 -10%", max: 3, costs: [110, 200, 300], col: "#5eead4", ico: '<path d="M20.4 12a8.4 8.4 0 1 1-2.6-6.1"/><path d="M20.4 3.6v4.8h-4.8"/><circle cx="12" cy="12" r="2.2"/>' },
      { key: "wlvl", cat: "util", nm: "武器预热", ds: "开局武器 +1 级", max: 2, costs: [200, 400], col: "#8ab4f8", ico: '<path d="M12 4v12M7 9l5-5 5 5M5 20h14"/>' },
      { key: "coin", cat: "util", nm: "掠夺芯片", ds: "金币获取 +20%", max: 4, costs: [70, 140, 230, 340], col: "#f7f15a", ico: '<path d="M12 3l8 9-8 9-8-9z"/><path d="M12 8l3.5 4-3.5 4-3.5-4z"/>' },
      { key: "scdr", cat: "util", nm: "技能校准", ds: "技能冷却 -8%", max: 3, costs: [150, 300, 460], col: "#67e8f9", ico: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.5V12l3.2 2"/>' },
      { key: "key", cat: "util", nm: "宝箱密钥", ds: "宝箱多 1 个选项", max: 1, costs: [420], col: "#fbbf24", ico: '<rect x="4" y="10" width="16" height="9" rx="2.5"/><path d="M8 10V7.5a4 4 0 018 0V10"/>' },
      { key: "hunter", cat: "util", nm: "精英猎手", ds: "精英/Boss 多掉 1 个补给", max: 2, costs: [260, 520], col: "#f472b6", ico: '<path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.4l6-.8z"/>' },
    ];

    /* 局外强化分类（商店单选） */
    const META_CATS = [
      { id: "atk", nm: "攻击型", ds: "伤害与输出手段", col: "#ff9f45" },
      { id: "def", nm: "防御型", ds: "生命与减伤", col: "#7dd3fc" },
      { id: "util", nm: "功能型", ds: "节奏与收益", col: "#a78bfa" },
    ];
    const META_BY_KEY = {};
    META.forEach(m => META_BY_KEY[m.key] = m);

    /* ---------- 角色（固定一把武器，另两把靠宝箱解锁） ---------- */
    const CHARS = [
      { id: "tri", nm: "蓝脉", col: "#4fc3ff", sides: 3, icon: "▲", svg: '<path d="M12 3.6l8.4 15.2H3.6z"/><circle cx="12" cy="13.4" r="1.9"/>', weapon: "pulse", hp: 0, spd: 1, area: 1, dmg: 1, cost: 0, tr: { crit: .05 }, trait: "超感 · 暴击率 +5%", ds: "远程点射 · 暴击流\n初始武器【脉冲】" },
      { id: "core", nm: "紫暗", col: "#a78bfa", sides: 6, icon: "◎", svg: '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="6.6"/><path d="M12 2.4a9.6 9.6 0 019.6 9.6"/>', weapon: "dark", hp: 0, spd: 1, area: 1, dmg: 1, cost: 300, tr: { taken: .9 }, trait: "坚壁 · 受到伤害 -10%", ds: "法术压制 · 区域流\n初始武器【暗黑】" },
      { id: "arc", nm: "绿弧", col: "#6ee7a8", sides: 4, icon: "⌁", svg: '<path d="M13.4 2.4L5 13.6h5.6L9.4 21.6 18.8 10.4h-5.6z"/>', weapon: "blade", hp: 0, spd: 1, area: 1, dmg: 1, cost: 400, tr: { spd: 1.08 }, trait: "疾风 · 移动速度 +8%", ds: "近身刀光 · 高频流\n初始武器【弧刃】" },
    ];
    const CHAR_BY_ID = {};
    CHARS.forEach(c => CHAR_BY_ID[c.id] = c);

    /* ---------- 武器 3 把：玩家自己释放的普攻动作 ---------- */
    const WEAPONS = [
      {
        id: "pulse", nm: "脉冲", icon: "◈", col: "#4fc3ff", cat: "wpn", fam: "pulse",
        svg: '<path d="M4 7.6l6 4.4-6 4.4"/><path d="M12.4 7.6l6 4.4-6 4.4"/>',
        aspd: lv => 3.5 + 1.2 * lv,                 /* 每秒攻击次数 */
        dmg: lv => 1.8 + .55 * lv,
        desc: lv => "朝最近敌人点射，攻速 " + (3.5 + 1.2 * lv).toFixed(1) + " 次/秒，伤害 " + (1.8 + .55 * lv).toFixed(1),
        evo: { nm: "千针", need: "power", ds: "普攻弹道数 ×2（永久）· 必定穿透 · 单发伤害 -30%" },
      },
      {
        id: "dark", nm: "暗黑", icon: "◎", col: "#a78bfa", cat: "wpn", fam: "dark",
        svg: '<circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="12" r="6.4"/><path d="M12 2.3a9.7 9.7 0 019.7 9.7"/><path d="M2.3 12A9.7 9.7 0 0112 2.3" opacity=".55"/>',
        aspd: lv => .5 + .26 * lv,
        dmg: lv => 2.2 + .9 * lv,
        desc: lv => "推出紫黑球体，飞满射程才消散；扫到的敌人各掉一次血，攻速 " + (.5 + .26 * lv).toFixed(2) + " 次/秒，伤害 " + (2.2 + .9 * lv).toFixed(1),
        evo: { nm: "奇点球", need: "area", ds: "球体半径 +40% · 命中减速 40% · 返程再判一次二段伤害" },
      },
      {
        id: "blade", nm: "弧刃", icon: "✦", col: "#6ee7a8", cat: "wpn", fam: "blade",
        svg: '<path d="M4.6 17.6A11.6 11.6 0 0119.4 9.2"/><path d="M4.6 17.6l-1.9 1.7 3.6.6"/><path d="M12 3.4l2 6.6"/>',
        aspd: lv => 1.0 + .45 * lv,
        dmg: lv => 5.0 + 1.9 * lv,
        desc: lv => "朝移动方向挥出 90° 刀光，每个敌人只判 1 次，攻速 " + (1.0 + .45 * lv).toFixed(2) + " 次/秒，伤害 " + (5.0 + 1.9 * lv).toFixed(1),
        evo: { nm: "双月", need: "haste", ds: "左右两侧各补一刀 120° 弧（半径 +28%）· 伤害 +40%" },
      },
    ];
    const WPN_BY_ID = {};
    WEAPONS.forEach(w => WPN_BY_ID[w.id] = w);

    /* 弹道数：1（自身） + 脉冲炮等级（每级 +1）；千针进化后整体翻倍，且必定穿透 */
    function cannonLv() {
      const c = typeof skillOf === "function" ? skillOf("pulseCannon") : null;
      return c ? c.lv : 0;
    }
    function pulsePattern() {
      const w = typeof wpnOf === "function" ? wpnOf("pulse") : null;
      const n0 = 1 + cannonLv();
      return w && w.evo ? n0 * 2 : n0;
    }
    function canonCount(lv) { return pulsePattern(); }
    function canonDmg(lv) { return 3.0 + 1.2 * lv; }
    function pulseEvo() { const w = typeof wpnOf === "function" ? wpnOf("pulse") : null; return !!(w && w.evo); }

    /* ---------- 技能 3×3：归属武器的专有技（kind: cd 冷却技 / mount 普攻挂载） ---------- */
    const SKILLS = [
      {
        id: "pulseCannon", nm: "脉冲炮", fam: "pulse", kind: "mount", icon: "»", col: "#4fc3ff",
        svg: '<path d="M3.6 8l6.4 4-6.4 4"/><path d="M12 8l6.4 4-6.4 4"/><path d="M20 6.6v10.8" stroke-dasharray="2 3"/>',
        desc: lv => "普攻直接多射出 " + lv + " 道（不穿透）；千针后随弹道数一起翻倍",
        stat: lv => [["弹道 +", lv], ["合计弹道", pulsePattern()], ["穿透", pulseEvo() ? "1（千针）" : "0"]],
      },
      {
        id: "chain", nm: "连锁闪电", fam: "pulse", kind: "cd", icon: "⌁", col: "#7dd3fc",
        svg: '<path d="M13.6 2.4L5.2 13.6h5.5l-1.2 8L18.8 10.4h-5.5z"/>',
        cd: lv => Math.max(.9, 2.8 - .15 * lv),
        desc: lv => "电弧在敌人间跳跃 " + (2 + lv) + " 次，每跳伤害 " + (7 + 3 * lv),
        stat: lv => [["跳跃", 2 + lv], ["伤害", 7 + 3 * lv], ["冷却", Math.max(.9, 2.8 - .15 * lv).toFixed(2) + "s"]],
      },
      {
        id: "cmissile", nm: "暴击飞弹", fam: "pulse", kind: "mount", icon: "➶", col: "#7fd4ff",
        svg: '<path d="M3 20l6.5-2.2L20 7.4 16.6 4 6.1 14.6z"/><path d="M14.6 6l3.4 3.4"/>',
        desc: lv => "普攻时暴击时发射一枚飞弹，弧线回击该目标，伤害为触发伤害的 " + Math.round((.5 + .05 * lv) * 100) + "%",
        stat: lv => [["回击伤害", Math.round((.5 + .05 * lv) * 100) + "%"]],
      },
      {
        id: "well", nm: "引力井", fam: "dark", kind: "cd", icon: "◎", col: "#a78bfa",
        svg: '<circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="12" r="6.4"/><path d="M12 2.3a9.7 9.7 0 019.7 9.7"/><path d="M2.3 12A9.7 9.7 0 0112 2.3" opacity=".55"/>',
        cd: lv => Math.max(1.2, 4.6 - .35 * lv),
        desc: lv => "在敌群生成半径 " + Math.round(68 + 14 * lv) + " 的引力井，持续拉拽并伤害 " + (1.2 + .8 * lv).toFixed(1) + "/跳",
        stat: lv => [["半径", Math.round(68 + 14 * lv)], ["伤害", (1.2 + .8 * lv).toFixed(1)], ["冷却", Math.max(1.2, 4.6 - .35 * lv).toFixed(1) + "s"]],
      },
      {
        id: "torpedo", nm: "湮灭鱼雷", fam: "dark", kind: "cd", icon: "◍", col: "#c4b5fd",
        svg: '<path d="M12 2.6c3.1 2.7 4.8 6.2 4.8 9.9L12 16.2l-4.8-3.7c0-3.7 1.7-7.2 4.8-9.9z"/><path d="M12 16.2V21M9.2 18.4L12 21l2.8-2.6"/>',
        cd: lv => Math.max(1.2, 4.2 - .3 * lv),
        desc: lv => "发射 " + (1 + Math.floor(lv / 2)) + " 枚追踪鱼雷，命中坍缩爆炸，伤害 " + (14 + 6 * lv),
        stat: lv => [["数量", 1 + Math.floor(lv / 2)], ["伤害", 14 + 6 * lv], ["冷却", Math.max(1.2, 4.2 - .3 * lv).toFixed(1) + "s"]],
      },
      {
        id: "orbital", nm: "轨道打击", fam: "dark", kind: "cd", icon: "◉", col: "#b9a4ff",
        svg: '<circle cx="12" cy="12" r="2.6"/><ellipse cx="12" cy="12" rx="9.3" ry="4.5" transform="rotate(-32 12 12)"/><path d="M12 2.4v3.2M12 18.4v3.2"/>',
        cd: lv => Math.max(1.2, 4.8 - .3 * lv),
        desc: lv => "锁定 " + (1 + lv) + " 个敌人天降光柱，半径 " + Math.round(78 + 8 * lv) + "，伤害 " + (9 + 4 * lv),
        stat: lv => [["目标", 1 + lv], ["半径", Math.round(78 + 8 * lv)], ["伤害", 9 + 4 * lv]],
      },
      {
        id: "gale", nm: "疾风斩", fam: "blade", kind: "cd", icon: "≋", col: "#7ef7c8",
        svg: '<path d="M3 9.6h11.4a3.4 3.4 0 10-3.4-3.4"/><path d="M3 14.4h8.6a3 3 0 11-3 3"/><path d="M3 19h6.2"/>',
        cd: lv => Math.max(.7, 2.2 - .12 * lv),
        desc: lv => "朝移动方向甩出旋风，飞行 " + Math.round(480 + 40 * lv) + " 后消散；穿过的敌人各受一次伤害 " + (3.6 + 1.5 * lv).toFixed(1),
        stat: lv => [["伤害", (3.6 + 1.5 * lv).toFixed(1)], ["射程", Math.round(480 + 40 * lv)], ["冷却", Math.max(.7, 2.2 - .12 * lv).toFixed(1) + "s"]],
      },
      {
        id: "boomerang", nm: "回旋斩", fam: "blade", kind: "cd", icon: "↺", col: "#52d6a0",
        svg: '<path d="M6 18a8.4 8.4 0 1112-7.6"/><path d="M18 6.2l.4 4.6-4.4-.6"/><circle cx="12" cy="12" r="1.8"/>',
        cd: lv => Math.max(.9, 3 - .14 * lv),
        desc: lv => "向前抛出刀身，飞行 " + Math.round(320 + 30 * lv) + " 后回旋返回；去、回各判 1 次，伤害 " + (4.5 + 1.6 * lv).toFixed(1),
        stat: lv => [["伤害", (4.5 + 1.6 * lv).toFixed(1)], ["射程", Math.round(320 + 30 * lv)], ["冷却", Math.max(.9, 3 - .14 * lv).toFixed(1) + "s"]],
      },
      {
        id: "dual", nm: "双剑滑斩", fam: "blade", kind: "mount", icon: "⇄", col: "#8be0c0",
        svg: '<path d="M4 20L15.6 8.4"/><path d="M20 20L8.4 8.4"/><path d="M18.2 4.2l1.6 1.6-1.6 1.6M5.8 4.2L4.2 5.8l1.6 1.6"/>',
        desc: lv => "普攻时朝反方向再次攻击，反向刀光伤害为普攻的 " + Math.round((.6 + .08 * lv) * 100) + "%",
        stat: lv => [["反向伤害", Math.round((.6 + .08 * lv) * 100) + "%"]],
      },
      /* ---------- 通用技能（fam 为空：任何武器都能刷到） ---------- */
      {
        id: "nova", nm: "冲击新星", fam: null, kind: "cd", icon: "✦", col: "#ffd76a",
        svg: '<circle cx="12" cy="12" r="2.6"/><path d="M12 2v4.4M12 17.6V22M2 12h4.4M17.6 12H22M4.9 4.9l3.1 3.1M16 16l3.1 3.1M19.1 4.9L16 8M8 16l-3.1 3.1"/>',
        cd: lv => Math.max(1, 3.6 - .25 * lv),
        desc: lv => "以自身为中心释放半径 " + Math.round(96 + 24 * lv) + " 的冲击波，伤害 " + (2.4 + 1.3 * lv).toFixed(1) + "，击退",
        stat: lv => [["半径", Math.round(96 + 24 * lv)], ["伤害", (2.4 + 1.3 * lv).toFixed(1)], ["冷却", Math.max(1, 3.6 - .25 * lv).toFixed(1) + "s"]],
      },
      {
        id: "meteor", nm: "陨石天罚", fam: null, kind: "cd", icon: "☄", col: "#ffb066",
        svg: '<path d="M15.2 3.4l4.6 1.6-1.6 4.6"/><path d="M13.6 8.2l-3.8 3.8"/><circle cx="7.4" cy="13.4" r="2.6"/><path d="M5.4 17.4l-2.8 2.6M10.6 19.4l-1 2.8M3.6 10.6L.8 9.8"/>',
        cd: lv => Math.max(2.4, 7 - .4 * lv),
        desc: lv => "巨型陨石轰向敌群，半径 " + Math.round(150 + 14 * lv) + "，伤害 " + (22 + 10 * lv),
        stat: lv => [["半径", Math.round(150 + 14 * lv)], ["伤害", 22 + 10 * lv], ["冷却", Math.max(2.4, 7 - .4 * lv).toFixed(1) + "s"]],
      },
      {
        id: "frost", nm: "冰封棱镜", fam: null, kind: "cd", icon: "❄", col: "#8ee6ff",
        svg: '<path d="M12 3.2v17.6M3.2 12h17.6M5.8 5.8l12.4 12.4M18.2 5.8L5.8 18.2"/>',
        cd: lv => Math.max(2.6, 6.5 - .35 * lv),
        desc: lv => "周身炸开冰晶，冻结半径 " + Math.round(120 + 16 * lv) + " 内敌人 " + (.9 + .12 * lv).toFixed(1) + " 秒，伤害 " + (6 + 3 * lv) + "，冻结时受击 +25%",
        stat: lv => [["半径", Math.round(120 + 16 * lv)], ["伤害", 6 + 3 * lv], ["冻结", (.9 + .12 * lv).toFixed(1) + "s"]],
      },
      {
        id: "flare", nm: "焚地火海", fam: null, kind: "cd", icon: "✹", col: "#ff8a4c",
        svg: '<path d="M12 3c3.6 4 5.4 6.4 5.4 9.2A5.4 5.4 0 116.6 12C6.6 9.4 8.4 7 12 3z"/><path d="M12 12.4c1.4 1.8 2 2.8 2 4a2 2 0 11-4 0c0-1.2.6-2.2 2-4z"/>',
        cd: lv => Math.max(3.4, 9 - .5 * lv),
        desc: lv => "朝面前铺出 3 段火海，持续 2.6 秒，每 0.4 秒烫伤 " + (2.2 + 1.1 * lv).toFixed(1),
        stat: lv => [["每跳伤害", (2.2 + 1.1 * lv).toFixed(1)], ["持续", "2.6s"], ["冷却", Math.max(3.4, 9 - .5 * lv).toFixed(1) + "s"]],
      },
      {
        id: "leech", nm: "血契汲取", fam: null, kind: "pass", icon: "♥", col: "#ff6b81",
        svg: '<path d="M12 20.2S4.6 15.5 4.6 10.4A4.1 4.1 0 0112 7.6a4.1 4.1 0 017.4 2.8c0 5.1-7.4 9.8-7.4 9.8z"/><path d="M9.2 12.6h5.6M12 9.8v5.6"/>',
        desc: lv => "造成伤害的 " + (4 + 1.2 * lv).toFixed(1) + "% 累积为生命，攒满 1 点即回复",
        stat: lv => [["转化", (4 + 1.2 * lv).toFixed(1) + "%"]],
      },
    ];
    const SKILL_BY_ID = {};
    SKILLS.forEach(s => SKILL_BY_ID[s.id] = s);
    function skillsOf(wpnId) {
      const w = WPN_BY_ID[wpnId];
      return w ? SKILLS.filter(s => s.fam === w.fam) : [];
    }

    /* 武器数值行（升级卡顶部展示 [旧值 → 新值]） */
    const WSTAT = {
      pulse: lv => [["伤害", (1.8 + .55 * lv).toFixed(1)], ["射程", "6 格"], ["攻速", (3.5 + 1.2 * lv).toFixed(1) + "/秒"]],
      dark: lv => [["伤害", (2.2 + .9 * lv).toFixed(1)], ["射程", "4 格"], ["攻速", (.5 + .26 * lv).toFixed(2) + "/秒"]],
      blade: lv => [["伤害", (5.0 + 1.9 * lv).toFixed(1)], ["射程", "2 格"], ["弧角", "90°"], ["攻速", (1.0 + .45 * lv).toFixed(2) + "/秒"]],
    };

    /* ---------- 被动 6 个 ---------- */
    const PASSIVES = [
      { id: "rapid", nm: "超频", icon: "»", max: 5, ds: "只影响技能：全部技能冷却 -6%", svg: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.4 2.1"/>' },
      { id: "power", nm: "增幅", icon: "✧", max: 5, ds: "全部伤害 +10%", svg: '<path d="M5 18l7-7 7 7"/><path d="M5 11.5l7-7 7 7"/>' },
      { id: "area", nm: "扩散", icon: "◎", max: 5, ds: "技能范围 +8%（不影响脉冲系）", svg: '<circle cx="12" cy="12" r="2.8"/><circle cx="12" cy="12" r="6.4" stroke-dasharray="3 3.4"/><circle cx="12" cy="12" r="9.4" stroke-dasharray="2 4.6" opacity=".65"/>' },
      { id: "haste", nm: "疾行", icon: "➤", max: 5, ds: "移动速度 +10%", svg: '<path d="M3 7.5h8M3 12h11M3 16.5h8"/><path d="M14 8l4 4-4 4"/>' },
      { id: "craft", nm: "匠心", icon: "⚒", max: 5, ds: "只加成武器：武器伤害 +12%", svg: '<path d="M14.5 4.5l5 5-9.2 9.2H5.3v-5z"/><path d="M12.6 6.4l5 5"/>' },
      { id: "regen", nm: "再生", icon: "♥", max: 5, ds: "每 20 秒回复 1 点生命", svg: '<path d="M12 20.2S4.6 15.5 4.6 10.4A4.1 4.1 0 0112 7.6a4.1 4.1 0 017.4 2.8c0 5.1-7.4 9.8-7.4 9.8z"/><path d="M12 9.4v3.4M10.3 11.1h3.4"/>' },
    ];
    const PAS_BY_ID = {};
    PASSIVES.forEach(p => PAS_BY_ID[p.id] = p);

    /* 被动数值行 */
    const PSTAT = {
      rapid: lv => [["技能冷却", "-" + Math.round((1 - Math.max(.45, 1 - .06 * lv)) * 100) + "%"]],
      power: lv => [["全部伤害", "+" + (10 * lv) + "%"]],
      area: lv => [["技能范围", "+" + (8 * lv) + "%"]],
      haste: lv => [["移速", "+" + (10 * lv) + "%"]],
      craft: lv => [["武器伤害", "+" + (12 * lv) + "%"]],
      regen: lv => [["回血", lv + " / 20s"]],
    };

    /* ---------- 局内补给（敌人掉落，走过去自动拾取） ---------- */
    const PICKUPS = {
      heal: { nm: "生命补给", col: "#ff6b81", r: 12, ds: "回复 1 点生命" },
      magnet: { nm: "磁力脉冲", col: "#b18cff", r: 12, ds: "吸取全场经验与金币" },
      bomb: { nm: "湮灭弹", col: "#ffa94d", r: 12, ds: "以自身为中心造成大范围伤害" },
    };
    const PICKUP_KINDS = ["heal", "magnet", "bomb"];

    /* ---------- 敌人 ---------- */
    const ETYPE = {
      drift: { r: 10, hp: 3.2, spd: 84, xp: 1, coin: 1, dmg: 1, col: "#ff6b81", sides: 3 },
      rusher: { r: 8, hp: 2.2, spd: 162, xp: 1, coin: 1, dmg: 1, col: "#ffa94d", sides: 4 },
      shooter: { r: 11, hp: 6, spd: 74, xp: 2, coin: 2, dmg: 1, col: "#c084fc", sides: 5 },
      tank: { r: 21, hp: 36, spd: 49, xp: 4, coin: 4, dmg: 2, col: "#8ab4f8", sides: 6 },
      splitter: { r: 13, hp: 9, spd: 106, xp: 2, coin: 2, dmg: 1, col: "#f7f15a", sides: 4 },
      mini: { r: 6, hp: 2.4, spd: 172, xp: 1, coin: 1, dmg: 1, col: "#ffe066", sides: 3 },
      orbiter: { r: 10, hp: 7.5, spd: 138, xp: 2, coin: 2, dmg: 1, col: "#5eead4", sides: 3 },
      elite: { r: 26, hp: 130, spd: 72, xp: 15, coin: 14, dmg: 2, col: "#ff4d8d", sides: 6 },
      boss: { r: 58, hp: 1, spd: 50, xp: 0, coin: 120, dmg: 3, col: "#ff3d6e", sides: 3 },
    };

    /* 敌人图鉴：顺序 + 显示名 */
    const ENEMY_LIST = [
      { id: "drift", nm: "散兵", ds: "最基础的追击单位，血薄量大" },
      { id: "rusher", nm: "突袭者", ds: "速度快、贴脸就撞，成群出现" },
      { id: "shooter", nm: "射手", ds: "远程抛射，保持距离输出" },
      { id: "tank", nm: "重装", ds: "高血量慢速，用来磨时间" },
      { id: "splitter", nm: "分裂者", ds: "死亡后炸成两只小体" },
      { id: "mini", nm: "裂片", ds: "分裂者的碎片，血少极快" },
      { id: "orbiter", nm: "卫星", ds: "绕圈游走，难被点射命中" },
      { id: "elite", nm: "精英", ds: "定期刷新的强化单位，必掉补给" },
      { id: "boss", nm: "终局 Boss", ds: "12:00 小 Boss / 14:00 终局 Boss" },
    ];

    /* ---------- 成就（全部配置在这里；进度读存档累计值，领取后写 save.ach[id]） ----------
       src: kills 累计击杀 / boss Boss 击杀 / types 击败过的敌人种类 / wpns 单局最多武器
            evo 累计进化 / chars 已解锁角色 / skills 单局最多技能 / meta 强化总等级
            runs 累计局数 / chest 累计宝箱 / noHit 无伤彩蛋 / win 通关彩蛋
            dmg 单局最高伤害 / combo 单局最长连杀 */
    const ACH = [
      { id: "k1", cat: "kill", nm: "初次交锋", ds: "累计击杀 100 个敌人", src: "kills", goal: 100, reward: 60 },
      { id: "k2", cat: "kill", nm: "清道夫", ds: "累计击杀 2,000 个敌人", src: "kills", goal: 2000, reward: 220 },
      { id: "k3", cat: "kill", nm: "屠戮者", ds: "累计击杀 10,000 个敌人", src: "kills", goal: 10000, reward: 700 },
      { id: "k4", cat: "kill", nm: "屠龙者", ds: "累计击败 10 个 Boss", src: "boss", goal: 10, reward: 500 },
      { id: "k5", cat: "kill", nm: "万物图鉴", ds: "击败过全部 9 种敌人", src: "types", goal: 9, reward: 300 },
      { id: "k6", cat: "kill", nm: "极限连杀", ds: "单局最长连杀 100", src: "combo", goal: 100, reward: 350 },
      { id: "u1", cat: "unlock", nm: "三把武器", ds: "一局内集齐 3 把武器", src: "wpns", goal: 3, reward: 260 },
      { id: "u2", cat: "unlock", nm: "进化之路", ds: "累计完成 1 次武器进化", src: "evo", goal: 1, reward: 200 },
      { id: "u3", cat: "unlock", nm: "全员到齐", ds: "解锁全部 3 名角色", src: "chars", goal: 3, reward: 400 },
      { id: "u4", cat: "unlock", nm: "技能大师", ds: "单局持有 8 个技能", src: "skills", goal: 8, reward: 320 },
      { id: "u5", cat: "unlock", nm: "满配强化", ds: "局外强化总等级达到 30", src: "meta", goal: 30, reward: 600 },
      { id: "u6", cat: "unlock", nm: "常客", ds: "累计作战 20 局", src: "runs", goal: 20, reward: 300 },
      { id: "u7", cat: "unlock", nm: "开箱专家", ds: "累计开启 30 个宝箱", src: "chest", goal: 30, reward: 280 },
      { id: "e1", cat: "easter", nm: "毫发无伤", ds: "单局存活 3 分钟且一次未受伤", src: "noHit", goal: 1, reward: 500 },
      { id: "e2", cat: "easter", nm: "幸存者", ds: "活满 15 分钟通关", src: "win", goal: 1, reward: 800 },
      { id: "e3", cat: "easter", nm: "一击入魂", ds: "单局总伤害突破 100,000", src: "dmg", goal: 100000, reward: 400 },
    ];
    const ACH_CATS = [
      { id: "kill", nm: "击杀", col: "#ff8a5c" },
      { id: "unlock", nm: "成长", col: "#67e8f9" },
      { id: "easter", nm: "彩蛋", col: "#fbbf24" },
    ];

    /* ---------- 地图 / 难度 ---------- */
    /* bg：地图背景配色（基底 / 两层星云 / 网格 / 星图节点），供 render.js 的 drawWorld() 用
       soon: true = 只占位，还没做内容 */
    const MAPS = [
      {
        id: "plain", nm: "静寂星野", ds: "开阔星野，敌人四面合围，纯靠走位", props: 0, col: "#4fc3ff",
        bg: { base: "#070b1a", nebA: "#2b4b8f", nebB: "#6d3fa8", grid: "#7fb4ff", node: "#bfe4ff" },
      },
      {
        id: "ruin", nm: "陨落回廊", ds: "满地可破坏残骸：挡你也挡怪，打碎会爆经验与金币", props: .8, col: "#ffb45c",
        bg: { base: "#120a14", nebA: "#8a3550", nebB: "#5a2a86", grid: "#ff9a6a", node: "#ffd2a8" },
      },
      {
        id: "waste", nm: "荒芜星域", ds: "后续版本开放", props: 0, col: "#8f9bb3", soon: true,
        bg: { base: "#0b0c0f", nebA: "#4b5a6b", nebB: "#6b5a3a", grid: "#9fb0c2", node: "#d6e0ea" },
      },
      {
        id: "abyss", nm: "崩塌星渊", ds: "后续版本开放", props: 0, col: "#b06bff", soon: true,
        bg: { base: "#0a0714", nebA: "#4a1f8a", nebB: "#a02b5c", grid: "#b78bff", node: "#e8d6ff" },
      },
    ];
    /* diff：hp 敌人生命倍率 / spd 敌人速度倍率 / coin 金币倍率 / xp 经验倍率
       unlockTime：历史最佳生存时间（秒）达到后解锁 */
    const DIFFS = [
      { id: 0, nm: "普通", ds: "标准强度", hp: 1, spd: 1, coin: 1, xp: 1, unlockTime: 0, col: "#9fb4cc" },
      { id: 1, nm: "强化", ds: "敌人 +20% 生命 · 金币 +20%", hp: 1.2, spd: 1.04, coin: 1.2, xp: 1, unlockTime: 180, col: "#67e8f9" },
      { id: 2, nm: "梦魇", ds: "敌人 +45% 生命 +8% 速度 · 金币 +50% 经验 +15%", hp: 1.45, spd: 1.08, coin: 1.5, xp: 1.15, unlockTime: 420, col: "#c084fc" },
      { id: 3, nm: "深渊", ds: "敌人 +75% 生命 +14% 速度 · 金币 ×2 经验 +30%", hp: 1.75, spd: 1.14, coin: 2, xp: 1.3, unlockTime: 600, col: "#ff6b8a" },
    ];

    /* ---------- 时间轴 ---------- */
    const TIMELINE = [
      { t: 1, txt: "生存 15:00 ｜ 击杀终局 Boss 后可提前撤离", fn: null },
      { t: 30, txt: "增援来袭", fn: () => surge(16) },
      { t: 60, txt: "增援来袭", fn: () => surge(22) },
      { t: 90, txt: "精英入侵 · 宝箱可解锁新武器", fn: () => spawnElite() },
      { t: 120, txt: "增援来袭", fn: () => surge(26) },
      { t: 180, txt: "精英入侵", fn: () => spawnElite() },
      { t: 240, txt: "增援来袭", fn: () => surge(30) },
      { t: 300, txt: "怪潮来袭", fn: () => horde(34) },
      { t: 360, txt: "增援来袭", fn: () => surge(34) },
      { t: 420, txt: "精英入侵", fn: () => spawnElite() },
      { t: 480, txt: "增援来袭", fn: () => surge(38) },
      { t: 540, txt: "怪潮来袭", fn: () => horde(48) },
      { t: 600, txt: "增援来袭", fn: () => surge(42) },
      { t: 660, txt: "精英入侵", fn: () => spawnElite() },
      { t: 720, txt: "小型 Boss 出现", fn: () => spawnBoss(false) },
      { t: 840, txt: "终局 Boss 出现", fn: () => spawnBoss(true) },
    ];

export { ACH, ACH_CATS, CHARS, CHAR_BY_ID, DIFFS, ENEMY_LIST, ETYPE, FAMILIES, MAPS, MAX_LV, MAX_WPN, UNLOCK_GATE, META, META_BY_KEY, META_CATS, PASSIVES, PAS_BY_ID, PICKUPS, PICKUP_KINDS, PSTAT, RUN_LEN, SKILLS, SKILL_BY_ID, TIMELINE, WEAPONS, WPN_BY_ID, WSTAT, XP_TABLE, cannonLv, canonCount, canonDmg, pulseEvo, pulsePattern, skillsOf };


