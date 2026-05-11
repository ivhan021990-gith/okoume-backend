// ─────────────────────────────────────────────────────────────────────────────
// Okoumé — src/controllers/paymentController.js
// Adapté au schema Prisma existant (model Payment, enum PayProvider, PayStatus, Subscription)
// ─────────────────────────────────────────────────────────────────────────────

const { v4: uuidv4 }   = require('uuid');
const { PrismaClient } = require('@prisma/client');
const {
  initierPaiement, verifierStatut, detecterOperateur, PLANS,
} = require('../services/singpay');

const prisma = new PrismaClient();

// ─── POST /api/payments/initiate ─────────────────────────────────────────────
async function initierAbonnement(req, res) {
  try {
    const { plan } = req.body;   // 'plus' ou 'premium'
    const userId   = req.user.id;

    if (!PLANS[plan]) {
      return res.status(400).json({ error: 'Plan invalide. Choisir : plus ou premium' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const operateurInfo = detecterOperateur(user.phone);
    if (!operateurInfo) {
      return res.status(400).json({
        error: 'Numéro non reconnu. Doit être Airtel (+241 07x) ou Moov (+241 06x)',
      });
    }

    const planInfo     = PLANS[plan];
    const reference    = `OKM-${uuidv4().slice(0, 8).toUpperCase()}`;
    const subscription = plan === 'premium' ? 'PREMIUM' : 'PLUS';

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.payment.create({
      data: {
        id:           uuidv4(),
        userId,
        amount:       planInfo.amount,
        subscription,
        provider:     operateurInfo.operateur,
        reference,
        status:       'PENDING',
        expiresAt,
      },
    });

    await initierPaiement({
      transactionId: reference,
      montant:       planInfo.amount,
      phone:         user.phone,
      description:   `Abonnement ${planInfo.label} — Okoumé`,
    });

    const nomOp = operateurInfo.operateur === 'AIRTEL_MONEY' ? 'Airtel Money' : 'Moov Money';

    return res.json({
      reference,
      operateur: operateurInfo.operateur,
      message:   `📱 Confirmez le paiement de ${planInfo.amount.toLocaleString()} FCFA sur votre ${nomOp}.`,
      plan,
      amount:    planInfo.amount,
    });

  } catch (err) {
    console.error('[payments/initiate]', err.message);
    return res.status(500).json({ error: err.message || 'Erreur initialisation paiement' });
  }
}

// ─── POST /api/payments/webhook ──────────────────────────────────────────────
async function webhookSingPay(req, res) {
  try {
    console.log('[Webhook SingPay]', JSON.stringify(req.body));

    const reference = req.body?.reference || req.body?.transaction_id || req.body?.id;
    if (!reference) return res.status(400).json({ error: 'reference manquante' });

    const { paid } = await verifierStatut(reference);

    const payment = await prisma.payment.findUnique({ where: { reference } });
    if (!payment) return res.status(200).json({ received: true });
    if (payment.status === 'SUCCESS') return res.status(200).json({ received: true });

    if (!paid) {
      await prisma.payment.update({ where: { reference }, data: { status: 'FAILED' } });
      return res.status(200).json({ received: true });
    }

    await prisma.$transaction([
      prisma.payment.update({
        where: { reference },
        data:  { status: 'SUCCESS' },
      }),
      prisma.user.update({
        where: { id: payment.userId },
        data:  { subscription: payment.subscription },
      }),
    ]);

    console.log(`✅ Abonnement activé — User: ${payment.userId} | ${payment.subscription} | ${payment.amount} FCFA`);
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('[payments/webhook]', err.message);
    return res.status(200).json({ received: true });
  }
}

// ─── GET /api/payments/status/:reference ─────────────────────────────────────
async function statutPaiement(req, res) {
  try {
    const { reference } = req.params;
    const userId        = req.user.id;

    const payment = await prisma.payment.findUnique({ where: { reference } });
    if (!payment || payment.userId !== userId) {
      return res.status(404).json({ error: 'Paiement introuvable' });
    }

    return res.json({
      reference,
      status:       payment.status,
      subscription: payment.subscription,
      amount:       payment.amount,
      expiresAt:    payment.expiresAt,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = { initierAbonnement, webhookSingPay, statutPaiement };
