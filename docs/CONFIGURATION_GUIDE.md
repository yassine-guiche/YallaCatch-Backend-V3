# GUIDE DE CONFIGURATION - YALLACATCH V2.0

**Date** : 14 novembre 2025  
**Version** : 2.0 Final Production-Ready  

---

## 🎯 CONFIGURATION MONGODB & REDIS

Vos credentials ont été fournis et sont prêts à être utilisés.

### MongoDB Atlas
```
Connection String: mongodb+srv://yguiche_db_user:%23YASyas97@cluster0.tt6an49.mongodb.net/yallacatch?retryWrites=true&w=majority&appName=Cluster0
```

**Note** : Le caractère `#` dans le mot de passe est encodé en `%23`

### Redis Cloud
```
Connection String: redis://default:d8huCnfKQnE2GiWsXKvsS2fti3FFw4kz@redis-11469.c8.us-east-1-2.ec2.cloud.redislabs.com:11469
```

---

## 📝 FICHIER .ENV À CRÉER

Créez un fichier `.env` dans le répertoire `yallacatch-backend-complete/` avec le contenu suivant :

```env
# MongoDB Atlas
MONGODB_URI=mongodb+srv://yguiche_db_user:%23YASyas97@cluster0.tt6an49.mongodb.net/yallacatch?retryWrites=true&w=majority&appName=Cluster0

# Redis Cloud
REDIS_URL=redis://default:d8huCnfKQnE2GiWsXKvsS2fti3FFw4kz@redis-11469.c8.us-east-1-2.ec2.cloud.redislabs.com:11469

# Server
PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET=yallacatch_super_secret_key_2024_production_v2
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# JWT RSA Keys (Auto-generated - DO NOT CHANGE)
JWT_PRIVATE_KEY_BASE64=LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JSUV2Z0lCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQktnd2dnU2tBZ0VBQW9JQkFRREhsSkFsTTVoWlVONWYKY3AyQ3NCY2VNQUNGWnNERzlBTnA3a1NucGdobkhSUG9LbHBjNEhrc0hFazdFb2swTG9HNC9INGJVdEZmL3RDTQpPc3JiY01Lc25TMHZudm5QV0lQUFgyeVBJMk81ZjZJVjhnNHg3VG42eThuM2NTMWwwbkxkNFU5SW4vSTgva1hlCi9YUmcwKzdiQlRBL3ArNFh2M3pkVjFuMkRGNGNxTjNlbkl4MGxBQ0loYUhWbnNWN01YdkJjb0VwRElkdHBYdDIKU0VISHY5ZTJheDNjcnovZ2ZsTm1ITFFzdysvOUF2dVhVNTBvNmpRRkJObDY0b1NYSWVFTmpNUzFRZ2QyOUVKVAptMFpPYmRGcjBwL2RHaUJPOE14eThGZ1pKWlBiRGlRbE9HL2NwT0ZyUXQ5WVdDQlNxWC9ZWlRhbTUyQk5hQzlyCjhwSDRUZXFMQWdNQkFBRUNnZ0VBQm9aNDQzK09qallXL3k2MG5ydHhyNmR6bDVPbXErZGdnQ0ZIVWdod3E1LysKNUFhdDcrMjJxSUZJUURKQlNLNTZ0eXdZbXAreDkxRlI5ZmdKRDF0RXAzKzd6MWVsb0htcS83anIrMlAxamlRVAowbU4yb05EK2NzUCtqdkZwVzIvRDlwdTMySDJQbWV0UXdpenlVYjdOTmp0VklSeDVlTmRNeWNHM1QvOGY2OHdKCmZ2K3g0c0dKaXNxY2xtNFhoRWxpT2NZaHNHM2dGMnpZYk9OSllCUEdrZUtJQmtFbGhoNXMzNGFMcXAweGViczAKaDgzUWpvRG8vcXFuT3ROTXdKRmpqbjV2SVJNUHgxTTRhYVlKeWZyYSs2V3hVQ1hQZFdYaHg3dFM3TEQ1Q1EycQpIREVUODNBa0NTOGZKdisrRFpuVVcrQ1lqL0hiWmhMWmtvM2hlLzJyWVFLQmdRRHNzTHhWUHZsTlRYRmJqVXZ2CnAreXUreDd6NVo0TXlaWndaMXNQVUJCOGZtZFE1M0dybyt4Qmh2VmRLekdkSUxPMllOWnMwdk94QUpleDN4Qk0KbG16d1k2WkN0ajg1eW5YL2lDbWJRODlpNHhkMFRiSFJ3L3BoVWZHWGpneVFDWUtvenFpMWhlemlGQ1lUTWJDVApwQ0M1bEVidktrT3NYZlF6K1VUeitLemcwUUtCZ1FEWDNNbEdTL3VoRmxlMU9vam9TbDBxeEFGM1J1aVRHTmI2CjYrSXVuZWdOaDZUU2JucFNia01Bend2Z3VXTHdEcGNsY0pOZUtPR3VCY2hiZDN4WUJZUkVnaC95cTY3bkdXL3kKakVyTGZ3MXhiZFVqOXY0QnBnemoyL21KVGc4WmNyWHljbElQL3RLeDVnWWM4TWJLSlZBZitseFdTT2UwdlhtMgpJUC9zQVpnTW13S0JnUUNMRnBDVng1dll3Vm1MNDB4c1dOSE5RZVMram9DQ0l6UTBlWWdaUjROb3BSOHhlOUJnCmZNT28vaFhSMmtBZGhjb1ZzbkpQSU9memE5VzR3TXhqTlVKdlFSL0N0RFlUVDlabmd5eHdBVGt0Y3lXbFFzTHIKOGE2QTRoYUdhUU1ZNFgzV2xScXZFVFJTNW1RNWcwbXdlUktCKzVCem12S0pwK3lKWGtJVzNGczdBUUtCZ0NiVwpLMFJCZ1drdkN1S3BRRjZDbXBhS0l6VmhoWkNKaEl3cWlrd1d6dHc0VGxncDFrb2tXbHUzNUl3dTduVUFPd05hCmFMa2xJODFhYnZ5OTE1cENpOVNEa05ucE41T09pUXliWHcyVHMwaDRHVVBhT1VMMHJCY0d5Yk9CWHNnV1VsUG4KYTRwREw0Y2dPbk5VZ245MkRSOWp2Tjh0U0xyRTZEUHpaZmdCSldrSEFvR0JBSmYrUFdyaDgvMDQ1LzRLNnIvZApjWXF6bDBBaXlSU3VyYUhJMG83cGtlUlhZOFFiU2hKckJsaHNDSitDem1KUmY2WldEck1hOFEvWnd5eXQyYWZ1CnZUSlVvRE9vYnJmWGtxN1QyMkR2NmcwWEhYTVVCY1lQcGxqZmxKZjdqdkNCVWphSE5RdUdYQThRdjRFWFZPN2YKd05zNzAvN2pGbFJyKzhtT01iQ1kvSUkwCi0tLS0tRU5EIFBSSVZBVEUgS0VZLS0tLS0K
JWT_PUBLIC_KEY_BASE64=LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUF4NVNRSlRPWVdWRGVYM0tkZ3JBWApIakFBaFdiQXh2UURhZTVFcDZZSVp4MFQ2Q3BhWE9CNUxCeEpPeEtKTkM2QnVQeCtHMUxSWC83UWpEcksyM0RDCnJKMHRMNTc1ejFpRHoxOXNqeU5qdVgraUZmSU9NZTA1K3N2SjkzRXRaZEp5M2VGUFNKL3lQUDVGM3YxMFlOUHUKMndVd1A2ZnVGNzk4M1ZkWjlneGVIS2pkM3B5TWRKUUFpSVdoMVo3RmV6Rjd3WEtCS1F5SGJhVjdka2hCeDcvWAp0bXNkM0s4LzRINVRaaHkwTE1Qdi9RTDdsMU9kS09vMEJRVFpldUtFbHlIaERZekV0VUlIZHZSQ1U1dEdUbTNSCmE5S2YzUm9nVHZETWN2QllHU1dUMnc0a0pUaHYzS1RoYTBMZldGZ2dVcWwvMkdVMnB1ZGdUV2d2YS9LUitFM3EKaXdJREFRQUIKLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg==

# Session & Encryption (IMPORTANT: ENCRYPTION_KEY must be exactly 32 characters)
SESSION_SECRET=yallacatch_session_secret_key_2024_production_v2_ultra_secure
ENCRYPTION_KEY=yallacatch2024productionv2key12

# Security
BCRYPT_ROUNDS=10
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000

# S3 (Mock for development - Configure for production)
S3_BUCKET=yallacatch-assets
S3_REGION=us-east-1
S3_ACCESS_KEY=mock_access_key
S3_SECRET_KEY=mock_secret_key

# Push Notifications (Mock for development - Configure for production)
FCM_SERVER_KEY=mock_fcm_key
FCM_PROJECT_ID=yallacatch
APNS_KEY_ID=mock_apns_key
APNS_TEAM_ID=mock_team_id
APNS_BUNDLE_ID=com.yallacatch.app
APNS_KEY_PATH=./apns_key.p8
APNS_PRODUCTION=false

# Game Settings
DEFAULT_CLAIM_RADIUS=50
DEFAULT_COOLDOWN_MINUTES=60
DEFAULT_DAILY_LIMIT=10
DEFAULT_POINTS_PER_CLAIM=100

# Admin
ADMIN_EMAIL=admin@yallacatch.com
ADMIN_PASSWORD=Admin@2024!

# CORS
CORS_ORIGIN=*
```

---

## 🚀 DÉMARRAGE RAPIDE

### 1. Backend

```bash
cd yallacatch-backend-complete
npm install
npm run dev
```

Le backend devrait démarrer sur `http://localhost:3000`

### 2. Frontend Admin

```bash
cd yallacatch-admin
npm install
npm run dev
```

Le frontend devrait démarrer sur `http://localhost:5173`

---

## ✅ VÉRIFICATIONS

### Test MongoDB
```bash
# Le backend affichera au démarrage :
✅ MongoDB connected successfully
```

### Test Redis
```bash
# Le backend affichera au démarrage :
✅ Redis connected successfully
```

### Test Backend API
```bash
curl http://localhost:3000/api/v1/health
# Devrait retourner : {"status":"ok"}
```

### Test Admin Panel
Ouvrez `http://localhost:5173` dans votre navigateur

**Credentials par défaut** :
- Email : `admin@yallacatch.com`
- Password : `Admin@2024!`

---

## 🧪 TESTS FONCTIONNELS

### 1. Créer un Utilisateur
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@123",
    "displayName": "Test User"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@123"
  }'
```

### 3. Créer un Prize (via Admin Panel)
1. Connectez-vous à l'admin panel
2. Allez dans "Prizes Management"
3. Cliquez sur "Create Prize"
4. Remplissez le formulaire
5. Cliquez sur "Create"

---

## 📊 DONNÉES DE TEST

Le système créera automatiquement :
- ✅ Un admin user (admin@yallacatch.com)
- ✅ Les collections MongoDB nécessaires
- ✅ Les indexes MongoDB

Pour ajouter des données de test :
1. Utilisez l'admin panel
2. Ou importez le fichier `seed-data.json` (si fourni)

---

## 🔧 TROUBLESHOOTING

### Erreur MongoDB Connection
- Vérifiez que l'IP `0.0.0.0/0` est dans la whitelist
- Vérifiez le mot de passe (caractère `#` encodé en `%23`)

### Erreur Redis Connection
- Vérifiez la connection string Redis
- Vérifiez que le port 11469 est accessible

### Erreur ENCRYPTION_KEY
- La clé doit faire **exactement 32 caractères**
- Utilisez : `yallacatch2024productionv2key12`

### Port déjà utilisé
```bash
# Tuer le processus sur le port 3000
lsof -ti:3000 | xargs kill -9

# Tuer le processus sur le port 5173
lsof -ti:5173 | xargs kill -9
```

---

## 📝 NOTES IMPORTANTES

1. **MongoDB Atlas** :
   - Cluster gratuit M0 (512 MB)
   - Limite : 100 connexions simultanées
   - Backup automatique désactivé (gratuit)

2. **Redis Cloud** :
   - Database gratuite (30 MB)
   - Limite : 30 connexions simultanées

3. **Production** :
   - Changez tous les secrets
   - Configurez S3 pour les uploads
   - Configurez FCM/APNS pour les push notifications
   - Activez HTTPS
   - Configurez un domaine

---

## 🎯 PROCHAINES ÉTAPES

1. ✅ Démarrer le backend
2. ✅ Démarrer le frontend
3. ✅ Se connecter à l'admin panel
4. ✅ Créer des prizes de test
5. ✅ Tester les APIs avec Postman/curl
6. ✅ Vérifier les logs
7. ✅ Tester les workflows

---

**Bon test ! 🚀**


