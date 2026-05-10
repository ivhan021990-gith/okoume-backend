const express = require('express');
const prisma  = require('../config/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ─── MESSAGES D'UN MATCH ──────────────────────────────────────────
// GET /api/messages/:matchId
router.get('/:matchId', authenticate, async (req, res) => {
  const { page = 0, limit = 30 } = req.query;

  const match = await prisma.match.findUnique({ where: { id: req.params.matchId } });
  if (!match) return res.status(404).json({ error: 'Match introuvable' });
  if (match.userAId !== req.user.id && match.userBId !== req.user.id) {
    return res.status(403).json({ error: 'Non autorisé' });
  }

  const messages = await prisma.message.findMany({
    where:   { matchId: req.params.matchId },
    orderBy: { createdAt: 'desc' },
    skip:    parseInt(page) * parseInt(limit),
    take:    parseInt(limit),
  });

  // Marquer comme lus
  await prisma.message.updateMany({
    where: {
      matchId:  req.params.matchId,
      senderId: { not: req.user.id },
      readAt:   null,
    },
    data: { readAt: new Date() },
  });

  res.json({ messages: messages.reverse() });
});

// ─── ENVOYER UN MESSAGE ───────────────────────────────────────────
// POST /api/messages/:matchId
router.post('/:matchId', authenticate, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Message vide' });
  if (text.length > 500)  return res.status(400).json({ error: 'Message trop long (max 500)' });

  const match = await prisma.match.findUnique({ where: { id: req.params.matchId } });
  if (!match) return res.status(404).json({ error: 'Match introuvable' });
  if (match.userAId !== req.user.id && match.userBId !== req.user.id) {
    return res.status(403).json({ error: 'Non autorisé' });
  }

  const message = await prisma.message.create({
    data: {
      matchId:  req.params.matchId,
      senderId: req.user.id,
      text:     text.trim(),
    },
  });

  // Renouveler l'expiration du match (7 jours après le dernier message)
  await prisma.match.update({
    where: { id: req.params.matchId },
    data:  { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });

  res.json({ success: true, message });
});

module.exports = router;
