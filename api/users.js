// ============================================================
// 使用者資料 API — /api/users
// 使用 Vercel KV (Redis) 儲存使用者資訊
// ============================================================
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // 處理 CORS 預檢請求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            // 讀取使用者資料
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: '缺少 userId 參數' });

            const userData = await kv.get(`user:${userId}`);
            if (!userData) return res.status(404).json({ error: '找不到使用者' });

            return res.status(200).json(userData);
        }

        if (req.method === 'POST') {
            // 建立或更新使用者資料
            const { userId, displayName, pictureUrl } = req.body;
            if (!userId) return res.status(400).json({ error: '缺少 userId' });

            const existing = await kv.get(`user:${userId}`);
            const userData = {
                ...(existing || {}),
                userId,
                displayName: displayName || (existing && existing.displayName) || '訪客',
                pictureUrl: pictureUrl || (existing && existing.pictureUrl) || '',
                updatedAt: new Date().toISOString(),
                createdAt: (existing && existing.createdAt) || new Date().toISOString()
            };

            await kv.set(`user:${userId}`, userData);
            return res.status(200).json({ success: true, data: userData });
        }

        return res.status(405).json({ error: '不允許的請求方法' });
    } catch (error) {
        console.error('使用者 API 錯誤:', error);
        return res.status(500).json({ error: '伺服器內部錯誤' });
    }
}
