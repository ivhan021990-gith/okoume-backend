// ─────────────────────────────────────────────────────────────────────────────
// Okoumé — src/routes/payments.js
// ⚠️ Ce fichier REMPLACE ton fichier src/routes/payments.js existant
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth');
const {
  initierAbonnement,
  webhookSingPay,
  statutPaiement,
} = require('../controllers/paymentController');

// ⚠️ Webhook SANS auth JWT — appelé directement par SingPay
router.post('/webhook', webhookSingPay);

// Routes protégées par JWT
router.post('/initiate',               authMiddleware, initierAbonnement);
router.get('/status/:transactionId',   authMiddleware, statutPaiement);

module.exports = router;
