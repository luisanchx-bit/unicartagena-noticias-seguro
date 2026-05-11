const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(session({
    secret: 'clave_secreta_unicartagena_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        httpOnly: true, 
        maxAge: 30 * 60 * 1000,
        secure: false
    }
}));

// ========== BASE DE DATOS ==========
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Tabla de usuarios
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        nombre TEXT,
        rol TEXT DEFAULT 'usuario'
    )`);
    
    // Tabla de bloqueos por IP
    db.run(`CREATE TABLE IF NOT EXISTS bloqueos_ip (
        ip TEXT PRIMARY KEY,
        intentos_fallidos INTEGER DEFAULT 0,
        nivel_bloqueo INTEGER DEFAULT 0,
        desbloqueo_en DATETIME,
        bloqueo_permanente INTEGER DEFAULT 0
    )`);
    
    // Tabla de logs de intentos
    db.run(`CREATE TABLE IF NOT EXISTS logs_intentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT,
        username TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        exito BOOLEAN
    )`);
    
    // Crear usuario admin si no existe
    db.get("SELECT * FROM usuarios WHERE username = 'admin'", (err, row) => {
        if (!row && !err) {
            bcrypt.hash('admin123', 10, (err, hash) => {
                if (!err) {
                    db.run("INSERT INTO usuarios (username, password_hash, nombre, rol) VALUES (?, ?, ?, ?)",
                        ['admin', hash, 'Administrador', 'admin']);
                    console.log('✅ Usuario admin creado');
                }
            });
        }
    });
});

// ========== SISTEMA DE BLOQUEO EXPONENCIAL ==========
const tiemposBloqueo = [0, 1, 5, 30, 120, 720, 1440, 4320, 10080, 14400];

function verificarBloqueo(ip) {
    return new Promise((resolve) => {
        db.get("SELECT * FROM bloqueos_ip WHERE ip = ?", [ip], (err, row) => {
            if (!row) return resolve({ bloqueado: false, intentosRestantes: 5 });
            
            if (row.bloqueo_permanente === 1) {
                return resolve({ 
                    bloqueado: true, 
                    mensaje: '❌❌❌ IP BLOQUEADA PERMANENTEMENTE ❌❌❌\nHas superado el límite de intentos fallidos.\nContacta al administrador.'
                });
            }
            
            if (row.desbloqueo_en) {
                const ahora = new Date();
                const desbloqueo = new Date(row.desbloqueo_en);
                if (ahora < desbloqueo) {
                    const minutosRest = Math.ceil((desbloqueo - ahora) / 60000);
                    return resolve({ 
                        bloqueado: true, 
                        mensaje: `🔒 IP BLOQUEADA por ${tiemposBloqueo[row.nivel_bloqueo]} minutos. Restan ${minutosRest} minutos.`
                    });
                }
            }
            
            const intentosUsados = row?.intentos_fallidos || 0;
            const intentosRest = 5 - (intentosUsados % 5);
            resolve({ 
                bloqueado: false, 
                intentosRestantes: intentosRest,
                intentosUsados: intentosUsados
            });
        });
    });
}

function registrarIntento(ip, username, exito) {
    return new Promise((resolve) => {
        db.run("INSERT INTO logs_intentos (ip, username, exito) VALUES (?, ?, ?)", 
            [ip, username, exito ? 1 : 0]);
        
        if (exito) {
            db.run("UPDATE bloqueos_ip SET intentos_fallidos = 0, nivel_bloqueo = 0, desbloqueo_en = NULL WHERE ip = ?", [ip], () => resolve());
            return;
        }
        
        db.get("SELECT * FROM bloqueos_ip WHERE ip = ?", [ip], (err, row) => {
            const intentosActuales = (row?.intentos_fallidos || 0) + 1;
            let nuevoNivel = row?.nivel_bloqueo || 0;
            let desbloqueoEn = null;
            
            if (intentosActuales >= 5 && intentosActuales % 5 === 0 && nuevoNivel < tiemposBloqueo.length - 1) {
                nuevoNivel++;
                
                if (nuevoNivel === tiemposBloqueo.length - 1) {
                    db.run(`INSERT OR REPLACE INTO bloqueos_ip (ip, intentos_fallidos, nivel_bloqueo, bloqueo_permanente) 
                            VALUES (?, ?, ?, 1)`, [ip, intentosActuales, nuevoNivel], () => resolve());
                    return;
                }
                
                desbloqueoEn = new Date(Date.now() + tiemposBloqueo[nuevoNivel] * 60000);
            }
            
            db.run(`INSERT OR REPLACE INTO bloqueos_ip (ip, intentos_fallidos, nivel_bloqueo, desbloqueo_en) 
                    VALUES (?, ?, ?, ?)`, [ip, intentosActuales, nuevoNivel, desbloqueoEn], () => resolve());
        });
    });
}

// ========== RUTAS PÚBLICAS ==========
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ========== VERIFICAR SESIÓN ==========
app.get('/api/verificar-sesion', (req, res) => {
    if (req.session.user) {
        res.json({ logueado: true, usuario: req.session.user.username });
    } else {
        res.json({ logueado: false });
    }
});

// ========== LOGIN ==========
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const ip = req.ip || req.socket.remoteAddress || req.connection.remoteAddress;
    
    const bloqueo = await verificarBloqueo(ip);
    if (bloqueo.bloqueado) {
        return res.status(403).json({ error: bloqueo.mensaje });
    }
    
    db.get("SELECT * FROM usuarios WHERE username = ?", [username], async (err, user) => {
        if (err || !user) {
            await registrarIntento(ip, username, false);
            const info = await verificarBloqueo(ip);
            return res.status(401).json({ 
                error: `😅 ¡Papi ese usuario no lo conozco yo! Si quieres crearlo puedes hacerlo abajo, tú dirás. Te quedan ${info.intentosRestantes} intentos.`
            });
        }
        
        const match = await bcrypt.compare(password, user.password_hash);
        
        if (match) {
            await registrarIntento(ip, username, true);
            req.session.user = { 
                id: user.id, 
                username: user.username, 
                nombre: user.nombre, 
                rol: user.rol 
            };
            
            const redirectUrl = (user.rol === 'admin') ? '/admin-panel.html' : '/';
            res.json({ success: true, redirect: redirectUrl });
        } else {
            await registrarIntento(ip, username, false);
            const info = await verificarBloqueo(ip);
            res.status(401).json({ 
                error: `😅 ¡Te equivocaste, papi! Esa no es la clave de este user ggz. Te quedan ${info.intentosRestantes} intentos.`
            });
        }
    });
});

// ========== REGISTRO ==========
app.post('/register', async (req, res) => {
    const { username, password, nombre } = req.body;
    
    if (!username || !password || !nombre) {
        return res.status(400).json({ error: '❌ Todos los campos son requeridos' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: '❌ La contraseña debe tener al menos 6 caracteres' });
    }
    
    db.get("SELECT * FROM usuarios WHERE username = ?", [username], async (err, user) => {
        if (user) {
            return res.status(400).json({ error: '❌ El usuario ya existe' });
        }
        
        const hash = await bcrypt.hash(password, 10);
        db.run("INSERT INTO usuarios (username, password_hash, nombre, rol) VALUES (?, ?, ?, ?)",
            [username, hash, nombre, 'usuario'], 
            function(err) {
                if (err) {
                    res.status(500).json({ error: '❌ Error al crear usuario' });
                } else {
                    res.json({ success: true, message: '✅ Usuario creado exitosamente' });
                }
            });
    });
});

// ========== LOGOUT ==========
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// ========== API PARA ADMIN ==========
app.get('/api/admin/datos', (req, res) => {
    if (!req.session.user || req.session.user.rol !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    db.all("SELECT id, username, nombre, rol FROM usuarios", (err, usuarios) => {
        if (err) return res.status(500).json({ error: 'Error al obtener usuarios' });
        
        db.all("SELECT * FROM bloqueos_ip", (err, bloqueos) => {
            db.all("SELECT * FROM logs_intentos ORDER BY timestamp DESC LIMIT 20", (err, logs) => {
                const stats = {
                    totalUsuarios: usuarios.length,
                    totalBloqueos: bloqueos.length,
                    totalIntentosFallidos: logs.filter(l => !l.exito).length
                };
                res.json({ usuarios, bloqueos, logs, stats });
            });
        });
    });
});

app.delete('/api/admin/usuario/:id', (req, res) => {
    if (!req.session.user || req.session.user.rol !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    const id = req.params.id;
    db.run("DELETE FROM usuarios WHERE id = ? AND rol != 'admin'", [id], function(err) {
        if (err || this.changes === 0) {
            res.status(400).json({ error: 'No se pudo eliminar el usuario' });
        } else {
            res.json({ success: true });
        }
    });
});

app.post('/api/admin/desbloquear', (req, res) => {
    if (!req.session.user || req.session.user.rol !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    const { ip } = req.body;
    db.run("DELETE FROM bloqueos_ip WHERE ip = ?", [ip], function(err) {
        if (err) {
            res.status(500).json({ error: 'Error al desbloquear' });
        } else {
            res.json({ success: true });
        }
    });
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, () => {
    console.log(`\n🛡️ ========================================`);
    console.log(`🛡️ SERVIDOR CON BLOQUEO EXPONENCIAL ACTIVADO`);
    console.log(`🛡️ ========================================`);
    console.log(`📡 Servidor corriendo en: http://localhost:${PORT}`);
    console.log(`👤 Usuario ADMIN: admin`);
    console.log(`🔑 Contraseña ADMIN: admin123`);
    console.log(`🔒 Sistema: 5 intentos fallidos = bloqueo progresivo`);
    console.log(`🛡️ ========================================\n`);
});