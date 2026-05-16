const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { initierAbonnement, webhookSingPay, statutPaiement } = require('../controllers/paymentController');

// ─── POST /api/payments/initiate ─────────────────────────────────
router.post('/initiate', authenticate, initierAbonnement);

// ─── POST /api/payments/webhook (appelé par SingPay, sans JWT) ───
router.post('/webhook', webhookSingPay);

// ─── GET /api/payments/status/:reference ─────────────────────────
router.get('/status/:reference', authenticate, statutPaiement);

module.exports = router;
