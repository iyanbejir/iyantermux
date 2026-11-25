import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const binId = process.env.JSONBIN_BIN_ID;
  const masterKey = process.env.JSONBIN_MASTER_KEY;
  const binUrl = `https://api.jsonbin.io/v3/b/${binId}`;

  if (!binId || !masterKey) {
    return res.status(500).json({ error: 'Konfigurasi server belum diset di Vercel' });
  }

  // ── ENDPOINT GET (BEBAS DIAKSES SIAPA SAJA) ──
  if (req.method === 'GET') {
    try {
      const response = await fetch(`${binUrl}/latest`, {
        headers: { "X-Master-Key": masterKey, "X-Bin-Meta": "false" }
      });
      const data = await response.json();
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  
  // ── ENDPOINT PUT/POST (WAJIB LOGIN & ROLE DEVELOPER) ──
  if (req.method === 'PUT' || req.method === 'POST') {
    
    // 1. Cek apakah ada token Authorization dari frontend
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Akses ditolak: Tidak ada sesi login' });
    }

    const token = authHeader.split(' ')[1];
    
    // 2. Inisialisasi Supabase dengan token user, supaya query berjalan sebagai user ini
    //    (RLS memakai auth.uid() dari token ini)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false }
      }
    );

    // 3. Verifikasi token user ke Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Akses ditolak: Sesi tidak valid atau kadaluarsa' });
    }

    // 4. Cek Role: Hanya developer yang boleh ubah stok
    // (RLS di database memastikan user hanya bisa baca role-nya sendiri)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || profile?.role !== 'developer') {
      return res.status(403).json({ error: 'Akses ditolak: Hanya Developer yang bisa mengubah data' });
    }

    // 5. Validasi body sederhana agar data tidak tertimpa nilai kosong/salah
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Body tidak valid' });
    }

    // 6. Jika lolos verifikasi, baru tembak ke JSONBin
    try {
      const response = await fetch(binUrl, {
        method: "PUT", // Pakai PUT agar menimpa seluruh data
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": masterKey
        },
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.setHeader('Allow', ['GET', 'PUT', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}