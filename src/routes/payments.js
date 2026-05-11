// ─────────────────────────────────────────────────────────────────────────────
// Okoumé — src/routes/payments.js (tout-en-un, remplace l'existant)
// ─────────────────────────────────────────────────────────────────────────────

const router       = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const axios        = require('axios');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const prisma   = new PrismaClient();
const BASE_URL = 'https://gateway.singpay.ga/v1';
const TOKEN_URL = 'https://gateway.singpay.ga/oauth/token';

let cachedToken = null;
let tokenExpiry = null;

const PLANS = {
  plus:    { label: 'Okoumé+',        amount: 5000  },
  premium: { label: 'Okoumé Premium', amount: 10000 },
};

// ─── OAuth 2.0 Token ─────────────────────────────────────────────────────────
async function getToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 60000) return cachedToken;
  const params = new URLSearchParams();
  params.append('grant_type',    'client_credentials');
  params.append('client_id',     process.env.SINGPAY_CLIENT_ID);
  params.append('client_secret', process.env.SINGPAY_CLIENT_SECRET);
  const { data } = await axios.post(TOKEN_URL, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  });
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);
  return cachedToken;
}

// ─── Détection opérateur ─────────────────────────────────────────────────────
function detecterOp(phone) {
  const n = phone.replace(/\D/g, '').replace(/^241/, '');
  if (n.startsWith('07') || n.startsWith('7')) return { op: 'AIRTEL_MONEY', route: '/74/paiement' };
  if (n.startsWith('06') || n.startsWith('6')) return { op: 'MOOV_MONEY',   route: '/62/paiement' };
  return null;
}

// ─── POST /api/payments/initiate ─────────────────────────────────────────────
router.post('/initiate', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    const userId   = req.user.id;

    if (!PLANS[plan]) return res.status(400).json({ error: 'Plan invalide : plus ou premium' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const info = detecterOp(user.phone);
    if (!info) return res.status(400).json({ error: 'Numéro invalide (Airtel 07x ou Moov 06x)' });

    const planInfo     = PLANS[plan];
    const reference    = `OKM-${uuidv4().slice(0, 8).toUpperCase()}`;
    const subscription = plan === 'premium' ? 'PREMIUM' : 'PLUS';
    const expiresAt    = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const numero       = user.phone.replace(/\D/g, '').replace(/^241/, '');

    await prisma.payment.create({
      data: { id: uuidv4(), userId, amount: planInfo.amount, subscription, provider: info.op, reference, status: 'PENDING', expiresAt },
    });

    const token = await getToken();
    await axios.post(`${BASE_URL}${info.route}`, {
      reference,
      montant:      planInfo.amount,
      numero,
      portefeuille: process.env.SINGPAY_WALLET_ID,
      description:  `Abonnement ${planInfo.label} — Okoumé`,
      callback:     `${process.env.APP_URL}/api/payments/webhook`,
    }, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, timeout: 15000 });

    const nomOp = info.op === 'AIRTEL_MONEY' ? 'Airtel Money' : 'Moov Money';
    return res.json({
      reference,
      operateur: info.op,
      message:   `📱 Confirmez le paiement de ${planInfo.amount.toLocaleString()} FCFA sur votre ${nomOp}.`,
      plan,
      amount:    planInfo.amount,
    });

  } catch (err) {
    console.error('[payments/initiate]', err.message);
    return res.status(500).json({ error: err.message || 'Erreur paiement' });
  }
});

// ─── POST /api/payments/webhook ──────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  try {
    console.log('[Webhook SingPay]', JSON.stringify(req.body));
    const reference = req.body?.reference || req.body?.transaction_id || req.body?.id;
    if (!reference) return res.status(400).json({ error: 'reference manquante' });

    const token     = await getToken();
    const { data }  = await axios.get(`${BASE_URL}/transaction/api/status/${reference}`, {
      headers: { Authorization: `Bearer ${token}` }, timeout: 10000,
    });
    const paid = data?.status === 'SUCCESS' || data?.statut === 'SUCCESS';

    const payment = await prisma.payment.findUnique({ where: { reference } });
    if (!payment || payment.status === 'SUCCESS') return res.status(200).json({ received: true });

    if (!paid) {
      await prisma.payment.update({ where: { reference }, data: { status: 'FAILED' } });
      return res.status(200).json({ received: true });
    }

    await prisma.$transaction([
      prisma.payment.update({ where: { reference }, data: { status: 'SUCCESS' } }),
      prisma.user.update({ where: { id: payment.userId }, data: { subscription: payment.subscription } }),
    ]);

    console.log(`✅ ${payment.userId} | ${payment.subscription} | ${payment.amount} FCFA`);
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('[payments/webhook]', err.message);
    return res.status(200).json({ received: true });
  }
});

// ─── GET /api/payments/status/:reference ─────────────────────────────────────
router.get('/status/:reference', authMiddleware, async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { reference: req.params.reference } });
    if (!payment || payment.userId !== req.user.id) return res.status(404).json({ error: 'Introuvable' });
    return res.json({ reference: payment.reference, status: payment.status, subscription: payment.subscription, amount: payment.amount, expiresAt: payment.expiresAt });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
