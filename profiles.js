// 참여자(프로필) 관리와 참여자별 저장소, 이어하기 기록.
//
// - ProfileStore: 참여자 목록과 현재 참여자. localStorage "abc-profiles".
// - scopedStorage(id): 기존 저장소들(ProgressStore 등)에 넘길 수 있는 참여자별 저장소.
//   키를 "<원래 키>@<참여자 id>"로 바꿔 저장하므로 참여자마다 기록이 분리된다.
// - ResumeStore: 하던 곳(연습 중인 글자, 진행 중인 게임)을 저장해 다음에 이어서 한다.

const KEY_PROFILES = "abc-profiles";
const KEY_RESUME = "abc-trace-resume";

// 첫 참여자를 만들 때 예전(참여자 없던 시절) 기록을 넘겨받을 키들
const LEGACY_KEYS = ["abc-trace-progress", "abc-trace-settings", "abc-trace-game-best"];

// 캐릭터 모습 후보 (이모지)
export const AVATARS = ["🦁", "🐯", "🐻", "🐼", "🦊", "🐸", "🐵", "🐧", "🦄", "🐲", "🤖", "👽", "🚀", "🦖", "🐙", "🦋"];

export const MAX_NAME_LENGTH = 8;

export function scopedStorage(profileId, storage = globalThis.localStorage) {
  const k = (key) => `${key}@${profileId}`;
  return {
    getItem: (key) => (storage ? storage.getItem(k(key)) : null),
    setItem: (key, value) => storage && storage.setItem(k(key), value),
    removeItem: (key) => storage && storage.removeItem(k(key)),
  };
}

export class ProfileStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  load() {
    try {
      const raw = this.storage && this.storage.getItem(KEY_PROFILES);
      const data = raw ? JSON.parse(raw) : null;
      if (data && Array.isArray(data.list)) return data;
    } catch {
      // 손상된 데이터는 무시
    }
    return { list: [], currentId: null };
  }

  save(data) {
    try {
      this.storage && this.storage.setItem(KEY_PROFILES, JSON.stringify(data));
    } catch {
      // 저장 실패는 무시
    }
  }

  list() {
    return this.load().list;
  }

  current() {
    const data = this.load();
    return data.list.find((p) => p.id === data.currentId) || null;
  }

  select(id) {
    const data = this.load();
    if (!data.list.some((p) => p.id === id)) return null;
    data.currentId = id;
    this.save(data);
    return this.current();
  }

  // 새 참여자를 만들고 현재 참여자로 정한다. 첫 참여자면 예전 기록을 넘겨받는다.
  create(name, avatar) {
    const clean = String(name || "").trim().slice(0, MAX_NAME_LENGTH);
    if (!clean) throw new Error("이름이 필요합니다");
    const data = this.load();
    const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const profile = { id, name: clean, avatar: avatar || AVATARS[0], createdAt: new Date().toISOString() };
    if (data.list.length === 0) this.migrateLegacy(id);
    data.list.push(profile);
    data.currentId = id;
    this.save(data);
    return profile;
  }

  update(id, patch) {
    const data = this.load();
    const p = data.list.find((x) => x.id === id);
    if (!p) return null;
    if (patch.name !== undefined) p.name = String(patch.name).trim().slice(0, MAX_NAME_LENGTH) || p.name;
    if (patch.avatar !== undefined) p.avatar = patch.avatar;
    this.save(data);
    return p;
  }

  remove(id) {
    const data = this.load();
    data.list = data.list.filter((p) => p.id !== id);
    if (data.currentId === id) data.currentId = data.list[0] ? data.list[0].id : null;
    this.save(data);
    try {
      for (const key of [...LEGACY_KEYS, KEY_RESUME]) this.storage && this.storage.removeItem(`${key}@${id}`);
    } catch {
      // 무시
    }
  }

  migrateLegacy(id) {
    try {
      for (const key of LEGACY_KEYS) {
        const v = this.storage && this.storage.getItem(key);
        if (v !== null && v !== undefined) {
          this.storage.setItem(`${key}@${id}`, v);
          this.storage.removeItem(key);
        }
      }
    } catch {
      // 무시
    }
  }
}

// 하던 곳 저장. kind: "practice" | "game". 참여자별 저장소(scopedStorage)를 넘긴다.
export class ResumeStore {
  constructor(storage) {
    this.storage = storage;
  }

  loadAll() {
    try {
      const raw = this.storage && this.storage.getItem(KEY_RESUME);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  get(kind) {
    return this.loadAll()[kind] || null;
  }

  set(kind, data) {
    const all = this.loadAll();
    all[kind] = { ...data, savedAt: new Date().toISOString() };
    try {
      this.storage && this.storage.setItem(KEY_RESUME, JSON.stringify(all));
    } catch {
      // 무시
    }
  }

  clear(kind) {
    const all = this.loadAll();
    delete all[kind];
    try {
      this.storage && this.storage.setItem(KEY_RESUME, JSON.stringify(all));
    } catch {
      // 무시
    }
  }
}
