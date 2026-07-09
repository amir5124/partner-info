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
const JAGEL_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImZmM2I0Njk4YWZiZDc0NmY4NDc5NmJkMjUyMGFjY2JlY2I2Mjg2ZWY4MDEwYzI0MTI5NDJiZjZiZTZhMmUwM2FhYzgyNzEwYTZiOTdlZDUxIn0.eyJhdWQiOiIxIiwianRpIjoiZmYzYjQ2OThhZmJkNzQ2Zjg0Nzk2YmQyNTIwYWNjYmVjYjYyODZlZjgwMTBjMjQxMjk0MmJmNmJlNmEyZTAzYWFjODI3MTBhNmI5N2VkNTEiLCJpYXQiOjE3ODI3MzI3OTEsIm5iZiI6MTc4MjczMjc5MSwiZXhwIjoxODE0MjY4NzkxLCJzdWIiOiIyOTcxODQ0Iiwic2NvcGVzIjpbXX0.C_jRz3EjjNjn9oJ-Ka1ksFXfGvgVZOlav4flxr2afeGY_CnR0Hn3RrC2tan1ofRynFqj__jolJ5aGHxt3VI5y3occNTDPjmVydVW0h2yDRUxv_q9FY3QsHPs9MsntJf3e8U0uquPLeMTN1bQrJrSz-kslmMGb4BllB8oQz3462K3dn4zrtW8tndIL1kJoPd_yEnIcUSxM9mMubdwbPFtrlhnHuBK91XRdVIt61NC4GN5Vl2sxfexaX4dfr02vRGswFnEA05DvAct1WOZcJ0YQt30gF_htyqDtH_5eGOBZfF00ZcG1QRKnbzfj-syPoC3_upipBKNd9VoswUHSAMQwgFlX-06PuxiQSFJJs2pUxDI00fTY73SKrINX_tO5qutEx5I2J5LxtwKMP0H5eMBLe6wcjDoUl32W8UBwR_bJAG96v2762ka37KHATrQ6ygsDubPDZVAtTdl_wB7mmwCQ8IR2_bL8vXzGplacc_x0hHZVeCGGCDRaeukUrl6Z_FRWmyT7Dl15rbPqiiJ6PUWtBsMuBBXQ7k4E1JGELBukNOlaaXbWNSJk_Qa7BstOEAwRmupt3KSlVYfQKnO2e7JDO78QHC9TPzsgEza25eu_q6ukbjiKanmDdRu-7MUOo95FRajAmRyOr3fIJ6-2zqEHTMNRlq7qEUyJMvTJXnQan4";
const CODENAME = "iknlinku";
const JAGEL_CODENAME = 'iknlinku'; // alias, dipakai fungsi jagelGet
const BATCH_SIZE = 3;
const DEFAULT_UNIQUE_ID = '03421121304617f701ba3b374.23310242';
const DEFAULT_PARTNER_STATUS = '2';

// Component UID
const MAKANAN_COMPONENT_UID = '618637dbc8415';    // Jastip Makanan
const PETANI_COMPONENT_UID = '6a48d1e936ae2';     // Petani Lokal
const PREORDER_COMPONENT_UID = '150313187266a4c96a3639b16.85140307';
const PANEN_HARI_INI_COMPONENT_UID = '240213187266a4c967075d019.51911072';
const JADWAL_PANEN_COMPONENT_UID = '550313187266a4c96cba28072.25599401';
const JAGEL_BASE_URL = 'https://app.jagel.id/api/v2/customer';

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

        // Filter hanya mitra dengan diskon category === 1
        const filteredDiscounts = (data.discounts || []).filter(
            (discount) => discount.category === 1
        );

        console.log(`✅ Total discounts: ${data.discounts?.length || 0}, category=1: ${filteredDiscounts.length}`);

        res.json({
            success: true,
            data: {
                ...data,
                discounts: filteredDiscounts
            }
        });

    } catch (err) {
        console.error('❌ [MYDISCOUNT] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

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