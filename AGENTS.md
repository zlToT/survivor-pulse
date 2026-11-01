# AGENTS.md —— 给 AI 协作者的项目规则

> 本文件面向在此仓库工作的 AI（以及人类）协作者。**动手前先读完「铁律」一节**。
> 项目：幸存者 · 脉冲（Survivor Pulse），Canvas2D 单局 15 分钟的动作类幸存者游戏。

---

## 1. 这是什么，两个版本的关系

| 位置 | 角色 | 说明 |
| --- | --- | --- |
| `D:\Work\site\survivor-pulse`（本仓库） | **开发主仓** | Vite 多文件工程，所有新功能在这里做 |
| `D:\Work\site\zlToT.github.io-site\public\games\gravity_well_shot.html` | **线上单文件版** | 旧版单 HTML，站点在用；玩法修复需要**同步**过去 |

- 本仓库 `npm run build:single` 产出的 `dist-single/survivor-pulse.html` 是新版的「双击即玩」单文件版。
- 只改本仓库 = 线上老版不会变。若用户说「线上还要能玩」，改完记得同步单文件版（见第 9 节）。

---

## 2. 命令

```bash
npm install          # 首次
npm run dev          # http://127.0.0.1:5173（端口被占则顺延，看启动日志）
npm run build        # dist/（http 部署，如 GitHub Pages）
npm run build:single # dist-single-build/（不压缩）+ dist-single/survivor-pulse.html（内联、可读、双击即玩）
npm run preview      # 本地预览 dist/
```

环境：Node 24 / npm 11 / vite 7。**不要引入新依赖**（尤其不要为了特效引入 Pixi/Phaser/物理引擎；渲染层 2900 行 Canvas2D 已经调好，换引擎等于重写）。

---

## 3. 目录与模块职责

```
index.html              页面骨架（HUD / 面板 DOM，约 70 行）
src/style.css           全部样式（约 2200 行，含手机断点）
src/config.js           环境判定：export const isTouch
src/core.js             工具（$ / rnd / clamp / colA）、音效 sfx、存档 loadSave/persist
src/data.js             纯数据表：RUN_LEN / MAX_LV / XP_TABLE / META / CHARS / WEAPONS / SKILLS / PASSIVES / ETYPE / TIMELINE / WSTAT / PSTAT
src/world.js            世界状态与生成器：run / player / 各实体数组 / 倍率函数 / 刷怪 / 掉落 / 粒子池
src/combat.js           普攻 atkXxx / 技能 castXxx / hurt / killEnemy / damageArea / updateAttacks / updateCombat
src/update.js           主循环逻辑：输入、玩家、敌人 AI、经验、时间轴、相机
src/render.js           双画布渲染（#c 实体 / #fx 粒子）
src/ui.js               全部面板（标题/商店/升级/宝箱/暂停/结算）+ HUD + 事件委托
src/boot.js             输入绑定、GM 面板、启动 bootGame()
src/selftest.js         dev-only 自测（?selftest=1）
scripts/build-single.mjs 单文件打包
```

依赖方向（大致）：`data → world → combat → update → render → ui → boot`，允许向上借用函数，但要遵守第 4 节。

---

## 4. 铁律（踩过坑的）

1. **跨模块可变状态只能走 setter。** ESM 里 `import` 进来的 `let` 是只读的，直接赋值会构建失败：
   `Illegal reassignment of import "dashReq"`。可变量都留在属主模块，通过 `setState / setPaused / setMuted / setDashReq / setBoss / setChest / setRift / setTlIdx` 修改。
2. **setter 不能出现在表达式位置**（如 `arr[setTlIdx(tlIdx + 1)]`）。要拆成两行：
   `const v = arr[tlIdx]; setTlIdx(tlIdx + 1);`（增量判断同理）。
3. **不要在模块顶层读取别的模块的 `let`**（TDZ）。`isTouch` 这类环境值放 `src/config.js`；DOM 取值放 `bootGame()`；`pickedChar` 由 `initPicked()` 初始化。
4. **`$()` 必须是函数声明**（`function $(id)`），不能是 `const $ = id => ...`：循环 import 下只有函数声明在模块实例化阶段就可用。
5. **导出用文件底部的 `export { ... }` 聚合列表**，与现有风格保持一致（自动拆分脚本也是这么生成的）。新增导出记得加进去。
6. **`ui.js` 的 `ui` 对象在模块顶层取 DOM**：所以 `index.html` 里的元素必须存在且顺序正确；新增 HUD 元素时同步改三处：`index.html`、`ui` 对象、`updateHud()`。
7. **`canvas { position: fixed; inset: 0 }` 这类全局样式只对 `#c`、`#fx` 生效**。曾因全局 canvas 规则把迷你地图 `#mm` 拉成全屏画布。
8. **不要每帧 `createRadialGradient`**：光晕用 `glowTex()` 预渲染贴图，多边形用 `unitPoly()` 的 Path2D 缓存，颜色透明度走 `colA()` 的 12 档缓存。新增特效先看 `render.js` 现有做法。
9. **改数值先改 `src/data.js`**，不要在 `combat.js`/`update.js` 里写死魔法数。武器/技能/被动/敌人/时间轴全部表驱动。
10. **临时脚本与截图必须删**。调试产物写在项目内（`*.png`、`_*.html`），收尾一律删除；禁止往 `C:\` 临时目录写文件。

---

## 5. 数值约定（改平衡时保持一致性）

- 一局 `RUN_LEN = 900` 秒；`XP_TABLE` 13 档，之后线性外推。
- `MAX_LV = 5`（武器/技能/被动统一上限）；`EVO_LV = 3`（武器进化门槛，看**武器等级**不是人物等级）。
- `WEAPONS[x].evo.need` 是进化需要的被动 id（千针←增幅 power、奇点球←扩散 area、双月←疾行 haste），进化的两个门槛：武器 `lv >= EVO_LV`（3）且该被动 `>= EVO_PAS_LV`（当前 1）。`EVO_FAM`（`src/ui.js`）由 `WEAPONS[].evo.need` 反查得出，用于在被动卡上标注「X族武器进化前置条件」的族色提示。
- 宝箱里若武器已到 3 级但前置被动不够，不放进化卡，改成放出那张被动卡（`chestOpts()` 产出 `{kind:"p"}`，`takeChest("p", id)` 加被动），别让玩家干看着进化不了。
- 局内补给：`PICKUPS`（heal / magnet / bomb）走 `dropPickup()` 与 `updatePickups()`，存 `pickups` 数组；精英与 Boss 必掉。
- 技能归属用**族**：`SKILLS[].fam` → `FAMILIES`（pulse / dark / blade）；`hasFam(fam)` 判断是否持有该族任一武器，`skillsOf(wpnId)` 按族取技能。新增武器只要 `WEAPONS[].fam` 填对，就能共用同族技能。
- 角色特质：`CHARS[].tr`（`crit` 暴击率加成 / `taken` 受击倍率 / `spd` 移速倍率）与展示文案 `CHARS[].trait`；分别接在 `critC()`、`hitPlayer()`、`moveSpd()`。
- 武器解锁门槛：`UNLOCK_GATE = { 2: 90, 3: 480 }`（第 2 把 1:30、第 3 把 8:00），`unlockedSlots()` 决定当前最多能有几把武器，`chestOpts()` 每次只放出一把。
- 局外强化 `META[]` 带 `cat`：`atk` 攻击型 / `def` 防御型 / `util` 功能型，商店用 `META_CATS` 做单选（`shopCat`）。新增强化必须填 `cat`，否则商店里看不到。
- 局外强化的实际接点：`pierce`+`proj`→`atkPulse()` 弹道与穿透；`aspd`→`updateAttacks()` 的 `1 / (aspd * (1 + .06·aspd))`；`armor`/`guard`→`hitPlayer()`（`1 - .06·armor`、受击后 1.5s 内 `1 - .30·guard`，`run.guardT`）；`dodge`→`run.dashT = .17 + .15·dodge`；`regen`→`updatePlayer()` 每 `max(4, 10 - 2·(lv-1))` 秒回 1 血（`run.regenT`，resetRun 时按周期初始化）；`scdr`→`skillCdMul()`；`hunter`→`dropLoot()` 精英/Boss 额外补给；`key`→`chestOpts()` 末尾追加一张 `{kind:"wup"}` 武器等级+1 卡 + `cnt = 3 + key`。
- `MAX_WPN = 3`；技能无损上限（当前 14 个：3 武器族 × 3 + 5 通用），被动 6 个。
- 射程按格算：`CELL = 90`。脉冲 6 格、暗黑 4 格、弧刃 2 格（90° 扇形，每个敌人只判一次）。
- 普攻只有「攻速」没有 CD：`aspd(lv)` 次/秒，间隔 `1 / aspd`。CD 只属于主动技能（吃 `skillCdMul()`）；挂载技能（`kind:"mount"`：脉冲炮/暴击飞弹/双剑滑斩）**永不进出手循环**。
- 暴击归局外养成：`critC() = min(.75, .05 + .08*up.crit)`、`critD() = 2 + .20*up.critd`。
- 敌人血量缩放 `hpScale() = 1 + .55m + .10m²`（m = 分钟）；刷怪 `cap = min(260, 55 + 34m)`；`director` 的 `budget += (1.15 + 1.05m) * dt`。
- 粒子池 `PMAX = 触屏 1300 / 桌面 2400`；同屏敌人上限 `MAX_ENEMY = 260`。

---

## 6. 存档

- **只有两把 key**（都定义在 `src/core.js`）：`gws_set` = 设置（`muted` 音效开关 / `dmg` 伤害数字 / `volM` 音乐音量 / `volS` 音效音量），`gws_data` = 数据（`coins / up / chars / pick / map / diff / best{地图:难度 → {t,k,c,d,m}} / bestTime / bestKill / bestCoin / bestDmg / bestCombo / bestWpns / bestSkills` + 成就用的 `tot{kills,runs,coin,boss,chest,evo} / killTypes / easter{noHit,win} / ach`）。
- 设置的四个开关/音量在 **暂停面板**和**标题页「设置」**里是同一套 `setRows()`，改样式/加项只改这一处。
- 设置改 `setMuted / setDmg / setVol`（内部 `persistSet()`），数据改 `save` 后调 `persist()`；两条通道互不影响。
- 开发期**不设版本号、不写迁移**：加减字段直接改 `defSave()`，`loadSave()` 用 `Object.assign(defSave(), raw)` 补默认值即可。
- `persist()` / `persistSet()` 失败会置 `saveOk = false`，标题页显示红字提示——别把这个提示删了。
- **改存档逻辑必须确认 `loadSave()` 真的被调用**（曾经只定义没调用，导致金币永远是默认值）。

---

## 7. 验证流程（务必自己做一遍再交付）

1. `npm run build:single` 必须通过（它同时覆盖语法与 import 检查，产物本身也是可读代码）。
2. 逻辑类改动：跑 `npm run dev`，打开 `http://127.0.0.1:<port>/?selftest=1`，看 `document.title` 是否为
   `SELFTEST OK state=run kills=... lv=... cards=... enemies=... particles=...`。
3. 视觉/交互类改动：headless 截图看真实画面

   ```powershell
   $exe = "C:\Program Files\Google\Chrome\Application\chrome.exe"
   & $exe --headless=new --disable-gpu --hide-scrollbars --window-size=1280,860 `
     --screenshot="$PWD\_shot.png" --virtual-time-budget=4000 "http://127.0.0.1:<port>/"
   ```

   - 想验证某个状态（升级面板/宝箱/GM）时，复制一份 `index.html` 为 `_xxx.html`，在 `</body>` 前插一段
     `<script type="module">` 用**真实点击**（`document.querySelector('[data-act="start"]').click()`）驱动流程，最后把结果写进 `document.title`，再用 `--dump-dom` 读。用完删掉。
   - **同步调用 `update()` + `render()` 后截图会拍到黑屏**（合成没触发）；要看画面必须让 `requestAnimationFrame(loop)` 跑起来，或 `setInterval(() => render(), 40)`。
   - `--window-size` 最小约 500 CSS px；移动端用 520×900 模拟。
4. 改完 `dist`/`dist-single` 后记得 `Get-ChildItem -Filter "_*"` 确认没有残留临时文件。

---

## 8. GM 面板

- 总开关 `GM_ENABLED`（`src/boot.js`）。入口是左下角 `GM` 按钮，`data-gm="动作名"` 走统一委托 `gmApply(act)`。
- 命名规范：`w+:<id>` / `wmax:<id>` / `wevo:<id>` / `s+:<id>` / `smax:<id>` / `sallmax` / `p+:<id>` / `pmax:<id>` / `pallmax` / `god` / `nopop` / `freeze` / `add60` / `boss` / `elite` / `bossS` / `bossF` / `clear` / `n:1|5|20` / `lv1` / `lv5` / `xp10|xp100` / `coin500|coinMax`。
- 加新动作：`gmRender()` 里加 `gmPill`，`gmApply()` 里加分支，必要时在对应模块加钩子（例：`hitPlayer()` 开头 `if (gm.god) return;`）。
- 玩家属性面板在 `#gmStats`（右侧固定，不跟随滚动），数据源 `playerStats()`，改属性记得同步它。

---

## 9. 同步到线上单文件版

改完玩法后，把**相同的最小改动**打到 `gravity_well_shot.html`（它是同样代码的单文件形态，DOM/函数名一致）：

```powershell
# 1) 用 read 读目标片段（必须先读才能 edit）
# 2) edit 精确替换
# 3) 语法校验：拆 <script> 块用 node --check 逐个检查
```

不要整份覆盖线上文件（用户可能同时在编辑器里改动）。

---

## 10. 代码风格

- 4 空格缩进；简体中文注释；命名沿用现状（`w`/`s`/`e`/`o`/`b` 这类短名在循环里是惯例，不要重命名）。
- 不写 `console.log` 调试残留（`dumpStats()` 这类 GM 功能除外）。
- 不删除/重排与本次改动无关的代码；不做「顺手重构」。
- 提交信息用中文，一句话说明改了什么。

---

## 11. 已知坑速查

| 现象 | 原因 / 处理 |
| --- | --- |
| `Illegal reassignment of import "x"` | 见铁律 1，改用 setter |
| `Cannot read properties of null (reading 'x')` in `drawWorld` | 标题页 `player` 为 null，取坐标要兜底 |
| `file://` 打开 dist 白屏/无样式 | module 脚本 + crossorigin 被 CORS 拦；用 `build:single` 产物或起 http |
| 单文件版全白、HUD 有文字但游戏不动 | 内联脚本跑到 `<head>` 里了；`build-single.mjs` 已把它插到 `</body>` 前 |
| 弧刃没刀光只有伤害 | `arcs` 元素字段不匹配（要有 `a0/a1/w/spin`），统一用 `pushArc()` |
| 死亡后屏幕一直震 | `cam.shake` 在 `update()` 里衰减，非 run 状态不再更新；`render()` 里已按状态清零 |
| 暂停恢复后 HUD 不回来 | `hidePanel()` 必须移除 `body.panel-open` 并清 `#overlay` 的 class |
| Windows 下 dev server 崩 `EBUSY ... .tmpdir` | 编辑器/工具原子写文件时 vite watcher 抓到临时目录，重启即可，与代码无关 |
| 同屏出现两只一模一样的 Boss | `spawnBoss()` 有 `run.bossDone` 去重（GM 跳关 + 时间轴双触发）；新增 Boss 类型记得加对应 key |
| `pwsh` 工具直接报 `[exit code: 3221225794]` | 本地 PowerShell 在受限沙箱下加载 DLL 失败，与项目无关；需要跑命令时让用户执行或换工具 |

---

## 12. 当前进度与待补（做需求前先看这里）

**已完成**：3 武器（各 1 进化，进化需配套被动）/ 14 技能（10 族技能 + 4 通用：陨石天罚 / 冰封棱镜 / 焚地火海 / 血契汲取）/ 6 被动 / 9 种敌人 / 时间轴（30 秒起每 30~60 秒增援，12:00 小 Boss、14:00 终局 Boss）/ 宝箱解锁与进化 + 武器强化卡（`key`）/ 三选一升级 + 3 次刷新 / 暴击（局外养成）/ 22 项局外强化（按攻防功三型分类）/ 3 角色 / 结算复盘（伤害 / 承伤 / 连杀 / 破纪录）/ 图鉴（武器·技能·被动·敌人）/ 成就（16 条，配置在 `src/data.js` 的 `ACH`/`ACH_CATS`）/ 存档（`gws_set` 设置 + `gws_data` 数据两把 key，无版本号） / 双画布粒子特效 / 手机适配 / 迷你地图 / GM 面板 / 伤害数字 / 音效 + 程序化 BGM 与音量设置 / 局内三种补给掉落。

**明确还缺**（按优先级，细节见与用户的对齐记录）：

- （P0 四项已于本轮补齐：补给掉落 / 武器+被动配对进化 / BGM 与音量 / 开局密度。）
- 第 ① 批（结算复盘 / 4 通用技能 / 强化分类与 10 项）、第 ② 批（图鉴 / 成就 / 标题页入口）、第 ③ 批（第二张地图「陨落回廊」+ 局外选地图 / 选难度 + Boss 三阶段）均已完成。
  - 地图与难度：`MAPS`（4 张：`plain` 静寂星野 props 0 / `ruin` 陨落回廊 props **0.8 = 每 760px 区块的出残骸概率**（别当数量用）/ `waste` 荒芜星域、`abyss` 崩塌星渊后两张带 `soon: true` 只占位）与 `DIFFS`（4 档，`hp/spd/coin/xp` 倍率）都在 `src/data.js`；局内统一走 `diffHp()/diffSpd()/diffCoin()/diffXp()`，不要另开一套乘法。存档字段 `save.map` / `save.diff`（`loadSave()` 只放行 plain / ruin，占位图选不了）。
  - 解锁链：下一张地图要**上一张地图 4 个难度全部**活满 3:00（`mapUnlocked()` 逐档检查 `bestSec(prev.id, d) >= 180`，`soon` 图永远锁着，提示文案在 `mapLockTip()`）；难度按**当前地图**逐级解锁（普通→强化→梦魇→深渊，每档都要上一档活满 3:00）。判定函数是 `src/ui.js` 的 `mapUnlocked()` / `diffUnlocked()`，数据源 `bestSec(mapId, diff)`，别再改回 `save.bestTime`。
  - 最佳记录：`save.best["plain:0"] = {t,k,c,d,m}`，2 地图 × 4 难度共 8 份，由 `bestRec()` / `recKey()` 管理；`save.bestTime/bestKill/...` 只作为「全组合总最佳」给标题页和成就用。结算面板的「新纪录 / 最佳 N」一律读 `bestRec()`。
  - 可破坏物：世界数组 `props` 按区块懒生成（`PROP_CHUNK = 760`、`genPropChunk()`、`refillProps()` 每帧由 `src/update.js` 调），挡玩家也挡怪；玩家伤害走三种入口 —— `hurtProps(x,y,r,dmg,hit)`（范围/球体）、`hurtPropsArc(cx,cy,ang,half,radius,dmg,hit)`（弧刃刀光类扇形）、子弹碰撞块。**新增任何伤害来源时三选一接上，否则玩家会打不碎残骸**。
  - 标题页缩放：`.ticons` 是 `position: fixed` 贴底（在 `#hint` 上方），内容高度由 `src/ui.js` 的 `fitTitle()` 按「图标行顶边」实时算 `zoom`，所以别再往 CSS 里写死 `zoom` 断点。
  - 背景：星空外域风格在 `src/render.js` 的 `bgBase()` / `bgVignette()` / `bgSpace()`（底图与暗角是离屏 canvas 缓存，别每帧 createRadialGradient）；星云按 `NEB_PERIOD = 1560` 世界循环 + 视差、星点三层无缝贴图、主网格每 4 格一条线并在交点画星图节点，配色读 `MAPS[].bg`。换地图不用改渲染代码，只改 `bg`。
  - Boss：`enemies` 里 `boss: true` 的那只按血量切 `phase` 1/2/3，动作是环弹 + 冲击波（`waves[]`）+ 阵法召唤（`spawnFormation`）+ 锁定扇形弹幕（`fanShot`），全部在 `src/update.js` 的 Boss 分支里。
- P2：手柄支持、更多设置项（音量/粒子/震屏）、每日种子与排行、教程引导。

新增内容优先复用现有表驱动 + 面板 + GM 的骨架，不要另起一套系统。成就/图鉴的判定值**只从 `save` 的累计字段算**（`achVal()`），不要另存一份进度。


