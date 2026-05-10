const express = require('express');
const prisma  = require('../config/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ─── MES MATCHES ──────────────────────────────────────────────────
// GET /api/matches
router.get('/', authenticate, async (req, res) => {
  const matches = await prisma.match.findMany({
    where: {
      OR: [{ userAId: req.user.id }, { userBId: req.user.id }],
    },
    include: {
      userA: { include: { profile: true } },
      userB: { include: { profile: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const formatted = matches.map((m) => {
    const other = m.userAId === req.user.id ? m.userB : m.userA;
    return {
      matchId:      m.id,
      userId:       other.id,
      name:         other.profile?.name,
      photos:       other.profile?.photos,
      lastMessage:  m.messages[0] || null,
      unread:       m.messages[0] && !m.messages[0].readAt && m.messages[0].senderId !== req.user.id,
      createdAt:    m.createdAt,
    };
  });

  res.json({ matches: formatted });
});

// ─── SUPPRIMER UN MATCH ────────────────────────────────────────────
// DELETE /api/matches/:matchId
router.delete('/:matchId', authenticate, async (req, res) => {
  const match = await prisma.match.findUnique({ where: { id: req.params.matchId } });
  if (!match) return res.status(404).json({ error: 'Match introuvable' });
  if (match.userAId !== req.user.id && match.userBId !== req.user.id) {
    return res.status(403).json({ error: 'Non autorisé' });
  }
  await prisma.match.delete({ where: { id: req.params.matchId } });
  res.json({ success: true });
});

module.exports = router;
