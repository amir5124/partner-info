# Jagel Partner API - Backend Node.js

Backend Express.js untuk mengambil dan memperkaya data mitra dari Jagel API.

## Setup

```bash
npm install
cp .env.example .env
node index.js
```

## Endpoints

### 1. `GET /api/partner/list`
Ambil daftar mitra (raw, tanpa detail) dengan pagination.

**Query params:**
| Param | Default | Keterangan |
|---|---|---|
| `unique_id` | wajib | unique_id app partner |
| `page` | 1 | halaman |
| `paginate` | 10 | jumlah per halaman |
| `partner_status` | 2 | status mitra |

**Contoh:**
```
GET /api/partner/list?unique_id=03421121304617f701ba3b374.23310242&page=1&paginate=10
```

---

### 2. `GET /api/partner/detail/:viewUid`
Ambil detail 1 mitra berdasarkan `view_uid`.

**Contoh:**
```
GET /api/partner/detail/135512151266a1d1ec179e447.52503478
```

---

### 3. `GET /api/partner/enriched`
Ambil semua mitra (semua halaman) yang sudah diperkaya dengan data detail.

Menghasilkan field matching:
- `phone`
- `username`
- `partner_commission`

**Contoh:**
```
GET /api/partner/enriched?unique_id=03421121304617f701ba3b374.23310242
```

**Contoh response:**
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "app": { "unique_id": "...", "view_uid": "...", "name": "LinkU" },
    "total": 1,
    "partners": [
      {
        "view_uid": "135512151266a1d1ec179e447.52503478",
        "unique_id": "135512261516a1d1ec179e2e8.53532296",
        "name": "Zaenal Muttaqin",
        "email": "zaenalm354@gmail.com",
        "username": "Zaenal",
        "phone": "081545877868",
        "partner_commission": 10,
        "partner_status": 2,
        "partner_commission_max_value": 100000000,
        "partner_products": "0,4",
        ...
      }
    ]
  }
}
```

---

### 4. `GET /api/partner/match`
Cari mitra berdasarkan `phone` atau `username` untuk di-matching ke aplikasi lain.

**Query params:**
| Param | Keterangan |
|---|---|
| `unique_id` | wajib |
| `phone` | nomor HP mitra |
| `username` | username mitra |

**Contoh:**
```
GET /api/partner/match?unique_id=03421121304617f701ba3b374.23310242&phone=082158323930
```

**Response:**
```json
{
  "success": true,
  "data": {
    "view_uid": "252709135266a07d60dbc29f0.40480697",
    "unique_id": "252709261356a07d60dbc28b3.43074442",
    "username": "kafejamu",
    "phone": "082158323930",
    "partner_commission": 10,
    "name": "Driver Kafe Jamu Nusantara",
    "partner_status": 2
  }
}
```

## Flow Data

```
POST jagel /partner/report (list semua mitra)
    ↓
Ambil view_uid tiap mitra
    ↓
GET jagel /users/{view_uid}?driver=1 (detail tiap mitra)
    ↓
Merge & extract: phone, username, partner_commission
    ↓
Tersedia di /api/partner/enriched & /api/partner/match
```
