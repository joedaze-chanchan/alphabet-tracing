// 글자별 획 데이터. 좌표계 0~100, y는 아래 방향.
// 각 획은 중심선 점 목록. 획순은 배열 순서, 방향은 점 순서.
// joins: 손을 떼지 않고 다음 획으로 이어 써도 되는 획의 번호(0부터). 예: B의 두 굽은 획.
// ko: 글자 이름 한글 읽기, sound: 파닉스 소리, word/wordKo/meaning: 예시 단어와 읽기·뜻.

export const STROKE_WIDTH = 16;

// 타원 호를 꺾은선으로 만든다. 각도는 도 단위, y가 아래로 향하므로 -90이 위쪽.
function arc(cx, cy, rx, ry, fromDeg, toDeg, steps = 24) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
    pts.push([round(cx + rx * Math.cos(a)), round(cy + ry * Math.sin(a))]);
  }
  return pts;
}

function round(v) {
  return Math.round(v * 10) / 10;
}

// 여러 조각을 하나의 획으로 잇는다 (이음새의 중복 점 제거).
function join(...parts) {
  const out = [];
  for (const part of parts) {
    for (const p of part) {
      const last = out[out.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
    }
  }
  return out;
}

export const LETTERS = {
  A: {
    ko: "에이", // 글자 이름 읽기
    sound: "애", // 파닉스 소리
    word: "apple", wordKo: "애플", meaning: "사과", // 예시 단어
    strokes: [
      [[50, 8], [14, 92]],
      [[50, 8], [86, 92]],
      [[28, 60], [72, 60]],
    ],
  },
  B: {
    ko: "비", // 글자 이름 읽기
    sound: "브", // 파닉스 소리
    word: "ball", wordKo: "볼", meaning: "공", // 예시 단어
    joins: [1],
    strokes: [
      [[22, 8], [22, 92]],
      join([[22, 8], [52, 8]], arc(52, 29, 21, 21, -90, 90), [[22, 50]]),
      join([[22, 50], [54, 50]], arc(54, 71, 22, 21, -90, 90), [[22, 92]]),
    ],
  },
  C: {
    ko: "씨", // 글자 이름 읽기
    sound: "크", // 파닉스 소리
    word: "cat", wordKo: "캣", meaning: "고양이", // 예시 단어
    strokes: [
      // 오른쪽 위에서 시작해 위쪽·왼쪽을 지나 오른쪽 아래로 (반시계 방향)
      arc(52, 50, 36, 42, -45, -315, 40),
    ],
  },
  D: {
    ko: "디", // 글자 이름 읽기
    sound: "드", // 파닉스 소리
    word: "dog", wordKo: "도그", meaning: "개", // 예시 단어
    strokes: [
      [[22, 8], [22, 92]],
      join([[22, 8], [44, 8]], arc(44, 50, 36, 42, -90, 90, 32), [[22, 92]]),
    ],
  },
  E: {
    ko: "이", // 글자 이름 읽기
    sound: "에", // 파닉스 소리
    word: "egg", wordKo: "에그", meaning: "달걀", // 예시 단어
    strokes: [
      [[22, 8], [22, 92]],
      [[22, 8], [80, 8]],
      [[22, 50], [72, 50]],
      [[22, 92], [80, 92]],
    ],
  },
  F: {
    ko: "에프", // 글자 이름 읽기
    sound: "프", // 파닉스 소리
    word: "fish", wordKo: "피쉬", meaning: "물고기", // 예시 단어
    strokes: [
      [[22, 8], [22, 92]],
      [[22, 8], [80, 8]],
      [[22, 50], [70, 50]],
    ],
  },
};

export const LETTER_ORDER = Object.keys(LETTERS);
