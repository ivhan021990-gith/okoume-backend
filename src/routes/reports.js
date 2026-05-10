const express = require('express');
const prisma  = require('../config/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ─── SIGNALER UN PROFIL ───────────────────────────────────────────
// POST /api/reports
router.post('/', authenticate, async (req, res) => {
  const { reportedId, reason, details } = req.body;

  const validReasons = ['FAKE_PROFILE', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'SPAM', 'OTHER'];
  if (!validReasons.includes(reason)) {
    return res.status(400).json({ error: 'Raison invalide' });
  }

  await prisma.report.create({
    data: { reporterId: req.user.id, reportedId, reason, details },
  });

  // Si l'utilisateur a été signalé 3+ fois, le mettre en révision
  const reportCount = await prisma.report.count({ where: { reportedId } });
  if (reportCount >= 3) {
    console.log(`[Modération] ⚠️ Profil ${reportedId} signalé ${reportCount} fois — révision requise`);
  }

  res.json({ success: true, message: 'Signalement enregistré. Merci pour votre contribution.' });
});

// ─── BLOQUER UN UTILISATEUR ───────────────────────────────────────
// POST /api/reports/block
router.post('/block', authenticate, async (req, res) => {
  const { blockedId } = req.body;

  await prisma.block.upsert({
    where:  { blockerId_blockedId: { blockerId: req.user.id, blockedId } },
    create: { blockerId: req.user.id, blockedId },
    update: {},
  });

  // Supprimer le match s'il existe
  const [userAId, userBId] = [req.user.id, blockedId].sort();
  await prisma.match.deleteMany({ where: { userAId, userBId } });

  res.json({ success: true, message: 'Utilisateur bloqué' });
});

// ─── DÉBLOQUER ────────────────────────────────────────────────────
// DELETE /api/reports/block/:blockedId
router.delete('/block/:blockedId', authenticate, async (req, res) => {
  await prisma.block.deleteMany({
    where: { blockerId: req.user.id, blockedId: req.params.blockedId },
  });
  res.json({ success: true });
});

module.exports = router;
