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
const JAGEL_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6IjhmZDYyMzhkYWRjNzliM2QyMDE2MGZlODhjMmM5ZjM3ODIyNjcyYmZhMmVhMzhjODVhZjBmNjllZjJkNzllZGU0YjZiNjczNzVlNDFlNThhIn0.eyJhdWQiOiIxIiwianRpIjoiOGZkNjIzOGRhZGM3OWIzZDIwMTYwZmU4OGMyYzlmMzc4MjI2NzJiZmEyZWEzOGM4NWFmMGY2OWVmMmQ3OWVkZTRiNmI2NzM3NWU0MWU1OGEiLCJpYXQiOjE3ODEyNTU0NDYsIm5iZiI6MTc4MTI1NTQ0NiwiZXhwIjoxODEyNzkxNDQ2LCJzdWIiOiIyOTcxODQ0Iiwic2NvcGVzIjpbXX0.BwMcED-hPj9JsY6dbiAdppNcVEAgmvwuKsexR4omk_qDCeDT5XHmO58rzHADJu--cbZV7uNcGVCoLji1wahs_9t9GeS8i707iaQk_jJqBoT7kiLQSIZMcUBTV4DA1_jgZO1qDKzPp26aGoZZuqgv2POi49M8FXI7zZWxtsqE37e7XahzuwhOAR8_UJrtjpogmPM3rezeIW642GprPWQNpkAZsJZgMBt56vtfcYdtxzxGj2D5YbLsIFqMDtcdv-INLE5pmeUjlRTufMrIOLrMjTNo0iPxPNc0QT8zOFo_3iaMRVFI8-vRDJa4M6aRgZIhXW_FGlxMPmjaII-dAeqOtYS67JpYpDu7vqBtDNpXul2vGF9fMb0nvNMmT72IfJog4PqCRGbrqDyQusXxD9K2Mhqhyap9OemQoJxk9MBChyx3NN-FuZOHJCfnWm3ej8e8HsDUxp-JYOz5LVP5wVbcRzPrlb6tel4_CrQAmF_Pc1szY0yhg47SVeuu6zwk7zOeS2a77IqQwQh6pmS_KfCfSFmPcA5cD5_u6AlB4gmO6luczAG27vfxg6-qWg2MsGT4PErbiSA7ksxxExpqWoS95mts5TydmS9Pp2_veb0sP9_JSHoymKnfXJuKcoaOJWX0VFHgFo08HlhB7wFyIghugljG3TO_Ccr7D3nmP6guqNE";
const CODENAME = "iknlinku";
const BATCH_SIZE = 3;

// Component UI
const MAKANAN_COMPONENT_UID = '618637dbc8415';    // Jastip Makanan

// Default koordinat
const defaultCoords = { lat: -0.975, lng: 116.786 };

// Headers untuk request ke Jagel
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

function setupSSE(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

    // Penting: disable compression untuk SSE
    res.setHeader('Content-Encoding', 'identity');

    res.flushHeaders();

    let heartbeatInterval = null;

    // Kirim heartbeat setiap 15 detik
    heartbeatInterval = setInterval(() => {
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

    // Cleanup heartbeat saat koneksi ditutup
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

// ─────────────────────────────────────────────────────────────
// 🔥 FUNGSI GET PARTNER DETAIL (PAKAI ENDPOINT USERS)
// ─────────────────────────────────────────────────────────────
async function getPartnerDetailByViewUid(viewUid) {
    if (!viewUid) return null;

    try {
        // Coba endpoint /api/users/{view_uid}?driver=1
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
// FUNGSI FETCH DARI JAGEL
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

    // Setup SSE dengan heartbeat
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

    // Setup headers
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

    // Heartbeat setiap 15 detik
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

    // Handle client disconnect
    req.on('close', () => {
        console.log('Client disconnected from stores-stream');
        isClosed = true;
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (!res.writableEnded) res.end();
    });

    // Handle timeout
    req.setTimeout(120000, () => {
        console.log('Request timeout, closing SSE');
        isClosed = true;
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (!res.writableEnded) res.end();
    });

    try {
        const userCoords = parseUserCoords(req.query);
        console.log(`📡 [makanan/stores-stream] lat=${userCoords.lat}, lng=${userCoords.lng}`);

        // Send initial meta
        send('meta', { status: 'starting', userCoords });

        // Gunakan AbortController untuk membatalkan request jika koneksi terputus
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

        // Proses batch dengan timeout per batch
        for (let bi = 0; bi < batches.length; bi++) {
            if (isClosed) break;

            const batch = batches[bi];

            // Promise dengan timeout untuk setiap batch
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

            // Timeout per batch (30 detik)
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

            // Small delay between batches to prevent overwhelming
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

        // 🔥 Match partner menggunakan partner_view_uid dari toko
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

        // METHOD 1: Match by view_uid
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

        // METHOD 2: Match by phone
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

        // METHOD 3: Match by username
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

        // METHOD 4: Match by name
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
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});