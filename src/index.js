require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');

const authRoutes     = require('./routes/auth');
const profileRoutes  = require('./routes/profiles');
const discoverRoutes = require('./routes/discover');
const matchRoutes    = require('./routes/matches');
const messageRoutes  = require('./routes/messages');
const paymentRoutes  = require('./routes/payments');
const reportRoutes   = require('./routes/reports');

const { socketHandler } = require('./services/socket');
const { errorHandler }  = require('./middleware/errorHandler');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
  },
});

// ─── MIDDLEWARE ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ─── ROUTES API ────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/discover', discoverRoutes);
app.use('/api/matches',  matchRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reports',  reportRoutes);

// ─── HEALTH CHECK ──────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app:    'Itonda API',
    version:'1.0.0',
    time:   new Date().toISOString(),
  });
});

// ─── SOCKET.IO (messagerie temps réel) ────────────────────────────
socketHandler(io);

// ─── GESTION D'ERREURS ────────────────────────────────────────────
app.use(errorHandler);

// ─── DÉMARRAGE ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   🌿  Itonda API — Démarré           ║
║   Port    : ${PORT}                       ║
║   Env     : ${process.env.NODE_ENV || 'development'}               ║
╚═══════════════════════════════════════╝
  `);
});

module.exports = { app, io };
