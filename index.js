const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ─────────────────────────────────────────────────────────────
// KONFIGURASI
// ─────────────────────────────────────────────────────────────
const JAGEL_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6IjRhNDc5ZDU2N2E4N2ZjOTljMWExZjUyZDQ0NTk3NzgyNjVjNmE1NjRjZTg3NTQ1ZDEzMjkxYmQ0YzJkZjFlZTY1NTJmMGU3NjJlMDAyOTMyIn0.eyJhdWQiOiIxIiwianRpIjoiNGE0NzlkNTY3YTg3ZmM5OWMxYTFmNTJkNDQ1OTc3ODI2NWM2YTU2NGNlODc1NDVkMTMyOTFiZDRjMmRmMWVlNjU1MmYwZTc2MmUwMDI5MzIiLCJpYXQiOjE3ODQ2ODg4MzAsIm5iZiI6MTc4NDY4ODgzMCwiZXhwIjoxODE2MjI0ODMwLCJzdWIiOiIyOTcxODQ0Iiwic2NvcGVzIjpbXX0.XrNiE7QXo53bAtTzyxQMTQjs9mUqXy7YHY4IrFqUV3rEqbs4JsbnT9dImUxXPn8iqG8QHuiGRmWWVDA1KqbrKoHNf5yeJMKIUH-lwfXRHlL4m00naghEoZRHcOZmd4_BlP_C_hQQ4pYsDAZ0-Yy3KurawzOkaAzlYprY7R_lwUROSjDjNpVbT9y65Fk-8RzjuvIItDtE6DG94HdrPD4K_wKkpzrCcSkbuGM_UNhW6O27rsWEu41HoiXcn3m_51JX0FPBSmlprAvx3xxhIY-RXUp9YJN6Zq1bbxBdEeSPRbvQJj94FGOk9fluJ8R-esJGf691OdGEYYwRlkMTzanQ5diuQJeSjENvcV88iI1DZJP3Z82onIS18hgocbN9W7nR_L-24aVhz0UZBSDcPanT8kpJz4f5EmYVd2Rnd8wKLrQ8YjBC4ffMZhk1CJpV4bRuClPJFUKrvKEHjhE1dkOSmFu8sKbt3sk2CZrBivE4e0qqXWLPWrZ2VxTf1y_2dpLhy-IMTkgm0k1diTSqqp_y6PcM-qJjSStfGnWuWxuhj503z0jGukbcfukX1E00U3qcCvf8E4RUDaO4zNOMvhgLBn_puIAoYVn4PMyQSy6LCOMNP6bGlC1k6eNRep4TTaLl3wRw0q_QqP_1n_An23k8BHlnqkuBKTiGRuRCtnssTtc";
const CODENAME = "iknlinku";
const JAGEL_CODENAME = 'iknlinku'; // alias, dipakai fungsi jagelGet
const BATCH_SIZE = 3;
const DEFAULT_UNIQUE_ID = '03421121304617f701ba3b374.23310242';
const DEFAULT_PARTNER_STATUS = '2';
const BONUS_API = 'https://bonus.siappgo.id';
const BONUS_COMPLETE_ENDPOINT = '/api/driver/order/complete';
const ORDER_STATUS_COMPLETED = 4; // sesuaikan kalau ternyata beda
const triggeredOrderCache = new Set();
const TRIGGER_CACHE_MAX_SIZE = 5000; 

// Component UID
const MAKANAN_COMPONENT_UID = '618637dbc8415';    // Jastip Makanan
const PETANI_COMPONENT_UID = '6a48d1e936ae2';     // Petani Lokal
const UWARUNG_COMPONENT_UID = '618b7f0c383e4';
const PREORDER_COMPONENT_UID = '150313187266a4c96a3639b16.85140307';
const PANEN_HARI_INI_COMPONENT_UID = '240213187266a4c967075d019.51911072';
const JADWAL_PANEN_COMPONENT_UID = '550313187266a4c96cba28072.25599401';
const JAGEL_BASE_URL = 'https://app.jagel.id/api/v2/customer';
const DRIVER_EXPEDITION_FILTER = 'kurir - kurir food';
const COURIER_MASTER_CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam
const JAGEL_ASSET_BASE = 'https://app.jagel.id/storage';
let courierMasterCache = {}; // { [unique_id]: { data, cachedAt } }


// Default koordinat
const defaultCoords = { lat: -0.975, lng: 116.786 };

// Headers untuk request ke Jagel (dipakai axios, endpoint yang butuh auth: report, users, partner)
const jagelHeaders = {
    'User-Agent': 'Mozilla/5.0',
    'Authorization': `Bearer ${JAGEL_TOKEN}`,
    'Origin': 'https://app.linku.co.id',
    'Referer': 'https://app.linku.co.id/',
    'Accept': 'application/json'
};

// ─────────────────────────────────────────────────────────────
// UTILITAS
// ─────────────────────────────────────────────────────────────

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function chunk(arr, n) {
    const result = [];
    for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n));
    return result;
}

function parseUserCoords(query) {
    const lat = parseFloat(query.lat);
    const lng = parseFloat(query.lng);
    return (!isNaN(lat) && !isNaN(lng)) ? { lat, lng } : defaultCoords;
}

// Catatan: fungsi ini tidak dipakai di endpoint manapun saat ini
// (stores-stream punya implementasi SSE sendiri secara inline).
// Signature diperbaiki agar req ikut di-pass, supaya tidak crash jika dipakai nanti.
function setupSSE(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');
    res.setHeader('Content-Encoding', 'identity');

    res.flushHeaders();

    let heartbeatInterval = setInterval(() => {
        if (!res.writableEnded && !res.finished) {
            try {
                res.write(`: heartbeat ${Date.now()}\n\n`);
                if (typeof res.flush === 'function') res.flush();
            } catch (err) {
                console.log('Heartbeat write failed:', err.message);
                clearInterval(heartbeatInterval);
            }
        } else {
            clearInterval(heartbeatInterval);
        }
    }, 15000);

    req.on('close', () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (!res.writableEnded) res.end();
    });

    return (event, data) => {
        if (res.writableEnded || res.finished) return;
        try {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            if (typeof res.flush === 'function') res.flush();
        } catch (err) {
            console.error(`Failed to send SSE event ${event}:`, err.message);
        }
    };
}

// Helper GET generik ke jagel.id (pakai fetch, tanpa auth header — untuk endpoint public v2/customer)
async function jagelGet(path, params = {}) {
    const url = new URL(`${JAGEL_BASE_URL}${path}`);
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });

    const resp = await fetch(url.toString());
    if (!resp.ok) {
        throw new Error(`Jagel API error ${resp.status} - ${url.toString()}`);
    }
    const json = await resp.json();
    if (!json.success) {
        throw new Error(json.message || 'Jagel API returned success=false');
    }
    return json.data;
}

// ─────────────────────────────────────────────────────────────
// TRIGGER BONUS: kirim order selesai ke Bonus API
// Fire-and-forget — tidak menghambat response ke frontend.
// Aman dipanggil berulang untuk order yang sama karena
// Bonus API sudah cek hasOrderBonus() sebelum insert.
// ─────────────────────────────────────────────────────────────
async function triggerBonusForOrder(order) {
    try {
        const resp = await axios.post(
            `${BONUS_API}${BONUS_COMPLETE_ENDPOINT}`,
            {
                order_no: order.order_no,
                driver_username: order.driver_username,
                driver_phone: order.driver_phone,
                distance_km: order.distance_km,
                total_price: order.total_price,
                unique_id: order.unique_id,
                order_type: 'food',
                category: 3,
                use_expedition: 1,
            },
            { timeout: 8000 }
        );
        if (resp.data?.data?.bonus?.new_bonuses?.length > 0) {
            console.log(`🎉 [bonus-trigger] Bonus baru untuk order ${order.order_no}: ${resp.data.data.bonus.new_bonuses.length} block`);
        }
    } catch (err) {
        console.warn(`⚠️ [bonus-trigger] Gagal kirim order ${order.order_no} ke Bonus API: ${err.message}`);
    }
}

function triggerBonusForCompletedOrders(orders) {
    const completed = orders.filter(o =>
        o.order_status === ORDER_STATUS_COMPLETED &&
        o.distance_km > 0 &&
        o.driver_username &&
        !triggeredOrderCache.has(o.order_no)
    );

    completed.forEach(o => {
        triggeredOrderCache.add(o.order_no);
        triggerBonusForOrder(o);
    });

    // Cegah Set membengkak tanpa batas kalau server jalan lama
    if (triggeredOrderCache.size > TRIGGER_CACHE_MAX_SIZE) {
        const excess = triggeredOrderCache.size - TRIGGER_CACHE_MAX_SIZE;
        const it = triggeredOrderCache.values();
        for (let i = 0; i < excess; i++) triggeredOrderCache.delete(it.next().value);
    }
}

// ─────────────────────────────────────────────────────────────
// 🔥 FUNGSI GET PARTNER DETAIL (PAKAI ENDPOINT USERS)
// ─────────────────────────────────────────────────────────────
async function getPartnerDetailByViewUid(viewUid) {
    if (!viewUid) return null;

    try {
        const url = `https://app.jagel.id/api/users/${viewUid}?driver=1`;
        console.log('🌐 Fetch partner from users API:', url);

        const response = await axios.get(url, { headers: jagelHeaders });

        if (response.data && response.data.success && response.data.data) {
            const data = response.data.data;
            return {
                view_uid: data.view_uid,
                unique_id: data.unique_id,
                username: data.username,
                phone: data.phone,
                name: data.name,
                partner_commission: data.partner_commission || 0,
                partner_status: data.partner_status
            };
        }
        return null;
    } catch (err) {
        console.log(`⚠️ Failed to fetch partner ${viewUid}: ${err.message}`);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────
// 🔥 FUNGSI GET PARTNER REPORT (FILTER KATEGORI USAHA)
// ─────────────────────────────────────────────────────────────
async function fetchPartnerReport({ unique_id, paginate = 10, partner_status, page }) {
    const url = 'https://app.jagel.id/api/partner/report';

    const payload = { unique_id, paginate };
    if (partner_status !== undefined) payload.partner_status = partner_status;
    if (page !== undefined) payload.page = page;

    console.log('🌐 Fetch partner report (POST):', url, payload);

    const response = await axios.post(url, payload, { headers: jagelHeaders });

    if (!response.data || !response.data.success) {
        throw new Error('Partner report API error');
    }

    return response.data.data;
}

function filterPartnersByKategoriUsaha(partners, kategoriUsaha) {
    if (!Array.isArray(partners)) return [];
    return partners.filter(p => {
        const kategori = p?.formSubmit?.data?.kategoriusaha;
        return kategori === kategoriUsaha;
    });
}

// ─────────────────────────────────────────────────────────────
// FUNGSI FETCH DARI JAGEL (untuk MAKANAN / stores)
// ─────────────────────────────────────────────────────────────

async function fetchAllStoresFromComponent(componentUid) {
    let all = [], page = 1, lastPage = 1;
    do {
        const url = `https://app.jagel.id/api/v2/customer/component/${componentUid}`
            + `?codename=${CODENAME}&page=${page}&app_mode=1&per_page=24`;
        const { data } = await axios.get(url, { headers: jagelHeaders });
        if (!data.success) throw new Error(`Component API error (uid=${componentUid})`);
        const lists = data.data.lists;
        all.push(...(lists.data || []));
        lastPage = lists.last_page;
        page++;
    } while (page <= lastPage);
    return all;
}

async function fetchStoreDetail(viewUid) {
    const url = `https://app.jagel.id/api/v2/customer/list/${viewUid}?codename=${CODENAME}`;
    const { data } = await axios.get(url, { headers: jagelHeaders });
    if (!data.success) throw new Error(`Detail API error for ${viewUid}`);
    return data.data;
}

// ── Ambil 1 halaman dari komponen (mis. daftar mitra Petani Lokal) ──
async function fetchComponentPage(componentUid, page = 1, perPage = 24) {
    const url = `https://app.jagel.id/api/v2/customer/component/${componentUid}`
        + `?codename=${CODENAME}&page=${page}&app_mode=1&per_page=${perPage}`;
    const { data } = await axios.get(url, { headers: jagelHeaders });
    if (!data.success) throw new Error(`Component API error (uid=${componentUid})`);
    return data.data; // { view_uid, name, lists: { current_page, data, last_page, ... }, ... }
}

// ── Ambil 1 halaman children dari sebuah list (mis. produk milik satu mitra) ──
async function fetchListChildrenPage(parentUid, page = 1, searchList = '') {
    const url = `https://app.jagel.id/api/v2/customer/list/${parentUid}/children`
        + `?codename=${CODENAME}&page=${page}&search_list=${encodeURIComponent(searchList || '')}`;
    const { data } = await axios.get(url, { headers: jagelHeaders });
    if (!data.success) throw new Error(`Children API error (uid=${parentUid})`);
    return data.data; // { current_page, data, last_page, per_page, total, ... }
}

async function fetchChildren(parentUid, page = 1, perPage = 100) {
    try {
        const url = `https://app.jagel.id/api/v2/customer/list/${parentUid}/children`
            + `?codename=${CODENAME}&page=${page}&per_page=${perPage}`;
        const { data } = await axios.get(url, { headers: jagelHeaders });
        if (!data.success) return { items: [], lastPage: 1 };
        return { items: data.data.data || [], lastPage: data.data.last_page || 1 };
    } catch (err) {
        return { items: [], lastPage: 1 };
    }
}

async function fetchStoreCategories(viewUid) {
    let all = [], page = 1, lastPage = 1;
    do {
        const { items, lastPage: lp } = await fetchChildren(viewUid, page, 100);
        all.push(...items.filter(i => i.type === 4));
        lastPage = lp;
        page++;
    } while (page <= lastPage);
    return all;
}

async function fetchCategoryProducts(categoryUid) {
    let all = [], page = 1, lastPage = 1;
    do {
        const { items, lastPage: lp } = await fetchChildren(categoryUid, page, 100);
        all.push(...items.filter(i => i.type === 0 || i.purchasable === 1));
        lastPage = lp;
        page++;
    } while (page <= lastPage);
    return all;
}

async function fetchStoreProductsWithCategories(viewUid) {
    try {
        const categories = await fetchStoreCategories(viewUid);
        const allProducts = [];
        for (const category of categories) {
            const products = await fetchCategoryProducts(category.view_uid);
            products.forEach(p => {
                p.category_name = category.title;
                p.category_uid = category.view_uid;
            });
            allProducts.push(...products);
        }
        if (categories.length === 0) {
            const direct = await fetchCategoryProducts(viewUid);
            direct.forEach(p => {
                p.category_name = "Menu Utama";
                p.category_uid = "main";
            });
            allProducts.push(...direct);
        }
        return allProducts;
    } catch {
        return [];
    }
}

// ─────────────────────────────────────────────────────────────
// FORMAT PRODUK DENGAN PARTNER COMMISSION
// ─────────────────────────────────────────────────────────────

function formatProductWithCommission(product, storeDetail, userCoords, partnerInfo = null) {
    const distance = (storeDetail.origin_lat && storeDetail.origin_lng)
        ? getDistance(userCoords.lat, userCoords.lng,
            parseFloat(storeDetail.origin_lat), parseFloat(storeDetail.origin_lng))
        : null;

    let displayPrice = product.price || 0;
    let variants = [];
    if (product.list_product_variant?.length > 0) {
        variants = product.list_product_variant.map(v => ({
            view_uid: v.view_uid,
            name: v.name,
            price: v.price || v.new_price || 0
        }));
        displayPrice = Math.min(...variants.map(v => v.price), displayPrice);
    }

    const commission = partnerInfo?.partner_commission || 0;
    const finalPrice = displayPrice * (1 - commission / 100);

    return {
        view_uid: product.view_uid,
        title: product.title,
        image: product.image,
        original_price: displayPrice,
        price: finalPrice,
        commission_percent: commission,
        commission_nominal: displayPrice * (commission / 100),
        content: product.content || "",
        category_name: product.category_name || "Menu Utama",
        has_variants: variants.length > 0,
        variants: variants,
        is_open: product.is_open === 1,
        max_qty: product.max_qty || null,
        store_view_uid: storeDetail.view_uid,
        store_title: storeDetail.title,
        store_image: storeDetail.image || null,
        store_origin_address: storeDetail.origin_address || "",
        store_origin_lat: storeDetail.origin_lat,
        store_origin_lng: storeDetail.origin_lng,
        store_distance: distance,
        store_rating: storeDetail.seller_rating || null,
        store_is_open: storeDetail.is_open === 1,
        mitra_phone: partnerInfo?.phone || null,
        mitra_username: partnerInfo?.username || null,
        mitra_name: partnerInfo?.name || null,
        mitra_partner_commission: commission,
        mitra_view_uid: partnerInfo?.view_uid || null,
    };
}


// ─────────────────────────────────────────────────────────────
// SSE: /api/uwarung/stores-stream
// ─────────────────────────────────────────────────────────────
app.get('/api/uwarung/stores-stream', async (req, res) => {
    let isClosed = false;
    let heartbeatInterval = null;

    const send = (event, data) => {
        if (isClosed || res.writableEnded || res.finished) return;
        try {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            if (typeof res.flush === 'function') res.flush();
        } catch (err) {
            console.error(`SSE write error (${event}):`, err.message);
            isClosed = true;
        }
    };

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    res.on('error', (err) => {
        console.log(`💥 SSE Response error: ${err.message}`);
        isClosed = true;
        if (heartbeatInterval) clearInterval(heartbeatInterval);
    });

    heartbeatInterval = setInterval(() => {
        if (!isClosed && !res.writableEnded && !res.finished) {
            try {
                res.write(`: heartbeat ${Date.now()}\n\n`);
                if (typeof res.flush === 'function') res.flush();
            } catch (err) {
                console.log('Heartbeat failed, cleaning up');
                clearInterval(heartbeatInterval);
                isClosed = true;
                if (!res.writableEnded) res.end();
            }
        } else {
            clearInterval(heartbeatInterval);
        }
    }, 15000);

    req.on('close', () => {
        console.log('Client disconnected from uwarung stores-stream');
        isClosed = true;
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (!res.writableEnded) res.end();
    });

    req.setTimeout(120000, () => {
        console.log('Request timeout, closing SSE');
        isClosed = true;
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (!res.writableEnded) res.end();
    });

    try {
        const userCoords = parseUserCoords(req.query);
        console.log(`📡 [uwarung/stores-stream] lat=${userCoords.lat}, lng=${userCoords.lng}`);

        send('meta', { status: 'starting', userCoords });

        const abortController = new AbortController();
        req.on('close', () => abortController.abort());

        const stores = await fetchAllStoresFromComponent(UWARUNG_COMPONENT_UID);

        if (isClosed) return;

        const batches = chunk(stores, BATCH_SIZE);

        send('meta', {
            total_stores: stores.length,
            total_batches: batches.length,
            batch_size: BATCH_SIZE,
            source: 'uwarung',
            userCoords
        });

        let processedCount = 0;

        for (let bi = 0; bi < batches.length; bi++) {
            if (isClosed) break;

            const batch = batches[bi];

            const batchPromise = Promise.all(batch.map(async (store) => {
                if (isClosed) return null;

                try {
                    const detail = await fetchStoreDetail(store.view_uid);
                    const distance = (detail.origin_lat && detail.origin_lng)
                        ? getDistance(userCoords.lat, userCoords.lng,
                            parseFloat(detail.origin_lat), parseFloat(detail.origin_lng))
                        : null;

                    return {
                        ok: true,
                        data: {
                            view_uid: store.view_uid,
                            title: store.title,
                            image: store.image,
                            is_open: detail.is_open === 1,
                            close_status: detail.close_status || '',
                            close_time: detail.close_time || '',
                            origin_address: detail.origin_address || '',
                            origin_lat: detail.origin_lat,
                            origin_lng: detail.origin_lng,
                            distance: distance,
                            seller_rating: detail.seller_rating,
                            user_phone: detail.user_phone || null,
                            partner_view_uid: detail.partner_view_uid || null,
                            app_name: detail.app_name || null
                        }
                    };
                } catch (err) {
                    return { ok: false, store_title: store.title, error: err.message };
                }
            }));

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Batch timeout')), 30000)
            );

            const results = await Promise.race([batchPromise, timeoutPromise]).catch(err => {
                console.error(`Batch ${bi + 1} timeout:`, err.message);
                return batch.map(() => ({ ok: false, error: 'Batch timeout' }));
            });

            if (isClosed) break;

            const successItems = results.filter(r => r && r.ok).map(r => r.data);
            const failedItems = results.filter(r => r && !r.ok);

            if (successItems.length > 0) {
                send('batch_stores', {
                    batch_index: bi + 1,
                    total_batches: batches.length,
                    stores: successItems
                });
            }

            failedItems.forEach(f => {
                if (f) send('error_store', { store_name: f.store_title, error: f.error });
            });

            processedCount += batch.length;
            send('progress', {
                processed_stores: processedCount,
                total_stores: stores.length,
                percent: Math.round((processedCount / stores.length) * 100)
            });

            if (bi < batches.length - 1 && !isClosed) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        if (!isClosed) {
            send('done', { total_stores: stores.length, source: 'uwarung' });
        }

    } catch (err) {
        console.error('❌ [uwarung/stores-stream]', err.message);
        if (!isClosed) {
            send('error', { message: err.message });
        }
    } finally {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (!res.writableEnded) res.end();
    }
});

// ─────────────────────────────────────────────────────────────
// ENDPOINT JSON: GET /api/uwarung/stores
// ─────────────────────────────────────────────────────────────
app.get('/api/uwarung/stores', async (req, res) => {
    try {
        const userCoords = parseUserCoords(req.query);
        const stores = await fetchAllStoresFromComponent(UWARUNG_COMPONENT_UID);

        const storeList = await Promise.all(stores.map(async (store) => {
            try {
                const detail = await fetchStoreDetail(store.view_uid);
                const distance = (detail.origin_lat && detail.origin_lng)
                    ? getDistance(userCoords.lat, userCoords.lng,
                        parseFloat(detail.origin_lat), parseFloat(detail.origin_lng))
                    : null;

                return {
                    view_uid: store.view_uid,
                    title: store.title,
                    image: store.image,
                    is_open: detail.is_open === 1,
                    close_status: detail.close_status || '',
                    origin_address: detail.origin_address || '',
                    origin_lat: detail.origin_lat,
                    origin_lng: detail.origin_lng,
                    distance: distance,
                    seller_rating: detail.seller_rating,
                    user_phone: detail.user_phone || null,
                    partner_view_uid: detail.partner_view_uid || null,
                    app_name: detail.app_name || null
                };
            } catch (err) {
                return null;
            }
        }));

        const validStores = storeList.filter(s => s !== null);
        validStores.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

        res.json({
            success: true,
            total: validStores.length,
            stores: validStores,
            userCoords
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// ENDPOINT JSON: GET /api/uwarung/store/:viewUid (DETAIL TOKO)
// ─────────────────────────────────────────────────────────────
app.get('/api/uwarung/store/:viewUid', async (req, res) => {
    try {
        const { viewUid } = req.params;
        const userCoords = parseUserCoords(req.query);

        const detail = await fetchStoreDetail(viewUid);
        const distance = (detail.origin_lat && detail.origin_lng)
            ? getDistance(userCoords.lat, userCoords.lng,
                parseFloat(detail.origin_lat), parseFloat(detail.origin_lng))
            : null;

        res.json({
            success: true,
            data: {
                store: {
                    view_uid: detail.view_uid,
                    title: detail.title,
                    image: detail.image,
                    origin_address: detail.origin_address || '',
                    origin_lat: detail.origin_lat,
                    origin_lng: detail.origin_lng,
                    distance: distance,
                    seller_rating: detail.seller_rating,
                    is_open: detail.is_open === 1,
                    user_phone: detail.user_phone || null,
                    partner_view_uid: detail.partner_view_uid || null,
                    app_name: detail.app_name || null
                }
            }
        });
    } catch (err) {
        console.error('❌ [uwarung/store]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// ENDPOINT JSON: GET /api/uwarung/products/:storeUid
// ─────────────────────────────────────────────────────────────
app.get('/api/uwarung/products/:storeUid', async (req, res) => {
    try {
        const { storeUid } = req.params;
        const userCoords = parseUserCoords(req.query);
        const { view_uid } = req.query;

        console.log(`📦 [uwarung/products] store=${storeUid}, partner_view_uid=${view_uid}`);

        let partnerInfo = null;

        if (view_uid) {
            partnerInfo = await getPartnerDetailByViewUid(view_uid);
            if (partnerInfo) {
                console.log(`✅ Partner found: ${partnerInfo.username} (${partnerInfo.partner_commission}%)`);
            } else {
                console.log(`⚠️ No partner found for view_uid: ${view_uid}`);
            }
        }

        const [storeDetail, categories, rawProducts] = await Promise.all([
            fetchStoreDetail(storeUid),
            fetchStoreCategories(storeUid),
            fetchStoreProductsWithCategories(storeUid)
        ]);

        const products = rawProducts.map(product =>
            formatProductWithCommission(product, storeDetail, userCoords, partnerInfo)
        );

        const productsByCategory = {};
        products.forEach(p => {
            const cat = p.category_name;
            if (!productsByCategory[cat]) productsByCategory[cat] = [];
            productsByCategory[cat].push(p);
        });

        const categoriesResult = Object.keys(productsByCategory).map(catName => ({
            name: catName,
            products: productsByCategory[catName],
            count: productsByCategory[catName].length
        }));

        res.json({
            success: true,
            store: {
                view_uid: storeDetail.view_uid,
                title: storeDetail.title,
                image: storeDetail.image,
                origin_address: storeDetail.origin_address,
                origin_lat: storeDetail.origin_lat,
                origin_lng: storeDetail.origin_lng,
                is_open: storeDetail.is_open === 1,
                seller_rating: storeDetail.seller_rating,
                user_phone: storeDetail.user_phone || null,
                partner_view_uid: storeDetail.partner_view_uid || null,
                app_name: storeDetail.app_name || null
            },
            partner_info: partnerInfo ? {
                view_uid: partnerInfo.view_uid,
                username: partnerInfo.username,
                phone: partnerInfo.phone,
                name: partnerInfo.name,
                partner_commission: partnerInfo.partner_commission
            } : null,
            products: products,
            categories: categoriesResult,
            total_products: products.length,
            total_categories: categoriesResult.length,
            userCoords
        });

    } catch (err) {
        console.error('❌ [uwarung/products]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// SSE: /api/makanan/stores-stream
// ─────────────────────────────────────────────────────────────
app.get('/api/makanan/stores-stream', async (req, res) => {
    let isClosed = false;
    let heartbeatInterval = null;

    const send = (event, data) => {
        if (isClosed || res.writableEnded || res.finished) return;
        try {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            if (typeof res.flush === 'function') res.flush();
        } catch (err) {
            console.error(`SSE write error (${event}):`, err.message);
            isClosed = true;
        }
    };

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    res.on('error', (err) => {
        console.log(`💥 SSE Response error: ${err.message}`);
        isClosed = true;
        if (heartbeatInterval) clearInterval(heartbeatInterval);
    });

    heartbeatInterval = setInterval(() => {
        if (!isClosed && !res.writableEnded && !res.finished) {
            try {
                res.write(`: heartbeat ${Date.now()}\n\n`);
                if (typeof res.flush === 'function') res.flush();
            } catch (err) {
                console.log('Heartbeat failed, cleaning up');
                clearInterval(heartbeatInterval);
                isClosed = true;
                if (!res.writableEnded) res.end();
            }
        } else {
            clearInterval(heartbeatInterval);
        }
    }, 15000);

    req.on('close', () => {
        console.log('Client disconnected from stores-stream');
        isClosed = true;
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (!res.writableEnded) res.end();
    });

    req.setTimeout(120000, () => {
        console.log('Request timeout, closing SSE');
        isClosed = true;
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (!res.writableEnded) res.end();
    });

    try {
        const userCoords = parseUserCoords(req.query);
        console.log(`📡 [makanan/stores-stream] lat=${userCoords.lat}, lng=${userCoords.lng}`);

        send('meta', { status: 'starting', userCoords });

        const abortController = new AbortController();
        req.on('close', () => abortController.abort());

        const stores = await fetchAllStoresFromComponent(MAKANAN_COMPONENT_UID);

        if (isClosed) return;

        const batches = chunk(stores, BATCH_SIZE);

        send('meta', {
            total_stores: stores.length,
            total_batches: batches.length,
            batch_size: BATCH_SIZE,
            source: 'makanan',
            userCoords
        });

        let processedCount = 0;

        for (let bi = 0; bi < batches.length; bi++) {
            if (isClosed) break;

            const batch = batches[bi];

            const batchPromise = Promise.all(batch.map(async (store) => {
                if (isClosed) return null;

                try {
                    const detail = await fetchStoreDetail(store.view_uid);
                    const distance = (detail.origin_lat && detail.origin_lng)
                        ? getDistance(userCoords.lat, userCoords.lng,
                            parseFloat(detail.origin_lat), parseFloat(detail.origin_lng))
                        : null;

                    return {
                        ok: true,
                        data: {
                            view_uid: store.view_uid,
                            title: store.title,
                            image: store.image,
                            is_open: detail.is_open === 1,
                            close_status: detail.close_status || '',
                            close_time: detail.close_time || '',
                            origin_address: detail.origin_address || '',
                            origin_lat: detail.origin_lat,
                            origin_lng: detail.origin_lng,
                            distance: distance,
                            seller_rating: detail.seller_rating,
                            user_phone: detail.user_phone || null,
                            partner_view_uid: detail.partner_view_uid || null,
                            app_name: detail.app_name || null
                        }
                    };
                } catch (err) {
                    return { ok: false, store_title: store.title, error: err.message };
                }
            }));

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Batch timeout')), 30000)
            );

            const results = await Promise.race([batchPromise, timeoutPromise]).catch(err => {
                console.error(`Batch ${bi + 1} timeout:`, err.message);
                return batch.map(() => ({ ok: false, error: 'Batch timeout' }));
            });

            if (isClosed) break;

            const successItems = results.filter(r => r && r.ok).map(r => r.data);
            const failedItems = results.filter(r => r && !r.ok);

            if (successItems.length > 0) {
                send('batch_stores', {
                    batch_index: bi + 1,
                    total_batches: batches.length,
                    stores: successItems
                });
            }

            failedItems.forEach(f => {
                if (f) send('error_store', { store_name: f.store_title, error: f.error });
            });

            processedCount += batch.length;
            send('progress', {
                processed_stores: processedCount,
                total_stores: stores.length,
                percent: Math.round((processedCount / stores.length) * 100)
            });

            if (bi < batches.length - 1 && !isClosed) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        if (!isClosed) {
            send('done', { total_stores: stores.length, source: 'makanan' });
        }

    } catch (err) {
        console.error('❌ [makanan/stores-stream]', err.message);
        if (!isClosed) {
            send('error', { message: err.message });
        }
    } finally {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (!res.writableEnded) res.end();
    }
});

// ─────────────────────────────────────────────────────────────
// ENDPOINT JSON: GET /api/makanan/stores
// ─────────────────────────────────────────────────────────────
app.get('/api/makanan/stores', async (req, res) => {
    try {
        const userCoords = parseUserCoords(req.query);
        const stores = await fetchAllStoresFromComponent(MAKANAN_COMPONENT_UID);

        const storeList = await Promise.all(stores.map(async (store) => {
            try {
                const detail = await fetchStoreDetail(store.view_uid);
                const distance = (detail.origin_lat && detail.origin_lng)
                    ? getDistance(userCoords.lat, userCoords.lng,
                        parseFloat(detail.origin_lat), parseFloat(detail.origin_lng))
                    : null;

                return {
                    view_uid: store.view_uid,
                    title: store.title,
                    image: store.image,
                    is_open: detail.is_open === 1,
                    close_status: detail.close_status || '',
                    origin_address: detail.origin_address || '',
                    origin_lat: detail.origin_lat,
                    origin_lng: detail.origin_lng,
                    distance: distance,
                    seller_rating: detail.seller_rating,
                    user_phone: detail.user_phone || null,
                    partner_view_uid: detail.partner_view_uid || null,
                    app_name: detail.app_name || null
                };
            } catch (err) {
                return null;
            }
        }));

        const validStores = storeList.filter(s => s !== null);
        validStores.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

        res.json({
            success: true,
            total: validStores.length,
            stores: validStores,
            userCoords
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// ENDPOINT JSON: GET /api/makanan/store/:viewUid (DETAIL TOKO)
// ─────────────────────────────────────────────────────────────
app.get('/api/makanan/store/:viewUid', async (req, res) => {
    try {
        const { viewUid } = req.params;
        const userCoords = parseUserCoords(req.query);

        const detail = await fetchStoreDetail(viewUid);
        const distance = (detail.origin_lat && detail.origin_lng)
            ? getDistance(userCoords.lat, userCoords.lng,
                parseFloat(detail.origin_lat), parseFloat(detail.origin_lng))
            : null;

        res.json({
            success: true,
            data: {
                store: {
                    view_uid: detail.view_uid,
                    title: detail.title,
                    image: detail.image,
                    origin_address: detail.origin_address || '',
                    origin_lat: detail.origin_lat,
                    origin_lng: detail.origin_lng,
                    distance: distance,
                    seller_rating: detail.seller_rating,
                    is_open: detail.is_open === 1,
                    user_phone: detail.user_phone || null,
                    partner_view_uid: detail.partner_view_uid || null,
                    app_name: detail.app_name || null
                }
            }
        });
    } catch (err) {
        console.error('❌ [makanan/store]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// ENDPOINT JSON: GET /api/makanan/products/:storeUid
// ─────────────────────────────────────────────────────────────
app.get('/api/makanan/products/:storeUid', async (req, res) => {
    try {
        const { storeUid } = req.params;
        const userCoords = parseUserCoords(req.query);
        const { view_uid } = req.query;

        console.log(`📦 [makanan/products] store=${storeUid}, partner_view_uid=${view_uid}`);

        let partnerInfo = null;

        if (view_uid) {
            partnerInfo = await getPartnerDetailByViewUid(view_uid);
            if (partnerInfo) {
                console.log(`✅ Partner found: ${partnerInfo.username} (${partnerInfo.partner_commission}%)`);
            } else {
                console.log(`⚠️ No partner found for view_uid: ${view_uid}`);
            }
        }

        const [storeDetail, categories, rawProducts] = await Promise.all([
            fetchStoreDetail(storeUid),
            fetchStoreCategories(storeUid),
            fetchStoreProductsWithCategories(storeUid)
        ]);

        const products = rawProducts.map(product =>
            formatProductWithCommission(product, storeDetail, userCoords, partnerInfo)
        );

        const productsByCategory = {};
        products.forEach(p => {
            const cat = p.category_name;
            if (!productsByCategory[cat]) productsByCategory[cat] = [];
            productsByCategory[cat].push(p);
        });

        const categoriesResult = Object.keys(productsByCategory).map(catName => ({
            name: catName,
            products: productsByCategory[catName],
            count: productsByCategory[catName].length
        }));

        res.json({
            success: true,
            store: {
                view_uid: storeDetail.view_uid,
                title: storeDetail.title,
                image: storeDetail.image,
                origin_address: storeDetail.origin_address,
                origin_lat: storeDetail.origin_lat,
                origin_lng: storeDetail.origin_lng,
                is_open: storeDetail.is_open === 1,
                seller_rating: storeDetail.seller_rating,
                user_phone: storeDetail.user_phone || null,
                partner_view_uid: storeDetail.partner_view_uid || null,
                app_name: storeDetail.app_name || null
            },
            partner_info: partnerInfo ? {
                view_uid: partnerInfo.view_uid,
                username: partnerInfo.username,
                phone: partnerInfo.phone,
                name: partnerInfo.name,
                partner_commission: partnerInfo.partner_commission
            } : null,
            products: products,
            categories: categoriesResult,
            total_products: products.length,
            total_categories: categoriesResult.length,
            userCoords
        });

    } catch (err) {
        console.error('❌ [makanan/products]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// ENDPOINT PARTNER MATCH
// ─────────────────────────────────────────────────────────────
app.get('/api/partner/match', async (req, res) => {
    const { unique_id, phone, username, view_uid, name } = req.query;

    console.log('🔍 [PARTNER MATCH] Request received:');
    console.log('   unique_id:', unique_id);
    console.log('   phone:', phone);
    console.log('   username:', username);
    console.log('   view_uid:', view_uid);
    console.log('   name:', name);

    if (!unique_id) {
        return res.status(400).json({ success: false, error: "unique_id is required" });
    }

    if (!phone && !username && !view_uid && !name) {
        return res.status(400).json({ success: false, error: "phone, username, view_uid, or name is required" });
    }

    try {
        let partnerData = null;

        if (view_uid) {
            try {
                const url = `https://app.jagel.id/api/users/${view_uid}?driver=1`;
                console.log('🌐 Fetching by view_uid:', url);
                const response = await axios.get(url, { headers: jagelHeaders });
                if (response.data && response.data.success && response.data.data) {
                    partnerData = response.data.data;
                    console.log('✅ Partner found by view_uid:', partnerData.username);
                }
            } catch (err) {
                console.log('⚠️ view_uid match failed:', err.message);
            }
        }

        if (!partnerData && phone) {
            try {
                const url = `https://app.jagel.id/api/v2/partner?unique_id=${unique_id}&phone=${phone}`;
                console.log('🌐 Searching by phone:', url);
                const response = await axios.get(url, { headers: jagelHeaders });
                if (response.data && response.data.success && response.data.data?.data?.length > 0) {
                    const partner = response.data.data.data[0];
                    const detailUrl = `https://app.jagel.id/api/users/${partner.view_uid}?driver=1`;
                    const detailRes = await axios.get(detailUrl, { headers: jagelHeaders });
                    if (detailRes.data.success) {
                        partnerData = detailRes.data.data;
                        console.log('✅ Partner found by phone:', partnerData.username);
                    }
                }
            } catch (err) {
                console.log('⚠️ phone match failed:', err.message);
            }
        }

        if (!partnerData && username) {
            try {
                const url = `https://app.jagel.id/api/v2/partner?unique_id=${unique_id}&username=${username}`;
                console.log('🌐 Searching by username:', url);
                const response = await axios.get(url, { headers: jagelHeaders });
                if (response.data && response.data.success && response.data.data?.data?.length > 0) {
                    const partner = response.data.data.data[0];
                    const detailUrl = `https://app.jagel.id/api/users/${partner.view_uid}?driver=1`;
                    const detailRes = await axios.get(detailUrl, { headers: jagelHeaders });
                    if (detailRes.data.success) {
                        partnerData = detailRes.data.data;
                        console.log('✅ Partner found by username:', partnerData.username);
                    }
                }
            } catch (err) {
                console.log('⚠️ username match failed:', err.message);
            }
        }

        if (!partnerData && name) {
            try {
                const url = `https://app.jagel.id/api/v2/partner?unique_id=${unique_id}&name=${name}`;
                console.log('🌐 Searching by name:', url);
                const response = await axios.get(url, { headers: jagelHeaders });
                if (response.data && response.data.success && response.data.data?.data?.length > 0) {
                    const partner = response.data.data.data[0];
                    const detailUrl = `https://app.jagel.id/api/users/${partner.view_uid}?driver=1`;
                    const detailRes = await axios.get(detailUrl, { headers: jagelHeaders });
                    if (detailRes.data.success) {
                        partnerData = detailRes.data.data;
                        console.log('✅ Partner found by name:', partnerData.username);
                    }
                }
            } catch (err) {
                console.log('⚠️ name match failed:', err.message);
            }
        }

        if (!partnerData) {
            console.log('❌ No partner found for any method');
            return res.status(404).json({ success: false, error: "Partner not found" });
        }

        console.log('✅ Final partner data:', {
            view_uid: partnerData.view_uid,
            username: partnerData.username,
            phone: partnerData.phone,
            commission: partnerData.partner_commission
        });

        res.json({
            success: true,
            data: {
                view_uid: partnerData.view_uid,
                unique_id: partnerData.unique_id,
                username: partnerData.username,
                phone: partnerData.phone,
                partner_commission: partnerData.partner_commission,
                name: partnerData.name,
                partner_status: partnerData.partner_status,
            }
        });
    } catch (err) {
        console.error('❌ Error in /api/partner/match:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// ENDPOINT PARTNER MATCH - SEDERHANA
// ─────────────────────────────────────────────────────────────
app.get('/api/partner/:viewUid', async (req, res) => {
    const { viewUid } = req.params;

    console.log('🔍 [PARTNER] Fetching partner:', viewUid);

    if (!viewUid) {
        return res.status(400).json({ success: false, error: "view_uid is required" });
    }

    try {
        const partnerInfo = await getPartnerDetailByViewUid(viewUid);

        if (!partnerInfo) {
            console.log('❌ Partner not found');
            return res.status(404).json({ success: false, error: "Partner not found" });
        }

        console.log('✅ Partner found:', partnerInfo.username);
        res.json({ success: true, data: partnerInfo });

    } catch (err) {
        console.error('❌ Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});


app.get('/api/partner/report/pertanian', async (req, res) => {
    const { unique_id, paginate, partner_status, page } = req.query;

    console.log('🌾 [PARTNER REPORT - PERTANIAN] Request received:');
    console.log('   unique_id:', unique_id);
    console.log('   paginate:', paginate);
    console.log('   partner_status:', partner_status);
    console.log('   page:', page);

    if (!unique_id) {
        return res.status(400).json({ success: false, error: "unique_id is required" });
    }

    try {
        const reportData = await fetchPartnerReport({
            unique_id,
            paginate: paginate || 10,
            partner_status,
            page
        });

        const allPartners = reportData?.partners?.data || [];
        const filteredPartners = filterPartnersByKategoriUsaha(allPartners, 'PRODUK PERTANIAN');

        const partnersWithLocation = filteredPartners.map(partner => {
            const locationData = partner.formSubmit?.data?.lokasiusaha || '';
            let location = null;

            if (locationData && locationData.includes(';')) {
                const parts = locationData.split(';');
                if (parts.length >= 3) {
                    location = {
                        address: parts[0] || '',
                        lat: parseFloat(parts[1]) || 0,
                        lng: parseFloat(parts[2]) || 0
                    };
                }
            }

            return {
                ...partner,
                location: location,
                location_raw: locationData || null
            };
        });

        console.log(`✅ Total partners: ${allPartners.length}, Pertanian: ${partnersWithLocation.length}`);

        res.json({
            success: true,
            data: {
                app: reportData?.app || null,
                partners: {
                    current_page: reportData?.partners?.current_page || 1,
                    last_page: reportData?.partners?.last_page || 1,
                    per_page: reportData?.partners?.per_page || paginate || 10,
                    total: partnersWithLocation.length,
                    total_unfiltered: allPartners.length,
                    data: partnersWithLocation
                }
            }
        });

    } catch (err) {
        console.error('❌ [PARTNER REPORT - PERTANIAN] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});


function extractDesaFromLocationRaw(locationRaw) {
    if (!locationRaw) return null;
    const parts = locationRaw.split(';');
    if (parts.length < 1) return null;

    const address = parts[0];
    const addressParts = address.split(',').map(s => s.trim());

    for (let i = 0; i < addressParts.length; i++) {
        const part = addressParts[i].trim();
        if (part.includes('+') || part.includes('Kec.') || part.includes('Kab.') ||
            part.includes('Prov.') || part.includes('Indonesia') ||
            /^\d{5}$/.test(part) ||
            part.includes('Kecamatan') || part.includes('Kabupaten')) {
            continue;
        }
        if (part.length > 1 && !part.includes('RT') && !part.includes('RW')) {
            return part;
        }
    }

    const match = address.match(/^[^,]+,?\s*([^,]+)/);
    if (match && match[1]) {
        const potentialDesa = match[1].trim();
        if (potentialDesa.length > 1 && !potentialDesa.includes('+')) {
            return potentialDesa;
        }
    }
    return null;
}

async function getPertanianEnrichmentMap() {
    try {
        const reportData = await fetchPartnerReport({
            unique_id: DEFAULT_UNIQUE_ID,
            paginate: 100,
            partner_status: DEFAULT_PARTNER_STATUS,
            page: 1,
        });

        const allPartners = reportData?.partners?.data || [];
        const filtered = filterPartnersByKategoriUsaha(allPartners, 'PRODUK PERTANIAN');

        const mapByPartnerViewUid = {};
        const mapByViewUid = {};

        filtered.forEach(partner => {
            const form = partner.formSubmit?.data || {};
            const locationRaw = form.lokasiusaha || '';
            const desa = extractDesaFromLocationRaw(locationRaw) || form.kelurahan || '';

            const enriched = {
                businessName: form.namausaha || null,
                ownerFirstName: (form.namapemilik || '').trim().split(/\s+/)[0] || '',
                kecamatan: form.kecamatan || '',
                kabupaten: form.kabupaten || '',
                provinsi: form.provinsi || '',
                desa,
                location_raw: locationRaw || null,
                joinedDate: partner.partner_date_accept || partner.partner_date || null,
            };

            if (partner.view_uid) mapByPartnerViewUid[partner.view_uid] = enriched;
            if (partner.view_uid) mapByViewUid[partner.view_uid] = enriched;
        });

        return { mapByPartnerViewUid, mapByViewUid };
    } catch (err) {
        console.log('⚠️ Gagal ambil data enrichment pertanian:', err.message);
        return { mapByPartnerViewUid: {}, mapByViewUid: {} };
    }
}


app.get('/api/petani/mitra', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.per_page) || 24;

        console.log(`🌾 [petani/mitra] page=${page}, per_page=${perPage}`);

        const [componentData, enrichment] = await Promise.all([
            jagelGet(`/component/${PETANI_COMPONENT_UID}`, {
                codename: JAGEL_CODENAME,
                page,
                app_mode: 1,
                per_page: perPage,
            }),
            getPertanianEnrichmentMap(),
        ]);

        const lists = componentData.lists || {};
        const rawItems = lists.data || [];

        const mitra = rawItems.map(item => {
            const enrich =
                enrichment.mapByPartnerViewUid[item.partner_view_uid] ||
                enrichment.mapByViewUid[item.view_uid] ||
                {};

            // ── Parse location_raw untuk ambil koordinat ──
            let origin_lat = null;
            let origin_lng = null;
            const locationRaw = enrich.location_raw || '';

            if (locationRaw && locationRaw.includes(';')) {
                const parts = locationRaw.split(';');
                if (parts.length >= 3) {
                    const lat = parseFloat(parts[1]);
                    const lng = parseFloat(parts[2]);
                    if (!isNaN(lat) && !isNaN(lng)) {
                        origin_lat = lat;
                        origin_lng = lng;
                    }
                }
            }

            return {
                view_uid: item.view_uid,
                title: (item.title || '').trim(),
                image: item.image || null,
                content: item.content || '',
                is_open: item.is_open === 1,
                close_status: item.close_status || '',
                partner_view_uid: item.partner_view_uid || null,
                partner_name: item.partner_name || null,
                link_view: item.link_view || null,
                distance: item.distance ?? null,
                // ── Koordinat dari location_raw ──
                origin_lat: origin_lat,
                origin_lng: origin_lng,
                // ── data hasil enrichment ──
                ownerFirstName: enrich.ownerFirstName || '',
                kecamatan: enrich.kecamatan || '',
                kabupaten: enrich.kabupaten || '',
                provinsi: enrich.provinsi || '',
                desa: enrich.desa || '',
                location_raw: locationRaw || null,
                joinedDate: enrich.joinedDate || null,
            };
        });

        res.json({
            success: true,
            component: {
                view_uid: componentData.view_uid,
                name: componentData.name,
            },
            data: mitra,
            pagination: {
                current_page: lists.current_page || page,
                last_page: lists.last_page || 1,
                per_page: lists.per_page || perPage,
                total: lists.total || mitra.length,
            }
        });
    } catch (err) {
        console.error('❌ [petani/mitra]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/petani/produk/:mitraUid', async (req, res) => {
    try {
        const { mitraUid } = req.params;
        const page = parseInt(req.query.page) || 1;
        const searchList = req.query.search_list || '';

        console.log(`🌾 [petani/produk] mitra=${mitraUid}, page=${page}, search_list="${searchList}"`);

        let childrenData;
        let actualUid = mitraUid;

        try {
            childrenData = await jagelGet(`/list/${mitraUid}/children`, {
                codename: JAGEL_CODENAME,
                page,
                search_list: searchList,
            });
        } catch (err) {
            console.log(`⚠️ fetch children gagal untuk ${mitraUid}, mencoba mencari ulang...`);

            const componentData = await jagelGet(`/component/${PETANI_COMPONENT_UID}`, {
                codename: JAGEL_CODENAME,
                page: 1,
                app_mode: 1,
                per_page: 100,
            });
            const allMitra = componentData.lists?.data || [];

            const foundMitra = allMitra.find(m =>
                m.view_uid === mitraUid ||
                m.partner_view_uid === mitraUid
            );

            if (foundMitra) {
                actualUid = foundMitra.view_uid;
                console.log(`🔄 Ditemukan mitra: ${foundMitra.title} dengan view_uid: ${actualUid}`);
                childrenData = await jagelGet(`/list/${actualUid}/children`, {
                    codename: JAGEL_CODENAME,
                    page,
                    search_list: searchList,
                });
            } else {
                throw new Error(`Mitra dengan UID ${mitraUid} tidak ditemukan di komponen Petani Lokal`);
            }
        }

        const rawProducts = (childrenData.data || []).filter(i => i.type === 0 || i.purchasable === 1);

        const produk = rawProducts.map(p => ({
            view_uid: p.view_uid,
            title: (p.title || '').trim(),
            image: p.image || null,
            price: p.price || 0,
            currency: p.currency || 'Rp',
            content: p.content || '',
            is_open: p.is_open === 1,
            close_status: p.close_status || '',
            max_qty: p.max_qty || null,
            partner_view_uid: p.partner_view_uid || null,
        }));

        res.json({
            success: true,
            mitra_view_uid: actualUid,
            data: produk,
            pagination: {
                current_page: childrenData.current_page || page,
                last_page: childrenData.last_page || 1,
                per_page: childrenData.per_page || produk.length,
                total: childrenData.total || produk.length,
            }
        });

    } catch (err) {
        console.error('❌ [petani/produk]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});


app.get('/api/preorder/mitra', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.per_page) || 24;

        console.log(`🥬 [preorder/mitra] page=${page}, per_page=${perPage}`);

        const [componentData, enrichment] = await Promise.all([
            jagelGet(`/component/${PREORDER_COMPONENT_UID}`, {
                codename: JAGEL_CODENAME,
                page,
                app_mode: 1,
                per_page: perPage,
            }),
            getPertanianEnrichmentMap(), // reuse map yang sudah ada
        ]);

        const lists = componentData.lists || {};
        const rawItems = lists.data || [];

        const mitra = rawItems.map(item => {
            const enrich =
                enrichment.mapByPartnerViewUid[item.partner_view_uid] ||
                enrichment.mapByViewUid[item.view_uid] ||
                {};

            return {
                view_uid: item.view_uid,           // ← dipakai untuk fetch produk
                title: (item.title || '').trim(),
                image: item.image || null,
                content: item.content || '',
                is_open: item.is_open === 1,
                close_status: item.close_status || '',
                partner_view_uid: item.partner_view_uid || null,
                partner_name: item.partner_name || null,
                link_view: item.link_view || null,
                distance: item.distance ?? null,
                // ── data hasil enrichment (bisa kosong jika tidak ketemu) ──
                ownerFirstName: enrich.ownerFirstName || '',
                kecamatan: enrich.kecamatan || '',
                kabupaten: enrich.kabupaten || '',
                provinsi: enrich.provinsi || '',
                desa: enrich.desa || '',
                location_raw: enrich.location_raw || null,
                joinedDate: enrich.joinedDate || null,
            };
        });

        res.json({
            success: true,
            component: {
                view_uid: componentData.view_uid,
                name: componentData.name,
            },
            data: mitra,
            pagination: {
                current_page: lists.current_page || page,
                last_page: lists.last_page || 1,
                per_page: lists.per_page || perPage,
                total: lists.total || mitra.length,
            }
        });
    } catch (err) {
        console.error('❌ [preorder/mitra]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/preorder/produk/:mitraUid', async (req, res) => {
    try {
        const { mitraUid } = req.params;
        const page = parseInt(req.query.page) || 1;
        const searchList = req.query.search_list || '';

        console.log(`🥬 [preorder/produk] mitra=${mitraUid}, page=${page}, search_list="${searchList}"`);

        let childrenData;
        let actualUid = mitraUid;

        try {
            childrenData = await jagelGet(`/list/${mitraUid}/children`, {
                codename: JAGEL_CODENAME,
                page,
                search_list: searchList,
            });
        } catch (err) {
            console.log(`⚠️ fetch children gagal untuk ${mitraUid}, mencoba mencari ulang di komponen Preorder...`);

            const componentData = await jagelGet(`/component/${PREORDER_COMPONENT_UID}`, {
                codename: JAGEL_CODENAME,
                page: 1,
                app_mode: 1,
                per_page: 100,
            });
            const allMitra = componentData.lists?.data || [];

            const foundMitra = allMitra.find(m =>
                m.view_uid === mitraUid ||
                m.partner_view_uid === mitraUid
            );

            if (foundMitra) {
                actualUid = foundMitra.view_uid;
                console.log(`🔄 Ditemukan mitra: ${foundMitra.title} dengan view_uid: ${actualUid}`);
                childrenData = await jagelGet(`/list/${actualUid}/children`, {
                    codename: JAGEL_CODENAME,
                    page,
                    search_list: searchList,
                });
            } else {
                throw new Error(`Mitra dengan UID ${mitraUid} tidak ditemukan di komponen Preorder`);
            }
        }

        const rawProducts = (childrenData.data || []).filter(i => i.type === 0 || i.purchasable === 1);

        const produk = rawProducts.map(p => ({
            view_uid: p.view_uid,
            title: (p.title || '').trim(),
            image: p.image || null,
            price: p.price || 0,
            currency: p.currency || 'Rp',
            content: p.content || '',
            is_open: p.is_open === 1,
            close_status: p.close_status || '',
            max_qty: p.max_qty || null,
            partner_view_uid: p.partner_view_uid || null,
        }));

        res.json({
            success: true,
            mitra_view_uid: actualUid,
            data: produk,
            pagination: {
                current_page: childrenData.current_page || page,
                last_page: childrenData.last_page || 1,
                per_page: childrenData.per_page || produk.length,
                total: childrenData.total || produk.length,
            }
        });

    } catch (err) {
        console.error('❌ [preorder/produk]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ─────────────────────────────────────────────────────────────
app.get('/api/panen-hari-ini/mitra', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.per_page) || 24;

        console.log(`🥭 [panen-hari-ini/mitra] page=${page}, per_page=${perPage}`);

        const [componentData, enrichment] = await Promise.all([
            jagelGet(`/component/${PANEN_HARI_INI_COMPONENT_UID}`, {
                codename: JAGEL_CODENAME,
                page,
                app_mode: 1,
                per_page: perPage,
            }),
            getPertanianEnrichmentMap(),
        ]);

        const lists = componentData.lists || {};
        const rawItems = lists.data || [];

        const mitra = rawItems.map(item => {
            const enrich =
                enrichment.mapByPartnerViewUid[item.partner_view_uid] ||
                enrichment.mapByViewUid[item.view_uid] ||
                {};

            return {
                view_uid: item.view_uid,
                title: (item.title || '').trim(),
                image: item.image || null,
                content: item.content || '',
                is_open: item.is_open === 1,
                close_status: item.close_status || '',
                partner_view_uid: item.partner_view_uid || null,
                partner_name: item.partner_name || null,
                link_view: item.link_view || null,
                distance: item.distance ?? null,
                ownerFirstName: enrich.ownerFirstName || '',
                kecamatan: enrich.kecamatan || '',
                kabupaten: enrich.kabupaten || '',
                provinsi: enrich.provinsi || '',
                desa: enrich.desa || '',
                location_raw: enrich.location_raw || null,
                joinedDate: enrich.joinedDate || null,
            };
        });

        res.json({
            success: true,
            component: {
                view_uid: componentData.view_uid,
                name: componentData.name,
            },
            data: mitra,
            pagination: {
                current_page: lists.current_page || page,
                last_page: lists.last_page || 1,
                per_page: lists.per_page || perPage,
                total: lists.total || mitra.length,
            }
        });
    } catch (err) {
        console.error('❌ [panen-hari-ini/mitra]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});


app.get('/api/panen-hari-ini/produk/:mitraUid', async (req, res) => {
    try {
        const { mitraUid } = req.params;
        const page = parseInt(req.query.page) || 1;
        const searchList = req.query.search_list || '';

        console.log(`🥭 [panen-hari-ini/produk] mitra=${mitraUid}, page=${page}, search_list="${searchList}"`);

        let childrenData;
        let actualUid = mitraUid;

        try {
            childrenData = await jagelGet(`/list/${mitraUid}/children`, {
                codename: JAGEL_CODENAME,
                page,
                search_list: searchList,
            });
        } catch (err) {
            console.log(`⚠️ fetch children gagal untuk ${mitraUid}, mencoba mencari ulang di komponen Panen Hari Ini...`);

            const componentData = await jagelGet(`/component/${PANEN_HARI_INI_COMPONENT_UID}`, {
                codename: JAGEL_CODENAME,
                page: 1,
                app_mode: 1,
                per_page: 100,
            });
            const allMitra = componentData.lists?.data || [];

            const foundMitra = allMitra.find(m =>
                m.view_uid === mitraUid ||
                m.partner_view_uid === mitraUid
            );

            if (foundMitra) {
                actualUid = foundMitra.view_uid;
                console.log(`🔄 Ditemukan mitra: ${foundMitra.title} dengan view_uid: ${actualUid}`);
                childrenData = await jagelGet(`/list/${actualUid}/children`, {
                    codename: JAGEL_CODENAME,
                    page,
                    search_list: searchList,
                });
            } else {
                throw new Error(`Mitra dengan UID ${mitraUid} tidak ditemukan di komponen Panen Hari Ini`);
            }
        }

        const rawProducts = (childrenData.data || []).filter(i => i.type === 0 || i.purchasable === 1);

        const produk = rawProducts.map(p => ({
            view_uid: p.view_uid,
            title: (p.title || '').trim(),
            image: p.image || null,
            price: p.price || 0,
            price_before_discount: p.price_before_discount || 0, // ← ditambahkan
            currency: p.currency || 'Rp',
            content: p.content || '',
            is_open: p.is_open === 1,
            close_status: p.close_status || '',
            max_qty: p.max_qty || null,
            partner_view_uid: p.partner_view_uid || null,
        }));

        res.json({
            success: true,
            mitra_view_uid: actualUid,
            data: produk,
            pagination: {
                current_page: childrenData.current_page || page,
                last_page: childrenData.last_page || 1,
                per_page: childrenData.per_page || produk.length,
                total: childrenData.total || produk.length,
            }
        });

    } catch (err) {
        console.error('❌ [panen-hari-ini/produk]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/jadwal-panen/mitra', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.per_page) || 24;

        console.log(`🌱 [jadwal-panen/mitra] page=${page}, per_page=${perPage}`);

        const [componentData, enrichment] = await Promise.all([
            jagelGet(`/component/${JADWAL_PANEN_COMPONENT_UID}`, {
                codename: JAGEL_CODENAME,
                page,
                app_mode: 1,
                per_page: perPage,
            }),
            getPertanianEnrichmentMap(),
        ]);

        const lists = componentData.lists || {};
        const rawItems = lists.data || [];

        const mitra = rawItems.map(item => {
            const enrich =
                enrichment.mapByPartnerViewUid[item.partner_view_uid] ||
                enrichment.mapByViewUid[item.view_uid] ||
                {};

            return {
                view_uid: item.view_uid,
                title: (item.title || '').trim(),
                image: item.image || null,
                content: item.content || '',
                is_open: item.is_open === 1,
                close_status: item.close_status || '',
                partner_view_uid: item.partner_view_uid || null,
                partner_name: item.partner_name || null,
                link_view: item.link_view || null,
                distance: item.distance ?? null,
                ownerFirstName: enrich.ownerFirstName || '',
                kecamatan: enrich.kecamatan || '',
                kabupaten: enrich.kabupaten || '',
                provinsi: enrich.provinsi || '',
                desa: enrich.desa || '',
                location_raw: enrich.location_raw || null,
                joinedDate: enrich.joinedDate || null,
            };
        });

        res.json({
            success: true,
            component: {
                view_uid: componentData.view_uid,
                name: componentData.name,
            },
            data: mitra,
            pagination: {
                current_page: lists.current_page || page,
                last_page: lists.last_page || 1,
                per_page: lists.per_page || perPage,
                total: lists.total || mitra.length,
            }
        });
    } catch (err) {
        console.error('❌ [jadwal-panen/mitra]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 🌱 ENDPOINT: GET /api/jadwal-panen/produk/:mitraUid
// Daftar produk "Jadwal Panen" milik satu mitra — langsung ke
// jagel /list/{uid}/children, dengan fallback pencarian ulang
// lewat komponen Jadwal Panen.
// Query params: page (default 1), search_list (opsional)
// ─────────────────────────────────────────────────────────────
app.get('/api/jadwal-panen/produk/:mitraUid', async (req, res) => {
    try {
        const { mitraUid } = req.params;
        const page = parseInt(req.query.page) || 1;
        const searchList = req.query.search_list || '';

        console.log(`🌱 [jadwal-panen/produk] mitra=${mitraUid}, page=${page}, search_list="${searchList}"`);

        let childrenData;
        let actualUid = mitraUid;

        try {
            childrenData = await jagelGet(`/list/${mitraUid}/children`, {
                codename: JAGEL_CODENAME,
                page,
                search_list: searchList,
            });
        } catch (err) {
            console.log(`⚠️ fetch children gagal untuk ${mitraUid}, mencoba mencari ulang di komponen Jadwal Panen...`);

            const componentData = await jagelGet(`/component/${JADWAL_PANEN_COMPONENT_UID}`, {
                codename: JAGEL_CODENAME,
                page: 1,
                app_mode: 1,
                per_page: 100,
            });
            const allMitra = componentData.lists?.data || [];

            const foundMitra = allMitra.find(m =>
                m.view_uid === mitraUid ||
                m.partner_view_uid === mitraUid
            );

            if (foundMitra) {
                actualUid = foundMitra.view_uid;
                console.log(`🔄 Ditemukan mitra: ${foundMitra.title} dengan view_uid: ${actualUid}`);
                childrenData = await jagelGet(`/list/${actualUid}/children`, {
                    codename: JAGEL_CODENAME,
                    page,
                    search_list: searchList,
                });
            } else {
                throw new Error(`Mitra dengan UID ${mitraUid} tidak ditemukan di komponen Jadwal Panen`);
            }
        }

        const rawProducts = (childrenData.data || []).filter(i => i.type === 0 || i.purchasable === 1);

        const produk = rawProducts.map(p => ({
            view_uid: p.view_uid,
            title: (p.title || '').trim(),
            image: p.image || null,
            price: p.price || 0,
            currency: p.currency || 'Rp',
            content: p.content || '',
            is_open: p.is_open === 1,
            close_status: p.close_status || '',
            max_qty: p.max_qty || null,
            partner_view_uid: p.partner_view_uid || null,
        }));

        res.json({
            success: true,
            mitra_view_uid: actualUid,
            data: produk,
            pagination: {
                current_page: childrenData.current_page || page,
                last_page: childrenData.last_page || 1,
                per_page: childrenData.per_page || produk.length,
                total: childrenData.total || produk.length,
            }
        });

    } catch (err) {
        console.error('❌ [jadwal-panen/produk]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 🎟️ ENDPOINT: GET /api/mydiscount
// Ambil voucher/diskon dari Jagel berdasarkan unique_id,
// lalu filter hanya yang category === 1
// Query params: filter (wajib), unique_id (wajib)
// ─────────────────────────────────────────────────────────────
async function fetchMyDiscount({ filter, unique_id }) {
    const url = 'https://app.jagel.id/api/mydiscount';

    console.log('🌐 Fetch mydiscount (GET):', url, { filter, unique_id });

    const response = await axios.get(url, {
        headers: jagelHeaders,
        params: { filter, unique_id }
    });

    if (!response.data || !response.data.success) {
        throw new Error(response.data?.message || 'Mydiscount API error');
    }

    return response.data.data;
}

app.get('/api/mydiscount', async (req, res) => {
    const { filter, unique_id } = req.query;

    console.log('🎟️ [MYDISCOUNT] Request received:');
    console.log('   filter:', filter);
    console.log('   unique_id:', unique_id);

    if (!unique_id) {
        return res.status(400).json({ success: false, error: 'unique_id is required' });
    }
    if (filter === undefined) {
        return res.status(400).json({ success: false, error: 'filter is required' });
    }

    try {
        const data = await fetchMyDiscount({ filter, unique_id });

        console.log(`✅ Total discounts: ${data.discounts?.length || 0}`);

        res.json({
            success: true,
            data
        });

    } catch (err) {
        console.error('❌ [MYDISCOUNT] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});


async function fetchDriverReportList({ app_uid = DEFAULT_UNIQUE_ID, paginate = 10, page = 1 }) {
    const url = 'https://app.jagel.id/api/owner/driver/report';
    const payload = { app_uid, paginate, page };

    console.log('🌐 Fetch driver report (POST):', url, payload);

    const response = await axios.post(url, payload, { headers: jagelHeaders });

    if (!response.data || !response.data.success) {
        throw new Error('Driver report API error');
    }

    return response.data.data;
}

// ─────────────────────────────────────────────────────────────
// 🔥 FUNGSI: Ambil detail 1 order driver — GET
// ─────────────────────────────────────────────────────────────
async function fetchDriverOrderDetail(uniqueId) {
    const url = `https://app.jagel.id/api/order/view-detail-owner/${uniqueId}`;

    console.log('🌐 Fetch driver order detail:', url);

    const response = await axios.get(url, { headers: jagelHeaders });

    if (!response.data || !response.data.success) {
        throw new Error(`Driver detail API error for ${uniqueId}`);
    }

    return response.data.data;
}

// ─────────────────────────────────────────────────────────────
// 🗓️ HELPER: Dapatkan tanggal "hari ini" dalam zona waktu Jakarta
// Format: YYYY-MM-DD
// ─────────────────────────────────────────────────────────────
function getJakartaDateString(offsetDays = 0) {
    const now = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
    // en-CA locale menghasilkan format YYYY-MM-DD secara default
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now);
}

// Ambil bagian tanggal saja dari creation_date, mis. "2026-07-09 19:30:56" -> "2026-07-09"
function extractDateOnly(creationDate) {
    if (!creationDate) return null;
    return String(creationDate).split(' ')[0];
}

// ─────────────────────────────────────────────────────────────
// 🔥 FUNGSI: Ambil SEMUA order driver untuk 1 tanggal tertentu.
//
// Karena list dari jagel terurut dari order terbaru -> terlama,
// begitu ditemukan order dengan tanggal LEBIH LAMA dari target,
// loop langsung berhenti (tidak perlu scan semua halaman).
// ─────────────────────────────────────────────────────────────
async function fetchAllDriverOrdersForDate({
    app_uid = DEFAULT_UNIQUE_ID,
    targetDate,
    perPage = 50,
    maxPages = 50,
}) {
    let page = 1;
    let collected = [];
    let stop = false;
    let appMeta = null;
    let pagesScanned = 0;

    while (!stop && page <= maxPages) {
        const reportData = await fetchDriverReportList({ app_uid, paginate: perPage, page });
        if (!appMeta) appMeta = reportData;
        pagesScanned = page;

        const items = reportData?.driver?.data || [];
        if (items.length === 0) break;

        for (const item of items) {
            const itemDate = extractDateOnly(item.creation_date);
            if (itemDate === targetDate) {
                collected.push(item);
            } else if (itemDate && itemDate < targetDate) {
                // Data sudah lebih lama dari tanggal target -> berhenti scan
                stop = true;
                break;
            }
            // jika itemDate > targetDate (order lebih baru dari target, kasus jarang
            // misal request tanggal kemarin sementara halaman 1 masih order hari ini) -> skip, lanjut
        }

        const lastPage = reportData?.driver?.last_page || 1;
        if (page >= lastPage) break;
        page++;
    }

    return { items: collected, appMeta, pagesScanned };
}

// Cari nomor HP driver — field asli ada di data.driver.phone
function extractDriverPhone(detail) {
    return (
        detail?.driver?.phone ||
        detail?.driver_phone ||
        null
    );
}

// Jenis kurir/ekspedisi — field asli ada di data.expedition
function extractExpedition(detail) {
    return detail?.expedition || null;
}

// Info driver lengkap (nama, plat nomor, model motor, dll)
function extractDriverInfo(detail) {
    const d = detail?.driver || {};
    return {
        view_uid: d.view_uid || null,
        name: d.name || null,
        phone: d.phone || null,
        license_plate: d.driver_license_plate || null,
        vehicle_model: d.driver_model || null,
        photo: d.photo || null,
    };
}

// ─────────────────────────────────────────────────────────────
// Jarak tempuh order — dipakai untuk hitung komisi BBM.
// Diambil dari data.lines[], baris dengan category === 2
// (baris "Kurir Food" / ongkir) yang punya field distance.
// distance dari jagel dalam METER.
// ─────────────────────────────────────────────────────────────
function extractDistanceInfo(detail) {
    const lines = detail?.lines || [];

    let target = lines.find(l => l.category === 2 && l.distance != null);
    if (!target) target = lines.find(l => l.distance != null); // fallback

    if (!target) {
        return { distance_meters: null, distance_km: null, distance_text: null };
    }

    return {
        distance_meters: target.distance,
        distance_km: Math.round((target.distance / 1000) * 100) / 100, // 2 desimal
        distance_text: target.distance_text || null,
    };
}


app.get('/api/driver/report', async (req, res) => {
    try {
        const app_uid = req.query.app_uid || DEFAULT_UNIQUE_ID;
        const phoneFilter = req.query.phone ? String(req.query.phone).trim() : null;
        const dateParam = req.query.date; // 'YYYY-MM-DD' | 'all' | undefined

        let driverList = [];
        let reportData = null;
        let targetDate = null;
        let pagesScanned = null;

        if (dateParam === 'all') {
            // ── Mode lama: single page manual, tanpa filter tanggal ──
            const page = parseInt(req.query.page) || 1;
            const paginate = parseInt(req.query.paginate) || 10;

            console.log(`🚗 [driver/report] mode=all-pages-off, page=${page}, paginate=${paginate}, phone=${phoneFilter || '-'}`);

            reportData = await fetchDriverReportList({ app_uid, paginate, page });
            driverList = reportData?.driver?.data || [];
        } else {
            // ── Mode default: filter by tanggal (hari ini kalau tidak diisi) ──
            targetDate = dateParam || getJakartaDateString();
            const perPage = parseInt(req.query.paginate) || 50;

            console.log(`🚗 [driver/report] mode=date-filter, date=${targetDate}, phone=${phoneFilter || '-'}`);

            const scanResult = await fetchAllDriverOrdersForDate({ app_uid, targetDate, perPage });
            driverList = scanResult.items;
            reportData = scanResult.appMeta;
            pagesScanned = scanResult.pagesScanned;
        }

        // Ambil detail tiap order secara batch (biar tidak membanjiri API jagel)
        const batches = chunk(driverList, BATCH_SIZE);
        const enrichedResults = [];

        for (const batch of batches) {
            const batchResults = await Promise.all(batch.map(async (item) => {
                try {
                    const detail = await fetchDriverOrderDetail(item.unique_id);
                    return { ok: true, item, detail };
                } catch (err) {
                    console.log(`⚠️ Gagal ambil detail order ${item.unique_id}: ${err.message}`);
                    return { ok: false, item, error: err.message };
                }
            }));
            enrichedResults.push(...batchResults);
        }

        // Filter hanya expedition = "kurir - kurir food"
        let filtered = enrichedResults
            .filter(r => r.ok)
            .filter(r => {
                const expedition = extractExpedition(r.detail);
                return typeof expedition === 'string'
                    && expedition.toLowerCase() === DRIVER_EXPEDITION_FILTER.toLowerCase();
            });

        // Filter tambahan by phone (kalau diminta frontend)
        if (phoneFilter) {
            filtered = filtered.filter(r => {
                const phone = extractDriverPhone(r.detail);
                return phone && String(phone).includes(phoneFilter);
            });
        }

        const data = filtered.map(r => {
            const distanceInfo = extractDistanceInfo(r.detail);
            return {
                driver_username: r.item.driver_username,
                creation_date: r.item.creation_date,
                order_no: r.item.order_no,
                unique_id: r.item.unique_id,
                total_price: r.item.total_price,
                currency: r.item.currency,
                expedition: extractExpedition(r.detail),
                courrier_type: r.detail?.courrier_type ?? null,   // ← BARU: dipakai untuk cocokkan ke /api/master/courier
                driver_phone: extractDriverPhone(r.detail),
                driver_info: extractDriverInfo(r.detail),
                distance_meters: distanceInfo.distance_meters,
                distance_km: distanceInfo.distance_km,
                distance_text: distanceInfo.distance_text,
                shipping: r.detail?.shipping ?? null,
                freight_charge: r.detail?.freight_charge ?? null,
                order_fee: r.detail?.order_fee ?? null,
                partner_commission_total: r.detail?.partner_commission_total ?? null,
                order_status: r.detail?.order_status ?? null,
            };
        });

        const failedCount = enrichedResults.filter(r => !r.ok).length;

        // Total nilai order (berguna buat rekap komisi BBM harian)
        const totalOrderValue = data.reduce((sum, d) => sum + (d.total_price || 0), 0);
        const totalDistanceKm = data.reduce((sum, d) => sum + (d.distance_km || 0), 0);

        // ── Ringkasan per driver: total order, total km, total nilai order ──
        // Ini yang dipakai untuk hitung ulang komisi BBM tiap hari (reset per hari).
        const summaryMap = {};
        data.forEach(d => {
            const key = d.driver_username || d.driver_phone || 'unknown';
            if (!summaryMap[key]) {
                summaryMap[key] = {
                    driver_username: d.driver_username,
                    driver_name: d.driver_info?.name || null,
                    driver_phone: d.driver_phone,
                    license_plate: d.driver_info?.license_plate || null,
                    total_orders: 0,
                    total_distance_km: 0,
                    total_order_value: 0,
                };
            }
            summaryMap[key].total_orders += 1;
            summaryMap[key].total_distance_km += (d.distance_km || 0);
            summaryMap[key].total_order_value += (d.total_price || 0);
        });

        const summaryByDriver = Object.values(summaryMap).map(s => ({
            ...s,
            total_distance_km: Math.round(s.total_distance_km * 100) / 100,
        }));

        res.json({
            success: true,
            app_name: reportData?.app_name || null,
            rating: reportData?.rating || null,
            done: reportData?.done || null,
            revenue: reportData?.revenue || null,
            currency: reportData?.currency || 'Rp',
            filter: {
                date: targetDate,               // null jika mode date=all
                pages_scanned: pagesScanned,    // null jika mode date=all
                phone: phoneFilter,
            },
            total_raw: driverList.length,
            total_filtered: data.length,
            total_order_value: totalOrderValue,
            total_distance_km: Math.round(totalDistanceKm * 100) / 100,
            failed_detail_fetch: failedCount,
            summary_by_driver: summaryByDriver,
            data
        });

    } catch (err) {
        console.error('❌ [driver/report]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// FINAL: ENDPOINT DRIVER REPORT — TANPA FILTER EXPEDITION
// ═══════════════════════════════════════════════════════════════
app.get('/api/driver/report/all-expedition', async (req, res) => {
    try {
        const app_uid = req.query.app_uid || DEFAULT_UNIQUE_ID;
        const phoneFilter = req.query.phone ? String(req.query.phone).trim() : null;
        const dateParam = req.query.date; // 'YYYY-MM-DD' | 'all' | undefined

        let driverList = [];
        let reportData = null;
        let targetDate = null;
        let pagesScanned = null;

        if (dateParam === 'all') {
            // ── Mode lama: single page manual, tanpa filter tanggal ──
            const page = parseInt(req.query.page) || 1;
            const paginate = parseInt(req.query.paginate) || 10;

            console.log(`🚗 [driver/report/all-expedition] mode=all-pages-off, page=${page}, paginate=${paginate}, phone=${phoneFilter || '-'}`);

            reportData = await fetchDriverReportList({ app_uid, paginate, page });
            driverList = reportData?.driver?.data || [];
        } else {
            // ── Mode default: filter by tanggal (hari ini kalau tidak diisi) ──
            targetDate = dateParam || getJakartaDateString();
            const perPage = parseInt(req.query.paginate) || 50;

            console.log(`🚗 [driver/report/all-expedition] mode=date-filter, date=${targetDate}, phone=${phoneFilter || '-'}`);

            const scanResult = await fetchAllDriverOrdersForDate({ app_uid, targetDate, perPage });
            driverList = scanResult.items;
            reportData = scanResult.appMeta;
            pagesScanned = scanResult.pagesScanned;
        }

        // Ambil detail tiap order secara batch (biar tidak membanjiri API jagel)
        const batches = chunk(driverList, BATCH_SIZE);
        const enrichedResults = [];

        for (const batch of batches) {
            const batchResults = await Promise.all(batch.map(async (item) => {
                try {
                    const detail = await fetchDriverOrderDetail(item.unique_id);
                    return { ok: true, item, detail };
                } catch (err) {
                    console.log(`⚠️ Gagal ambil detail order ${item.unique_id}: ${err.message}`);
                    return { ok: false, item, error: err.message };
                }
            }));
            enrichedResults.push(...batchResults);
        }

        // ── TIDAK ada filter expedition di sini ──
        // Langsung ambil semua yang berhasil di-fetch detail-nya.
        let filtered = enrichedResults.filter(r => r.ok);

        // Filter tambahan by phone (kalau diminta frontend) — tetap dipertahankan
        if (phoneFilter) {
            filtered = filtered.filter(r => {
                const phone = extractDriverPhone(r.detail);
                return phone && String(phone).includes(phoneFilter);
            });
        }

        const data = filtered.map(r => {
            const distanceInfo = extractDistanceInfo(r.detail);
            return {
                driver_username: r.item.driver_username,
                creation_date: r.item.creation_date,
                order_no: r.item.order_no,
                unique_id: r.item.unique_id,
                total_price: r.item.total_price,
                currency: r.item.currency,
                expedition: extractExpedition(r.detail), // tetap ditampilkan, hanya tidak dipakai untuk filter
                courrier_type: r.detail?.courrier_type ?? null,   // ← BARU: dipakai untuk cocokkan ke /api/master/courier
                driver_phone: extractDriverPhone(r.detail),
                driver_info: extractDriverInfo(r.detail),
                distance_meters: distanceInfo.distance_meters,
                distance_km: distanceInfo.distance_km,
                distance_text: distanceInfo.distance_text,
                shipping: r.detail?.shipping ?? null,
                freight_charge: r.detail?.freight_charge ?? null,
                order_fee: r.detail?.order_fee ?? null,
                partner_commission_total: r.detail?.partner_commission_total ?? null,
                order_status: r.detail?.order_status ?? null,
            };
        });

        const failedCount = enrichedResults.filter(r => !r.ok).length;

        const totalOrderValue = data.reduce((sum, d) => sum + (d.total_price || 0), 0);
        const totalDistanceKm = data.reduce((sum, d) => sum + (d.distance_km || 0), 0);

        // ── Ringkasan per driver (sama seperti endpoint asli) ──
        const summaryMap = {};
        data.forEach(d => {
            const key = d.driver_username || d.driver_phone || 'unknown';
            if (!summaryMap[key]) {
                summaryMap[key] = {
                    driver_username: d.driver_username,
                    driver_name: d.driver_info?.name || null,
                    driver_phone: d.driver_phone,
                    license_plate: d.driver_info?.license_plate || null,
                    total_orders: 0,
                    total_distance_km: 0,
                    total_order_value: 0,
                };
            }
            summaryMap[key].total_orders += 1;
            summaryMap[key].total_distance_km += (d.distance_km || 0);
            summaryMap[key].total_order_value += (d.total_price || 0);
        });

        const summaryByDriver = Object.values(summaryMap).map(s => ({
            ...s,
            total_distance_km: Math.round(s.total_distance_km * 100) / 100,
        }));

        // ── Bonus: ringkasan jumlah order per jenis expedition ──
        // Berguna untuk melihat sebaran expedition apa saja yang muncul
        // (karena endpoint ini tidak lagi difilter ke satu jenis expedition).
        const expeditionBreakdown = {};
        data.forEach(d => {
            const key = d.expedition || 'unknown';
            expeditionBreakdown[key] = (expeditionBreakdown[key] || 0) + 1;
        });

        triggerBonusForCompletedOrders(data);

        res.json({
            success: true,
            app_name: reportData?.app_name || null,
            rating: reportData?.rating || null,
            done: reportData?.done || null,
            revenue: reportData?.revenue || null,
            currency: reportData?.currency || 'Rp',
            filter: {
                date: targetDate,               // null jika mode date=all
                pages_scanned: pagesScanned,    // null jika mode date=all
                phone: phoneFilter,
                expedition_filter: null,        // sengaja null -> menandakan tanpa filter expedition
            },
            total_raw: driverList.length,
            total_filtered: data.length,
            total_order_value: totalOrderValue,
            total_distance_km: Math.round(totalDistanceKm * 100) / 100,
            failed_detail_fetch: failedCount,
            expedition_breakdown: expeditionBreakdown,
            summary_by_driver: summaryByDriver,
            data
        });

    } catch (err) {
        console.error('❌ [driver/report/all-expedition]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});


async function fetchCourierIconAll(unique_id) {
    const url = 'https://app.jagel.id/api/myapp/courierIcon/all';

    console.log('🌐 Fetch courier master (GET):', url, { unique_id });

    const response = await axios.get(url, {
        headers: jagelHeaders,
        params: { unique_id },
    });

    if (!response.data || !response.data.success) {
        throw new Error(response.data?.message || 'CourierIcon API error');
    }

    return response.data.data;
}

app.get('/api/master/courier', async (req, res) => {
    try {
        const unique_id = req.query.unique_id || DEFAULT_UNIQUE_ID;
        const forceRefresh = req.query.refresh === '1';

        const cached = courierMasterCache[unique_id];
        const isCacheValid = cached && (Date.now() - cached.cachedAt) < COURIER_MASTER_CACHE_TTL_MS;

        let rawData;

        if (isCacheValid && !forceRefresh) {
            console.log(`⚡ [master/courier] Pakai cache untuk unique_id=${unique_id}`);
            rawData = cached.data;
        } else {
            rawData = await fetchCourierIconAll(unique_id);
            courierMasterCache[unique_id] = { data: rawData, cachedAt: Date.now() };
            console.log(`✅ [master/courier] Cache diperbarui untuk unique_id=${unique_id} (${rawData.length} jenis kurir)`);
        }

        // Bersihkan entri "=================" (placeholder/separator yang sengaja
        // dikosongkan di data master jagel, courrier_type 20 & 23 pada contoh)
        const data = rawData
            .filter(c => c.name && !/^=+$/.test(c.name.trim()))
            .map(c => ({
                courrier_type: c.courrier_type,
                name: c.name,
                operator: c.operator,
                commission: c.commission,
                avoid_tolls: c.avoid_tolls === 1,
                icon: c.icon,
                icon_url: c.icon ? `${JAGEL_ASSET_BASE}/${c.icon}` : null,
            }));

        res.json({
            success: true,
            unique_id,
            cached: isCacheValid && !forceRefresh,
            total: data.length,
            data,
        });

    } catch (err) {
        console.error('❌ [master/courier]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

async function fetchCourierIconAll(unique_id) {
    const url = 'https://app.jagel.id/api/myapp/courierIcon/all';

    console.log('🌐 Fetch courier master (GET):', url, { unique_id });

    const response = await axios.get(url, {
        headers: jagelHeaders,
        params: { unique_id },
    });

    if (!response.data || !response.data.success) {
        throw new Error(response.data?.message || 'CourierIcon API error');
    }

    return response.data.data;
}


app.get('/api/master/courier', async (req, res) => {
    try {
        const unique_id = req.query.unique_id || DEFAULT_UNIQUE_ID;
        const forceRefresh = req.query.refresh === '1';

        const cached = courierMasterCache[unique_id];
        const isCacheValid = cached && (Date.now() - cached.cachedAt) < COURIER_MASTER_CACHE_TTL_MS;

        let rawData;

        if (isCacheValid && !forceRefresh) {
            console.log(`⚡ [master/courier] Pakai cache untuk unique_id=${unique_id}`);
            rawData = cached.data;
        } else {
            rawData = await fetchCourierIconAll(unique_id);
            courierMasterCache[unique_id] = { data: rawData, cachedAt: Date.now() };
            console.log(`✅ [master/courier] Cache diperbarui untuk unique_id=${unique_id} (${rawData.length} jenis kurir)`);
        }

        // Bersihkan entri "=================" (placeholder/separator yang sengaja
        // dikosongkan di data master jagel, courrier_type 20 & 23 pada contoh)
        const data = rawData
            .filter(c => c.name && !/^=+$/.test(c.name.trim()))
            .map(c => ({
                courrier_type: c.courrier_type,
                name: c.name,
                operator: c.operator,
                commission: c.commission,
                avoid_tolls: c.avoid_tolls === 1,
                icon: c.icon,
                icon_url: c.icon ? `${JAGEL_ASSET_BASE}/${c.icon}` : null,
            }));

        res.json({
            success: true,
            unique_id,
            cached: isCacheValid && !forceRefresh,
            total: data.length,
            data,
        });

    } catch (err) {
        console.error('❌ [master/courier]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT: AMBIL DATA TIPS DARI CUSTOMER KE DRIVER
// ═══════════════════════════════════════════════════════════════
app.get('/api/driver/tips', async (req, res) => {
    try {
        const unique_id = req.query.unique_id || DEFAULT_UNIQUE_ID;
        const driverUsername = req.query.driver_username || null; // optional filter

        console.log(`💰 [driver/tips] unique_id=${unique_id}, driver=${driverUsername || 'semua'}`);

        // ── Ambil semua halaman tanpa paginate ──
        const allTransactions = await fetchAllBalanceTransactions(unique_id);

        // ── Filter category 14 (Tips) ──
        const tipsTransactions = allTransactions.filter(t => t.category === 14);

        // ── Grouping berdasarkan order_no ──
        // Setiap tips biasanya berpasangan (+ untuk customer, - untuk driver)
        // Kita ambil yang amount positif (tips dari customer)
        const tipsReceived = tipsTransactions
            .filter(t => t.amount > 0)
            .map(t => ({
                ...t,
                amount: Math.abs(t.amount),
            }));

        // ── Filter by driver username (jika ada) ──
        const filteredTips = driverUsername
            ? tipsReceived.filter(t => t.username === driverUsername)
            : tipsReceived;

        // ── Hitung total tips ──
        const totalTips = filteredTips.reduce((sum, t) => sum + t.amount, 0);

        // ── Group by order_no ──
        const tipsByOrder = {};
        filteredTips.forEach(t => {
            const key = t.order_no || 'unknown';
            if (!tipsByOrder[key]) {
                tipsByOrder[key] = {
                    order_no: key,
                    total_amount: 0,
                    transactions: [],
                    created_at: t.creation_date,
                };
            }
            tipsByOrder[key].total_amount += t.amount;
            tipsByOrder[key].transactions.push(t);
        });

        const tipsByOrderArray = Object.values(tipsByOrder)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // ── Ringkasan per driver ──
        const summaryByDriver = {};
        filteredTips.forEach(t => {
            const key = t.username || 'unknown';
            if (!summaryByDriver[key]) {
                summaryByDriver[key] = {
                    username: key,
                    total_tips: 0,
                    total_orders: 0,
                    orders: new Set(),
                };
            }
            summaryByDriver[key].total_tips += t.amount;
            summaryByDriver[key].orders.add(t.order_no);
        });

        const summaryByDriverArray = Object.values(summaryByDriver).map(s => ({
            ...s,
            total_orders: s.orders.size,
        })).sort((a, b) => b.total_tips - a.total_tips);

        res.json({
            success: true,
            unique_id,
            filter: {
                driver_username: driverUsername,
                category: 14,
            },
            summary: {
                total_transactions: filteredTips.length,
                total_tips: totalTips,
                total_unique_orders: Object.keys(tipsByOrder).length,
                total_drivers: summaryByDriverArray.length,
            },
            summary_by_driver: summaryByDriverArray,
            tips_by_order: tipsByOrderArray,
            data: filteredTips,
        });

    } catch (err) {
        console.error('❌ [driver/tips]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT: KOMISI DRIVER (category 1) — data ASLI dari jagel,
// bukan estimasi shipping × persen komisi.
// Pola sama seperti /api/driver/tips, cuma category-nya beda.
// ═══════════════════════════════════════════════════════════════
app.get('/api/driver/commission', async (req, res) => {
    try {
        const unique_id = req.query.unique_id || DEFAULT_UNIQUE_ID;
        const driverUsername = req.query.driver_username || null; // optional filter

        console.log(`💸 [driver/commission] unique_id=${unique_id}, driver=${driverUsername || 'semua'}`);

        // ── Ambil semua halaman (fetchAllBalanceTransactions sudah looping
        //    berdasarkan last_page dari response, jadi otomatis sampai
        //    halaman terakhir walau per_page dari server selalu 10) ──
        const allTransactions = await fetchAllBalanceTransactions(unique_id);

        // ── Filter category 1 (Komisi Driver) ──
        const commissionTransactions = allTransactions.filter(t => t.category === 1);

        // ── Entri milik driver sendiri selalu amount NEGATIF
        //    (uang keluar dari saldo driver ke platform / appaycenter) ──
        const commissionDeducted = commissionTransactions
            .filter(t => t.amount < 0)
            .map(t => ({
                ...t,
                amount: Math.abs(t.amount),
            }));

        // ── Filter by driver username (jika ada) ──
        const filteredCommission = driverUsername
            ? commissionDeducted.filter(t => t.username === driverUsername)
            : commissionDeducted;

        // ── Hitung total komisi ──
        const totalCommission = filteredCommission.reduce((sum, t) => sum + t.amount, 0);

        // ── Group by order_no ──
        const commissionByOrder = {};
        filteredCommission.forEach(t => {
            const key = t.order_no || 'unknown';
            if (!commissionByOrder[key]) {
                commissionByOrder[key] = {
                    order_no: key,
                    total_amount: 0,
                    transactions: [],
                    created_at: t.creation_date,
                };
            }
            commissionByOrder[key].total_amount += t.amount;
            commissionByOrder[key].transactions.push(t);
        });

        const commissionByOrderArray = Object.values(commissionByOrder)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // ── Ringkasan per driver ──
        const summaryByDriver = {};
        filteredCommission.forEach(t => {
            const key = t.username || 'unknown';
            if (!summaryByDriver[key]) {
                summaryByDriver[key] = {
                    username: key,
                    total_commission: 0,
                    total_orders: 0,
                    orders: new Set(),
                };
            }
            summaryByDriver[key].total_commission += t.amount;
            summaryByDriver[key].orders.add(t.order_no);
        });

        const summaryByDriverArray = Object.values(summaryByDriver).map(s => ({
            ...s,
            total_orders: s.orders.size,
        })).sort((a, b) => b.total_commission - a.total_commission);

        res.json({
            success: true,
            unique_id,
            filter: {
                driver_username: driverUsername,
                category: 1,
            },
            summary: {
                total_transactions: filteredCommission.length,
                total_commission: totalCommission,
                total_unique_orders: Object.keys(commissionByOrder).length,
                total_drivers: summaryByDriverArray.length,
            },
            summary_by_driver: summaryByDriverArray,
            commission_by_order: commissionByOrderArray,
            data: filteredCommission,
        });

    } catch (err) {
        console.error('❌ [driver/commission]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});
// ═══════════════════════════════════════════════════════════════
// FUNGSI: AMBIL SEMUA TRANSAKSI BALANCE (TANPA PAGINATE)
// ═══════════════════════════════════════════════════════════════
async function fetchAllBalanceTransactions(unique_id) {
    const url = 'https://app.jagel.id/api/myapp/balance-report-transaction';
    const allData = [];
    let currentPage = 1;
    let lastPage = null;

    console.log(`🌐 Fetch balance transactions (page 1...)`);

    try {
        while (true) {
            const response = await axios.post(
                url,
                {
                    unique_id: unique_id,
                    paginate: 100, // ambil banyak per halaman untuk mengurangi request
                    page: currentPage,
                },
                {
                    headers: jagelHeaders,
                }
            );

            if (!response.data || !response.data.success) {
                throw new Error(response.data?.message || 'Balance API error');
            }

            const pageData = response.data.data;
            const items = pageData.data || [];

            if (items.length === 0) {
                break;
            }

            allData.push(...items);

            // Cek apakah ini halaman terakhir
            lastPage = pageData.last_page || 0;
            if (currentPage >= lastPage) {
                break;
            }

            currentPage++;

            // Optional: delay kecil agar tidak terlalu spam
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`✅ Total ${allData.length} transaksi balance diambil dari ${currentPage} halaman`);
        return allData;

    } catch (err) {
        console.error('❌ Gagal fetch balance transactions:', err.message);
        throw err;
    }
}

// ═══════════════════════════════════════════════════════════════
// ATAU VERSI DENGAN PAGINATE DINAMIS (PILIHAN)
// ═══════════════════════════════════════════════════════════════
async function fetchAllBalanceTransactionsWithDynamicPage(unique_id) {
    const url = 'https://app.jagel.id/api/myapp/balance-report-transaction';
    const allData = [];
    let currentPage = 1;
    let lastPage = null;
    const perPage = 100; // maksimal per halaman

    console.log(`🌐 Fetch balance transactions (dynamic pagination)...`);

    try {
        // Ambil halaman pertama untuk mengetahui total halaman
        const firstResponse = await axios.post(
            url,
            {
                unique_id: unique_id,
                paginate: perPage,
                page: 1,
            },
            {
                headers: jagelHeaders,
            }
        );

        if (!firstResponse.data || !firstResponse.data.success) {
            throw new Error(firstResponse.data?.message || 'Balance API error');
        }

        const firstPageData = firstResponse.data.data;
        const items = firstPageData.data || [];
        allData.push(...items);

        lastPage = firstPageData.last_page || 1;

        console.log(`📄 Total halaman: ${lastPage}, total item: ${firstPageData.total || 0}`);

        // Ambil halaman berikutnya secara paralel (dengan batas)
        if (lastPage > 1) {
            const pagePromises = [];
            for (let page = 2; page <= lastPage; page++) {
                pagePromises.push(
                    axios.post(
                        url,
                        {
                            unique_id: unique_id,
                            paginate: perPage,
                            page: page,
                        },
                        {
                            headers: jagelHeaders,
                        }
                    ).then(res => res.data)
                );
            }

            // Eksekusi paralel dengan batasan
            const batchSize = 10; // maksimal 10 request paralel
            for (let i = 0; i < pagePromises.length; i += batchSize) {
                const batch = pagePromises.slice(i, i + batchSize);
                const results = await Promise.all(batch);
                results.forEach(result => {
                    if (result.success && result.data?.data) {
                        allData.push(...result.data.data);
                    }
                });
                console.log(`📄 Halaman ${i + 2} - ${Math.min(i + batchSize, pagePromises.length) + 1} selesai`);
            }
        }

        console.log(`✅ Total ${allData.length} transaksi balance diambil dari ${lastPage} halaman`);
        return allData;

    } catch (err) {
        console.error('❌ Gagal fetch balance transactions:', err.message);
        throw err;
    }
}

// ═══════════════════════════════════════════════════════════════
// ENDPOINT: TIPS + INTEGRASI DENGAN ORDER DETAIL
// ═══════════════════════════════════════════════════════════════
app.get('/api/driver/tips-with-orders', async (req, res) => {
    try {
        const unique_id = req.query.unique_id || DEFAULT_UNIQUE_ID;
        const driverPhone = req.query.phone || null;
        const dateFrom = req.query.date_from || null;
        const dateTo = req.query.date_to || null;

        console.log(`💰 [driver/tips-with-orders] unique_id=${unique_id}`);

        // ── Ambil semua transaksi balance ──
        const allTransactions = await fetchAllBalanceTransactions(unique_id);

        // ── Filter category 14 (Tips) ──
        const tipsTransactions = allTransactions
            .filter(t => t.category === 14 && t.amount > 0);

        // ── Ambil detail order untuk setiap tips ──
        const tipsWithOrderDetail = await Promise.all(
            tipsTransactions.map(async (tip) => {
                try {
                    if (!tip.order_no) {
                        return { ...tip, order_detail: null };
                    }

                    // Cari order detail berdasarkan order_no
                    const orderDetail = await fetchOrderDetailByOrderNo(tip.order_no);
                    return { ...tip, order_detail: orderDetail };
                } catch (err) {
                    console.warn(`⚠️ Gagal ambil detail order ${tip.order_no}: ${err.message}`);
                    return { ...tip, order_detail: null };
                }
            })
        );

        // ── Filter by driver phone jika ada ──
        let filtered = tipsWithOrderDetail;
        if (driverPhone) {
            filtered = filtered.filter(t => {
                const driverPhoneInOrder = t.order_detail?.driver_phone || t.order_detail?.driver?.phone || '';
                return driverPhoneInOrder.includes(driverPhone);
            });
        }

        // ── Filter by date jika ada ──
        if (dateFrom) {
            filtered = filtered.filter(t => t.creation_date >= dateFrom);
        }
        if (dateTo) {
            filtered = filtered.filter(t => t.creation_date <= dateTo);
        }

        // ── Hitung total tips ──
        const totalTips = filtered.reduce((sum, t) => sum + t.amount, 0);

        // ── Group by order_no ──
        const tipsByOrder = {};
        filtered.forEach(t => {
            const key = t.order_no || 'unknown';
            if (!tipsByOrder[key]) {
                tipsByOrder[key] = {
                    order_no: key,
                    total_amount: 0,
                    transactions: [],
                    created_at: t.creation_date,
                    order_detail: t.order_detail,
                };
            }
            tipsByOrder[key].total_amount += t.amount;
            tipsByOrder[key].transactions.push(t);
        });

        const tipsByOrderArray = Object.values(tipsByOrder)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // ── Ringkasan per driver ──
        const summaryByDriver = {};
        filtered.forEach(t => {
            const driverName = t.order_detail?.driver?.name || t.order_detail?.driver_name || t.username || 'unknown';
            const driverPhone = t.order_detail?.driver?.phone || t.order_detail?.driver_phone || '';
            const key = driverPhone || driverName;

            if (!summaryByDriver[key]) {
                summaryByDriver[key] = {
                    driver_name: driverName,
                    driver_phone: driverPhone,
                    total_tips: 0,
                    total_orders: 0,
                    orders: new Set(),
                };
            }
            summaryByDriver[key].total_tips += t.amount;
            summaryByDriver[key].orders.add(t.order_no);
        });

        const summaryByDriverArray = Object.values(summaryByDriver).map(s => ({
            ...s,
            total_orders: s.orders.size,
        })).sort((a, b) => b.total_tips - a.total_tips);

        res.json({
            success: true,
            unique_id,
            filter: {
                driver_phone: driverPhone,
                date_from: dateFrom,
                date_to: dateTo,
            },
            summary: {
                total_transactions: filtered.length,
                total_tips: totalTips,
                total_unique_orders: Object.keys(tipsByOrder).length,
                total_drivers: summaryByDriverArray.length,
            },
            summary_by_driver: summaryByDriverArray,
            tips_by_order: tipsByOrderArray,
            data: filtered,
        });

    } catch (err) {
        console.error('❌ [driver/tips-with-orders]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT: GET DETAIL ORDER (untuk tampilan "Detail Rute Order"
// di frontend laporan-driver.html)
//
// Reuse fetchDriverOrderDetail() yang sudah ada & terbukti jalan
// (dipakai juga di /api/driver/report dan /api/driver/report/all-expedition).
// Taruh route ini di dekat endpoint driver lain, SETELAH fungsi
// fetchDriverOrderDetail(uniqueId) didefinisikan.
// ═══════════════════════════════════════════════════════════════
app.get('/api/driver/order-route/:uniqueId', async (req, res) => {
    try {
        const { uniqueId } = req.params;

        console.log(`🗺️ [driver/order-route] unique_id=${uniqueId}`);

        const detail = await fetchDriverOrderDetail(uniqueId);

        res.json({
            success: true,
            data: detail, // berisi order_no, lines[] (origin/destination/distance), dll
        });

    } catch (err) {
        console.error('❌ [driver/order-route]', err.message);
        res.status(502).json({ success: false, error: err.message });
    }
});


// ═══════════════════════════════════════════════════════════════
// BONUS (opsional): PERBAIKAN fetchOrderDetailByOrderNo
//
// Fungsi versi lama di bagian bawah file Anda punya 2 bug:
//   1. Memakai `API_BASE` yang TIDAK PERNAH didefinisikan di file
//      backend ini (cuma ada di file HTML front-end) -> akan
//      throw ReferenceError kalau benar-benar dipanggil.
//   2. Endpoint /api/driver/report/all-expedition TIDAK membaca
//      query param `order_no` sama sekali (cek definisinya —
//      cuma baca app_uid, phone, date, page, paginate). Jadi
//      filter `?order_no=${orderNo}` itu diam-diam tidak ngefek,
//      dan `json.data[0]` yang dikembalikan bisa jadi order yang
//      SALAH (order pertama di hasil list, bukan yang dicari).
//
// Fungsi ini dipakai di /api/driver/tips-with-orders — kalau
// endpoint itu Anda pakai, sebaiknya diganti dengan versi ini:
// ═══════════════════════════════════════════════════════════════
async function fetchOrderDetailByOrderNo(orderNo, { maxDaysBack = 7 } = {}) {
    try {
        // all-expedition tidak support filter order_no di server, jadi kita
        // scan per-tanggal (dari hari ini mundur beberapa hari) dan cari
        // order_no yang cocok secara manual.
        for (let dayOffset = 0; dayOffset <= maxDaysBack; dayOffset++) {
            const targetDate = getJakartaDateString(-dayOffset);
            const scanResult = await fetchAllDriverOrdersForDate({ targetDate });
            const found = scanResult.items.find(item => item.order_no === orderNo);

            if (found) {
                const detail = await fetchDriverOrderDetail(found.unique_id);
                return { ...found, ...detail };
            }
        }

        return null;
    } catch (err) {
        console.warn(`⚠️ Gagal ambil detail order ${orderNo}: ${err.message}`);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🚀 Server berjalan di port ${PORT}`);
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📡 MAKANAN ENDPOINTS:`);
    console.log(`  GET /api/makanan/stores-stream?lat=...&lng=...`);
    console.log(`  GET /api/makanan/stores?lat=...&lng=...`);
    console.log(`  GET /api/makanan/store/:viewUid?lat=...&lng=...`);
    console.log(`  GET /api/makanan/products/:storeUid?lat=...&lng=...&view_uid=...`);
    console.log(`\n🤝 PARTNER ENDPOINTS:`);
    console.log(`  GET /api/partner/:viewUid`);
    console.log(`  GET /api/partner/match?unique_id=...&phone=...`);
    console.log(`  GET /api/partner/report/pertanian?unique_id=...&paginate=10&partner_status=2&page=1`);
    console.log(`\n🌾 PETANI LOKAL ENDPOINTS:`);
    console.log(`  GET /api/petani/mitra?page=1&per_page=24`);
    console.log(`  GET /api/petani/produk/:mitraUid?page=1&search_list=`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});