/* 开发态自测：只在 `npm run dev` 下生效，构建产物里会被剔除 */
export async function runSelfTest() {
  const errors = [];
  window.addEventListener("error", e => errors.push(e.message));
  window.addEventListener("unhandledrejection", e => errors.push("reject:" + (e.reason && e.reason.message)));

  const out = [];
  const click = sel => {
    const el = document.querySelector(sel);
    if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return !!el;
  };

  try {
    const core = await import("./core.js");
    const world = await import("./world.js");
    const upd = await import("./update.js");
    const ui = await import("./ui.js");

    core.save.chars.arc = 1;
    core.save.chars.dark = 1;
    ui.startRun("tri");

    let levels = 0, chests = 0;
    for (let i = 0; i < 3600; i++) {
      if (world.state === "level") {
        levels++;
        if (!click("#panel .pickc")) world.setState("run");
        continue;
      }
      if (world.state === "chest") {
        chests++;
        if (!click("#panel .pickc")) { ui.hidePanel(); world.setState("run"); }
        continue;
      }
      upd.update(1 / 60);
    }

    out.push("state=" + world.state);
    out.push("t=" + (world.run ? world.run.t.toFixed(1) : -1));
    out.push("kills=" + (world.run ? world.run.kills : -1));
    out.push("lv=" + (world.run ? world.run.level : -1));
    out.push("cards=" + levels + "/" + chests);
    out.push("enemies=" + world.enemies.length);
    out.push("particles=" + world.particles.length);
    out.push("wpns=" + (world.run ? world.run.wpns.length : -1));
    out.push("skills=" + (world.run ? world.run.skills.length : -1));
    /* 新增内容自检：补给掉落 / 进化条件 / 音量 */
    world.dropPickup(world.player.x + 30, world.player.y, "heal");
    upd.update(1 / 60);
    out.push("pickups=" + world.pickups.length);
    out.push("hp=" + (world.player ? world.player.hp : -1) + "/" + (world.run ? world.run.maxHp : -1));
    core.audio();
    out.push("audio=" + (core.AC ? core.AC.state : "null"));
    out.push("vol=" + core.VOL.m.toFixed(2) + "/" + core.VOL.s.toFixed(2));
    out.push("evoNeed=" + JSON.stringify(ui.chestOpts().map(o => o.kind + ":" + o.id)));
    /* 角色特质 / 族 / 解锁门槛自检 */
    const data = await import("./data.js");
    out.push("trait=" + (world.run.char.trait || "-"));
    out.push("fams=" + data.SKILLS.map(s => s.id + ":" + (s.fam || "通用")).join(","));
    out.push("gate=" + JSON.stringify(data.UNLOCK_GATE));
    out.push("unlock@" + Math.round(world.run.t) + "s=" + ui.chestOpts().filter(o => o.kind === "unlock").length);

    /* 解锁门槛 & 角色特质数值核对 */
    const keepT = world.run.t, keepChar = world.run.char;
    world.run.t = 100;
    const u100 = ui.chestOpts().filter(o => o.kind === "unlock").length;
    world.run.t = 500;
    const u500 = ui.chestOpts().filter(o => o.kind === "unlock").length;
    world.run.t = keepT;
    out.push("unlockAt100/500=" + u100 + "/" + u500);

    const traitOut = data.CHARS.map(c => {
      world.run.char = c;
      const crit = world.critC(), spd = world.moveSpd(), taken = (c.tr && c.tr.taken) || 1;
      return c.nm + "(crit" + Math.round(crit * 100) + "%,spd" + spd.toFixed(0) + ",taken" + taken + ")";
    });
    world.run.char = keepChar;
    out.push("traits=" + traitOut.join(" "));
  } catch (e) {
    errors.push("run:" + e.message + " @" + (e.stack || "").split("\n")[1]);
  }
  document.title = errors.length
    ? "SELFTEST FAIL " + errors.slice(0, 3).join(" | ")
    : "SELFTEST OK " + out.join(" ");
}


