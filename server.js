const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';  // e.g. "username/sbtc.fc"

app.use(express.json());
app.use(express.static('.'));

const DATA_DIR = path.join(__dirname, 'data');

const ALLOWED_DATA_FILES = [
    'players.json',
    'matches.json',
    'tournaments.json',
    'site-content.json',
    'site-status.json',
];

// ===== SESSION STORE =====
const sessions = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000;

function createSession(username, permissions, master) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { username, permissions, master, expires: Date.now() + SESSION_TTL });
    return token;
}

function requireSession(req, res, next) {
    const auth = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    const session = sessions.get(token);
    if (!session || session.expires < Date.now()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    req.session = session;
    next();
}

function requireMaster(req, res, next) {
    if (!req.session?.master) return res.status(403).json({ error: 'Forbidden' });
    next();
}

// ===== AUTH =====
app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

    let users = [];
    try {
        users = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf8'));
    } catch {
        return res.status(500).json({ error: 'Cannot read users' });
    }

    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const user = users.find(u => u.username === username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const storedBuf = Buffer.from(user.password, 'hex');
    const inputBuf = Buffer.from(hash, 'hex');
    if (storedBuf.length !== inputBuf.length || !crypto.timingSafeEqual(storedBuf, inputBuf)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = createSession(username, user.permissions, user.master);
    res.json({ token, permissions: user.permissions, master: user.master });
});

// ===== LOCAL FILE WRITE (dev) =====
app.post('/api/save-json', requireSession, (req, res) => {
    const { filename, content } = req.body || {};
    if (!filename || !ALLOWED_DATA_FILES.includes(path.basename(filename))) {
        return res.status(400).json({ error: 'Invalid filename' });
    }
    try {
        const filePath = path.join(DATA_DIR, path.basename(filename));
        fs.writeFileSync(filePath, content, 'utf8');
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== GITHUB WRITE (prod) =====
app.post('/api/github-write', requireSession, async (req, res) => {
    const { filename, content } = req.body || {};
    if (!filename || !ALLOWED_DATA_FILES.includes(path.basename(filename))) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    // Always write locally first
    try {
        const filePath = path.join(DATA_DIR, path.basename(filename));
        fs.writeFileSync(filePath, content, 'utf8');
    } catch (e) {
        return res.status(500).json({ error: 'Local write failed: ' + e.message });
    }

    // Then push to GitHub if configured
    if (GITHUB_TOKEN && GITHUB_REPO) {
        try {
            const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/data/${path.basename(filename)}`;
            const getRes = await fetch(apiUrl, {
                headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'sbtc-cms' }
            });
            const existing = getRes.ok ? await getRes.json() : null;

            const encoded = Buffer.from(content).toString('base64');
            const body = {
                message: `CMS update: ${path.basename(filename)}`,
                content: encoded,
            };
            if (existing?.sha) body.sha = existing.sha;

            const putRes = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                    Authorization: `token ${GITHUB_TOKEN}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'sbtc-cms'
                },
                body: JSON.stringify(body)
            });

            if (!putRes.ok) {
                const err = await putRes.text();
                console.error('GitHub write error:', err);
                return res.status(502).json({ error: 'GitHub write failed', detail: err });
            }
        } catch (e) {
            console.error('GitHub push error:', e);
            return res.status(502).json({ error: 'GitHub push error: ' + e.message });
        }
    }

    res.json({ ok: true });
});

// ===== USERS API (master only) =====
app.get('/api/users', requireSession, requireMaster, (req, res) => {
    try {
        const users = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf8'));
        res.json(users.map(u => ({ ...u, password: undefined })));
    } catch {
        res.status(500).json({ error: 'Cannot read users' });
    }
});

app.post('/api/users', requireSession, requireMaster, (req, res) => {
    const { username, password, permissions } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    const users = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf8'));
    if (users.find(u => u.username === username)) return res.status(409).json({ error: 'User exists' });

    const hash = crypto.createHash('sha256').update(password).digest('hex');
    users.push({ username, password: hash, master: false, permissions: permissions || {} });
    fs.writeFileSync(path.join(DATA_DIR, 'users.json'), JSON.stringify(users, null, 2));
    res.json({ ok: true });
});

app.put('/api/users/:username', requireSession, requireMaster, (req, res) => {
    const users = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf8'));
    const idx = users.findIndex(u => u.username === req.params.username);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const { password, permissions } = req.body || {};
    if (password) users[idx].password = crypto.createHash('sha256').update(password).digest('hex');
    if (permissions) users[idx].permissions = permissions;

    fs.writeFileSync(path.join(DATA_DIR, 'users.json'), JSON.stringify(users, null, 2));
    res.json({ ok: true });
});

app.delete('/api/users/:username', requireSession, requireMaster, (req, res) => {
    let users = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf8'));
    if (!users.find(u => u.username === req.params.username)) return res.status(404).json({ error: 'Not found' });
    users = users.filter(u => u.username !== req.params.username);
    fs.writeFileSync(path.join(DATA_DIR, 'users.json'), JSON.stringify(users, null, 2));
    res.json({ ok: true });
});

app.listen(PORT, () => console.log(`SBTC FC CMS running on http://localhost:${PORT}`));
