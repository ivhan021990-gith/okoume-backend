const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma  = require('../config/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const PROVINCES = [
  'Estuaire', 'Haut-Ogooué', 'Ogooué-Maritime',
  'Ngounié', 'Nyanga', 'Ogooué-Lolo',
  'Moyen-Ogooué', 'Ogooué-Ivindo', 'Woleu-Ntem',
];

// ─── CRÉER / METTRE À JOUR LE PROFIL ──────────────────────────────
// POST /api/profiles
router.post('/',
  authenticate,
  [
    body('name').trim().isLength({ min: 2, max: 50 }),
    body('age').isInt({ min: 18, max: 99 }),
    body('gender').isIn(['HOMME', 'FEMME']),
    body('province').trim().isIn(PROVINCES).withMessage('Province gabonaise invalide'),
    body('city').trim().notEmpty(),
    body('bio').optional().isLength({ max: 280 }),
    body('interests').isArray({ min: 1 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, age, gender, province, city, bio, interests } = req.body;

    try {
      const profile = await prisma.profile.upsert({
        where:  { userId: req.user.id },
        create: { userId: req.user.id, name, age, gender, province, city, bio, interests },
        update: { name, age, gender, province, city, bio, interests },
      });
      res.json({ success: true, profile });
    } catch (err) {
      console.error('[profile create]', err);
      res.status(500).json({ error: 'Erreur lors de la création du profil' });
    }
  }
);

// ─── MON PROFIL ───────────────────────────────────────────────────
// GET /api/profiles/me
router.get('/me', authenticate, async (req, res) => {
  const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
  if (!profile) return res.status(404).json({ error: 'Profil non trouvé' });
  res.json(profile);
});

// ─── MES STATISTIQUES ─────────────────────────────────────────────
// GET /api/profiles/me/stats
// Défini AVANT /:userId pour éviter que "me" soit capturé comme paramètre
router.get('/me/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const [matchCount, likeCount] = await Promise.all([
      prisma.match.count({
        where: {
          OR: [{ userAId: userId }, { userBId: userId }],
        },
      }),
      prisma.like.count({
        where: { toUserId: userId }, // champ correct selon le schéma
      }),
    ]);

    return res.json({ matches: matchCount, likes: likeCount });
  } catch (err) {
    console.error('[Stats] error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── VOIR UN PROFIL (par ID) ───────────────────────────────────────
// GET /api/profiles/:userId
router.get('/:userId', authenticate, async (req, res) => {
  try {
    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: req.user.id, blockedId: req.params.userId },
          { blockerId: req.params.userId, blockedId: req.user.id },
        ],
      },
    });
    if (block) return res.status(404).json({ error: 'Profil introuvable' });

    const profile = await prisma.profile.findUnique({
      where: { userId: req.params.userId },
    });
    if (!profile) return res.status(404).json({ error: 'Profil introuvable' });

    // Cacher les profils incognito (sauf si match)
    if (profile.isIncognito) {
      const match = await prisma.match.findFirst({
        where: {
          OR: [
            { userAId: req.user.id, userBId: req.params.userId },
            { userAId: req.params.userId, userBId: req.user.id },
          ],
        },
      });
      if (!match) return res.status(404).json({ error: 'Profil introuvable' });
    }

    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── AJOUTER UNE PHOTO ────────────────────────────────────────────
// POST /api/profiles/photos
router.post('/photos', authenticate, async (req, res) => {
  const { photoUrl } = req.body;
  if (!photoUrl) return res.status(400).json({ error: 'URL photo requise' });

  const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
  if (!profile) return res.status(404).json({ error: 'Profil non trouvé' });

  if (profile.photos.length >= 6) {
    return res.status(400).json({ error: 'Maximum 6 photos' });
  }

  const updated = await prisma.profile.update({
    where: { userId: req.user.id },
    data:  { photos: [...profile.photos, photoUrl] },
  });
  res.json({ success: true, photos: updated.photos });
});

// ─── MODE INCOGNITO (Premium hommes) ──────────────────────────────
// PATCH /api/profiles/incognito
router.patch('/incognito', authenticate, async (req, res) => {
  if (req.user.subscription !== 'PREMIUM') {
    return res.status(403).json({ error: 'Itonda Premium requis' });
  }

  const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
  if (profile?.gender !== 'HOMME') {
    return res.status(403).json({ error: 'Le mode Incognito est réservé aux profils masculins' });
  }

  const updated = await prisma.profile.update({
    where: { userId: req.user.id },
    data:  { isIncognito: req.body.enabled },
  });
  res.json({ success: true, isIncognito: updated.isIncognito });
});

module.exports = router;
