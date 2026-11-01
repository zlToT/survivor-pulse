import "./style.css";

/* 依赖顺序：config → core → data → world → combat → update → render → ui → boot */
import "./config.js";
import "./core.js";
import "./data.js";
import "./world.js";
import "./combat.js";
import "./update.js";
import "./render.js";
import "./ui.js";
import { bootGame } from "./boot.js";

bootGame();

/* 开发态自测：npm run dev 下访问 ?selftest=1 会跑一局并把结果写进 document.title */
if (import.meta.env.DEV && location.search.includes("selftest")) {
  import("./selftest.js").then(m => m.runSelfTest());
}

