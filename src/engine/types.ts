// Kiểu dữ liệu dùng chung cho toàn bộ engine (trạng thái game, giải đấu, trận đấu, dữ liệu tĩnh).

export type Role = 'Top' | 'Jungle' | 'Mid' | 'Bot' | 'Support';
export type Side = 'B' | 'R';
export type LeagueId = 'LCK' | 'LPL' | 'LEC' | 'LCS' | 'LCP' | 'CBLOL' | 'VCS';
export type CompLeague = LeagueId | 'INTL';
export type Phase = 'kickoff' | 'fst' | 'spring' | 'msi' | 'summer' | 'worlds' | 'offseason';
export type AttrGroup = 'tech' | 'mind' | 'mental' | 'team';
export type Attr =
  | 'farm' | 'accuracy' | 'dodge' | 'positioning'
  | 'awareness' | 'judgment' | 'aggression' | 'patience' | 'creativity'
  | 'focus' | 'composure' | 'stamina'
  | 'teamwork' | 'leadership' | 'adaptability';
export type Stats = Record<Attr, number>;
/** chỉ số cũ (6 chỉ số) trong dữ liệu gốc / save cũ */
export type LegacyStats = Partial<Record<'laning' | 'mechanics' | 'teamfight' | 'macro' | 'vision' | 'consistency', number>>;

// ---------- dữ liệu tĩnh (data/*.json) ----------
export interface RealRecord { wr: number; kda: number; cspm: number; dpm: number; gpm: number; vspm: number }
export interface PoolEntry { c: string; g: number; w: number }
export interface DbPlayer {
  link: string; ign: string; role: Role; team: string; league: LeagueId; country?: string; name?: string; native?: string;
  birth?: string; age?: number; stats: LegacyStats; ovr: number; potential: number; games?: number;
  record?: RealRecord | null; pool?: PoolEntry[]; salary: number; value: number;
}
export interface DbTeam { name: string; display?: string; short: string; league: LeagueId; coach?: string; players: string[]; budget: number }
export interface League { id: LeagueId; name: string; region: string; strength: number; source?: string }
export interface Champion {
  id: string; name: string; nameVi: string; title?: string; titleVi?: string; tags: string[];
  info: { attack: number; defense: number; magic: number; difficulty: number };
  roles: Role[]; tier: string; presence: number; wr: number; picks: number; bans: number; power: number; build: string[];
}
export interface Item { id: string; name: string; nameVi: string; [k: string]: unknown }
export interface Images { leagues: Record<string, string>; teams: Record<string, string>; players: Record<string, string>; dark: string[] }
export interface PackGroup { chunks: number; bytes: number; files: Record<string, [number, number, number, string]> }
export interface Db {
  leagues: League[]; teams: Record<string, DbTeam>; players: Record<string, DbPlayer>;
  champions: Record<string, Champion>; items: Record<string, Item>; meta: { proPatch?: string; [k: string]: unknown };
  images: Images; darkLogos: Set<string>; pack: Record<string, string> | null; assetsLater?: Promise<unknown>;
  champList: Champion[]; leagueById: Record<string, League>;
}

// ---------- trạng thái game ----------
export interface SeasonStats { g: number; w: number; k: number; d: number; a: number; cs: number; mvp: number; dmg: number; gold: number; min: number; tk?: number; rt?: number }
export interface Player {
  id: string; ign: string; name: string; native: string; country: string; age: number; role: Role;
  teamId: string | null; stats: Stats; ovr: number; potential: number; pool: PoolEntry[];
  salary: number; value: number; contractUntil: number;
  form: number; morale: number; cond: number;
  record?: RealRecord | null; realGames?: number;
  season: SeasonStats; career: SeasonStats; rookie: boolean; homeLeague?: LeagueId;
  retired?: boolean; titles?: string[]; awards?: string[]; academyOf?: string | null; ovrStart?: number;
  clause?: number; promise?: 'starter' | 'rotation'; bonus?: boolean;
  t2?: { g: number; w: number; r: number }; loan?: { from: string; until: number };
  /** điểm phong độ 20 ván gần nhất (0-10) */
  fh?: number[];
  hype?: number; fromAcademy?: string;
  mastery?: Record<string, number>; honor?: number; rankHist?: { season: number; server: string; rank: number; lp: number }[];
  injury?: { kind: 'wrist' | 'back' | 'burnout'; until: number };
}
export interface Team {
  id: string; name: string; short: string; league: LeagueId; coach: string; roster: string[];
  lineup: Partial<Record<Role, string>>; budget: number; hue: number; trophies: string[]; sponsor: number;
}
export type PersonalTactic = 'safe' | 'standard' | 'aggressive';
export interface Tactics {
  tempo: 'early' | 'balanced' | 'late'; obj: 'dragon' | 'balanced' | 'top'; style: 'teamfight' | 'pick' | 'split';
  focus: 'auto' | 'carry' | 'weakest'; jungle: 'auto' | 'top' | 'mid' | 'bot' | 'farm';
  personal: Record<Role, PersonalTactic>; day?: number;
  /** độ ăn ý từng vị trí; thẻ tăng cường: ngọc / thể lực */
  chem?: Partial<Record<Role, number>>; runeB?: number; fresh?: boolean; synB?: number;
  /** kế hoạch nhịp độ theo giai đoạn (đầu < 14', giữa < 25', cuối) */
  phase?: { early: 'early' | 'balanced' | 'late'; mid: 'early' | 'balanced' | 'late'; late: 'early' | 'balanced' | 'late' };
  /** chỉ đạo riêng từng vị trí */
  roleIns?: Partial<Record<Role, string>>;
}
export interface NewsItem { id?: number; key: string; params: Record<string, unknown>; day: number; season: number; important: boolean }
export interface FinanceEntry { key: string; amount: number; params?: Record<string, unknown>; day: number; season: number }
export interface Offer { id: string; pid: string; from: string; amount: number; day: number }

/** bản ghi gọn của một ván đã đấu (lưu trong Match) */
export interface GameRecord {
  winner: string; dur: number;
  blue?: string; red?: string; kills?: Record<Side, number>; mvp?: string | null; picks?: Picks; bans?: Bans;
  towers?: Record<Side, number>; players?: PlayerLine[];
}
export interface Match {
  id: string; comp: string; day: number; a: string; b: string; bo: number; round: number;
  winsA: number; winsB: number; games: GameRecord[]; done: boolean; winner: string | null; aBlueFirst: boolean;
  group?: number; superWeek?: boolean; node?: string; swiss?: string; counted?: boolean;
  fearless?: string[]; fstat?: Record<string, number>;
}
export interface Trophy { tier: 'cup' | 'league' | 'fst' | 'msi' | 'worlds'; title: string }
export interface BracketNode { k: string; a: number | string; b: number | string; out?: number; win?: number; col: number; lo?: number; bo?: number }
interface CompBase {
  id: string; key: string; league: CompLeague; logo: string; name: string; stage: string; phase: Phase;
  matches: Match[]; done: boolean; teams: string[]; next?: string | null; trophy?: Trophy | null; bo: number;
  direct?: string[]; winnersGroup?: number;
}
export interface LeagueComp extends CompBase {
  type: 'league'; groups: { name: string | null; teams: string[]; double: boolean }[]; carry?: string | null; cross?: boolean;
}
export interface SwissComp extends CompBase {
  type: 'swiss'; boDecider: number; rec: Record<string, [number, number]>; met: Record<string, string[]>; round: number; region: Record<string, string> | null;
}
export interface BracketComp extends CompBase {
  type: 'bracket'; nodes: BracketNode[]; seeds: string[]; start: number; mk: Record<string, string>; place: Record<string, number>;
}
export type Comp = LeagueComp | SwissComp | BracketComp;

export interface GprSnap { season: number; phase: Phase; day: number; ranks: Record<string, number>; scores: Record<string, number> }
export interface Gpr { teams: Record<string, number>; leagues: Record<string, number>; snaps: GprSnap[] }

export interface Prospect { age: number; role: Role; ovr: number; pot: number }
export interface SoloAccount { id: string; pid?: string; name?: string; pr?: Prospect; lp: number; w: number; l: number; ch: Record<string, number> }
export interface SoloQ { servers: Record<string, { acc: SoloAccount[] }> }
export interface Academy { focus: string; days: Record<string, number>; intensity: 'light' | 'normal' | 'hard' }

export interface Who { pid: string; ign: string; team: string }
export interface HallEntry {
  season: number; event: string; league: CompLeague; title: string; champ: string; runner: string;
  mvp: Who; fmvp: Who | null; rookie: Who | null; allpro: Partial<Record<Role, Who>>;
  leaders: Record<'kda' | 'kills' | 'dpm' | 'cspm', (Who & { v: number; g: number })[]>;
}
export interface RecordEntry { v: number; pid?: string; ign?: string; team?: string; champ?: string; teams?: string; g?: number; season: number; event: string }
export interface Records { game: Record<string, RecordEntry>; event: Record<string, RecordEntry>; team?: Record<string, RecordEntry> }
/** [ván, thắng, hạ, chết, hỗ trợ, cs, sát thương, vàng, phút, mvp] */
export type EvRow = [number, number, number, number, number, number, number, number, number, number];
export interface EventStats { league: CompLeague; season: number; players: Record<string, EvRow>; role?: Record<string, Role>; closed: boolean }
export interface HistoryEntry { season: number; title: string; champ: string; runner: string; kind: string; league: CompLeague }
export interface DailyTask { id: string; kind: string; opp?: string; mid?: string; who?: string; n?: number }

export interface GameState {
  version: number; manager: string; userTeam: string; season: number; phase: Phase | null; day: number;
  teams: Record<string, Team>; players: Record<string, Player>;
  comps: Record<string, Comp>; phaseComps: string[];
  news: NewsItem[]; newsSeq?: number; history: HistoryEntry[]; finance: FinanceEntry[];
  training: AttrGroup; tactics: Tactics; freeAgents: string[]; created: number; userMatchesPlayed: number;
  offers?: Offer[]; listed?: string[]; renewed?: string[];
  seasonStartDay?: number; phaseStart?: Partial<Record<Phase, number>>;
  dailyCost?: number; dailyIncome?: number;
  gpr?: Gpr; soloq?: SoloQ; academy?: Academy;
  evstats?: Record<string, EventStats>; hall?: HallEntry[]; records?: Records;
  msiDirect?: string[]; worldsQ?: { byLeague: Record<string, string[]>; slots: Record<string, number>; extra: string[] }; worldsSwiss?: string[];
  pendingSwap?: { up: string; down: string } | null;
  tasks?: { day: number; items: DailyTask[]; done: string[] }; tacticsFor?: string; trainingSetDay?: number;
  inboxSeen?: number; goal?: string;
  chem?: Record<string, number>; boosts?: { id: string; kind: 'focus' | 'synergy' | 'meta' | 'fresh' | 'prep'; from: string; day: number }[]; seqB?: number;
  boostActive?: { id: string; kind: 'focus' | 'synergy' | 'meta' | 'fresh' | 'prep' } | null;
  sqOrder?: Record<string, 'rest' | 'normal' | 'grind' | 'pool' | 'duo'>; scrimPlan?: { on: boolean; opp: string | null };
  scrims?: { day: number; opp: string; win: boolean; k: [number, number]; mins: number }[];
  lastHonor?: { match: string; list: { kind: 'cool' | 'shotcall' | 'gg'; to: string; from: string }[] } | null;
  caps?: Record<string, { cap: number; floor: number; season: number }>; luxTax?: number;
  valueHist?: { key: string; season: number; phase: string; v: number }[];
  social?: { id: string; day: number; handle: string; key: string; params: Record<string, string | number>; likes: number; mood: 'pos' | 'neg' | 'meh'; pid?: string; team?: string }[]; seqP?: number;
  rivalry?: Record<string, number>; coachStyle?: Record<string, string>;
  fac?: { house: number; training: number; gym: number; analysis: number };
  missions?: { id: string; kind: 'win3' | 'top3' | 'chem' | 'promote' | 'sign' | 'fans'; start: number; deadline: number; target: number; base: number; reward: number; done?: boolean; failed?: boolean }[]; missionDay?: number;
  deal?: { id: string; brand: string; base: number; bonus: number; cond: 'worlds' | 'title' | 'fans' | 'stream'; target: number; season: number } | null;
  dealOffers?: { id: string; brand: string; base: number; bonus: number; cond: 'worlds' | 'title' | 'fans' | 'stream'; target: number; season: number }[];
  rivalBids?: Record<string, { team: string; amount: number; day: number }>;
  patch?: { v: string; day: number; mods: Record<string, number>; notes: { c: string; d: number }[]; n: number; hist?: { v: string; day: number; notes: { c: string; d: number }[] }[] };
  replays?: { id: string; season: number; day: number; comp: string; a: string; b: string; winner: string; durS: number; k: [number, number]; game: number; rin: import('./engine').RunInput; star?: boolean }[];
  ceremony?: { title: string; tier: string; season: number; team: string } | null;
  wrapped?: { season: number; team: string; w: number; l: number; titles: string[]; best?: { pid: string; rt: number; g: number }; topK?: { pid: string; k: number }; fans: [number, number]; allpro: Partial<Record<string, string>>; seen?: boolean } | null;
  dev?: Record<string, { focus: 'laning' | 'mechanics' | 'macro' | 'mental' | 'leader' | 'pool'; prog: number }>;
  scouted?: { team: string; day: number; bans: string[] }; pressDay?: number;
  staff?: { assistant: number; analyst: number; psych: number; fitness: number };
  nego?: Record<string, { pid: string; round: number; mood: number; last?: string; blockedUntil?: number }>;
  ledger?: { key: string; season: number; week: number; [cat: string]: number | string }[];
  brand?: { fans: number; hype: number; content: number; merch: number; fansStart: number }; festDay?: number;
  career?: { rep: number; conf: number; obj: 'title' | 'contend' | 'playoffs' | 'develop'; w: number; l: number; sw: number; sl: number; hist: { season: number; team: string; league: string; best: number | null; w: number; l: number; titles: string[]; conf: number }[]; offers: { team: string; day: number }[]; sacked?: boolean; best?: number | null };
  t2?: Record<string, { name: string; teams: { id: string; name: string; short: string; parent: string; ovr: number; w: number; l: number; gw: number; gl: number }[]; champ?: string }>;
  events?: { id: string; kind: 'tension' | 'scandal' | 'sick' | 'stream' | 'bootcamp' | 'fanmeet' | 'reschedule'; day: number; pid?: string; pid2?: string; amount?: number; done?: string; out?: string }[]; seqE?: number;
}

// ---------- cấm/chọn & kết quả ván ----------
export type Picks = Record<Side, Partial<Record<Role, string>>>;
export type Bans = Record<Side, string[]>;
export interface Draft {
  blue: string; red: string; step: number; bans: Bans; picks: Picks;
  log: { side: Side; type: 'ban' | 'pick'; champ: string; role: Role | null }[]; locked: string[];
}
export interface PlayerLine {
  side: Side; role: Role; pid: string | null; champ: string; k: number; d: number; a: number; cs: number; gold: number; dmg: number; dmgEarly?: number;
  build?: string[]; adapt?: 'mr' | 'armor' | 'none' | 'miss';
}
export interface GameEvent { t: number; m: number; s: number; type: string; side: Side; [k: string]: unknown }
/** khung hình: [x, y, máu, chết(nhịp), cấp, vàng, cs, hạ, chết, hỗ trợ] */
export type FrameUnit = [number, number, number, number, number, number, number, number, number, number];
export interface ObjTally { grubs: number; heralds: number; barons: number; elders: number; inhibs: number; plates: number }
export interface GameResult {
  winner: Side; winnerId: string; blue: string; red: string; dur: number; durS: number; gold: number[];
  events: GameEvent[]; kills: Record<Side, number>; towers: Record<Side, number>;
  drakes: Record<Side, string[]>; soul: Side | null; obj: Record<Side, ObjTally>;
  players: PlayerLine[]; mvp: string | null; picks: Picks; bans: Bans; frames: Record<string, FrameUnit>[] | null;
  pWinB?: number; recorded?: boolean; fights?: FightRec[];
  /** đầu vào để mô phỏng lại (chỉ trong bộ nhớ / bản phát lại) */
  rin?: import('./engine').RunInput;
  runes?: Record<string, { p: number; pr: number[]; s: number; sr: number[]; sh: number[]; kind: string; bonus: number; wr?: number }>;
}
/** một pha giao tranh ghi lại để phát lại: s0 = giây bắt đầu, ts = hệ số nén thời gian; frames: [t, x,y,hp × mỗi tướng] */
export interface FightRec { s0: number; ts: number; keys: string[]; frames: number[][]; acts: { t: number; s: string; k: string; tg?: string; x?: number; y?: number }[] }
