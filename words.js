// 게임·단어 따라쓰기용 단어 목록과 난이도 설정. 대문자만 쓴다 (획 데이터가 대문자뿐).

export const WORDS = {
  easy: ["CAT", "DOG", "SUN", "HAT", "BAG", "BUS", "CAR", "CUP", "EGG", "PIG", "BEE", "BOX", "FOX", "JAM", "KEY", "MAP", "PEN", "RED", "TOY", "ZOO"],
  medium: ["BALL", "FISH", "MILK", "NOSE", "KING", "GOAT", "DUCK", "FROG", "LION", "BIRD", "CAKE", "TREE", "STAR", "MOON", "BOOK"],
  hard: ["APPLE", "QUEEN", "WATER", "ZEBRA", "TIGER", "HOUSE", "HORSE", "MOUSE", "SHEEP", "GRAPE", "BREAD", "CANDY"],
};

export const LETTERS_AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// speed: 초당 내려오는 거리 (하늘 높이 대비 비율). 0.035 → 약 28초 만에 바닥.
// maxShips: 동시에 떠 있는 비행선 수. spawnMs: 새 비행선 등장 간격.
// singleLetterRate: 단어 대신 글자 하나가 나올 확률.
// 교육용이라 두 단계만 둔다. (WORDS.hard는 단어 따라쓰기 등에서 쓸 수 있게 남겨 둔다)
export const DIFFICULTY = {
  easy: { key: "easy", label: "쉬움", desc: "글자 하나와 쉬운 단어 · 천천히 · 한 대씩", speed: 0.035, maxShips: 1, spawnMs: 5000, singleLetterRate: 0.5, words: WORDS.easy },
  medium: { key: "medium", label: "보통", desc: "3~4글자 단어 · 조금 빠르게 · 두 대까지", speed: 0.05, maxShips: 2, spawnMs: 3800, singleLetterRate: 0, words: [...WORDS.easy, ...WORDS.medium] },
};

export const DIFFICULTY_ORDER = ["easy", "medium"];

export const LIVES = 3;
export const SCORE_PER_LETTER = 10;
export const SPEED_RAMP_PER_KILL = 0.04; // 격추마다 속도 4%씩 증가
export const SPEED_RAMP_MAX = 2.0;

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
