// Biểu tượng nét mảnh dùng trong danh sách việc / sự kiện (không dùng emoji).
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const S = (d: string) => (p: P) => <svg viewBox="0 0 24 24" aria-hidden="true" {...p}><path d={d} /></svg>;

export const IcPlay = S('M7 4v16l13-8z');
export const IcUsers = S('M8 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm8.5.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM1.5 20c.5-4 3.2-6 6.5-6s6 2 6.5 6zM14 14.3c3.6-.6 7.6.6 8.5 5.7H16c-.3-2.4-1-4.2-2-5.7z');
export const IcMail = S('M2 5h20v14H2zm2 2v.5l8 5.5 8-5.5V7z');
export const IcTactic = S('M2 5h20v14H2zm2 2v10h7V7zm9 0v10h7V7zM5 9h2v2H5zm2 4h2v2H7zm9-3h2v4h-2z');
export const IcContract = S('M5 2h10l4 4v16H5zm3 7h8v1.6H8zm0 4h8v1.6H8zm0 4h5v1.6H8z');
export const IcTrain = S('M2 10h3V7h2v10H5v-3H2zm20 0h-3V7h-2v10h2v-3h3zM8 11h8v2H8z');
export const IcRest = S('M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z');
export const IcScout = S('M10 3a7 7 0 0 1 5.6 11.2l5.6 5.6-1.4 1.4-5.6-5.6A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z');
export const IcMoney = S('M3 6h18v12H3zm9 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 8v2a2 2 0 0 0 2-2zm12 0a2 2 0 0 0 2 2V8zM5 14v2h2a2 2 0 0 0-2-2zm14 0a2 2 0 0 0-2 2h2z');
export const IcSave = S('M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 2v5h8V5H7zm5 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z');
export const IcMenu = S('M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z');
export const IcFwd = S('M4 5v14l8-7zm8 0v14l8-7z');
export const IcLineup = S('M12 2 3 6v6c0 5 3.8 9.4 9 10 5.2-.6 9-5 9-10V6zm-1 5h2v5h-2zm0 7h2v2h-2z');
export const IcChart = S('M3 20h18v2H3zM5 10h3v8H5zm5-6h3v14h-3zm5 9h3v5h-3z');
export const IcVerified = S('M12 1l2.6 2.2 3.4-.4.9 3.3 3 1.7-1.3 3.2 1.3 3.2-3 1.7-.9 3.3-3.4-.4L12 23l-2.6-2.2-3.4.4-.9-3.3-3-1.7L3.4 13 2.1 9.8l3-1.7.9-3.3 3.4.4zm-1.2 14.2 6-6-1.4-1.4-4.6 4.6-2.2-2.2-1.4 1.4z');

/** biểu tượng nét to cho khối "sự kiện" */
export const IcInvite = (p: P) => (
  <svg viewBox="0 0 64 64" aria-hidden="true" {...p}><g fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round">
    <path d="M6 26 32 8l26 18v30H6z" /><path d="M6 26l26 18 26-18" /><path d="M22 14h20v8a10 10 0 0 1-20 0zm10 18v5m-5 2h10" /><path d="M22 16h-4a4 4 0 0 0 4 6m20-6h4a4 4 0 0 1-4 6" /></g></svg>
);
export const IcTrophy = (p: P) => (
  <svg viewBox="0 0 64 64" aria-hidden="true" {...p}><path d="M18 8h28v14a14 14 0 0 1-28 0zM32 36v10m-10 8h20M18 12H8v4a10 10 0 0 0 10 10m28-14h10v4a10 10 0 0 1-10 10" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const IcSwords = (p: P) => (
  <svg viewBox="0 0 64 64" aria-hidden="true" {...p}><g fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 8l26 26m-4 4 4 4m-8-8 8 8M44 34l8 8m-4-12-8 8M54 8 28 34m4 4-4 4m8-8-8 8M20 34l-8 8m4-12 8 8" /><path d="M8 50l6 6M50 56l6-6" /></g></svg>
);
export const IcHeart = (p: P) => <svg viewBox="0 0 24 24" aria-hidden="true" {...p}><path d="M12 20s-7-4.4-9.3-8.6C1 8.2 3 4.5 6.6 4.5c2 0 3.4 1.2 4.1 2.3.7-1.1 2.1-2.3 4.1-2.3C18.4 4.5 20.4 8.2 19 11.4 17 15.6 12 20 12 20z" /></svg>;
export const IcComment = (p: P) => <svg viewBox="0 0 24 24" aria-hidden="true" {...p}><path d="M4 5h16v11H9l-5 4z" /></svg>;
