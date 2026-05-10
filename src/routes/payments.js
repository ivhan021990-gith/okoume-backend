const express = require('express');
const axios   = require('axios');
const prisma  = require('../config/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const PLANS = {
  PLUS:    { amount: 2500,  label: 'Okoumé+',       duration: 30 },
  PREMIUM: { amount: 5000, label: 'Okoumé Premium', duration: 30 },
};

// ─── INITIER UN PAIEMENT ──────────────────────────────────────────
// POST /api/payments/initiate
router.post('/initiate', authenticate, async (req, res) => {
  const { plan, provider } = req.body;

  if (!PLANS[plan]) return res.status(400).json({ error: 'Plan invalide' });
  if (!['AIRTEL_MONEY', 'MOOV_MONEY', 'CARD'].includes(provider)) {
    return res.status(400).json({ error: 'Opérateur invalide' });
  }

  // Premium uniquement pour les hommes
  if (plan === 'PREMIUM') {
    const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
    if (profile?.gender !== 'HOMME') {
      return res.status(403).json({ error: 'Okoumé Premium est réservé aux profils masculins' });
    }
  }

  const planDetails = PLANS[plan];
  const reference   = `OKM-${Date.now()}-${req.user.id.slice(0, 8)}`;
  const expiresAt   = new Date(Date.now() + planDetails.duration * 24 * 60 * 60 * 1000);

  try {
    // Appel CinetPay
    const cinetPayResponse = await axios.post('https://api-checkout.cinetpay.com/v2/payment', {
      apikey:              process.env.CINETPAY_API_KEY,
      site_id:             process.env.CINETPAY_SITE_ID,
      transaction_id:      reference,
      amount:              planDetails.amount,
      currency:            'XAF',
      description:         `${planDetails.label} — Okoumé`,
      notify_url:          process.env.CINETPAY_NOTIFY_URL,
      return_url:          `${process.env.FRONTEND_URL}/payment/success`,
      customer_id:         req.user.id,
      customer_phone_number: req.user.phone,
      channels:            provider === 'AIRTEL_MONEY' ? 'MOBILE_MONEY' : provider === 'MOOV_MONEY' ? 'MOBILE_MONEY' : 'ALL',
    });

    // Enregistrer le paiement en attente
    const payment = await prisma.payment.create({
      data: {
        userId:       req.user.id,
        amount:       planDetails.amount,
        subscription: plan,
        provider,
        reference,
        status:       'PENDING',
        expiresAt,
      },
    });

    res.json({
      success:     true,
      reference,
      paymentUrl:  cinetPayResponse.data?.data?.payment_url,
      amount:      planDetails.amount,
      currency:    'XAF',
    });

  } catch (err) {
    console.error('[payment initiate]', err.response?.data || err.message);

    // En mode dev, simuler un paiement
    if (process.env.NODE_ENV !== 'production') {
      await prisma.payment.create({
        data: { userId: req.user.id, amount: planDetails.amount, subscription: plan, provider, reference, status: 'PENDING', expiresAt },
      });
      return res.json({
        success:    true,
        reference,
        paymentUrl: `http://localhost:3000/api/payments/demo-success?ref=${reference}`,
        demo:       true,
      });
    }

    res.status(500).json({ error: 'Erreur lors de l\'initiation du paiement' });
  }
});

// ─── WEBHOOK CINETPAY (confirmation) ─────────────────────────────
// POST /api/payments/webhook
router.post('/webhook', async (req, res) => {
  const { cpm_trans_id, cpm_result, cpm_trans_status } = req.body;

  if (cpm_result !== '00' || cpm_trans_status !== 'ACCEPTED') {
    await prisma.payment.updateMany({
      where: { reference: cpm_trans_id },
      data:  { status: 'FAILED' },
    });
    return res.sendStatus(200);
  }

  try {
    const payment = await prisma.payment.findFirst({ where: { reference: cpm_trans_id } });
    if (!payment || payment.status === 'SUCCESS') return res.sendStatus(200);

    // Activer l'abonnement
    await Promise.all([
      prisma.payment.update({
        where: { id: payment.id },
        data:  { status: 'SUCCESS' },
      }),
      prisma.user.update({
        where: { id: payment.userId },
        data:  { subscription: payment.subscription },
      }),
    ]);

    console.log(`[Payment] ✅ Abonnement ${payment.subscription} activé pour ${payment.userId}`);
    res.sendStatus(200);
  } catch (err) {
    console.error('[webhook]', err);
    res.sendStatus(500);
  }
});

// ─── SIMULATION PAIEMENT (DEV uniquement) ─────────────────────────
// GET /api/payments/demo-success?ref=OKM-xxx
router.get('/demo-success', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.sendStatus(404);

  const { ref } = req.query;
  const payment = await prisma.payment.findFirst({ where: { reference: ref } });
  if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });

  await Promise.all([
    prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCESS' } }),
    prisma.user.update({ where: { id: payment.userId }, data: { subscription: payment.subscription } }),
  ]);

  res.json({ success: true, message: `Abonnement ${payment.subscription} activé (DEMO)` });
});

// ─── MES PAIEMENTS ────────────────────────────────────────────────
// GET /api/payments/history
router.get('/history', authenticate, async (req, res) => {
  const payments = await prisma.payment.findMany({
    where:   { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ payments });
});

module.exports = router;
