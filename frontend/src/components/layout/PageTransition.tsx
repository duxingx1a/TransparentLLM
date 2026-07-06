"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const NAV_ORDER = [
  "/dashboard",
  "/providers",
  "/models",
  "/playground",
  "/logs",
  "/settings",
  "/docs",
];

const STORAGE_KEY = "tlm-nav-index";

function getNavIndex(path: string): number {
  const idx = NAV_ORDER.findIndex((k) => path.startsWith(k));
  return idx === -1 ? 0 : idx;
}

function getSavedIndex(): number {
  if (typeof window === "undefined") return -1;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  return raw !== null ? Number(raw) : -1;
}

function saveIndex(idx: number) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, String(idx));
}

function applyAnimation(el: HTMLElement, dir: "up" | "down") {
  const cls = dir === "up" ? "page-anim-slide-up" : "page-anim-slide-down";
  // 先重置为 done，确保浏览器能看到 class 变化
  el.classList.remove("page-anim-slide-up", "page-anim-slide-down", "page-anim-done");
  // 强制回流，让浏览器确认 class 已移除
  void el.offsetHeight;
  el.classList.add(cls);
  // 动画结束后恢复
  setTimeout(() => {
    el.classList.remove(cls);
    el.classList.add("page-anim-done");
  }, 320);
}

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const prevIdxRef = useRef<number>(-1);
  const ref = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  // 挂载时：处理静态导出（full reload）的情况
  useEffect(() => {
    if (mountedRef.current) return; // 只在首次挂载执行
    mountedRef.current = true;

    const currentIdx = getNavIndex(pathname);
    const savedIdx = getSavedIndex();

    // 保存当前 index
    saveIndex(currentIdx);
    prevIdxRef.current = currentIdx;

    // 有记录且不同页面 → 播放动画
    if (savedIdx !== -1 && savedIdx !== currentIdx && ref.current) {
      const dir = currentIdx > savedIdx ? "up" : "down";
      applyAnimation(ref.current, dir);
    }
  }, []);

  // 路由变化时：处理 dev 模式（client-side routing）的情况
  useEffect(() => {
    if (!mountedRef.current) return; // 跳过首次

    const currentIdx = getNavIndex(pathname);
    const prevIdx = prevIdxRef.current;
    prevIdxRef.current = currentIdx;

    saveIndex(currentIdx);

    if (currentIdx === prevIdx) return;
    if (!ref.current) return;

    const dir = currentIdx > prevIdx ? "up" : "down";
    applyAnimation(ref.current, dir);
  }, [pathname]);

  return (
    <div ref={ref} className="page-transition page-anim-done">
      {children}
    </div>
  );
}
