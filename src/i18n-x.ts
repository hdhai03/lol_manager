// Chuỗi cho đợt cập nhật lối chơi lớn (tách riêng cho gọn): thị trường, đội hình, trận đấu, câu lạc bộ.
export const X: { vi: Record<string, string>; en: Record<string, string> } = { vi: {}, en: {} };
const add = (vi: Record<string, string>, en: Record<string, string>) => { Object.assign(X.vi, vi); Object.assign(X.en, en); };

// ---------- thị trường ----------
add({
  'news.aiMoves': 'Thị trường mùa nghỉ sôi động: {list} ({n} thương vụ).',
  'news.wantsOut': '{player} bất mãn kéo dài và chính thức đề nghị được ra đi.',
  'news.staysHappy': '{player} đã vui vẻ trở lại và rút đề nghị chia tay.',
  'news.retireMine': '{player} ({age} tuổi) tuyên bố giải nghệ.',
  'news.retireStar': 'Huyền thoại {player} ({age} tuổi) giải nghệ.',
  'amb.label': 'Động lực', 'amb.money': 'Tiền lương', 'amb.winner': 'Danh hiệu', 'amb.home': 'Quê nhà', 'amb.play': 'Thời gian thi đấu',
  'amb.moneyD': 'Ưu tiên lương cao.', 'amb.winnerD': 'Muốn về đội đủ mạnh để vô địch.', 'amb.homeD': 'Muốn thi đấu ở giải quê nhà.', 'amb.playD': 'Cần được hứa đá chính.',
  'ng.rival': '{agent}: Một đội khác đưa ra lời mời hấp dẫn hơn. Muốn có chữ ký, hãy nâng lương lên khoảng {salary}.',
  'ng.rivalOn': '{team} cũng đang theo đuổi',
  'p.wantsOut': 'Đòi ra đi',
}, {
  'news.aiMoves': 'Busy off-season market: {list} ({n} deals).',
  'news.wantsOut': '{player} has been unhappy for too long and asks to leave.',
  'news.staysHappy': '{player} is happy again and withdraws the transfer request.',
  'news.retireMine': '{player} ({age}) announces retirement.',
  'news.retireStar': 'Legend {player} ({age}) retires.',
  'amb.label': 'Motivation', 'amb.money': 'Money', 'amb.winner': 'Trophies', 'amb.home': 'Home region', 'amb.play': 'Playing time',
  'amb.moneyD': 'Wants the best salary.', 'amb.winnerD': 'Wants a team that can win titles.', 'amb.homeD': 'Wants to play in the home league.', 'amb.playD': 'Needs a starting spot promise.',
  'ng.rival': '{agent}: Another team made a more attractive offer. Raise the salary to about {salary} to get the signature.',
  'ng.rivalOn': '{team} are also chasing him',
  'p.wantsOut': 'Wants out',
});

// ---------- đội hình: ngoại binh, hòa nhập, kèm cặp, đổi vị trí ----------
add({
  'imp.tag': 'Ngoại binh', 'imp.hint': 'Mỗi đội chỉ được tối đa {max} ngoại binh trong đội hình đá chính. Thi đấu 3 mùa liên tục ở một giải sẽ có quyền cư trú (không còn tính là ngoại binh).',
  'imp.resident': 'Cư trú: {lg}', 'imp.count': 'Ngoại binh {n}/{max}', 'imp.adapting': '{n} đang hòa nhập',
  'imp.err': 'Vi phạm luật ngoại binh: tối đa 2 ngoại binh đá chính.',
  'imp.adapt': 'Hòa nhập ({lang} → {team})',
  'lang.ko': 'tiếng Hàn', 'lang.zh': 'tiếng Trung', 'lang.vi': 'tiếng Việt', 'lang.en': 'tiếng Anh', 'lang.pt': 'tiếng Bồ', 'lang.es': 'tiếng Tây Ban Nha', 'lang.ja': 'tiếng Nhật',
  'news.resident': '{player} đã đủ 3 mùa thi đấu và có quyền cư trú tại {league}.',
  'news.adapted': '{player} đã hòa nhập hoàn toàn với đồng đội.',
  'mt.title': 'Người kèm cặp', 'mt.none': '— Không —', 'mt.mentoring': 'Đang kèm cặp {player}.', 'mt.hint': 'Chỉ tân binh (≤ 22 tuổi) mới cần người kèm cặp.',
  'mt.err.self': 'Không thể tự kèm cặp.', 'mt.err.young': 'Người kèm cặp cần từ 23 tuổi.', 'mt.err.old': 'Chỉ kèm cặp tuyển thủ ≤ 22 tuổi.', 'mt.err.weak': 'Người kèm cặp phải giỏi hơn ít nhất 4 OVR.', 'mt.err.busy': 'Người này đang kèm cặp một tân binh khác.',
  'sw.title': 'Luyện đổi vị trí', 'sw.prog': 'Sang {role} (OVR dự kiến {ovr})', 'sw.days': ' ngày', 'sw.hint': 'Chỉ số giữ nguyên, trọng số vị trí đổi. Tuyển thủ trẻ chuyển nhanh hơn.',
  'news.roleSwap': '{player} đã chuyển từ {from} sang {to}.',
}, {
  'imp.tag': 'Import', 'imp.hint': 'Each team may field at most {max} imports in the starting lineup. Three straight seasons in a league grants residency (no longer an import).',
  'imp.resident': 'Resident: {lg}', 'imp.count': 'Imports {n}/{max}', 'imp.adapting': '{n} settling in',
  'imp.err': 'Import rule: at most 2 imports in the starting lineup.',
  'imp.adapt': 'Settling in ({lang} → {team})',
  'lang.ko': 'Korean', 'lang.zh': 'Chinese', 'lang.vi': 'Vietnamese', 'lang.en': 'English', 'lang.pt': 'Portuguese', 'lang.es': 'Spanish', 'lang.ja': 'Japanese',
  'news.resident': '{player} has played 3 seasons and gains residency in the {league}.',
  'news.adapted': '{player} has fully settled in with the team.',
  'mt.title': 'Mentor', 'mt.none': '— None —', 'mt.mentoring': 'Mentoring {player}.', 'mt.hint': 'Only rookies (22 or younger) need a mentor.',
  'mt.err.self': 'Cannot mentor yourself.', 'mt.err.young': 'Mentors must be 23 or older.', 'mt.err.old': 'Only players aged 22 or younger can be mentored.', 'mt.err.weak': 'The mentor must be at least 4 OVR better.', 'mt.err.busy': 'Already mentoring another rookie.',
  'sw.title': 'Role swap training', 'sw.prog': 'To {role} (projected OVR {ovr})', 'sw.days': 'd', 'sw.hint': 'Attributes stay, role weights change. Younger players switch faster.',
  'news.roleSwap': '{player} has switched from {from} to {to}.',
});
