// 레이싱 게임의 화면과 무관한 규칙: 문제 만들기, 차선 판정, 속도.

import { DIFFICULTY, MEANINGS, makeChoices, pickTarget } from "./words.js";
import { LETTERS, LETTER_ORDER } from "./letters.js";

export const LANES = 4;
// 도로 좌표: 평소 도로는 [-1, 1], 네 갈래 구간은 [-3, 3] (넓게 벌려 멀리서도 갈라져 보이게).
// 차선 중심은 -2.25, -0.75, 0.75, 2.25.
export const FORK_LIMIT = 3; // 네 갈래 구간에서 좌우 한계
export const LANE_CENTERS = [-2.25, -0.75, 0.75, 2.25];
export const ROAD_LIMIT = 1; // 평소 도로에서 좌우 한계
export const LANE_COLORS = ["#f87171", "#fbbf24", "#4ade80", "#60a5fa"]; // 왼쪽부터 빨강·노랑·초록·파랑

export const RACE_LIVES = 3;
export const BASE_SPEED = 12; // 초당 진행 거리 (도로 단위)
export const SPEED_PER_CORRECT = 0.3; // 정답마다 빨라지는 양
export const MAX_SPEED = 22;
export const STEER_SPEED = 3.4; // 초당 좌우 이동 (도로 단위)

// 문제 사이 거리와 네 갈래 구간 길이 (도로 단위)
export const GAP_BEFORE_FORK = 55; // 단어가 뜬 뒤 갈라지는 지점까지 거리
export const FORK_LENGTH = 45; // 네 갈래 길이 (간판은 그 끝)
export const MERGE_LENGTH = 40; // 간판을 지난 뒤 네 길이 다시 하나로 모이는 구간
export const RAMP_LENGTH = 10; // 갈라지기 시작하는 구간
export const REST_AFTER = 45; // 통과 후 다음 문제까지 (합쳐지는 구간 포함)
export const CURVE_DRIFT = 0.35; // 커브에서 차가 바깥으로 밀리는 정도 (약하게: 핸들을 조금만 잡으면 된다)

export const SCORE_PER_SIGN = 10; // 간판 통과
export const SCORE_PER_COIN = 5; // 코인
export const DRIVE_SCORE_PER_UNIT = 0.2; // 달린 거리 1단위마다 (= 5단위에 1점)
export const COIN_HIT_RADIUS = 0.5; // 코인을 먹는 좌우 거리

export function totalScore(g) {
  return g.score + g.coinScore + Math.floor(g.drive);
}

// 문제 하나: 위에 보이는 글(prompt)과 간판 4개(signs), 정답 차선(answer).
// dir: "en2ko" (영어 보고 뜻 고르기) | "ko2en" (한글 보고 영어 고르기)
export function makeQuestion(level, prevWord = null, dir = "en2ko", rand = Math.random) {
  const en = pickTarget(level, prevWord, rand);
  const isLetter = en.length === 1;
  const ko = isLetter ? LETTERS[en].ko : MEANINGS[en];
  const pool = isLetter
    ? LETTER_ORDER.map((l) => ({ en: l, ko: LETTERS[l].ko }))
    : DIFFICULTY[level].words.map((w) => ({ en: w, ko: MEANINGS[w] }));
  const choices = makeChoices({ en, ko }, pool, LANES - 1, rand);
  const signs = choices.map((c) => (dir === "en2ko" ? c.ko : c.en));
  const answer = choices.findIndex((c) => c.en === en);
  return {
    en,
    ko,
    isLetter,
    dir,
    prompt: dir === "en2ko" ? en : ko,
    question: dir === "en2ko" ? (isLetter ? `${en} 는 어떻게 읽을까요?` : `${en} 의 뜻은?`) : isLetter ? `'${ko}' 는 어느 글자?` : `'${ko}' 는 영어로?`,
    signs,
    answer,
  };
}

// 차의 도로 좌표(x)로 어느 차선에 있는지. 네 갈래 구간 기준.
export function laneFromX(x) {
  const idx = Math.floor((x + FORK_LIMIT) / ((FORK_LIMIT * 2) / LANES));
  return Math.max(0, Math.min(LANES - 1, idx));
}

export function speedFor(correctCount) {
  return Math.min(MAX_SPEED, BASE_SPEED + SPEED_PER_CORRECT * correctCount);
}

export const RACE_DIFFICULTY = {
  easy: { key: "easy", label: "쉬움", desc: "글자 하나와 쉬운 단어 · 천천히", speedMul: 0.8 },
  medium: { key: "medium", label: "보통", desc: "3~4글자 단어 · 보통 속도", speedMul: 1.0 },
};
export const RACE_DIFFICULTY_ORDER = ["easy", "medium"];
