import { defineConfig } from "vite";

export default defineConfig({
  /* 相对路径：构建产物可以直接双击 dist/index.html 打开，也能丢进任意子目录 */
  base: "./",
  plugins: [
    {
      /* file:// 打开时 crossorigin 会触发 CORS 把样式挡掉，构建后去掉 */
      name: "strip-crossorigin",
      enforce: "post",
      transformIndexHtml(html) {
        return html.replace(/ crossorigin/g, "");
      },
    },
  ],
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    open: false,
  },
});
