const express = require('express');
const prisma  = require('../config/prisma');
const { authenticate, requireSubscription } = require('../middleware/auth');

const router = express.Router();

// ─── DÉCOUVRIR DES PROFILS ────────────────────────────────────────
// GET /api/discover?province=Estuaire&minAge=18&maxAge=40&gender=FEMME
router.get('/', authenticate, async (req, res) => {
  try {
    const myProfile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
    if (!myProfile) return res.status(400).json({ error: 'Complétez votre profil d\'abord' });

    const {
      province,
      minAge = 18,
      maxAge = 50,
      gender,
      page   = 0,
      limit  = 10,
    } = req.query;

    // Récupérer les IDs déjà likés ou bloqués
    const [alreadyLiked, blocked] = await Promise.all([
      prisma.like.findMany({
        where:  { fromUserId: req.user.id },
        select: { toUserId: true },
      }),
      prisma.block.findMany({
        where:  { OR: [{ blockerId: req.user.id }, { blockedId: req.user.id }] },
        select: { blockerId: true, blockedId: true },
      }),
    ]);

    const excludeIds = [
      req.user.id,
      ...alreadyLiked.map((l) => l.toUserId),
      ...blocked.map((b) => b.blockerId === req.user.id ? b.blockedId : b.blockerId),
    ];

    // Genre opposé par défaut
    const targetGender = gender || (myProfile.gender === 'HOMME' ? 'FEMME' : 'HOMME');

    // Requête Prisma avec filtres
    const profiles = await prisma.profile.findMany({
      where: {
        userId:      { notIn: excludeIds },
        gender:      targetGender,
        age:         { gte: parseInt(minAge), lte: parseInt(maxAge) },
        isIncognito: false, // Ne pas montrer les profils incognito
        ...(province && { province }),
        user: { isActive: true, isBanned: false },
      },
      include: {
        user: {
          select: {
            id: true, isVerified: true, subscription: true, lastSeen: true,
          },
        },
      },
      skip:    parseInt(page) * parseInt(limit),
      take:    parseInt(limit),
      orderBy: { updatedAt: 'desc' },
    });

    // Calculer le score de compatibilité
    const scored = profiles.map((p) => {
      const commonInterests = p.interests.filter((i) =>
        myProfile.interests.includes(i)
      ).length;
      const sameProvince = p.province === myProfile.province ? 10 : 0;
      const score = commonInterests * 5 + sameProvince;

      return {
        userId:       p.userId,
        name:         p.name,
        age:          p.age,
        gender:       p.gender,
        province:     p.province,
        city:         p.city,
        bio:          p.bio,
        interests:    p.interests,
        photos:       p.photos,
        isVerified:   p.user.isVerified,
        subscription: p.user.subscription,
        lastSeen:     p.user.lastSeen,
        score,
      };
    }).sort((a, b) => b.score - a.score);

    res.json({
      profiles: scored,
      page:     parseInt(page),
      hasMore:  scored.length === parseInt(limit),
    });

  } catch (err) {
    console.error('[discover]', err);
    res.status(500).json({ error: 'Erreur lors de la découverte' });
  }
});

// ─── LIKER UN PROFIL ─────────────────────────────────────────────
// POST /api/discover/like
router.post('/like', authenticate, async (req, res) => {
  const { toUserId, isSuper = false } = req.body;
  if (!toUserId) return res.status(400).json({ error: 'toUserId requis' });

  try {
    // Vérifier la limite de likes gratuits (20/jour pour FREE)
    if (req.user.subscription === 'FREE') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const likesToday = await prisma.like.count({
        where: { fromUserId: req.user.id, createdAt: { gte: today } },
      });
      if (likesToday >= 20) {
        return res.status(403).json({
          error: 'Limite de 20 likes atteinte. Passez à Okoumé+ pour des likes illimités.',
          upgradeRequired: true,
        });
      }
    }

    // Super like — max 3/jour pour FREE et PLUS
    if (isSuper && req.user.subscription !== 'PREMIUM') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const superLikesToday = await prisma.like.count({
        where: { fromUserId: req.user.id, isSuper: true, createdAt: { gte: today } },
      });
      if (superLikesToday >= 3) {
        return res.status(403).json({ error: 'Limite de 3 Super Likes atteinte aujourd\'hui' });
      }
    }

    // Créer le like
    await prisma.like.upsert({
      where:  { fromUserId_toUserId: { fromUserId: req.user.id, toUserId } },
      create: { fromUserId: req.user.id, toUserId, isSuper },
      update: { isSuper },
    });

    // Vérifier s'il y a un match mutuel
    const mutualLike = await prisma.like.findFirst({
      where: { fromUserId: toUserId, toUserId: req.user.id },
    });

    let match = null;
    if (mutualLike) {
      // Créer le match (ordre alphabétique pour éviter les doublons)
      const [userAId, userBId] = [req.user.id, toUserId].sort();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

      match = await prisma.match.upsert({
        where:  { userAId_userBId: { userAId, userBId } },
        create: { userAId, userBId, expiresAt },
        update: {},
      });
    }

    res.json({
      success: true,
      isMatch: !!match,
      matchId: match?.id,
    });

  } catch (err) {
    console.error('[like]', err);
    res.status(500).json({ error: 'Erreur lors du like' });
  }
});

// ─── PASSER UN PROFIL ─────────────────────────────────────────────
// POST /api/discover/pass
router.post('/pass', authenticate, async (req, res) => {
  const { toUserId } = req.body;
  // On crée un "like" négatif fictif pour ne plus montrer ce profil
  // On utilise la même table mais on pourrait aussi avoir une table "passes"
  res.json({ success: true });
});

module.exports = router;
