// ─── SERVICE SMS — Africa's Talking ────────────────────────────────
// Documentation : https://developers.africastalking.com/docs/sms
const axios = require('axios');

const AT_BASE = 'https://api.africastalking.com/version1';

/**
 * Envoie un SMS via Africa's Talking
 * @param {string} phone   - Numéro au format +241XXXXXXXXX
 * @param {string} message - Corps du SMS
 */
async function sendSMS(phone, message) {
  const isProduction = process.env.NODE_ENV === 'production';

  // En développement, on simule l'envoi
  if (!isProduction) {
    console.log(`[SMS DEMO] À : ${phone}`);
    console.log(`[SMS DEMO] Message : ${message}`);
    return { success: true, demo: true };
  }

  try {
    const response = await axios.post(
      `${AT_BASE}/messaging`,
      new URLSearchParams({
        username: process.env.AT_USERNAME,
        to:       phone,
        message,
        from:     process.env.AT_SENDER_ID || 'ITONDA',
      }),
      {
        headers: {
          'ApiKey':       process.env.AT_API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept':       'application/json',
        },
      }
    );

    const result = response.data?.SMSMessageData;
    const recipient = result?.Recipients?.[0];

    if (recipient?.status === 'Success') {
      return { success: true, messageId: recipient.messageId };
    } else {
      throw new Error(recipient?.status || 'Échec envoi SMS');
    }
  } catch (err) {
    console.error('[SMS Error]', err.message);
    throw new Error('Impossible d\'envoyer le SMS. Réessayez.');
  }
}

/**
 * Génère et envoie un code OTP
 * @param {string} phone - Numéro gabonais
 * @returns {string} code - Le code OTP (4 chiffres)
 */
async function sendOTP(phone) {
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const message = `Votre code Itonda : ${code}\n\nValable 10 minutes. Ne partagez jamais ce code.`;

  try {
    await sendSMS(phone, message);
  } catch (err) {
    // Fallback : afficher le code dans les logs si SMS échoue
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📱 OTP FALLBACK — ${phone}`);
    console.log(`🔑 CODE : ${code}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
  return code;
}

module.exports = { sendSMS, sendOTP };
