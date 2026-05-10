const jwt    = require('jsonwebtoken');
const prisma = require('../config/prisma');

/**
 * Middleware d'authentification JWT
 * Vérifie le token Bearer dans le header Authorization
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant ou invalide' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { profile: true },
    });

    if (!user || !user.isActive || user.isBanned) {
      return res.status(401).json({ error: 'Compte inactif ou banni' });
    }

    // Met à jour lastSeen
    await prisma.user.update({
      where: { id: user.id },
      data:  { lastSeen: new Date() },
    });

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expirée. Reconnectez-vous.' });
    }
    return res.status(401).json({ error: 'Token invalide' });
  }
}

/**
 * Middleware — vérifie si l'utilisateur a un abonnement actif
 */
function requireSubscription(level = 'PLUS') {
  const levels = { FREE: 0, PLUS: 1, PREMIUM: 2 };
  return (req, res, next) => {
    const userLevel = levels[req.user.subscription] ?? 0;
    if (userLevel < levels[level]) {
      return res.status(403).json({
        error:    'Abonnement requis',
        required: level,
        current:  req.user.subscription,
      });
    }
    next();
  };
}

module.exports = { authenticate, requireSubscription };
