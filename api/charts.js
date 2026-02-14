// ============================================================
// 命盤紀錄 API — /api/charts
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
            // 取得使用者所有命盤紀錄
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: '缺少 userId 參數' });

            const charts = await db.get(`charts:${userId}`);
            return res.status(200).json(charts || []);
        }

        if (req.method === 'POST') {
            // 儲存新命盤紀錄
            const { userId, id, birthData, label, createdAt } = req.body;
            if (!userId || !id) return res.status(400).json({ error: '缺少必要欄位' });

            // 讀取現有紀錄
            const charts = (await db.get(`charts:${userId}`)) || [];

            // 避免重複
            if (!charts.find(c => c.id === id)) {
                charts.unshift({ id, birthData, label, createdAt: createdAt || new Date().toISOString() });

                // 最多保留 50 筆
                if (charts.length > 50) charts.length = 50;

                await db.set(`charts:${userId}`, charts);
            }

            return res.status(200).json({ success: true, count: charts.length });
        }

        if (req.method === 'DELETE') {
            // 刪除指定命盤紀錄
            const { userId, id } = req.query;
            if (!userId || !id) return res.status(400).json({ error: '缺少必要參數' });

            const charts = (await db.get(`charts:${userId}`)) || [];
            const filtered = charts.filter(c => c.id !== id);
            await db.set(`charts:${userId}`, filtered);

            return res.status(200).json({ success: true, remaining: filtered.length });
        }

        return res.status(405).json({ error: '不允許的請求方法' });
    } catch (error) {
        console.error('命盤 API 錯誤:', error);
        return res.status(500).json({ error: '伺服器內部錯誤: ' + error.message });
    }
}
