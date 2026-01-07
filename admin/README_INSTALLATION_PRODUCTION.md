# 🚀 YallaCatch! Admin Panel - Installation & Déploiement Production

**Version**: 3.0.0 - 100% Complete  
**Date**: 26 octobre 2025  
**Statut**: ✅ Production Ready

---

## 📋 Table des Matières

1. [Prérequis](#prérequis)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Démarrage Développement](#démarrage-développement)
5. [Build Production](#build-production)
6. [Déploiement](#déploiement)
7. [APIs Intégrées](#apis-intégrées)
8. [Dépannage](#dépannage)

---

## 🔧 Prérequis

### Logiciels Requis

- **Node.js**: 20.x ou supérieur
- **npm** ou **pnpm**: Gestionnaire de paquets
- **Backend YallaCatch!**: Serveur Node.js + MongoDB en cours d'exécution

### Backend YallaCatch!

Le panneau d'administration nécessite que le backend soit démarré et accessible :

```bash
# Vérifier que le backend est accessible
curl http://localhost:3000/api/v1/health
```

Si le backend n'est pas démarré, consultez la documentation du backend :
- `/home/ubuntu/yallacatch-backend-complete/README.md`
- `/home/ubuntu/yallacatch-backend-complete/Deployment_Guide.md`

---

## 📦 Installation

### Étape 1 : Cloner ou Extraire le Projet

```bash
# Si vous avez le package tar.gz
tar -xzf yallacatch-admin-final.tar.gz
cd yallacatch-admin

# Ou si vous êtes déjà dans le répertoire
cd /home/ubuntu/yallacatch-admin
```

### Étape 2 : Installer les Dépendances

```bash
# Avec npm
npm install

# Ou avec pnpm (plus rapide)
pnpm install
```

**Durée estimée** : 1-2 minutes

---

## ⚙️ Configuration

### Étape 1 : Créer le Fichier de Configuration

```bash
# Copier le fichier d'exemple
cp .env.example .env.local

# Éditer la configuration
nano .env.local
```

### Étape 2 : Configurer les Variables d'Environnement

Éditez `.env.local` avec vos paramètres :

```env
# ==================== BACKEND API ====================

# URL du backend API
# Développement local
VITE_API_URL=http://localhost:3000/api/v1

# Production (exemple)
# VITE_API_URL=https://api.yallacatch.tn/api/v1

# WebSocket URL (optionnel)
VITE_WS_URL=ws://localhost:3000

# ==================== MODE ====================

# Mode Mock (false pour production)
VITE_USE_MOCK=false

# ==================== APPLICATION ====================

VITE_APP_NAME=YallaCatch! Admin
VITE_APP_VERSION=3.0.0

# ==================== MAP ====================

# Centre de la carte (Tunis par défaut)
VITE_MAP_DEFAULT_CENTER_LAT=36.8065
VITE_MAP_DEFAULT_CENTER_LNG=10.1815
VITE_MAP_DEFAULT_ZOOM=13

# ==================== FEATURES ====================

VITE_ENABLE_WEBSOCKET=true
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_NOTIFICATIONS=true

# ==================== DEBUG ====================

VITE_DEBUG=false
```

### Configuration Backend

**Important** : Assurez-vous que le backend est configuré pour accepter les requêtes CORS du frontend :

```javascript
// Dans le backend (app.ts ou server.ts)
fastify.register(cors, {
  origin: [
    'http://localhost:5173',  // Dev
    'http://localhost:3001',  // Proxy
    'https://admin.yallacatch.tn'  // Production
  ],
  credentials: true
});
```

---

## 🔨 Démarrage Développement

### Démarrer le Serveur de Développement

```bash
# Avec npm
npm run dev

# Ou avec pnpm
pnpm dev
```

Le serveur sera accessible sur :
- **Local**: http://localhost:5173
- **Network**: http://[votre-ip]:5173

### Hot Module Replacement (HMR)

Le serveur de développement supporte le HMR - vos modifications seront reflétées instantanément sans recharger la page.

---

## 📦 Build Production

### Créer le Build de Production

```bash
# Avec npm
npm run build

# Ou avec pnpm
pnpm build
```

Le build sera généré dans le dossier `dist/`.

### Prévisualiser le Build

```bash
# Avec npm
npm run preview

# Ou avec pnpm
pnpm preview
```

Le build sera accessible sur http://localhost:4173

---

## 🌐 Déploiement

### Option 1 : Nginx (Recommandé)

#### 1. Copier les Fichiers

```bash
# Copier le build vers le serveur web
sudo cp -r dist/* /var/www/yallacatch-admin/
```

#### 2. Configuration Nginx

Créer `/etc/nginx/sites-available/yallacatch-admin` :

```nginx
server {
    listen 80;
    server_name admin.yallacatch.tn;
    
    root /var/www/yallacatch-admin;
    index index.html;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    
    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Proxy API requests to backend
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 3. Activer le Site

```bash
# Créer le lien symbolique
sudo ln -s /etc/nginx/sites-available/yallacatch-admin /etc/nginx/sites-enabled/

# Tester la configuration
sudo nginx -t

# Recharger Nginx
sudo systemctl reload nginx
```

#### 4. SSL avec Let's Encrypt (Optionnel)

```bash
# Installer Certbot
sudo apt install certbot python3-certbot-nginx

# Obtenir le certificat SSL
sudo certbot --nginx -d admin.yallacatch.tn

# Renouvellement automatique
sudo certbot renew --dry-run
```

### Option 2 : Apache

#### Configuration Apache

Créer `/etc/apache2/sites-available/yallacatch-admin.conf` :

```apache
<VirtualHost *:80>
    ServerName admin.yallacatch.tn
    DocumentRoot /var/www/yallacatch-admin
    
    <Directory /var/www/yallacatch-admin>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        
        # SPA routing
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>
    
    # Proxy API
    ProxyPass /api http://localhost:3000/api
    ProxyPassReverse /api http://localhost:3000/api
    
    # Compression
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
    </IfModule>
</VirtualHost>
```

#### Activer le Site

```bash
# Activer les modules nécessaires
sudo a2enmod rewrite proxy proxy_http deflate

# Activer le site
sudo a2ensite yallacatch-admin

# Recharger Apache
sudo systemctl reload apache2
```

### Option 3 : Docker (Avancé)

#### Créer un Dockerfile

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

#### Créer nginx.conf

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### Build et Run

```bash
# Build l'image
docker build -t yallacatch-admin .

# Run le container
docker run -d -p 80:80 --name yallacatch-admin yallacatch-admin
```

---

## ✨ APIs Intégrées (100% Couverture)

Le panneau d'administration intègre **104 APIs backend** réparties en **12 modules** :

### Modules Principaux

| Module | APIs | Description |
|--------|------|-------------|
| **admin** | 15 | Gestion administrative |
| **analytics** | 12 | Analytics et statistiques |
| **auth** | 8 | Authentification et autorisation |
| **capture** | 4 | Gestion des captures ⭐ |
| **claims** | 10 | Validation des réclamations |
| **distribution** | 8 | Distribution des prix |
| **marketplace** | 5 | Marketplace et récompenses ⭐ |
| **notifications** | 8 | Notifications push |
| **partners** | 5 | Gestion des partenaires |
| **prizes** | 9 | Gestion des prix |
| **rewards** | 8 | Gestion des récompenses |
| **users** | 12 | Gestion des utilisateurs |

### Nouvelles APIs Intégrées (v3.0.0)

#### Module Capture (2 APIs)

1. **GET /api/capture/stats**
   - Statistiques globales des captures
   - Détection anti-triche
   - Métriques de validation

2. **POST /api/capture/report**
   - Gestion des signalements
   - Résolution des rapports
   - Traçabilité

#### Module Marketplace (3 APIs)

3. **GET /api/marketplace/categories**
   - Liste des catégories
   - Compteurs de récompenses

4. **GET /api/marketplace/featured**
   - Récompenses vedettes
   - Mise en avant

5. **GET /api/marketplace/history**
   - Historique des échanges
   - Détails des transactions

---

## 🎨 Fonctionnalités

### Pages Principales

1. **Dashboard**
   - Vue d'ensemble des statistiques
   - Graphiques en temps réel
   - Métriques clés

2. **Gestion des Utilisateurs**
   - Liste avec filtres
   - Actions (activer, suspendre, bannir)
   - Gestion des points

3. **Validation des Captures** ⭐
   - **Onglet Captures** : Validation/rejet
   - **Onglet Signalements** : Modération
   - **Onglet Statistiques** : Analytics anti-triche

4. **Gestion des Récompenses** ⭐
   - **Onglet Récompenses** : CRUD complet
   - **Onglet Catégories** : Organisation
   - **Onglet Vedettes** : Mise en avant
   - **Onglet Historique** : Transactions

5. **Gestion des Prix**
   - Distribution sur carte
   - Filtres et recherche
   - Statistiques

6. **Analytics**
   - Graphiques détaillés
   - Export de données
   - Rapports personnalisés

7. **Notifications**
   - Envoi de notifications push
   - Ciblage utilisateurs
   - Historique

8. **Partenaires**
   - Gestion des partenaires
   - Contrats et commissions

9. **Paramètres**
   - Configuration système
   - Gestion des rôles
   - Logs d'activité

---

## 🐛 Dépannage

### Problème : Le frontend ne se connecte pas au backend

**Solution** :

1. Vérifier que le backend est démarré :
   ```bash
   curl http://localhost:3000/api/v1/health
   ```

2. Vérifier la configuration CORS du backend

3. Vérifier l'URL dans `.env.local` :
   ```env
   VITE_API_URL=http://localhost:3000/api/v1
   ```

### Problème : Erreur 401 Unauthorized

**Solution** :

1. Vérifier que vous êtes connecté
2. Vérifier que le token JWT est valide
3. Vérifier les permissions admin dans le backend

### Problème : Build échoue

**Solution** :

1. Nettoyer le cache :
   ```bash
   rm -rf node_modules dist
   npm install
   npm run build
   ```

2. Vérifier la version de Node.js :
   ```bash
   node --version  # Doit être >= 20.x
   ```

### Problème : Page blanche après déploiement

**Solution** :

1. Vérifier la configuration du serveur web (Nginx/Apache)
2. Vérifier que le routing SPA est configuré
3. Vérifier les logs du navigateur (F12 → Console)

---

## 📞 Support

### Documentation

- **Backend** : `/home/ubuntu/yallacatch-backend-complete/README.md`
- **API Documentation** : `/home/ubuntu/yallacatch-backend-complete/API_Documentation.md`
- **Deployment Guide** : `/home/ubuntu/yallacatch-backend-complete/Deployment_Guide.md`

### Logs

- **Frontend (Dev)** : Console du navigateur (F12)
- **Frontend (Prod)** : Logs Nginx/Apache
- **Backend** : `/home/ubuntu/yallacatch-backend-complete/logs/`

---

## 🎉 Conclusion

Le panneau d'administration YallaCatch! est maintenant **100% complet** et **prêt pour la production**.

**Fonctionnalités clés** :
- ✅ 104 APIs backend intégrées
- ✅ Interface moderne et responsive
- ✅ Gestion complète des captures avec anti-triche
- ✅ Marketplace avec catégories et vedettes
- ✅ Analytics avancées
- ✅ Notifications push
- ✅ Gestion des partenaires

**Bon déploiement !** 🚀

---

**YallaCatch! Admin Panel v3.0.0**  
**Production Ready - 100% Complete**  
**26 octobre 2025**

