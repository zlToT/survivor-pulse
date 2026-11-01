/* ================= CONFIG ================= */
/* 被多个模块在「顶层」读取的常量放这里，保证求值顺序安全 */
export const isTouch = matchMedia("(pointer: coarse)").matches;
