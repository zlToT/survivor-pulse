/* 把 vite 构建产物内联成「双击即玩」的单个 HTML（无外部请求）
   输入目录是 dist-single-build（`vite build --minify false`），
   这样产出的单文件仍然可读，方便和线上单文件版对照维护。 */
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve("dist-single-build");
const out = path.resolve("dist-single");
fs.mkdirSync(out, { recursive: true });

let html = fs.readFileSync(path.join(dist, "index.html"), "utf8");

/* 内联 CSS */
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (m, href) => {
  const css = fs.readFileSync(path.join(dist, href.replace(/^\.\//, "")), "utf8");
  return "<style>\n" + css + "\n</style>";
});

/* 内联 JS（构建产物是单 chunk，无 import/export，可直接当普通脚本跑） */
let inlineScript = "";
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
  let js = fs.readFileSync(path.join(dist, src.replace(/^\.\//, "")), "utf8");
  js = js.replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, "").replace(/^\s*import\s.+?;?\s*$/gm, "");
  inlineScript = "<script>\n/* 幸存者 · 脉冲 —— 单文件构建 */\n" + js + "\n</script>";
  return "";
});

/* 脚本必须放在 body 末尾：vite 会把它提升进 head，那时 DOM 还不存在 */
html = html.replace("</body>", inlineScript + "\n</body>");

const target = path.join(out, "survivor-pulse.html");
fs.writeFileSync(target, html, "utf8");
console.log("单文件版已生成：" + target + "  (" + Math.round(html.length / 1024) + " kB)");
