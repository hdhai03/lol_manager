// Màn tải trận như client: ảnh tướng, tuyển thủ, phép bổ trợ, ngọc chính, thông thạo, bậc rank
import { useEffect } from 'react';
import { champArt, spellImg } from '../../engine/data';
import { S } from '../../engine/state';
import { masteryLv, playerTier } from '../../engine/lolx';
import { ROLES } from '../../engine/util';
import { t, cname } from '../../i18n';
import { Badge, Mastery, RankEmblem, RuneIco } from '../components';
import type { GameResult, Side } from '../../engine/types';

export function LoadingScreen({ g, onGo }: { g: GameResult; onGo: () => void }) {
  useEffect(() => { const h = setTimeout(onGo, 6000); return () => clearTimeout(h); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const row = (sd: Side) => (
    <div className={`ld-row ${sd}`}>
      <div className="ld-team"><Badge id={sd === 'B' ? g.blue : g.red} size="md" /><b>{S.teams[sd === 'B' ? g.blue : g.red].name}</b></div>
      <div className="ld-cards">{ROLES.map((r) => {
        const x = g.players.find((y) => y.side === sd && y.role === r)!;
        const p = x.pid ? S.players[x.pid] : undefined;
        const rn = g.runes?.[sd + r];
        const tier = p ? playerTier(p.id) : null;
        return (
          <div key={r} className="ld-c">
            <div className="ld-art" style={{ backgroundImage: `url('${champArt(x.champ)}')` }} />
            <div className="ld-info">
              <div className="ld-top">{rn && <RuneIco id={rn.pr[0]} size={26} />}<span className="ld-sp">{(x.spells || []).map((s) => <img key={s} src={spellImg(s)} alt="" />)}</span></div>
              <b className="ld-pn">{p?.ign ?? '?'}</b>
              <small>{cname(x.champ)}</small>
              <div className="ld-bot">{p && <Mastery lv={masteryLv(p, x.champ)} />}{tier && <RankEmblem tier={tier.tier} size={20} />}</div>
            </div>
          </div>
        );
      })}</div>
    </div>
  );
  return (
    <div className="ld" onClick={onGo}>
      {row('B')}
      <div className="ld-mid"><b className="k-disp">VS</b><small className="muted">{t('ld.click')}</small></div>
      {row('R')}
    </div>
  );
}
