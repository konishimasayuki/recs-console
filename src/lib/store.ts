// データ保存層。UPSTASH_REDIS_REST_URL が設定されていれば Upstash、
// なければメモリ（手元テスト用。サーバー再起動で消える）。
import { Redis } from "@upstash/redis";

export interface Store {
  hgetall(key: string): Promise<Record<string, string> | null>;
  hset(key: string, obj: Record<string, string | number>): Promise<void>;
  sadd(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  lpush(key: string, value: string): Promise<void>;
  ltrim(key: string, start: number, stop: number): Promise<void>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

// Vercel経由で接続すると KV_REST_API_* の名前で入ることがあるので両方見る
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

class UpstashStore implements Store {
  private r: Redis;
  constructor() {
    this.r = new Redis({ url: REDIS_URL!, token: REDIS_TOKEN!, automaticDeserialization: false });
  }
  async hgetall(key: string) {
    const v = await this.r.hgetall<Record<string, string>>(key);
    return v && Object.keys(v).length ? v : null;
  }
  async hset(key: string, obj: Record<string, string | number>) {
    const s: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) s[k] = String(v);
    await this.r.hset(key, s);
  }
  async sadd(key: string, member: string) { await this.r.sadd(key, member); }
  async smembers(key: string) { return (await this.r.smembers(key)) as string[]; }
  async lpush(key: string, value: string) { await this.r.lpush(key, value); }
  async ltrim(key: string, start: number, stop: number) { await this.r.ltrim(key, start, stop); }
  async lrange(key: string, start: number, stop: number) {
    return (await this.r.lrange(key, start, stop)) as string[];
  }
}

class MemoryStore implements Store {
  h = new Map<string, Record<string, string>>();
  s = new Map<string, Set<string>>();
  l = new Map<string, string[]>();
  async hgetall(key: string) { const v = this.h.get(key); return v ? { ...v } : null; }
  async hset(key: string, obj: Record<string, string | number>) {
    const cur = this.h.get(key) ?? {};
    for (const [k, v] of Object.entries(obj)) cur[k] = String(v);
    this.h.set(key, cur);
  }
  async sadd(key: string, member: string) {
    if (!this.s.has(key)) this.s.set(key, new Set());
    this.s.get(key)!.add(member);
  }
  async smembers(key: string) { return [...(this.s.get(key) ?? [])]; }
  async lpush(key: string, value: string) {
    if (!this.l.has(key)) this.l.set(key, []);
    this.l.get(key)!.unshift(value);
  }
  async ltrim(key: string, start: number, stop: number) {
    const a = this.l.get(key); if (a) this.l.set(key, a.slice(start, stop + 1));
  }
  async lrange(key: string, start: number, stop: number) {
    const a = this.l.get(key) ?? [];
    return a.slice(start, stop === -1 ? undefined : stop + 1);
  }
}

const g = globalThis as unknown as { __recsStore?: Store };
export function store(): Store {
  if (!g.__recsStore) {
    g.__recsStore = REDIS_URL && REDIS_TOKEN ? new UpstashStore() : new MemoryStore();
  }
  return g.__recsStore;
}
