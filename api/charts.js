// ============================================================
// 命盤紀錄 API — /api/charts
// 使用 Vercel KV (Redis) 儲存使用者的排盤歷史紀錄
// ============================================================
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // 處理 CORS 預檢請求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            // 取得使用者所有命盤紀錄
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: '缺少 userId 參數' });

            const charts = await kv.get(`charts:${userId}`);
            return res.status(200).json(charts || []);
        }

        if (req.method === 'POST') {
            // 儲存新命盤紀錄
            const { userId, id, birthData, label, createdAt } = req.body;
            if (!userId || !id) return res.status(400).json({ error: '缺少必要欄位' });

            // 讀取現有紀錄
            const charts = (await kv.get(`charts:${userId}`)) || [];

            // 避免重複
            if (!charts.find(c => c.id === id)) {
                charts.unshift({ id, birthData, label, createdAt: createdAt || new Date().toISOString() });

                // 最多保留 50 筆
                if (charts.length > 50) charts.length = 50;

                await kv.set(`charts:${userId}`, charts);
            }

            return res.status(200).json({ success: true, count: charts.length });
        }

        if (req.method === 'DELETE') {
            // 刪除指定命盤紀錄
            const { userId, id } = req.query;
            if (!userId || !id) return res.status(400).json({ error: '缺少必要參數' });

            const charts = (await kv.get(`charts:${userId}`)) || [];
            const filtered = charts.filter(c => c.id !== id);
            await kv.set(`charts:${userId}`, filtered);

            return res.status(200).json({ success: true, remaining: filtered.length });
        }

        return res.status(405).json({ error: '不允許的請求方法' });
    } catch (error) {
        console.error('命盤 API 錯誤:', error);
        return res.status(500).json({ error: '伺服器內部錯誤' });
    }
}
