const { v4: uuidv4 } = require('uuid');
const crypto         = require('crypto');
const prisma         = require('../config/prisma');
const {
  initierPaiement, verifierStatut, detecterOperateur, PLANS,
} = require('../services/singpay');

// ─── POST /api/payments/initiate ─────────────────────────────────
async function initierAbonnement(req, res) {
  try {
    const { plan } = req.body;
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
    const expiresAt    = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

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
      description:   `Abonnement ${planInfo.label} — Itonda`,
    });

    const nomOp = operateurInfo.operateur === 'AIRTEL_MONEY' ? 'Airtel Money' : 'Moov Money';

    return res.json({
      reference,
      operateur: operateurInfo.operateur,
      message:   `Confirmez le paiement de ${planInfo.amount.toLocaleString()} FCFA sur votre ${nomOp}.`,
      plan,
      amount:    planInfo.amount,
    });

  } catch (err) {
    console.error('[payments/initiate]', err.message);
    return res.status(500).json({ error: err.message || 'Erreur initialisation paiement' });
  }
}

// ─── POST /api/payments/webhook ──────────────────────────────────
// Appelé par SingPay sans JWT. On vérifie le statut directement
// auprès de l'API SingPay pour éviter toute manipulation externe.
async function webhookSingPay(req, res) {
  try {
    // Vérification de signature HMAC si SingPay la fournit
    const singpaySecret = process.env.SINGPAY_WEBHOOK_SECRET;
    if (singpaySecret) {
      const signature = req.headers['x-singpay-signature'] || req.headers['x-webhook-signature'];
      if (!signature) {
        console.warn('[Webhook] Signature manquante — requête rejetée');
        return res.status(401).json({ error: 'Signature requise' });
      }
      const expected = crypto
        .createHmac('sha256', singpaySecret)
        .update(JSON.stringify(req.body))
        .digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        console.warn('[Webhook] Signature invalide — requête rejetée');
        return res.status(401).json({ error: 'Signature invalide' });
      }
    }

    console.log('[Webhook SingPay]', JSON.stringify(req.body));

    const reference = req.body?.reference || req.body?.transaction_id || req.body?.id;
    if (!reference) return res.status(400).json({ error: 'reference manquante' });

    // Re-vérification du statut côté SingPay (source de vérité)
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

    console.log(`[Webhook] Abonnement activé — ${payment.userId} | ${payment.subscription} | ${payment.amount} FCFA`);
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('[payments/webhook]', err.message);
    return res.status(200).json({ received: true });
  }
}

// ─── GET /api/payments/status/:reference ─────────────────────────
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
