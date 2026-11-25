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

// ---------- trận đấu: kế hoạch đầu trận, nói chuyện, đa vị trí, quyết định, AI thích nghi ----------
add({
  'ep.title': 'Kế hoạch đầu trận', 'ep.hint': 'Cấp 1: xâm lăng thắng mặc định, mặc định thắng phòng thủ, phòng thủ phản công xâm lăng. Mắt sâu đọc được hướng đi rừng đối thủ.',
  'ep.lvl1': 'Cấp 1', 'ep.path': 'Hướng đi rừng', 'ep.ward': 'Cắm mắt',
  'ep.lvl1.invade': 'Xâm lăng', 'ep.lvl1.standard': 'Mặc định', 'ep.lvl1.defend': 'Phòng thủ',
  'ep.lvl1.invadeD': 'Cả đội vào rừng đối phương lấy bùa / săn mạng đầu.', 'ep.lvl1.standardD': 'Hỗ trợ đi rừng dọn bãi quái, lên đường đúng giờ.', 'ep.lvl1.defendD': 'Canh rừng nhà, phục kích đội xâm lăng.',
  'ep.path.top': 'Từ dưới lên trên', 'ep.path.bot': 'Từ trên xuống dưới', 'ep.path.topD': 'Kết thúc vòng rừng ở phía trên: hỗ trợ Đường trên/giữa.', 'ep.path.botD': 'Kết thúc vòng rừng ở phía dưới: hỗ trợ Đường dưới, sớm tranh Rồng.',
  'ep.ward.river': 'Sông', 'ep.ward.deep': 'Rừng sâu', 'ep.ward.lane': 'An toàn đường',
  'ep.ward.riverD': 'Kiểm soát sông và mục tiêu.', 'ep.ward.deepD': 'Đọc hướng đi rừng đối phương, khó bị gank.', 'ep.ward.laneD': 'Đi đường an toàn, ít mất mạng sớm.',
  'ep.oppStyle': 'Đối thủ', 'ep.oppLvl1': 'hay {v} cấp 1', 'ep.res': 'Cấp 1',
  'ep.cast.invade': '{team} xâm lăng cấp 1 thành công, {opp} mất bùa sớm!', 'ep.cast.standard': '{team} đọc được ý đồ và đi rừng trọn vẹn, {opp} bị trễ nhịp.', 'ep.cast.defend': '{team} phục kích ngay trong rừng nhà, {opp} trả giá cho pha xâm lăng!',
  'ai.studied': 'Đối thủ đã nghiên cứu tướng tủ của bạn:',
  'tt.title': 'Nói chuyện với đội', 'tt.ctx.pre': 'Trước loạt đấu', 'tt.ctx.lead': 'Đang dẫn', 'tt.ctx.trail': 'Đang bị dẫn', 'tt.ctx.even': 'Đang hòa',
  'tt.calm': 'Giữ bình tĩnh', 'tt.fire': 'Truyền lửa', 'tt.demand': 'Đòi hỏi nhiều hơn', 'tt.praise': 'Khen ngợi',
  'tt.calmD': 'Hợp người dễ dao động; người máu lửa thấy nhạt.', 'tt.fireD': 'Người máu lửa bùng nổ; người dễ dao động áp lực.', 'tt.demandD': 'Hiệu quả khi bị dẫn; người tự tôn và dễ dao động phản ứng xấu.', 'tt.praiseD': 'Người tự tôn rất thích; đang dẫn dễ sinh tự mãn.',
  'tmp.steady': 'Điềm tĩnh', 'tmp.fiery': 'Máu lửa', 'tmp.fragile': 'Dễ dao động', 'tmp.proud': 'Tự tôn',
  'dr.why.flex': 'đa vị trí', 'fx.title': 'Tướng đa vị trí',
  'dc.title': 'Khoảnh khắc quyết định', 'dc.trust': 'Để đội tự quyết', 'dc.called': 'Quyết định của HLV',
  'dc.baron': 'Baron Nashor đã xuất hiện', 'dc.baronD': 'Cả hai đội đang dồn về phía trên bản đồ. Bạn chỉ đạo thế nào?',
  'dc.soul': 'Điểm Linh hồn Rồng', 'dc.soulD': 'Con Rồng sắp tới quyết định Linh hồn. Đánh hay nhường?',
  'dc.behind': 'Đội bạn đang bị dẫn xa', 'dc.behindD': 'Đối thủ đang ép sân. Chọn cách xoay chuyển thế trận.',
  'dc.ahead': 'Đội bạn đang dẫn trước', 'dc.aheadD': 'Lợi thế vàng lớn. Kết thúc thế nào cho chắc?',
}, {
  'ep.title': 'Early-game plan', 'ep.hint': 'Level 1: invade beats standard, standard beats defend, defend punishes invades. Deep wards read the enemy jungle path.',
  'ep.lvl1': 'Level 1', 'ep.path': 'Jungle path', 'ep.ward': 'Warding',
  'ep.lvl1.invade': 'Invade', 'ep.lvl1.standard': 'Standard', 'ep.lvl1.defend': 'Defend',
  'ep.lvl1.invadeD': 'Whole team invades for a buff or first blood.', 'ep.lvl1.standardD': 'Leash, clear, reach lane on time.', 'ep.lvl1.defendD': 'Guard your jungle and ambush invaders.',
  'ep.path.top': 'Bot to top', 'ep.path.bot': 'Top to bot', 'ep.path.topD': 'Finish the clear topside: help top/mid.', 'ep.path.botD': 'Finish the clear botside: help bot, early dragon.',
  'ep.ward.river': 'River', 'ep.ward.deep': 'Deep jungle', 'ep.ward.lane': 'Lane safety',
  'ep.ward.riverD': 'Control river and objectives.', 'ep.ward.deepD': 'Track the enemy jungler, avoid ganks.', 'ep.ward.laneD': 'Safer laning, fewer early deaths.',
  'ep.oppStyle': 'Opponent', 'ep.oppLvl1': 'tends to {v} at level 1', 'ep.res': 'Level 1',
  'ep.cast.invade': '{team} win the level-1 invade, {opp} lose a buff early!', 'ep.cast.standard': '{team} read it and get a full clear, {opp} fall behind on tempo.', 'ep.cast.defend': '{team} ambush in their own jungle, {opp} pay for the invade!',
  'ai.studied': 'They have studied your comfort picks:',
  'tt.title': 'Team talk', 'tt.ctx.pre': 'Before the series', 'tt.ctx.lead': 'Leading', 'tt.ctx.trail': 'Trailing', 'tt.ctx.even': 'Level',
  'tt.calm': 'Stay calm', 'tt.fire': 'Fire them up', 'tt.demand': 'Demand more', 'tt.praise': 'Praise',
  'tt.calmD': 'Great for fragile players; fiery ones find it flat.', 'tt.fireD': 'Fiery players thrive; fragile ones feel pressure.', 'tt.demandD': 'Works when trailing; proud and fragile players react badly.', 'tt.praiseD': 'Proud players love it; when leading it breeds complacency.',
  'tmp.steady': 'Steady', 'tmp.fiery': 'Fiery', 'tmp.fragile': 'Fragile', 'tmp.proud': 'Proud',
  'dr.why.flex': 'flex pick', 'fx.title': 'Flex picks',
  'dc.title': 'Decision moment', 'dc.trust': 'Let the team decide', 'dc.called': "Coach's call",
  'dc.baron': 'Baron Nashor has spawned', 'dc.baronD': 'Both teams are rotating topside. Your call?',
  'dc.soul': 'Dragon soul point', 'dc.soulD': 'The next dragon decides the soul. Contest or concede?',
  'dc.behind': 'You are well behind', 'dc.behindD': 'The enemy is sieging. Pick a way to turn it around.',
  'dc.ahead': 'You have a big lead', 'dc.aheadD': 'Large gold lead. How do you close it out?',
});

// ---------- bản thử nghiệm ----------
add({
  'pt.pbe': 'Máy chủ thử nghiệm · {v}', 'pt.pbeHint': 'Ra mắt sau vài ngày. Cho tuyển thủ leo rank chế độ "Luyện tướng" để tập trước tướng sắp được tăng.',
  'news.pbe': 'Bản {v} lên máy chủ thử nghiệm ({n} ngày nữa ra mắt). Tăng: {buffs}. Giảm: {nerfs}.',
}, {
  'pt.pbe': 'Test server · {v}', 'pt.pbeHint': 'Goes live in a few days. Put players on the "Pool" solo-queue order to practise champions about to be buffed.',
  'news.pbe': 'Patch {v} hits the test server ({n} days to release). Buffs: {buffs}. Nerfs: {nerfs}.',
});

// ---------- đội học viện ở hạng 2 ----------
add({
  't2p.title': 'Chỉ đạo đội học viện · {league}', 't2p.style': 'Lối chơi', 't2p.focus': 'Ưu tiên phát triển',
  't2p.aggressive': 'Tấn công', 't2p.balanced': 'Cân bằng', 't2p.safe': 'Chắc chắn',
  't2p.aggressiveD': 'Nhỉnh hơn một chút nhưng kết quả thất thường.', 't2p.balancedD': 'Theo đúng sức mạnh hai đội.', 't2p.safeD': 'Ổn định, ít bất ngờ (lợi khi mạnh hơn đối thủ).',
}, {
  't2p.title': 'Academy team · {league}', 't2p.style': 'Style', 't2p.focus': 'Development focus',
  't2p.aggressive': 'Aggressive', 't2p.balanced': 'Balanced', 't2p.safe': 'Safe',
  't2p.aggressiveD': 'Slight edge but swingy results.', 't2p.balancedD': "Plays to both teams' strength.", 't2p.safeD': 'Steady, few upsets (good when favoured).',
});

// ---------- CLB: hội đồng, đầu tư, hợp đồng, cột mốc, so sánh, lịch tuần ----------
add({
  'brd.title': 'Hội đồng quản trị', 'brd.winNow': 'Ham thắng ngay', 'brd.youth': 'Ưu tiên trẻ hóa', 'brd.profit': 'Ưu tiên lợi nhuận', 'brd.patient': 'Kiên nhẫn',
  'brd.winNowD': 'Chỉ quan tâm kết quả. Thua liên tiếp có thể bị sa thải ngay giữa mùa.', 'brd.youthD': 'Hài lòng khi đội hình đá chính có ít nhất 2 tuyển thủ ≤ 21 tuổi.', 'brd.profitD': 'Theo dõi ngân sách hằng ngày; nợ nần làm mất tín nhiệm nhanh.', 'brd.patientD': 'Cho bạn thời gian xây dựng, ít phản ứng với từng trận.',
  'brd.line': 'Bị sa thải cuối mùa nếu độ tín nhiệm dưới {n} (hiện tại {c}).',
  'news.newOwner': '{team} đổi chủ. Hội đồng mới theo đường lối: {board}.', 'news.sackedMid': 'Hội đồng {team} mất kiên nhẫn và sa thải bạn ngay giữa mùa.',
  'inv.title': 'Đầu tư dài hạn', 'inv.hubs': 'Trung tâm tuyển trạch', 'inv.hubsD': 'Xây một lần {cost}, phí duy trì {up}/ngày. Ước lượng tiềm năng chính xác hơn và chi phí mời vào học viện giảm 20% trên máy chủ đó.',
  'inv.hubOk': 'Đã mở trung tâm tuyển trạch tại {sv}.', 'inv.loan': 'Vay ngân hàng', 'inv.loanD': 'Nhận tiền ngay, trả góp trong 120 ngày (lãi {r}%). Chỉ vay một khoản mỗi lần.',
  'inv.loanOk': 'Đã nhận khoản vay.', 'inv.loanLeft': 'Còn nợ {left} · trả {per}/ngày.', 'inv.debt': 'Ngân sách âm: nếu nợ quá 1.5 triệu$ kéo dài 2 tuần, ban lãnh đạo sẽ buộc bán tuyển thủ giá trị nhất.',
  'news.hub': 'Trung tâm tuyển trạch mới tại máy chủ {sv} đi vào hoạt động.', 'news.loanPaid': 'Đã trả hết khoản vay ngân hàng.',
  'news.debtWarn': 'Cảnh báo: {team} đang nợ nặng. Ban lãnh đạo yêu cầu cân đối tài chính.', 'news.forceSale': 'Vì nợ nần, ban lãnh đạo chấp nhận lời mua {player} từ {team}. Hãy xử lý trong hộp thư đề nghị.',
  'fin.hub': 'Trung tâm tuyển trạch {sv}', 'fin.loanIn': 'Khoản vay ngân hàng', 'fin.sellOn': 'Phần trăm bán lại ({player})', 'fin.loyalty': 'Thưởng trung thành ({player})',
  'news.sellOn': 'Nhận {amount}k$ phần trăm bán lại khi {player} chuyển đội.', 'news.optionUsed': 'Kích hoạt quyền gia hạn thêm 1 năm với {player}.',
  'ng.option': 'Quyền gia hạn 1 năm', 'ng.optionD': 'Hết hạn thì đội tự động gia hạn thêm 1 năm, cùng mức lương. Tuyển thủ kém thích điều khoản này.',
  'ng.loyal': 'Thưởng trung thành', 'ng.loyalD': 'Trả {v} khi hết hợp đồng. Tuyển thủ thích điều khoản này.',
  'mile.title': 'Cột mốc sự nghiệp', 'mile.g': 'trận chuyên nghiệp', 'mile.k': 'mạng hạ gục', 'mile.w': 'trận thắng', 'mile.mvp': 'lần MVP', 'mile.penta': 'pentakill',
  'news.milestone': '{player} cán mốc {n} {what}!',
  'cmp.btn': 'So sánh', 'cmp.search': 'Tìm tuyển thủ để so sánh…', 'cmp.shared': 'Có {n} tướng chung trong bể tướng.',
  'wk.patch': 'Ra bản cập nhật', 'wk.pbe': 'Máy chủ thử nghiệm', 'wk.clash': 'Giải Clash', 'wk.mission': 'Hạn nhiệm vụ', 'wk.t2': 'Học viện thi đấu hạng 2', 'wk.loan': 'Trả góp khoản vay',
  'wk.patchS': 'P', 'wk.pbeS': 'T', 'wk.clashS': 'C', 'wk.missionS': '!', 'wk.t2S': 'H2', 'wk.loanS': '$',
}, {
  'brd.title': 'Board', 'brd.winNow': 'Win now', 'brd.youth': 'Youth first', 'brd.profit': 'Profit first', 'brd.patient': 'Patient',
  'brd.winNowD': 'Only results matter. A bad run can get you sacked mid-season.', 'brd.youthD': 'Happy when at least 2 starters are 21 or younger.', 'brd.profitD': 'Watches the budget daily; debt costs trust fast.', 'brd.patientD': 'Gives you time to build, reacts little to single matches.',
  'brd.line': 'Sacked at season end if trust is below {n} (now {c}).',
  'news.newOwner': '{team} have new owners. New board policy: {board}.', 'news.sackedMid': 'The {team} board has lost patience and sacks you mid-season.',
  'inv.title': 'Long-term investments', 'inv.hubs': 'Scouting hubs', 'inv.hubsD': 'Build once for {cost}, upkeep {up}/day. More accurate potential estimates and 20% cheaper academy invites on that server.',
  'inv.hubOk': 'Scouting hub opened on {sv}.', 'inv.loan': 'Bank loan', 'inv.loanD': 'Cash now, repaid over 120 days ({r}% interest). One loan at a time.',
  'inv.loanOk': 'Loan received.', 'inv.loanLeft': '{left} left · {per}/day.', 'inv.debt': 'Negative budget: if debt exceeds $1.5M for 2 weeks, the board forces the sale of your most valuable player.',
  'news.hub': 'New scouting hub on the {sv} server is up and running.', 'news.loanPaid': 'Bank loan fully repaid.',
  'news.debtWarn': 'Warning: {team} are deep in debt. The board demands balanced books.', 'news.forceSale': 'Due to debt, the board accepts a bid for {player} from {team}. Handle it in your offers.',
  'fin.hub': 'Scouting hub {sv}', 'fin.loanIn': 'Bank loan', 'fin.sellOn': 'Sell-on fee ({player})', 'fin.loyalty': 'Loyalty bonus ({player})',
  'news.sellOn': 'Received {amount}k$ sell-on fee as {player} moved clubs.', 'news.optionUsed': '1-year option triggered for {player}.',
  'ng.option': '1-year team option', 'ng.optionD': 'At expiry the team extends 1 more year at the same salary. Players dislike it.',
  'ng.loyal': 'Loyalty bonus', 'ng.loyalD': 'Pay {v} when the contract ends. Players like it.',
  'mile.title': 'Career milestones', 'mile.g': 'pro games', 'mile.k': 'kills', 'mile.w': 'wins', 'mile.mvp': 'MVPs', 'mile.penta': 'pentakill',
  'news.milestone': '{player} reaches {n} {what}!',
  'cmp.btn': 'Compare', 'cmp.search': 'Search a player to compare…', 'cmp.shared': '{n} champions shared in their pools.',
  'wk.patch': 'Patch release', 'wk.pbe': 'Test server', 'wk.clash': 'Clash', 'wk.mission': 'Mission deadline', 'wk.t2': 'Academy tier-2 match', 'wk.loan': 'Loan instalment',
  'wk.patchS': 'P', 'wk.pbeS': 'T', 'wk.clashS': 'C', 'wk.missionS': '!', 'wk.t2S': 'A', 'wk.loanS': '$',
});
