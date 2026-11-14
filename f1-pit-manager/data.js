// =============================================================
//  PIT WALL 26 — データ定義
//  チーム・ドライバーは架空（実在チーム/選手の商標・肖像を避けるため）。
//  数値はこのファイルを書き換えれば自由に調整できます。
// =============================================================

// コンパウンド特性（90秒ラップ換算の秒数。実ラップ長に応じてスケール）
const COMPOUNDS = {
  S: { name: 'SOFT',   jp: 'ソフト',     color: '#ff2d2d', offset: 0.00, deg: 0.075, life: 20, wetOk: false },
  M: { name: 'MEDIUM', jp: 'ミディアム', color: '#ffd400', offset: 0.55, deg: 0.048, life: 30, wetOk: false },
  H: { name: 'HARD',   jp: 'ハード',     color: '#f2f2f2', offset: 1.05, deg: 0.030, life: 42, wetOk: false },
  I: { name: 'INTER',  jp: 'インター',   color: '#2fd34a', offset: 0.00, deg: 0.050, life: 30, wetOk: true },
  W: { name: 'WET',    jp: 'ウェット',   color: '#2f7dff', offset: 0.00, deg: 0.040, life: 40, wetOk: true },
};

// 架空チーム（pace は下のチャンピオンシップポイントから自動算出）
// reliability = 1レースあたりのメカニカルトラブル発生率（過去データ風の想定値）
// pitCrew = 静止時間の平均（秒）
const TEAMS = [
  { id: 'VOL', name: 'Volta Racing',        color: '#ff8a1f', color2: '#1a1a1a', reliability: 0.045, pitCrew: 2.25,
    drivers: [
      { name: 'L. Navarro',   code: 'NAV', num: 4,  skill: 0.95, aggr: 0.65, tyre: 0.85, cons: 0.90, wet: 0.88, ovt: 0.85, temper: 0.4, quirk: 'タイヤを労わるのが上手く、終盤に強い' },
      { name: 'O. Pryce',     code: 'PRY', num: 81, skill: 0.94, aggr: 0.55, tyre: 0.92, cons: 0.93, wet: 0.80, ovt: 0.78, temper: 0.2, quirk: '冷静沈着。無線は短く的確' },
    ] },
  { id: 'APX', name: 'Apex Dynamics',       color: '#2b3fbf', color2: '#ffcc00', reliability: 0.055, pitCrew: 2.10,
    drivers: [
      { name: 'M. Verhagen',  code: 'VER', num: 1,  skill: 0.99, aggr: 0.90, tyre: 0.88, cons: 0.95, wet: 0.99, ovt: 0.97, temper: 0.8, quirk: '超攻撃的。雨で別次元、無線で戦略に口を出す' },
      { name: 'Y. Tanabe',    code: 'TAN', num: 22, skill: 0.86, aggr: 0.60, tyre: 0.75, cons: 0.82, wet: 0.80, ovt: 0.75, temper: 0.5, quirk: 'リアの不安定さを嫌い、ブレーキングで攻める' },
    ] },
  { id: 'ROS', name: 'Rossa Veloce',        color: '#d4001a', color2: '#ffe600', reliability: 0.065, pitCrew: 2.30,
    drivers: [
      { name: 'C. Lombard',   code: 'LOM', num: 16, skill: 0.94, aggr: 0.75, tyre: 0.78, cons: 0.85, wet: 0.88, ovt: 0.86, temper: 0.7, quirk: '一発の速さは随一。戦略に不満を言いがち' },
      { name: 'E. Hartley',   code: 'HAR', num: 44, skill: 0.93, aggr: 0.55, tyre: 0.90, cons: 0.90, wet: 0.95, ovt: 0.88, temper: 0.5, quirk: 'ベテラン。雨とタイヤマネジメントの達人' },
    ] },
  { id: 'ARG', name: 'Argent Motorsport',   color: '#00c6b5', color2: '#c0c0c0', reliability: 0.050, pitCrew: 2.35,
    drivers: [
      { name: 'G. Rowntree',  code: 'ROW', num: 63, skill: 0.93, aggr: 0.55, tyre: 0.85, cons: 0.94, wet: 0.86, ovt: 0.80, temper: 0.3, quirk: '精密機械。予選で強い' },
      { name: 'K. Antonelli', code: 'KAN', num: 12, skill: 0.87, aggr: 0.70, tyre: 0.72, cons: 0.78, wet: 0.80, ovt: 0.82, temper: 0.4, quirk: '若手。速いがミスも出る' },
    ] },
  { id: 'VRD', name: 'Verdant GP',          color: '#00704a', color2: '#d9ff00', reliability: 0.070, pitCrew: 2.45,
    drivers: [
      { name: 'F. Almeida',   code: 'ALM', num: 14, skill: 0.90, aggr: 0.70, tyre: 0.92, cons: 0.90, wet: 0.92, ovt: 0.90, temper: 0.6, quirk: '老獪。ディフェンスが異常に上手い' },
      { name: 'L. Strand',    code: 'STR', num: 18, skill: 0.78, aggr: 0.50, tyre: 0.80, cons: 0.80, wet: 0.84, ovt: 0.70, temper: 0.3, quirk: '雨で化けることがある' },
    ] },
  { id: 'HWL', name: 'Hartwell Racing',     color: '#1468ff', color2: '#0a1a3a', reliability: 0.075, pitCrew: 2.40,
    drivers: [
      { name: 'A. Sainz-Rey', code: 'SAR', num: 55, skill: 0.90, aggr: 0.60, tyre: 0.86, cons: 0.90, wet: 0.84, ovt: 0.84, temper: 0.5, quirk: '戦略眼があり、自分からピットを提案する' },
      { name: 'A. Albers',    code: 'ALB', num: 23, skill: 0.86, aggr: 0.50, tyre: 0.85, cons: 0.88, wet: 0.80, ovt: 0.78, temper: 0.2, quirk: '安定感抜群のチームプレーヤー' },
    ] },
  { id: 'KST', name: 'Kestrel Junior',      color: '#e8ecff', color2: '#1d3cff', reliability: 0.080, pitCrew: 2.40,
    drivers: [
      { name: 'I. Hadid',     code: 'HAD', num: 6,  skill: 0.84, aggr: 0.65, tyre: 0.75, cons: 0.80, wet: 0.78, ovt: 0.78, temper: 0.4, quirk: '一発の速さがある新人' },
      { name: 'L. Lawson',    code: 'LAW', num: 30, skill: 0.83, aggr: 0.85, tyre: 0.70, cons: 0.76, wet: 0.78, ovt: 0.84, temper: 0.8, quirk: 'とにかく引かない。接触が多め' },
    ] },
  { id: 'AZL', name: 'Azure Lumière',       color: '#0090ff', color2: '#ff5fb0', reliability: 0.085, pitCrew: 2.55,
    drivers: [
      { name: 'P. Garnier',   code: 'GAR', num: 10, skill: 0.85, aggr: 0.70, tyre: 0.78, cons: 0.80, wet: 0.86, ovt: 0.80, temper: 0.6, quirk: 'ウェットで強いが感情的' },
      { name: 'F. Colapinto', code: 'COL', num: 43, skill: 0.80, aggr: 0.75, tyre: 0.70, cons: 0.72, wet: 0.76, ovt: 0.80, temper: 0.5, quirk: '攻めすぎてタイヤを使い切る' },
    ] },
  { id: 'IRN', name: 'Ironside Racing',     color: '#b7b7b7', color2: '#e1001a', reliability: 0.090, pitCrew: 2.60,
    drivers: [
      { name: 'E. Okonkwo',   code: 'OKO', num: 31, skill: 0.84, aggr: 0.65, tyre: 0.80, cons: 0.84, wet: 0.80, ovt: 0.78, temper: 0.5, quirk: 'ロングランが得意' },
      { name: 'O. Bearden',   code: 'BEA', num: 87, skill: 0.82, aggr: 0.70, tyre: 0.76, cons: 0.78, wet: 0.76, ovt: 0.80, temper: 0.4, quirk: 'オーバーテイクで光る若手' },
    ] },
  { id: 'NDR', name: 'Nordring',            color: '#8a8f98', color2: '#ff2a00', reliability: 0.110, pitCrew: 2.70,
    drivers: [
      { name: 'N. Hulkenberg',code: 'HUL', num: 27, skill: 0.84, aggr: 0.55, tyre: 0.86, cons: 0.88, wet: 0.84, ovt: 0.76, temper: 0.3, quirk: '経験豊富でミスが少ない' },
      { name: 'G. Bortoleto', code: 'BOR', num: 5,  skill: 0.82, aggr: 0.60, tyre: 0.78, cons: 0.80, wet: 0.78, ovt: 0.76, temper: 0.3, quirk: '吸収が早い若手' },
    ] },
  { id: 'LBS', name: 'Liberty Stars',       color: '#101010', color2: '#ffffff', reliability: 0.130, pitCrew: 2.85,
    drivers: [
      { name: 'S. Perera',    code: 'PER', num: 11, skill: 0.84, aggr: 0.55, tyre: 0.92, cons: 0.84, wet: 0.80, ovt: 0.82, temper: 0.4, quirk: 'タイヤを持たせる名人' },
      { name: 'V. Bottas',    code: 'BOT', num: 77, skill: 0.83, aggr: 0.45, tyre: 0.84, cons: 0.88, wet: 0.80, ovt: 0.72, temper: 0.2, quirk: '淡々と走る。無線はほぼ無言' },
    ] },
];

// 2026 シーズン想定のチャンピオンシップポイント（スタート時点の値・強さの元）
// ※ゲーム内でレースを走ると加算されます。
const START_POINTS = {
  NAV: 342, PRY: 330, VER: 335, TAN: 40, LOM: 160, HAR: 145, ROW: 260, KAN: 150,
  ALM: 20, STR: 30, SAR: 64, ALB: 73, HAD: 50, LAW: 36, GAR: 18, COL: 4,
  OKO: 34, BEA: 40, HUL: 41, BOR: 19, PER: 8, BOT: 4,
};

// -------------------------------------------------------------
//  2026 カレンダー（24戦）
//  laps / len(km) は実際の公式値。baseLap はおおよそのレースペース(秒)。
//  pitLoss: ピットレーン通過ロス(秒), deg: タイヤ攻撃性, ovt: 抜きにくさ(0-1)
//  comp: 持ち込みコンパウンド(C1〜C6), scLaps: SC平均周回
//  weather: 過去の本番レースの天候（雨の時間帯をレース進行率0-1で表現、強さ0-1）
//    ※記録を簡略化した近似です。year:null 相当の晴天年も含まれます。
//  shape: コース形状（0-100座標の簡略トレース。時計回り/反時計回りは概ね再現）
// -------------------------------------------------------------
const W = (year, ...rain) => ({ year, rain: rain.map(r => ({ s: r[0], e: r[1], i: r[2] })) });

const CIRCUITS = [
  { id: 'AUS', name: 'オーストラリアGP', track: 'アルバート・パーク', laps: 58, len: 5.278, baseLap: 82.0, pitLoss: 19.5, deg: 0.9, ovt: 0.55, comp: 'C3-C4-C5', scLaps: 4, terrain: '#2f6b33', water: true,
    weather: [W(2018), W(2019), W(2022), W(2023), W(2024), W(2025, [0, 0.12, 0.45], [0.75, 0.9, 0.55])],
    shape: [[30,85],[48,88],[64,84],[78,74],[86,60],[84,46],[76,36],[70,22],[58,12],[44,12],[36,22],[28,34],[18,46],[14,60],[20,74]] },
  { id: 'CHN', name: '中国GP', track: '上海インターナショナル', laps: 56, len: 5.451, baseLap: 96.5, pitLoss: 22.5, deg: 1.15, ovt: 0.35, comp: 'C2-C3-C4', scLaps: 4, terrain: '#5c7a3a',
    weather: [W(2016), W(2017, [0, 0.08, 0.35]), W(2018), W(2019), W(2024), W(2025)],
    shape: [[20,80],[60,80],[85,78],[90,68],[78,62],[60,64],[54,54],[64,44],[74,36],[70,24],[58,20],[50,30],[40,38],[30,28],[22,18],[12,26],[16,44],[24,58],[14,70]] },
  { id: 'JPN', name: '日本GP', track: '鈴鹿サーキット', laps: 53, len: 5.807, baseLap: 95.0, pitLoss: 22.0, deg: 1.1, ovt: 0.65, comp: 'C1-C2-C3', scLaps: 4, terrain: '#2e5f2e',
    weather: [W(2018), W(2019), W(2022, [0, 1, 0.75]), W(2023), W(2024), W(2025)],
    shape: [[30,78],[50,80],[62,72],[56,62],[64,54],[58,46],[68,38],[80,34],[88,24],[80,14],[66,18],[54,28],[44,40],[36,52],[24,60],[12,64],[10,74]] },
  { id: 'BHR', name: 'バーレーンGP', track: 'バーレーン国際', laps: 57, len: 5.412, baseLap: 96.0, pitLoss: 23.0, deg: 1.35, ovt: 0.25, comp: 'C1-C2-C3', scLaps: 4, terrain: '#c9a46a',
    weather: [W(2019), W(2021), W(2022), W(2023), W(2024), W(2025)],
    shape: [[70,85],[30,85],[18,80],[22,70],[40,66],[50,56],[44,44],[30,40],[20,30],[26,18],[44,14],[60,22],[70,34],[82,30],[90,44],[86,62],[82,76]] },
  { id: 'SAU', name: 'サウジアラビアGP', track: 'ジェッダ・コーニッシュ', laps: 50, len: 6.174, baseLap: 92.0, pitLoss: 20.0, deg: 0.75, ovt: 0.45, comp: 'C3-C4-C5', scLaps: 5, terrain: '#cdb383', water: true,
    weather: [W(2021), W(2022), W(2023), W(2024), W(2025)],
    shape: [[40,92],[50,90],[56,80],[54,66],[60,54],[56,40],[62,28],[58,14],[48,8],[42,14],[44,30],[38,44],[44,58],[38,72],[30,84]] },
  { id: 'MIA', name: 'マイアミGP', track: 'マイアミ・インターナショナル', laps: 57, len: 5.412, baseLap: 92.5, pitLoss: 19.5, deg: 1.0, ovt: 0.4, comp: 'C3-C4-C5', scLaps: 4, terrain: '#3f7f4a',
    weather: [W(2022), W(2023), W(2024), W(2025)],
    shape: [[20,70],[60,70],[86,68],[90,58],[80,50],[60,52],[50,44],[56,34],[70,30],[78,20],[60,14],[30,14],[14,22],[18,36],[30,46],[22,56]] },
  { id: 'CAN', name: 'カナダGP', track: 'ジル・ヴィルヌーヴ', laps: 70, len: 4.361, baseLap: 76.5, pitLoss: 18.5, deg: 0.85, ovt: 0.35, comp: 'C4-C5-C6', scLaps: 5, terrain: '#3a6e40', water: true,
    weather: [W(2017), W(2018), W(2019), W(2022), W(2023), W(2024, [0, 0.35, 0.6], [0.35, 0.5, 0.25]), W(2025)],
    shape: [[18,40],[30,30],[40,34],[50,32],[66,30],[80,28],[90,34],[86,42],[72,46],[60,50],[46,54],[32,58],[20,60],[12,52]] },
  { id: 'MON', name: 'モナコGP', track: 'モンテカルロ市街地', laps: 78, len: 3.337, baseLap: 75.5, pitLoss: 20.0, deg: 0.55, ovt: 0.95, comp: 'C4-C5-C6', scLaps: 5, terrain: '#6a6a5a', water: true,
    weather: [W(2016, [0, 0.3, 0.6]), W(2017), W(2018), W(2019), W(2021), W(2022, [0, 0.25, 0.7]), W(2023, [0.68, 0.85, 0.55]), W(2024), W(2025)],
    shape: [[44,70],[30,72],[18,66],[22,54],[34,44],[46,34],[60,22],[72,18],[76,28],[66,36],[70,48],[82,56],[84,66],[70,68]] },
  { id: 'ESP', name: 'バルセロナGP', track: 'カタロニア', laps: 66, len: 4.657, baseLap: 79.5, pitLoss: 21.0, deg: 1.3, ovt: 0.55, comp: 'C1-C2-C3', scLaps: 4, terrain: '#7a8a4a',
    weather: [W(2019), W(2021), W(2022), W(2023), W(2024), W(2025)],
    shape: [[30,82],[70,82],[86,76],[84,62],[72,56],[78,44],[70,30],[56,22],[42,30],[48,42],[36,50],[22,44],[14,56],[18,72]] },
  { id: 'AUT', name: 'オーストリアGP', track: 'レッドリンク・リンク', laps: 71, len: 4.318, baseLap: 68.5, pitLoss: 20.5, deg: 1.05, ovt: 0.3, comp: 'C3-C4-C5', scLaps: 3, terrain: '#3d7a35',
    weather: [W(2019), W(2020), W(2021), W(2022), W(2023), W(2024), W(2025)],
    shape: [[20,70],[56,74],[88,30],[74,22],[52,40],[40,52],[26,46],[16,36],[30,24],[42,18],[24,14],[10,24],[8,48],[12,62]] },
  { id: 'GBR', name: 'イギリスGP', track: 'シルバーストン', laps: 52, len: 5.891, baseLap: 90.5, pitLoss: 20.0, deg: 1.2, ovt: 0.4, comp: 'C1-C2-C3', scLaps: 4, terrain: '#3a7a3a',
    weather: [W(2019), W(2021), W(2022), W(2023), W(2024, [0.38, 0.62, 0.4]), W(2025, [0, 0.4, 0.65], [0.55, 0.65, 0.35])],
    shape: [[40,84],[60,86],[76,78],[86,64],[80,52],[86,40],[78,26],[62,20],[54,30],[44,22],[30,16],[18,24],[22,38],[14,52],[20,66],[28,74]] },
  { id: 'BEL', name: 'ベルギーGP', track: 'スパ・フランコルシャン', laps: 44, len: 7.004, baseLap: 108.0, pitLoss: 19.0, deg: 1.0, ovt: 0.25, comp: 'C1-C2-C3', scLaps: 4, terrain: '#2c5a2c',
    weather: [W(2018), W(2019), W(2021, [0, 1, 0.95]), W(2022), W(2023, [0, 0.1, 0.45]), W(2024), W(2025, [0, 0.15, 0.6])],
    shape: [[24,40],[16,30],[24,20],[40,14],[60,12],[80,16],[90,26],[84,36],[70,40],[62,52],[70,62],[84,70],[74,84],[54,86],[40,78],[30,68],[38,58],[30,50]] },
  { id: 'HUN', name: 'ハンガリーGP', track: 'ハンガロリンク', laps: 70, len: 4.381, baseLap: 81.0, pitLoss: 20.5, deg: 1.15, ovt: 0.8, comp: 'C3-C4-C5', scLaps: 4, terrain: '#5a7a3a',
    weather: [W(2019), W(2021, [0, 0.05, 0.4]), W(2022), W(2023), W(2024), W(2025)],
    shape: [[70,78],[30,78],[16,70],[20,58],[34,54],[28,42],[40,34],[34,22],[50,14],[66,20],[60,32],[74,40],[86,50],[84,66]] },
  { id: 'NED', name: 'オランダGP', track: 'ザントフォールト', laps: 72, len: 4.259, baseLap: 74.5, pitLoss: 21.5, deg: 1.0, ovt: 0.85, comp: 'C1-C2-C3', scLaps: 4, terrain: '#c8bc8a', water: true,
    weather: [W(2021), W(2022), W(2023, [0, 0.12, 0.55], [0.8, 0.9, 0.95]), W(2024), W(2025, [0.1, 0.2, 0.25])],
    shape: [[30,70],[60,72],[76,62],[86,48],[78,34],[62,30],[54,18],[40,14],[30,22],[40,34],[30,44],[16,46],[12,58],[18,68]] },
  { id: 'ITA', name: 'イタリアGP', track: 'モンツァ', laps: 53, len: 5.793, baseLap: 83.0, pitLoss: 23.5, deg: 0.8, ovt: 0.25, comp: 'C2-C3-C4', scLaps: 4, terrain: '#2f6a2f',
    weather: [W(2018), W(2019), W(2021), W(2022), W(2023), W(2024), W(2025)],
    shape: [[20,80],[70,80],[78,74],[74,66],[84,58],[88,40],[80,28],[66,22],[56,12],[40,10],[34,20],[30,40],[22,54],[14,66]] },
  { id: 'MAD', name: 'スペインGP', track: 'マドリング（新設）', laps: 57, len: 5.474, baseLap: 92.0, pitLoss: 21.0, deg: 1.0, ovt: 0.45, comp: 'C3-C4-C5', scLaps: 4, terrain: '#a89a6a',
    weather: [W('過去データなし・気候シミュ'), W('過去データなし・気候シミュ'), W('過去データなし・気候シミュ', [0.4, 0.55, 0.35])],
    shape: [[30,82],[60,84],[78,76],[88,62],[80,50],[86,38],[78,24],[62,18],[52,28],[40,20],[24,22],[14,36],[24,46],[16,60],[20,74]] },
  { id: 'AZE', name: 'アゼルバイジャンGP', track: 'バクー市街地', laps: 51, len: 6.003, baseLap: 105.0, pitLoss: 20.5, deg: 0.7, ovt: 0.3, comp: 'C4-C5-C6', scLaps: 5, terrain: '#9a8a6a', water: true,
    weather: [W(2018), W(2019), W(2021), W(2022), W(2023), W(2024), W(2025)],
    shape: [[90,80],[20,80],[12,72],[18,64],[30,62],[30,50],[22,40],[30,30],[22,20],[34,12],[46,22],[54,36],[64,42],[78,40],[90,50],[94,66]] },
  { id: 'SIN', name: 'シンガポールGP', track: 'マリーナ・ベイ', laps: 62, len: 4.940, baseLap: 97.0, pitLoss: 28.5, deg: 0.9, ovt: 0.8, comp: 'C3-C4-C5', scLaps: 5, terrain: '#4a5a4a', water: true, night: true,
    weather: [W(2017, [0, 0.1, 0.6]), W(2018), W(2019), W(2022, [0, 0.2, 0.55]), W(2023), W(2024), W(2025)],
    shape: [[60,80],[30,80],[16,72],[22,60],[14,48],[22,36],[34,40],[46,32],[42,20],[56,14],[70,20],[74,34],[86,40],[90,56],[78,64],[72,74]] },
  { id: 'USA', name: 'アメリカGP', track: 'サーキット・オブ・ジ・アメリカズ', laps: 56, len: 5.513, baseLap: 98.0, pitLoss: 20.5, deg: 1.1, ovt: 0.4, comp: 'C1-C3-C4', scLaps: 4, terrain: '#7a7a4a',
    weather: [W(2018), W(2019), W(2021), W(2022), W(2023), W(2024), W(2025)],
    shape: [[14,60],[20,40],[30,48],[38,36],[46,44],[54,32],[60,42],[70,36],[86,30],[90,44],[80,54],[60,58],[66,70],[58,82],[40,80],[26,74]] },
  { id: 'MEX', name: 'メキシコシティGP', track: 'エルマノス・ロドリゲス', laps: 71, len: 4.304, baseLap: 80.5, pitLoss: 22.0, deg: 0.95, ovt: 0.45, comp: 'C2-C3-C4', scLaps: 4, terrain: '#7a6a4a',
    weather: [W(2018), W(2019), W(2021), W(2022), W(2023), W(2024), W(2025)],
    shape: [[10,70],[70,70],[80,60],[76,48],[86,40],[80,26],[66,22],[50,28],[40,22],[28,30],[34,40],[24,46],[30,54],[16,58]] },
  { id: 'BRA', name: 'サンパウロGP', track: 'インテルラゴス', laps: 71, len: 4.309, baseLap: 73.0, pitLoss: 20.5, deg: 1.0, ovt: 0.3, comp: 'C2-C3-C4', scLaps: 5, terrain: '#3e6a36',
    weather: [W(2016, [0, 1, 0.85]), W(2018), W(2019), W(2021), W(2022), W(2023), W(2024, [0, 1, 0.8]), W(2025)],
    shape: [[70,24],[56,34],[60,46],[46,50],[38,40],[26,46],[30,60],[44,64],[56,72],[66,82],[78,76],[86,60],[84,40],[80,26],[76,16]] },
  { id: 'LVG', name: 'ラスベガスGP', track: 'ラスベガス・ストリップ', laps: 50, len: 6.201, baseLap: 96.0, pitLoss: 21.0, deg: 0.75, ovt: 0.35, comp: 'C3-C4-C5', scLaps: 4, terrain: '#4a4a52', night: true,
    weather: [W(2023), W(2024), W(2025)],
    shape: [[70,78],[20,78],[12,68],[22,58],[34,60],[40,50],[30,40],[36,30],[50,30],[56,20],[72,20],[88,24],[90,40],[86,62],[82,74]] },
  { id: 'QAT', name: 'カタールGP', track: 'ルサイル', laps: 57, len: 5.419, baseLap: 85.0, pitLoss: 26.0, deg: 1.4, ovt: 0.5, comp: 'C1-C2-C3', scLaps: 4, terrain: '#cbb080', night: true,
    weather: [W(2021), W(2023), W(2024), W(2025)],
    shape: [[20,72],[70,72],[84,64],[80,50],[88,38],[76,26],[60,28],[52,18],[36,20],[28,32],[40,42],[30,52],[16,50],[12,62]] },
  { id: 'ABU', name: 'アブダビGP', track: 'ヤス・マリーナ', laps: 58, len: 5.281, baseLap: 88.0, pitLoss: 21.5, deg: 0.9, ovt: 0.4, comp: 'C3-C4-C5', scLaps: 4, terrain: '#c4a674', water: true, night: true,
    weather: [W(2019), W(2021), W(2022), W(2023), W(2024), W(2025)],
    shape: [[30,80],[50,82],[60,72],[54,60],[62,50],[84,40],[90,26],[80,18],[64,22],[44,30],[30,22],[16,30],[20,44],[30,54],[20,64]] },
];

// 無線テンプレート（{tyre} 等は置換）
const RADIO = {
  tyresGone:   ['タイヤがもう限界だ！', 'リアがもう無い、グリップゼロだ', 'フロントが終わってる、早く入れてくれ'],
  tyresOk:     ['タイヤはまだいける', 'フィーリングは悪くない、もう少し引っ張れる'],
  rain:        ['雨が降ってきた！', 'ターン{n}が濡れてる、滑るぞ', 'ポツポツ来てる、どうする？'],
  rainHeavy:   ['かなり降ってる、スリックじゃ無理だ！', '前が見えない、ひどい雨だ'],
  drying:      ['ラインが乾いてきた', 'もうスリックでいけると思う'],
  pass:        ['よし、抜いた！', 'もらった！', 'クリーンに抜けた'],
  passed:      ['抜かれた、くそっ', '相手のほうがペースがある'],
  blocked:     ['前で詰まってる、抜けない', '{car}の後ろでダーティエアがきつい'],
  sc:          ['セーフティカー了解', 'SCか、ピットはどうする？'],
  complainStrat:['なんで入れないんだ！？', 'この戦略は理解できない', '今のは遅すぎる判断だ'],
  boxConfirm:  ['了解、ボックス', 'コピー、今周入る'],
  pitGood:     ['素晴らしいストップだ、ありがとう！'],
  pitBad:      ['ストップ遅すぎだろ！'],
  failure:     ['パワーが無い！止めなきゃ', '何か壊れた、ギアボックスかも', 'エンジンが…ダメだ'],
  crash:       ['クラッシュした…ごめん', 'コントロールを失った'],
  win:         ['やったー！最高だ、みんなありがとう！', 'ウィナー！完璧なレースだった！'],
  podium:      ['表彰台だ！いい仕事だったよ', 'ポディウム！みんなありがとう'],
  points:      ['ポイント獲得、悪くない', 'よし、ポイントは取れた'],
  noPoints:    ['厳しいレースだった', 'ペースが足りなかったね'],
};
