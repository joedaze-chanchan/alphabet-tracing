// 게임·단어 따라쓰기용 단어 목록과 난이도 설정. 대문자만 쓴다 (획 데이터가 대문자뿐).

export const WORDS = {
  easy: ["CAT", "DOG", "SUN", "HAT", "BAG", "BUS", "CAR", "CUP", "EGG", "PIG", "BEE", "BOX", "FOX", "JAM", "KEY", "MAP", "PEN", "RED", "TOY", "ZOO"],
  medium: ["BALL", "FISH", "MILK", "NOSE", "KING", "GOAT", "DUCK", "FROG", "LION", "BIRD", "CAKE", "TREE", "STAR", "MOON", "BOOK"],
  hard: ["APPLE", "QUEEN", "WATER", "ZEBRA", "TIGER", "HOUSE", "HORSE", "MOUSE", "SHEEP", "GRAPE", "BREAD", "CANDY"],
};

export const LETTERS_AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// 단어 뜻 (게임의 4지선다 문제용)
export const MEANINGS = {
  CAT: "고양이", DOG: "개", SUN: "해", HAT: "모자", BAG: "가방", BUS: "버스", CAR: "자동차", CUP: "컵", EGG: "달걀", PIG: "돼지",
  BEE: "벌", BOX: "상자", FOX: "여우", JAM: "잼", KEY: "열쇠", MAP: "지도", PEN: "펜", RED: "빨강", TOY: "장난감", ZOO: "동물원",
  BALL: "공", FISH: "물고기", MILK: "우유", NOSE: "코", KING: "왕", GOAT: "염소", DUCK: "오리", FROG: "개구리", LION: "사자", BIRD: "새",
  CAKE: "케이크", TREE: "나무", STAR: "별", MOON: "달", BOOK: "책",
  APPLE: "사과", QUEEN: "여왕", WATER: "물", ZEBRA: "얼룩말", TIGER: "호랑이", HOUSE: "집", HORSE: "말", MOUSE: "쥐", SHEEP: "양",
  GRAPE: "포도", BREAD: "빵", CANDY: "사탕",
};

// 한 단어(또는 글자)를 세 번 연달아 다루는 순서
export const PHASES = [
  { key: "meaning", label: "뜻 고르기" }, // 영어를 보고 한글 뜻(글자는 읽는 법) 고르기
  { key: "write", label: "따라 쓰기" }, // 스펠링 따라 쓰기
  { key: "english", label: "영어 고르기" }, // 한글을 보고 영어 고르기
];

// 정답 하나 + 오답 n개를 섞어 4지선다 보기를 만든다. items: [{ en, ko }] 목록.
export function makeChoices(answer, pool, n = 3, rand = Math.random) {
  const others = pool.filter((it) => it.en !== answer.en && it.ko !== answer.ko);
  const picked = [];
  const copy = [...others];
  while (picked.length < n && copy.length > 0) {
    const i = Math.floor(rand() * copy.length);
    const it = copy.splice(i, 1)[0];
    if (!picked.some((p) => p.ko === it.ko || p.en === it.en)) picked.push(it);
  }
  const all = [answer, ...picked];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

// speed: 초당 내려오는 거리 (하늘 높이 대비 비율). 0.035 → 약 28초 만에 바닥.
// maxShips: 동시에 떠 있는 비행선 수. spawnMs: 새 비행선 등장 간격.
// singleLetterRate: 단어 대신 글자 하나가 나올 확률.
// 교육용이라 두 단계만 둔다. (WORDS.hard는 단어 따라쓰기 등에서 쓸 수 있게 남겨 둔다)
// 비행선은 한 번에 한 대씩 내려온다 (같은 단어가 세 번 연달아 나오는 방식이라 순서가 중요).
export const DIFFICULTY = {
  easy: { key: "easy", label: "쉬움", desc: "글자 하나와 쉬운 단어 · 아주 천천히", speed: 0.028, maxShips: 1, spawnMs: 1500, singleLetterRate: 0.5, words: WORDS.easy },
  medium: { key: "medium", label: "보통", desc: "3~4글자 단어 · 천천히", speed: 0.031, maxShips: 1, spawnMs: 1500, singleLetterRate: 0, words: [...WORDS.easy, ...WORDS.medium] },
};

export const DIFFICULTY_ORDER = ["easy", "medium"];

export const LIVES = 3;
export const SCORE_PER_LETTER = 10;
export const SPEED_RAMP_PER_KILL = 0.02; // 격추마다 속도 2%씩 증가
export const SPEED_RAMP_MAX = 1.6;

// 난이도에 맞는 목표(글자 또는 단어)를 하나 고른다. 직전 것과는 다른 것을 고른다.
export function pickTarget(level, prev = null, rand = Math.random) {
  const d = DIFFICULTY[level];
  for (let tries = 0; tries < 10; tries++) {
    const useLetter = rand() < d.singleLetterRate;
    const pool = useLetter ? LETTERS_AZ : d.words;
    const w = pool[Math.floor(rand() * pool.length)];
    if (w !== prev) return w;
  }
  return d.words[0];
}

export function speedMultiplier(kills) {
  return Math.min(SPEED_RAMP_MAX, 1 + SPEED_RAMP_PER_KILL * kills);
}
