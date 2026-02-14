// ============================================================
// 使用者資料 API — /api/users
// 支援 Vercel KV (REST) 與標準 Redis 連線
// ============================================================
import { kv } from '@vercel/kv';
import Redis from 'ioredis';

// 初始化 Redis 客戶端
let redisClient = null;
if (process.env.KV_URL) {
    const url = process.env.KV_URL.startsWith('redis://')
        ? process.env.KV_URL.replace('redis://', 'rediss://')
        : process.env.KV_URL;

    redisClient = new Redis(url, {
        tls: { rejectUnauthorized: false }
    });
}

export default async function handler(req, res) {
    // 處理 CORS 預檢請求
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (!process.env.KV_REST_API_URL && !process.env.KV_URL) {
        return res.status(500).json({ error: '環境變數 KV_REST_API_URL 或 KV_URL 未設定。請確認資料庫連結。' });
    }

    // 統一的資料存取介面
    const db = {
        get: async (key) => {
            if (redisClient) {
                const data = await redisClient.get(key);
                return data ? JSON.parse(data) : null;
            }
            return await kv.get(key);
        },
        set: async (key, value) => {
            if (redisClient) {
                return await redisClient.set(key, JSON.stringify(value));
            }
            return await kv.set(key, value);
        }
    };

    try {
        if (req.method === 'GET') {
            // 讀取使用者資料
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: '缺少 userId 參數' });

            const userData = await db.get(`user:${userId}`);
            if (!userData) return res.status(404).json({ error: '找不到使用者' });

            return res.status(200).json(userData);
        }

        if (req.method === 'POST') {
            // 建立或更新使用者資料
            const { userId, displayName, pictureUrl } = req.body;
            if (!userId) return res.status(400).json({ error: '缺少 userId' });

            const existing = await db.get(`user:${userId}`);
            const userData = {
                ...(existing || {}),
                userId,
                displayName: displayName || (existing && existing.displayName) || '訪客',
                pictureUrl: pictureUrl || (existing && existing.pictureUrl) || '',
                updatedAt: new Date().toISOString(),
                createdAt: (existing && existing.createdAt) || new Date().toISOString()
            };

            await db.set(`user:${userId}`, userData);
            return res.status(200).json({ success: true, data: userData });
        }

        return res.status(405).json({ error: '不允許的請求方法' });
    } catch (error) {
        console.error('使用者 API 錯誤:', error);
        return res.status(500).json({ error: '伺服器內部錯誤: ' + error.message });
    }
}
