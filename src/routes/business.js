// ─────────────────────────────────────────────────────────────────────────────
// Itonda — src/routes/business.js
// Partenaires Itonda Business (restaurants, bars, cafés)
// ─────────────────────────────────────────────────────────────────────────────

const express    = require('express');
const router     = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma     = new PrismaClient();
const { authenticateToken } = require('../middleware/auth');

// GET /api/business — Liste tous les partenaires actifs
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { categorie } = req.query;

    const where = { actif: true };
    if (categorie && categorie !== 'all') {
      where.categorie = categorie;
    }

    const partenaires = await prisma.businessPartner.findMany({
      where,
      orderBy: [
        { featured: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return res.json({ partenaires });
  } catch (err) {
    console.error('[Business] GET error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/business/:id — Détail d'un partenaire
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const partenaire = await prisma.businessPartner.findUnique({
      where: { id: req.params.id },
    });
    if (!partenaire || !partenaire.actif) {
      return res.status(404).json({ error: 'Partenaire introuvable' });
    }
    return res.json(partenaire);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/business — Ajouter un partenaire (admin uniquement)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { nom, type, emoji, quartier, ville, ambiance, promo, prix, heures, categorie, featured } = req.body;

    if (!nom || !type || !quartier) {
      return res.status(400).json({ error: 'nom, type et quartier sont requis' });
    }

    const partenaire = await prisma.businessPartner.create({
      data: {
        nom,
        type,
        emoji:     emoji    || '🏪',
        quartier,
        ville:     ville    || 'Libreville',
        ambiance:  ambiance || '',
        promo:     promo    || '',
        prix:      prix     || '💰',
        heures:    heures   || '',
        categorie: categorie|| 'restaurant',
        featured:  featured || false,
        actif:     true,
      },
    });

    return res.status(201).json(partenaire);
  } catch (err) {
    console.error('[Business] POST error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
