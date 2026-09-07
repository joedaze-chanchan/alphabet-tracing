// 학습 기록 저장소. 지금은 localStorage. 서버로 바꿀 때 이 파일만 교체한다.

const KEY = "abc-trace-progress";
const KEY_SETTINGS = "abc-trace-settings";
const KEY_BEST = "abc-trace-game-best";

export const DEFAULT_SETTINGS = { repeat: 3 }; // 한 글자를 따라 쓰는 횟수

export class ProgressStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  load() {
    try {
      const raw = this.storage && this.storage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  save(data) {
    try {
      this.storage && this.storage.setItem(KEY, JSON.stringify(data));
    } catch {
      // 저장 실패(사생활 모드 등)는 조용히 무시
    }
  }

  get(letter) {
    return this.load()[letter] || { completed: false, attempts: 0, wrongs: 0, lastAt: null };
  }

  recordAttempt(letter, wrongs) {
    const data = this.load();
    const cur = data[letter] || { completed: false, attempts: 0, wrongs: 0, lastAt: null };
    cur.attempts += 1;
    cur.wrongs += wrongs;
    cur.lastAt = new Date().toISOString();
    data[letter] = cur;
    this.save(data);
    return cur;
  }

  markCompleted(letter) {
    const data = this.load();
    const cur = data[letter] || { completed: false, attempts: 0, wrongs: 0, lastAt: null };
    cur.completed = true;
    cur.lastAt = new Date().toISOString();
    data[letter] = cur;
    this.save(data);
    return cur;
  }

  reset() {
    this.save({});
  }
}

// 설정 저장소. 처음 실행 여부는 저장된 설정이 있는지로 판단한다.
export class SettingsStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  load() {
    try {
      const raw = this.storage && this.storage.getItem(KEY_SETTINGS);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : null;
    } catch {
      return null;
    }
  }

  save(settings) {
    try {
      this.storage && this.storage.setItem(KEY_SETTINGS, JSON.stringify(settings));
    } catch {
      // 저장 실패는 무시
    }
  }
}

// 게임 최고 점수 (난이도별)
export class BestScoreStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  load() {
    try {
      const raw = this.storage && this.storage.getItem(KEY_BEST);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  get(level) {
    return this.load()[level] || 0;
  }

  // 새 점수를 반영하고 갱신된 최고 점수를 돌려준다
  update(level, score) {
    const data = this.load();
    const best = Math.max(data[level] || 0, score);
    data[level] = best;
    try {
      this.storage && this.storage.setItem(KEY_BEST, JSON.stringify(data));
    } catch {
      // 저장 실패는 무시
    }
    return best;
  }
}
