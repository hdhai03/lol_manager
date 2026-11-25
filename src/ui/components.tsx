// Thành phần dùng chung: logo đội/giải, ảnh tuyển thủ, tướng, vai trò, OVR, cửa sổ, thông báo...
import type { ReactNode } from 'react';
import { DB, champImg, champTile, champSplash, teamLogo, leagueLogo, playerFace, isDarkLogo, src as asset, runeImg } from '../engine/data';
import { runeName } from '../engine/runes';
import { S } from '../engine/state';
import { clamp } from '../engine/util';
import { t, cname, getLang, setLang } from '../i18n';
import { CC, featuredChamp, vClass } from './helpers';
import { ui, closeModal, refresh } from './store';
import type { Player, Role } from '../engine/types';

export function Badge({ id, size = 'md' }: { id: string; size?: string }) {
  const tm = S ? S.teams[id] : undefined;
  const dbt = DB.teams[id];
  const short = tm?.short || dbt?.short || '?';
  const name = tm?.name || dbt?.display || dbt?.name || id;
  const logo = teamLogo(id);
  if (logo) return <span className={`badge badge-${size} logo ${isDarkLogo(logo) ? 'on-light' : ''}`} title={name}><img src={asset(logo)} alt={short} loading="lazy" /></span>;
  const h = tm ? tm.hue : [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 0);
  return <span className={`badge badge-${size}`} style={{ ['--h' as string]: h }} title={name}>{short}</span>;
}

export function LeagueBadge({ id, size = 'sm' }: { id: string; size?: string }) {
  const lp = leagueLogo(id === 'INTL' ? 'WORLDS' : id);
  if (!lp) return null;
  return <span className={`lg-logo lg-${size} ${isDarkLogo(lp) ? 'on-light' : ''}`} title={id}><img src={asset(lp)} alt={id} loading="lazy" /></span>;
}

export const faceSrc = (p: { id: string } | null | undefined): string | null => (p && playerFace(p.id) ? asset(playerFace(p.id)!) : null);
export function Face({ p, size = 'md', extra = '' }: { p: { id: string; ign: string } | null | undefined; size?: string; extra?: string }) {
  if (!p) return <span className={`face face-${size} ${extra} none`} />;
  const fs = faceSrc(p);
  if (fs) return <span className={`face face-${size} ${extra}`}><img src={fs} alt={p.ign} loading="lazy" /></span>;
  return <span className={`face face-${size} ${extra} none`}>{(p.ign || '?').slice(0, 2).toUpperCase()}</span>;
}

export function Champ({ id, size = 32 }: { id: string | null | undefined; size?: number }) {
  if (!id) return <span className="champ empty" style={{ width: size, height: size }} />;
  return <img className="champ" loading="lazy" src={size >= 44 ? champTile(id) : champImg(id)} width={size} height={size} alt={cname(id)} title={cname(id)} />;
}

const ROLE_PATH: Record<Role, string> = {
  Top: 'M3 3h15l-4 4H7v7l-4 4V3zm7 7h4v4h-4z',
  Jungle: 'M6 2c1.2 5.2 3.2 9 6 12.2C14.8 11 16.8 7.2 18 2c.3 7.4-1.6 13.4-6 20C7.6 15.4 5.7 9.4 6 2z',
  Mid: 'M3 17 17 3h4v4L7 21H3v-4zm0-14h7l-3 3H6v1L3 10V3zm18 18h-7l3-3h1v-1l3-3v7z',
  Bot: 'M21 21H6l4-4h7v-7l4-4v15zM10 10h4v4h-4z',
  Support: 'M12 3l3 4-3 3-3-3 3-3zM2 8h6l4 4 4-4h6l-5 5h-3l-2 8-2-8H7L2 8z',
};
export const RoleIcon = ({ r }: { r: Role }) => <svg className="ricon" viewBox="0 0 24 24" aria-hidden="true"><path d={ROLE_PATH[r]} /></svg>;
// vai trò: chỉ hiện biểu tượng (tô màu theo vai trò), tên đầy đủ ở tooltip / aria-label
export const RoleTag = ({ r }: { r: Role }) => <span className={`role role-${r}`} title={t('role.' + r)} aria-label={t('role.' + r)}><RoleIcon r={r} /></span>;
// hạng rank: chữ tô màu, không nền
export const RankTxt = ({ tier, lp }: { tier: string; lp?: number }) => <span className={`rkt t-${tier}`}><b>{t('tier.' + tier)}</b>{lp != null && <small>{lp} LP</small>}</span>;
export const Ovr = ({ v }: { v: number }) => <span className={`ovr o-${vClass(v)}`}>{v}</span>;
export function Stars({ ovr }: { ovr: number }) {
  const n = clamp(Math.round((ovr - 58) / 6), 1, 5);
  return <span className="stars">{'★'.repeat(n)}<span className="off">{'★'.repeat(5 - n)}</span></span>;
}
export const Cc = ({ country }: { country?: string }) => (country ? <span className="cc" title={country}>{CC[country] || country.slice(0, 3).toUpperCase()}</span> : null);
export const FormArrow = ({ f }: { f: number }) => <span className={`form ${f > 1 ? 'up' : f < -1 ? 'down' : ''}`} title={t('form')}>{f > 1 ? '▲' : f < -1 ? '▼' : '–'}</span>;
export const PHead = ({ title, right }: { title: ReactNode; right?: ReactNode }) => <div className="p-head"><h3>{title}</h3>{right}</div>;
export const Bar = ({ v, cls = '' }: { v: number; cls?: string }) => <div className={`bar ${cls}`}><i style={{ width: `${clamp(v, 0, 100)}%` }} /></div>;
export const CondMini = ({ p }: { p: Player }) => <span className={`cond-mini ${(p.cond ?? 100) < 60 ? 'low' : ''}`}><i style={{ width: `${Math.round(p.cond ?? 100)}%` }} /></span>;

/** ảnh nền mờ (splash tướng) */
export const BgArt = ({ champ }: { champ?: string }) => (
  <div className="bg-art" aria-hidden="true"><i style={{ backgroundImage: `url('${champSplash(champ || featuredChamp())}')` }} /></div>
);

export function LangSwitch() {
  const l = getLang();
  const set = (x: string) => { setLang(x); document.title = `${t('app.title')} — ${t('app.tagline')}`; refresh(); };
  return (
    <div className="lang" role="group" aria-label={t('lang.label')}>
      <button className={l === 'vi' ? 'on' : ''} onClick={() => set('vi')}>VI</button>
      <button className={l === 'en' ? 'on' : ''} onClick={() => set('en')}>EN</button>
    </div>
  );
}

/** nhóm nút chọn (chip) */
export function Seg<T extends string>({ items, value, onChange, label, cls = '' }: { items: readonly T[]; value: T | null | undefined; onChange: (v: T) => void; label: (v: T) => ReactNode; cls?: string }) {
  return <div className={`seg ${cls}`}>{items.map((x) => <button key={x} className={`chip ${value === x ? 'on' : ''}`} onClick={() => onChange(x)}>{label(x)}</button>)}</div>;
}

export function ModalHost() {
  const m = ui.modal;
  if (!m) return null;
  return (
    <div className="modal-wrap" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={`modal ${m.wide ? 'wide' : ''}`} role="dialog">
        <button className="modal-x" aria-label={t('common.close')} onClick={closeModal}>✕</button>
        {m.render(closeModal)}
      </div>
    </div>
  );
}

export function ToastHost() {
  return <>{ui.toasts.map((x, i) => <div key={x.id} className={`toast toast-${x.kind} show`} style={{ bottom: `${1.2 + i * 3.4}rem` }}>{x.msg}</div>)}</>;
}

/** hộp xác nhận */
export function confirmBox(msg: string): Promise<boolean> {
  return new Promise((res) => {
    let answered = false;
    ui.modal = {
      render: (close) => (
        <>
          <p>{msg}</p>
          <div className="row end gap">
            <button className="btn ghost" onClick={() => { answered = true; close(); res(false); }}>{t('common.cancel')}</button>
            <button className="btn primary" onClick={() => { answered = true; close(); res(true); }}>{t('common.ok')}</button>
          </div>
        </>
      ),
      onClose: () => { if (!answered) res(false); },
    };
    refresh();
  });
}

// ---------- Bảng ngọc ----------
type RP = { p: number; pr: number[]; s: number; sr: number[]; sh: number[]; kind?: string; bonus?: number; wr?: number; pick?: number };
export const RuneIco = ({ id, size = 22, cls = '' }: { id: number; size?: number; cls?: string }) => (
  <img className={`rune-i ${cls}`} src={runeImg(id)} width={size} height={size} alt="" title={runeName(id, getLang() === 'vi')} loading="lazy" />
);
/** gọn: ngọc chính + nhánh phụ (dùng trong cấm chọn / trận / tổng kết) */
export const RuneMini = ({ r, size = 22 }: { r?: RP | null; size?: number }) => (r ? (
  <span className={`rune-mini k-${r.kind || 'meta'}`} title={`${runeName(r.pr[0], getLang() === 'vi')} · ${runeName(r.s, getLang() === 'vi')}${r.kind ? ' — ' + t('rn.' + r.kind) : ''}`}>
    <RuneIco id={r.pr[0]} size={size} cls="ks" /><RuneIco id={r.s} size={Math.round(size * 0.55)} cls="sec" />
  </span>
) : null);
/** đầy đủ: nhánh chính 4 ngọc, nhánh phụ 2 ngọc, mảnh chỉ số */
export function RunePage({ r, foot }: { r: RP; foot?: ReactNode }) {
  const vi = getLang() === 'vi';
  return (
    <div className="rune-pg">
      <div className="rp-main"><RuneIco id={r.pr[0]} size={44} cls="ks" /><div><b>{runeName(r.pr[0], vi)}</b><small>{runeName(r.p, vi)} · {runeName(r.s, vi)}</small></div></div>
      <div className="rp-row"><RuneIco id={r.p} size={16} cls="st" />{r.pr.slice(1).map((id) => <RuneIco key={id} id={id} size={26} />)}<i className="rp-sep" /><RuneIco id={r.s} size={16} cls="st" />{r.sr.map((id) => <RuneIco key={id} id={id} size={26} />)}</div>
      <div className="rp-sh">{r.sh.map((id, i) => <span key={i} className={`shd s${id}`} title={runeName(id, vi)}>{runeName(id, vi)}</span>)}</div>
      {foot && <div className="rp-foot">{foot}</div>}
    </div>
  );
}
