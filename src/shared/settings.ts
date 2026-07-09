import { load, Store } from "@tauri-apps/plugin-store";

// 설정 파일 단일 진입점. 전체 스키마 헬퍼는 M7에서 확장한다.
let storePromise: Promise<Store> | null = null;

export function settingsStore(): Promise<Store> {
  storePromise ??= load("settings.json");
  return storePromise;
}

export type MarkerPos = { xRatio: number; yRatio: number };

export async function loadMarkerPos(): Promise<MarkerPos | null> {
  const store = await settingsStore();
  return (await store.get<MarkerPos>("markerPos")) ?? null;
}

export async function saveMarkerPos(pos: MarkerPos): Promise<void> {
  const store = await settingsStore();
  await store.set("markerPos", pos);
  await store.save();
}
