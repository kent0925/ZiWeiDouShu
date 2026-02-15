// ============================================================
// Redis 共用模組 — /api/_lib/redis.js
// 封裝 Vercel KV (REST) 與標準 Redis 連線邏輯
// ============================================================
import { kv } from '@vercel/kv';
import Redis from 'ioredis';

let redisClient = null;
let isRedisInitialized = false;

function initRedis() {
    if (isRedisInitialized) return;

    if (process.env.KV_URL) {
        try {
            const parsedUrl = new URL(process.env.KV_URL);
            // 修正協議以支援 TLS
            if (parsedUrl.protocol === 'redis:') {
                parsedUrl.protocol = 'rediss:';
            }

            redisClient = new Redis(parsedUrl.toString(), {
                tls: { rejectUnauthorized: false },
                retryStrategy: (times) => Math.min(times * 50, 2000), // 斷線重連策略，最長等待 2 秒
                maxRetriesPerRequest: 3,
                connectionName: 'zwds-api'
            });

            // 註冊錯誤監聽器防止崩潰
            redisClient.on('error', (err) => {
                console.error('[Redis Client Error]:', err.message);
            });

            console.log('[Redis] Client initialized successfully');
        } catch (e) {
            console.error('[Redis] Initialization failed:', e.message);
        }
    }
    isRedisInitialized = true;
}

// 初始化 (Lazy loading or immediate?)
// 由於這是 serverless，通常在模組載入時或第一次呼叫時執行。
// 這裡選擇模組載入時執行一次，利用模組快取。
initRedis();

/**
 * 檢查資料庫設定是否存在
 * @returns {boolean}
 */
export function checkConfig() {
    return !!(process.env.KV_REST_API_URL || process.env.KV_URL);
}

/**
 * 統一的資料存取介面
 */
export const db = {
    get: async (key) => {
        try {
            if (redisClient) {
                const data = await redisClient.get(key);
                return data ? JSON.parse(data) : null;
            }
            // Fallback to Vercel KV SDK (REST)
            if (checkConfig()) {
                return await kv.get(key);
            }
        } catch (error) {
            console.error(`[DB Get Error] Key: ${key}`, error);
            throw error;
        }
        return null;
    },
    set: async (key, value) => {
        try {
            if (redisClient) {
                return await redisClient.set(key, JSON.stringify(value));
            }
            // Fallback to Vercel KV SDK (REST)
            if (checkConfig()) {
                return await kv.set(key, value);
            }
        } catch (error) {
            console.error(`[DB Set Error] Key: ${key}`, error);
            throw error;
        }
        return null;
    }
};
