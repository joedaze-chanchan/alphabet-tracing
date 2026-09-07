// 학습 기록 저장소. 지금은 localStorage. 서버로 바꿀 때 이 파일만 교체한다.

const KEY = "abc-trace-progress";

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
