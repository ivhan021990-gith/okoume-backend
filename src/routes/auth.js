const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const prisma         = require('../config/prisma');
const { sendOTP }    = require('../services/sms');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Rate limiter — max 5 demandes OTP par heure par IP
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Trop de tentatives. Réessayez dans 1 heure.' },
});

// ─── ENVOYER UN OTP ───────────────────────────────────────────────
// POST /api/auth/send-otp
router.post('/send-otp',
  otpLimiter,
  [
    body('phone')
      .customSanitizer(value => value ? value.replace(/^\+2410/, '+241') : value)
      .matches(/^\+241(6[0256]|7[4567])\d{6}$/)
      .withMessage('Numéro gabonais invalide (+241 Airtel ou Moov)'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { phone } = req.body;

    try {
      // Créer ou récupérer l'utilisateur
      let user = await prisma.user.findUnique({ where: { phone } });
      if (!user) {
        user = await prisma.user.create({ data: { phone } });
      }

      // Invalider les anciens OTP
      await prisma.oTP.updateMany({
        where: { userId: user.id, used: false },
        data:  { used: true },
      });

      // Générer et envoyer l'OTP
      const code    = await sendOTP(phone);
      const hashed  = await bcrypt.hash(code, 10);
      const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await prisma.oTP.create({
        data: {
          userId:    user.id,
          phone,
          code:      hashed,
          expiresAt: expires,
        },
      });

      res.json({
        success: true,
        message: `Code envoyé au ${phone}`,
        // En dev uniquement — ne jamais exposer en prod !
        ...(process.env.NODE_ENV !== 'production' && { devCode: code }),
      });

    } catch (err) {
      console.error('[send-otp]', err);
      res.status(500).json({ error: 'Erreur lors de l\'envoi du code' });
    }
  }
);

// ─── VÉRIFIER L'OTP ───────────────────────────────────────────────
// POST /api/auth/verify-otp
router.post('/verify-otp',
  [
    body('phone').notEmpty()
      .customSanitizer(value => value ? value.replace(/^\+2410/, '+241') : value),
    body('code').isLength({ min: 4, max: 4 }).isNumeric(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { phone, code } = req.body;

    try {
      const user = await prisma.user.findUnique({ where: { phone }, include: { profile: true } });
      if (!user) return res.status(404).json({ error: 'Numéro introuvable' });

      // Récupérer l'OTP valide
      const otp = await prisma.oTP.findFirst({
        where: {
          userId: user.id,
          used:   false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!otp) return res.status(400).json({ error: 'Code expiré. Demandez un nouveau code.' });

      // Vérifier le nombre de tentatives (max 3)
      if (otp.attempts >= 3) {
        await prisma.oTP.update({ where: { id: otp.id }, data: { used: true } });
        return res.status(400).json({ error: 'Trop de tentatives. Demandez un nouveau code.' });
      }

      const isValid = await bcrypt.compare(code, otp.code);

      if (!isValid) {
        await prisma.oTP.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
        return res.status(400).json({ error: 'Code incorrect', attemptsLeft: 3 - otp.attempts - 1 });
      }

      // OTP valide — marquer comme utilisé
      await prisma.oTP.update({ where: { id: otp.id }, data: { used: true } });

      // Générer le JWT
      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
      );

      res.json({
        success:    true,
        token,
        userId:     user.id,
        isNewUser:  !user.profile,
        hasProfile: !!user.profile,
      });

    } catch (err) {
      console.error('[verify-otp]', err);
      res.status(500).json({ error: 'Erreur de vérification' });
    }
  }
);

// ─── MON COMPTE ───────────────────────────────────────────────────
// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  res.json({
    id:           req.user.id,
    phone:        req.user.phone,
    subscription: req.user.subscription,
    isVerified:   req.user.isVerified,
    profile:      req.user.profile,
    createdAt:    req.user.createdAt,
  });
});

// ─── SUPPRIMER MON COMPTE ─────────────────────────────────────────
// DELETE /api/auth/account
router.delete('/account', authenticate, async (req, res) => {
  await prisma.user.delete({ where: { id: req.user.id } });
  res.json({ success: true, message: 'Compte supprimé définitivement' });
});

module.exports = router;
