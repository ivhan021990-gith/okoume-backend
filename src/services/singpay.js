// ─────────────────────────────────────────────────────────────────────────────
// Okoumé — src/services/singpay.js
// Base URL : https://gateway.singpay.ga/v1
// Auth     : OAuth 2.0 client_credentials
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');

const BASE_URL  = 'https://gateway.singpay.ga/v1';
const TOKEN_URL = 'https://gateway.singpay.ga/oauth/token';

let cachedToken = null;
let tokenExpiry = null;

// ─── TOKEN OAUTH 2.0 (mis en cache) ──────────────────────────────────────────
async function getAccessToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 60000) {
    return cachedToken;
  }

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
  console.log('[SingPay] ✅ Token OAuth obtenu');
  return cachedToken;
}

async function getHeaders() {
  const token = await getAccessToken();
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

// ─── DÉTECTION OPÉRATEUR ──────────────────────────────────────────────────────
// Airtel = 07x → route /74/paiement
// Moov   = 06x → route /62/paiement
function detecterOperateur(phone) {
  const numero = phone.replace(/\D/g, '').replace(/^241/, '');
  if (numero.startsWith('07') || numero.startsWith('7')) {
    return { operateur: 'AIRTEL_MONEY', route: '/74/paiement' };
  }
  if (numero.startsWith('06') || numero.startsWith('6')) {
    return { operateur: 'MOOV_MONEY', route: '/62/paiement' };
  }
  return null;
}

// ─── INITIER UN PAIEMENT USSD PUSH ───────────────────────────────────────────
async function initierPaiement({ transactionId, montant, phone, description }) {
  const info = detecterOperateur(phone);
  if (!info) throw new Error('Numéro invalide. Doit être Airtel (07x) ou Moov (06x)');

  const headers    = await getHeaders();
  const numeroLocal = phone.replace(/\D/g, '').replace(/^241/, '');

  const payload = {
    reference:    transactionId,
    montant,
    numero:       numeroLocal,
    portefeuille: process.env.SINGPAY_WALLET_ID,
    description,
    callback:     `${process.env.APP_URL}/api/payments/webhook`,
  };

  const { data } = await axios.post(
    `${BASE_URL}${info.route}`,
    payload,
    { headers, timeout: 15000 }
  );

  return { operateur: info.operateur, transactionId, response: data };
}

// ─── VÉRIFIER LE STATUT ───────────────────────────────────────────────────────
async function verifierStatut(transactionId) {
  const headers  = await getHeaders();
  const { data } = await axios.get(
    `${BASE_URL}/transaction/api/status/${transactionId}`,
    { headers, timeout: 10000 }
  );

  const paid = data?.status === 'SUCCESS' || data?.statut === 'SUCCESS';
  return { paid, data };
}

// Plans Okoumé
const PLANS = {
  plus:    { label: 'Okoumé+',        amount: 5000  },
  premium: { label: 'Okoumé Premium', amount: 10000 },
};

module.exports = { initierPaiement, verifierStatut, detecterOperateur, PLANS };
