// Trạng thái giao diện (màn hình, tab, bộ lọc, cửa sổ, thông báo) + cơ chế vẽ lại.
// GameState nằm trong engine (S); sau mỗi thay đổi gọi refresh() để React vẽ lại.
import { useSyncExternalStore, type ReactNode } from 'react';
import type { Match, Role } from '../engine/types';

export type Screen = 'menu' | 'new' | 'load' | 'about' | 'game';
export interface Filters {
  schLeagues?: string[] | null; schBack?: number; schFwd?: number; schDay?: number | null; schMine?: boolean; schSpoil?: boolean;
  stLeague?: string; gprSnap?: number | null; gprLeague?: string | null;
  recTab?: string; recLg?: string; recEv?: string; recSort?: string;
  trRole?: 'all' | Role; trLeague?: string; trSort?: 'ovr' | 'pot' | 'val' | 'age'; trQ?: string; trPage?: number;
  mRole?: 'all' | Role; mQ?: string; mView?: 'solo' | 'pro'; mSel?: string | null; inCat?: string; lsv?: string;
}
export interface ModalSpec { render: (close: () => void) => ReactNode; wide?: boolean; onClose?: () => void }
export interface Toast { id: number; msg: string; kind: 'info' | 'ok' | 'err' }
export interface Ui {
  screen: Screen; tab: string; lastSub: Record<string, string>; filters: Filters;
  selPlayer: string | null; newLeague: string | null; newTeam: string | null; mgr: string;
  newsIdx: number; homeLg: string | null; inboxPrev: number; enter: boolean;
  busy: string | null; matchDay: Match | null; modal: ModalSpec | null; toasts: Toast[];
}

export const ui: Ui = {
  screen: 'menu', tab: 'dashboard', lastSub: {}, filters: {},
  selPlayer: null, newLeague: null, newTeam: null, mgr: '',
  newsIdx: 0, homeLg: null, inboxPrev: 0, enter: false,
  busy: null, matchDay: null, modal: null, toasts: [],
};

let version = 0;
const listeners = new Set<() => void>();
export function refresh(): void {
  version++;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** đăng ký vẽ lại khi trạng thái thay đổi */
export const useVersion = (): number => useSyncExternalStore(subscribe, () => version);

export function go(screen: Screen, extra: Partial<Ui> = {}): void {
  Object.assign(ui, { screen }, extra);
  refresh();
}
export function setTab(tab: string): void {
  ui.enter = ui.tab !== tab;
  ui.tab = tab;
  refresh();
}

// ----- cửa sổ & thông báo -----
export function openModal(render: ModalSpec['render'], opts: Omit<ModalSpec, 'render'> = {}): void {
  ui.modal = { render, ...opts };
  refresh();
}
export function closeModal(): void {
  const m = ui.modal;
  ui.modal = null;
  refresh();
  m?.onClose?.();
}
let toastId = 0;
export function toast(msg: string, kind: Toast['kind'] = 'info'): void {
  const id = ++toastId;
  ui.toasts = [...ui.toasts, { id, msg, kind }];
  refresh();
  setTimeout(() => { ui.toasts = ui.toasts.filter((x) => x.id !== id); refresh(); }, 2600);
}
