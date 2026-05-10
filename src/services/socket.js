const jwt    = require('jsonwebtoken');
const prisma = require('../config/prisma');

// Map des utilisateurs connectés : userId → socketId
const connectedUsers = new Map();

function socketHandler(io) {

  // Authentification Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Token manquant'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user    = await prisma.user.findUnique({ where: { id: decoded.userId } });

      if (!user || user.isBanned) return next(new Error('Accès refusé'));

      socket.userId = user.id;
      next();
    } catch {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    connectedUsers.set(userId, socket.id);
    console.log(`[Socket] ✅ Connecté: ${userId}`);

    // ── REJOINDRE UNE CONVERSATION ──────────────────────────────
    socket.on('join_conversation', async ({ matchId }) => {
      try {
        const match = await prisma.match.findUnique({ where: { id: matchId } });
        if (!match) return;
        if (match.userAId !== userId && match.userBId !== userId) return;

        socket.join(`match:${matchId}`);
        socket.emit('joined', { matchId });
      } catch (err) {
        console.error('[socket join]', err);
      }
    });

    // ── ENVOYER UN MESSAGE ──────────────────────────────────────
    socket.on('send_message', async ({ matchId, text }) => {
      try {
        if (!text?.trim() || text.length > 500) return;

        const match = await prisma.match.findUnique({ where: { id: matchId } });
        if (!match) return;
        if (match.userAId !== userId && match.userBId !== userId) return;

        const message = await prisma.message.create({
          data: { matchId, senderId: userId, text: text.trim() },
        });

        // Envoyer à tous dans la room
        io.to(`match:${matchId}`).emit('message', {
          id:        message.id,
          matchId,
          senderId:  userId,
          text:      message.text,
          createdAt: message.createdAt,
        });

        // Renouveler l'expiration du match
        await prisma.match.update({
          where: { id: matchId },
          data:  { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        });

        // Notification push si l'autre est hors ligne
        const otherId = match.userAId === userId ? match.userBId : match.userAId;
        if (!connectedUsers.has(otherId)) {
          // TODO : Envoyer une notification FCM
          console.log(`[Notif] 📱 Notification à envoyer à ${otherId}`);
        }

      } catch (err) {
        console.error('[socket message]', err);
      }
    });

    // ── INDICATEUR DE FRAPPE ────────────────────────────────────
    socket.on('typing', ({ matchId }) => {
      socket.to(`match:${matchId}`).emit('typing', { userId });
    });

    socket.on('stop_typing', ({ matchId }) => {
      socket.to(`match:${matchId}`).emit('stop_typing', { userId });
    });

    // ── DÉCONNEXION ─────────────────────────────────────────────
    socket.on('disconnect', async () => {
      connectedUsers.delete(userId);
      await prisma.user.update({
        where: { id: userId },
        data:  { lastSeen: new Date() },
      }).catch(() => {});
      console.log(`[Socket] ❌ Déconnecté: ${userId}`);
    });
  });
}

// Vérifier si un utilisateur est en ligne
function isUserOnline(userId) {
  return connectedUsers.has(userId);
}

module.exports = { socketHandler, isUserOnline };
