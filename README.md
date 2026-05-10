# 🌿 Okoumé Backend — API Node.js

API REST + WebSocket pour l'application de rencontres Okoumé (Gabon).

---

## 🚀 Démarrage rapide

### Prérequis
- Node.js 18+
- PostgreSQL (ou compte Supabase/Railway gratuit)

### Installation

```bash
# 1. Cloner et installer
cd okoume-backend
npm install

# 2. Configurer l'environnement
cp .env.example .env
# Éditez .env avec vos vraies valeurs

# 3. Créer la base de données
npx prisma db push

# 4. Lancer en développement
npm run dev
```

---

## 📡 Endpoints API

### Authentification
| Méthode | Endpoint               | Description                  |
|---------|------------------------|------------------------------|
| POST    | /api/auth/send-otp     | Envoyer code OTP par SMS     |
| POST    | /api/auth/verify-otp   | Vérifier code et obtenir JWT |
| GET     | /api/auth/me           | Mes infos compte             |
| DELETE  | /api/auth/account      | Supprimer mon compte         |

### Profil
| Méthode | Endpoint                  | Description              |
|---------|---------------------------|--------------------------|
| POST    | /api/profiles             | Créer/mettre à jour      |
| GET     | /api/profiles/me          | Mon profil               |
| GET     | /api/profiles/:userId     | Voir un profil           |
| POST    | /api/profiles/photos      | Ajouter une photo        |
| PATCH   | /api/profiles/incognito   | Mode incognito (Premium) |

### Découverte
| Méthode | Endpoint            | Description              |
|---------|---------------------|--------------------------|
| GET     | /api/discover       | Profils suggérés         |
| POST    | /api/discover/like  | Liker un profil          |
| POST    | /api/discover/pass  | Passer un profil         |

### Matches & Messages
| Méthode | Endpoint                  | Description              |
|---------|---------------------------|--------------------------|
| GET     | /api/matches              | Mes matches              |
| DELETE  | /api/matches/:id          | Supprimer un match       |
| GET     | /api/messages/:matchId    | Messages d'un match      |
| POST    | /api/messages/:matchId    | Envoyer un message       |

### Paiements
| Méthode | Endpoint                  | Description              |
|---------|---------------------------|--------------------------|
| POST    | /api/payments/initiate    | Initier un paiement      |
| POST    | /api/payments/webhook     | Webhook CinetPay         |
| GET     | /api/payments/history     | Historique paiements     |
| GET     | /api/payments/demo-success| Simuler paiement (DEV)   |

### Sécurité
| Méthode | Endpoint                  | Description              |
|---------|---------------------------|--------------------------|
| POST    | /api/reports              | Signaler un profil       |
| POST    | /api/reports/block        | Bloquer un utilisateur   |
| DELETE  | /api/reports/block/:id    | Débloquer                |

---

## 🔌 WebSocket Events

### Client → Serveur
| Event              | Payload                     | Description           |
|--------------------|-----------------------------|-----------------------|
| join_conversation  | { matchId }                 | Rejoindre un chat     |
| send_message       | { matchId, text }           | Envoyer un message    |
| typing             | { matchId }                 | Indicateur de frappe  |
| stop_typing        | { matchId }                 | Arrêt de frappe       |

### Serveur → Client
| Event     | Payload                                      | Description           |
|-----------|----------------------------------------------|-----------------------|
| message   | { id, matchId, senderId, text, createdAt }   | Nouveau message       |
| typing    | { userId }                                   | Quelqu'un frappe      |
| joined    | { matchId }                                  | Conversation rejointe |

---

## 🗄️ Base de données

Hébergement recommandé (gratuit pour démarrer) :
- **Supabase** → https://supabase.com (PostgreSQL gratuit)
- **Railway** → https://railway.app (PostgreSQL gratuit)
- **Render** → https://render.com (PostgreSQL gratuit)

---

## 📦 Stack

| Composant     | Technologie        |
|---------------|--------------------|
| Framework     | Express.js         |
| Base de données | PostgreSQL + Prisma |
| Temps réel    | Socket.io          |
| Auth          | JWT + bcrypt       |
| SMS OTP       | Africa's Talking   |
| Paiement      | CinetPay (Mobile Money) |
| Photos        | Cloudinary         |

---

## 🇬🇦 Déploiement Gabon

Serveurs recommandés proches du Gabon :
- **AWS eu-west-1** (Irlande) — latence ~120ms
- **OVH Roubaix** — latence ~100ms  
- **Render** — déploiement gratuit et simple

```bash
# Build pour production
NODE_ENV=production npm start
```

© 2026 Okoumé — API confidentielle
