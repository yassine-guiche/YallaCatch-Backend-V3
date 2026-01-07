# 🔗 YallaCatch! Integration Guide

**Version**: 2.0.0  
**Date**: 18 octobre 2025  
**Author**: YallaCatch! Development Team

---

## 📋 Vue d'Ensemble

Ce guide fournit toutes les informations nécessaires pour intégrer le backend YallaCatch! avec :
- **React Admin Panel** (TypeScript/JavaScript)
- **Unity Game** (C#)

Le backend fournit des APIs optimisées et des SDKs spécialement conçus pour chaque plateforme.

---

## 🎯 Architecture d'Intégration

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Admin   │    │  YallaCatch!    │    │   Unity Game    │
│     Panel       │◄──►│    Backend      │◄──►│                 │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
    HTTP/REST              WebSocket              HTTP/WebSocket
    + WebSocket            Real-time               + Real-time
```

### Protocoles de Communication

**React Admin Panel**:
- **HTTP/REST**: APIs CRUD pour la gestion
- **WebSocket**: Mises à jour temps réel du dashboard
- **Authentication**: JWT Bearer tokens

**Unity Game**:
- **HTTP/REST**: APIs de jeu et synchronisation
- **WebSocket**: Événements temps réel et multijoueur
- **Authentication**: JWT Bearer tokens

---

## 🔧 Configuration Initiale

### Variables d'Environnement

```bash
# Backend Configuration
YALLACATCH_API_URL=https://api.yallacatch.tn
YALLACATCH_WS_URL=wss://api.yallacatch.tn/ws
YALLACATCH_API_KEY=your-api-key-here

# CORS Configuration for React
CORS_ORIGINS=https://admin.yallacatch.tn,http://localhost:3000

# Unity Configuration
UNITY_CORS_ENABLED=true
UNITY_WEBSOCKET_ENABLED=true
```

### Authentification

Toutes les intégrations utilisent JWT (JSON Web Tokens) pour l'authentification :

```typescript
// Headers requis
{
  "Authorization": "Bearer <jwt_token>",
  "X-API-Key": "<api_key>",
  "Content-Type": "application/json"
}
```

---

## ⚛️ Intégration React Admin Panel

### Installation du SDK

```bash
npm install @yallacatch/react-admin-sdk
# ou copiez le fichier react-admin-sdk.ts dans votre projet
```

### Configuration de Base

```typescript
import { YallaCatchAdminClient } from '@yallacatch/react-admin-sdk';

const client = new YallaCatchAdminClient(
  'https://api.yallacatch.tn',
  'your-api-key'
);

// Login
const loginResult = await client.login('admin@yallacatch.tn', 'password');
if (loginResult.success) {
  console.log('Connecté:', loginResult.data.user);
}
```

### Composants React Recommandés

#### Dashboard en Temps Réel

```tsx
import React, { useState, useEffect } from 'react';
import { YallaCatchAdminClient } from '@yallacatch/react-admin-sdk';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState(null);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    // Charger les statistiques initiales
    loadDashboardStats();
    
    // Connecter WebSocket pour mises à jour temps réel
    const websocket = client.connectWebSocket();
    setWs(websocket);

    // Écouter les mises à jour
    window.addEventListener('yallacatch-update', handleRealtimeUpdate);

    return () => {
      websocket?.close();
      window.removeEventListener('yallacatch-update', handleRealtimeUpdate);
    };
  }, []);

  const loadDashboardStats = async () => {
    const result = await client.getDashboardStats();
    if (result.success) {
      setStats(result.data);
    }
  };

  const handleRealtimeUpdate = (event: CustomEvent) => {
    const { type, data } = event.detail;
    
    switch (type) {
      case 'user_activity':
        // Mettre à jour les métriques utilisateur
        break;
      case 'new_claim':
        // Mettre à jour les statistiques de réclamations
        break;
      case 'system_alert':
        // Afficher une alerte système
        break;
    }
  };

  return (
    <div className="dashboard">
      <h1>YallaCatch! Dashboard</h1>
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Utilisateurs Actifs</h3>
            <p>{stats.users.active24h}</p>
          </div>
          <div className="stat-card">
            <h3>Réclamations 24h</h3>
            <p>{stats.activity.claims24h}</p>
          </div>
          {/* Plus de statistiques... */}
        </div>
      )}
    </div>
  );
};
```

#### Table de Gestion des Utilisateurs

```tsx
import React, { useState, useEffect } from 'react';
import { User, YallaCatchAdminClient } from '@yallacatch/react-admin-sdk';

const UsersTable: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    role: '',
  });

  useEffect(() => {
    loadUsers();
  }, [pagination.page, filters]);

  const loadUsers = async () => {
    const result = await client.getUsers({
      page: pagination.page,
      limit: pagination.limit,
      search: filters.search,
      status: filters.status,
    });

    if (result.success) {
      setUsers(result.data);
      setPagination(result.pagination);
    }
  };

  const handleBanUser = async (userId: string, reason: string) => {
    const result = await client.banUser(userId, { reason });
    if (result.success) {
      loadUsers(); // Recharger la liste
    }
  };

  return (
    <div className="users-table">
      <div className="filters">
        <input
          type="text"
          placeholder="Rechercher..."
          value={filters.search}
          onChange={(e) => setFilters({...filters, search: e.target.value})}
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters({...filters, status: e.target.value})}
        >
          <option value="all">Tous</option>
          <option value="active">Actifs</option>
          <option value="banned">Bannis</option>
        </select>
      </div>

      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Email</th>
            <th>Niveau</th>
            <th>Points</th>
            <th>Statut</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td>{user.displayName}</td>
              <td>{user.email}</td>
              <td>{user.level}</td>
              <td>{user.points}</td>
              <td>
                <span className={`status ${user.status}`}>
                  {user.status}
                </span>
              </td>
              <td>
                <button onClick={() => handleBanUser(user.id, 'Violation des règles')}>
                  Bannir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pagination">
        <button
          disabled={pagination.page === 1}
          onClick={() => setPagination({...pagination, page: pagination.page - 1})}
        >
          Précédent
        </button>
        <span>Page {pagination.page} sur {pagination.totalPages}</span>
        <button
          disabled={pagination.page === pagination.totalPages}
          onClick={() => setPagination({...pagination, page: pagination.page + 1})}
        >
          Suivant
        </button>
      </div>
    </div>
  );
};
```

### APIs React Spécialisées

Le backend fournit des endpoints optimisés pour React :

```typescript
// Données optimisées pour les tables React
GET /api/v1/integration/react/users
GET /api/v1/integration/react/prizes
GET /api/v1/integration/react/partners

// Analytics pour les dashboards
GET /api/v1/integration/react/dashboard/analytics
GET /api/v1/integration/react/dashboard/real-time

// Notifications en temps réel via WebSocket
WS /ws (avec channels: admin_updates, system_alerts, user_activity)
```

---

## 🎮 Intégration Unity Game

### Installation du SDK

1. Copiez le fichier `unity-game-sdk.cs` dans votre projet Unity
2. Installez les dépendances requises :
   - **Newtonsoft.Json** (via Package Manager)
   - **WebSocket** (WebSocket-Sharp ou autre librairie)

### Configuration Unity

```csharp
using YallaCatch.SDK;

public class GameManager : MonoBehaviour
{
    private YallaCatchClient yallaCatchClient;

    void Start()
    {
        // Initialiser le client
        yallaCatchClient = YallaCatchClient.Instance;
        yallaCatchClient.baseUrl = "https://api.yallacatch.tn";
        yallaCatchClient.apiKey = "your-api-key";
        yallaCatchClient.enableDebugLogs = true;

        // S'abonner aux événements
        yallaCatchClient.OnUserLoggedIn += HandleUserLoggedIn;
        yallaCatchClient.OnGameSessionStarted += HandleGameSessionStarted;
        yallaCatchClient.OnNearbyPrizesUpdated += HandleNearbyPrizesUpdated;
        yallaCatchClient.OnPrizeClaimed += HandlePrizeClaimed;
        yallaCatchClient.OnError += HandleError;
    }

    void HandleUserLoggedIn(User user)
    {
        Debug.Log($"Utilisateur connecté: {user.displayName}");
        
        // Démarrer une session de jeu
        Vector2 initialLocation = GetPlayerLocation();
        yallaCatchClient.StartGameSession(initialLocation);
    }

    void HandleGameSessionStarted(GameSessionResponse session)
    {
        Debug.Log($"Session de jeu démarrée: {session.sessionId}");
        
        // Charger les données de la carte
        LoadMapData();
    }

    void HandleNearbyPrizesUpdated(List<Prize> prizes)
    {
        Debug.Log($"Trouvé {prizes.Count} prix à proximité");
        
        // Mettre à jour l'affichage des prix sur la carte
        UpdatePrizesOnMap(prizes);
    }
}
```

### Système de Géolocalisation

```csharp
public class LocationManager : MonoBehaviour
{
    private YallaCatchClient client;
    
    void Start()
    {
        client = YallaCatchClient.Instance;
        
        // Démarrer le service de localisation Unity
        StartCoroutine(StartLocationService());
    }

    IEnumerator StartLocationService()
    {
        // Vérifier si l'utilisateur a autorisé la géolocalisation
        if (!Input.location.isEnabledByUser)
        {
            Debug.LogError("Géolocalisation non autorisée");
            yield break;
        }

        // Démarrer le service
        Input.location.Start(1f, 1f); // Précision 1m, distance 1m

        int maxWait = 20;
        while (Input.location.status == LocationServiceStatus.Initializing && maxWait > 0)
        {
            yield return new WaitForSeconds(1);
            maxWait--;
        }

        if (maxWait < 1)
        {
            Debug.LogError("Timeout géolocalisation");
            yield break;
        }

        if (Input.location.status == LocationServiceStatus.Failed)
        {
            Debug.LogError("Impossible d'obtenir la localisation");
            yield break;
        }

        // Démarrer les mises à jour de position
        StartCoroutine(UpdateLocationLoop());
    }

    IEnumerator UpdateLocationLoop()
    {
        while (client.HasActiveSession)
        {
            if (Input.location.status == LocationServiceStatus.Running)
            {
                var location = new Vector2(
                    Input.location.lastData.longitude,
                    Input.location.lastData.latitude
                );
                
                client.UpdateLocation(location, 0f, 0f);
            }
            
            yield return new WaitForSeconds(5f); // Mise à jour toutes les 5 secondes
        }
    }
}
```

### Système de Réclamation de Prix

```csharp
public class PrizeManager : MonoBehaviour
{
    public GameObject prizePrefab;
    public Transform prizeContainer;
    
    private Dictionary<string, GameObject> activePrizes = new Dictionary<string, GameObject>();
    private YallaCatchClient client;

    void Start()
    {
        client = YallaCatchClient.Instance;
        client.OnNearbyPrizesUpdated += UpdatePrizesDisplay;
    }

    void UpdatePrizesDisplay(List<Prize> prizes)
    {
        // Supprimer les anciens prix
        foreach (var kvp in activePrizes)
        {
            if (!prizes.Any(p => p.id == kvp.Key))
            {
                Destroy(kvp.Value);
            }
        }
        activePrizes.Clear();

        // Ajouter les nouveaux prix
        foreach (var prize in prizes)
        {
            CreatePrizeObject(prize);
        }
    }

    void CreatePrizeObject(Prize prize)
    {
        GameObject prizeObj = Instantiate(prizePrefab, prizeContainer);
        
        // Positionner le prix sur la carte
        Vector3 worldPos = ConvertGPSToWorldPosition(prize.position.lat, prize.position.lng);
        prizeObj.transform.position = worldPos;

        // Configurer les données du prix
        var prizeComponent = prizeObj.GetComponent<PrizeObject>();
        prizeComponent.Initialize(prize);
        prizeComponent.OnClaimAttempted += (prizeId) => AttemptClaimPrize(prizeId);

        activePrizes[prize.id] = prizeObj;
    }

    void AttemptClaimPrize(string prizeId)
    {
        Vector2 playerLocation = GetPlayerLocation();
        client.ClaimPrize(prizeId, playerLocation, (success) =>
        {
            if (success)
            {
                Debug.Log("Prix réclamé avec succès!");
                // Afficher animation de succès
                ShowClaimSuccessAnimation();
            }
            else
            {
                Debug.Log("Échec de la réclamation");
                // Afficher message d'erreur
                ShowClaimErrorMessage();
            }
        });
    }

    Vector3 ConvertGPSToWorldPosition(float lat, float lng)
    {
        // Convertir les coordonnées GPS en position Unity
        // Cette méthode dépend de votre système de coordonnées
        return new Vector3(lng * 100000f, 0, lat * 100000f);
    }
}
```

### WebSocket Temps Réel

```csharp
public class RealtimeManager : MonoBehaviour
{
    private YallaCatchClient client;

    void Start()
    {
        client = YallaCatchClient.Instance;
        
        // Le WebSocket est automatiquement connecté lors du login
        // Vous pouvez écouter les événements via les callbacks du client
    }

    // Envoyer des événements personnalisés
    public void SendGameEvent(string eventType, object data)
    {
        var message = new
        {
            type = "game_event",
            data = new
            {
                eventType = eventType,
                eventData = data,
                timestamp = System.DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            }
        };

        // Le WebSocket est géré automatiquement par le SDK
        Debug.Log($"Événement envoyé: {eventType}");
    }
}
```

### APIs Unity Spécialisées

```csharp
// APIs optimisées pour Unity
GET /api/v1/integration/unity/map          // Données de carte optimisées
GET /api/v1/integration/unity/leaderboard  // Classement avec fonctionnalités sociales
GET /api/v1/game/session/start            // Démarrer session de jeu
POST /api/v1/game/location/update         // Mise à jour position
POST /api/v1/claims                       // Réclamer un prix
GET /api/v1/game/challenges/daily         // Défis quotidiens
POST /api/v1/game/power-ups/use           // Utiliser power-up

// WebSocket pour temps réel
WS /ws (événements: prize_discovered, achievement_unlocked, game_event)
```

---

## 🔒 Sécurité et Authentification

### Flux d'Authentification

1. **Login Initial**:
   ```typescript
   POST /api/v1/auth/login
   {
     "email": "user@example.com",
     "password": "password",
     "deviceId": "device-unique-id",
     "platform": "React|Unity"
   }
   ```

2. **Réponse avec Token**:
   ```json
   {
     "success": true,
     "data": {
       "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       "refreshToken": "refresh-token-here",
       "user": { ... }
     }
   }
   ```

3. **Utilisation du Token**:
   ```typescript
   // Headers pour toutes les requêtes
   {
     "Authorization": "Bearer <token>",
     "X-API-Key": "<api-key>"
   }
   ```

### Rotation des Tokens

```typescript
// Rafraîchir le token automatiquement
const refreshToken = async () => {
  const response = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${refreshToken}`,
      'X-API-Key': apiKey,
    }
  });
  
  const data = await response.json();
  if (data.success) {
    // Mettre à jour le token
    setAuthToken(data.data.token);
  }
};
```

### Validation des Permissions

Le backend valide automatiquement les permissions pour chaque endpoint :

- **Admin endpoints**: Rôle `admin` ou `moderator` requis
- **Game endpoints**: Utilisateur authentifié et non banni
- **Integration endpoints**: Clé API valide requise

---

## 📊 Monitoring et Analytics

### Métriques Disponibles

Le backend expose des métriques Prometheus pour le monitoring :

```
# Métriques HTTP
http_requests_total{method="GET",route="/api/v1/game/session/start",status="200"}
http_request_duration_seconds{method="GET",route="/api/v1/game/session/start"}

# Métriques WebSocket
websocket_connections_total{platform="Unity"}
websocket_messages_total{type="location_update"}

# Métriques Business
game_sessions_total{platform="Unity"}
prizes_claimed_total{category="food"}
users_active_total{timeframe="24h"}
```

### Dashboard Grafana

Le backend inclut des dashboards Grafana pré-configurés pour :

- **Performance des APIs**
- **Activité des utilisateurs**
- **Métriques de jeu**
- **Santé du système**

---

## 🚀 Déploiement et Production

### Configuration de Production

```yaml
# docker-compose.production.yml
version: '3.8'
services:
  yallacatch-backend:
    image: yallacatch/backend:latest
    environment:
      - NODE_ENV=production
      - CORS_ORIGINS=https://admin.yallacatch.tn
      - RATE_LIMIT_ENABLED=true
      - WEBSOCKET_ENABLED=true
    ports:
      - "3000:3000"
```

### Optimisations de Performance

1. **Mise en Cache Redis**:
   - Sessions de jeu
   - Données de carte
   - Classements

2. **CDN pour Assets**:
   - Images de prix
   - Avatars utilisateurs
   - Assets Unity

3. **Load Balancing**:
   - Multiple instances backend
   - WebSocket sticky sessions

### Monitoring de Production

```bash
# Health checks
curl https://api.yallacatch.tn/health
curl https://api.yallacatch.tn/integration/health

# Métriques
curl https://api.yallacatch.tn/metrics
```

---

## 🐛 Dépannage

### Problèmes Courants

#### React Admin Panel

**Erreur CORS**:
```javascript
// Vérifier la configuration CORS
const corsOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'];
```

**WebSocket ne se connecte pas**:
```javascript
// Vérifier le token et l'URL WebSocket
const wsUrl = baseUrl.replace(/^http/, 'ws') + `/ws?token=${token}`;
```

#### Unity Game

**Erreur de sérialisation JSON**:
```csharp
// Vérifier que Newtonsoft.Json est installé
using Newtonsoft.Json;
```

**GPS ne fonctionne pas**:
```csharp
// Vérifier les permissions dans le manifest Android
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

### Logs de Debug

```bash
# Activer les logs détaillés
export DEBUG=yallacatch:*
export LOG_LEVEL=debug

# Logs Unity
Debug.Log("[YallaCatch SDK] Message de debug");
```

---

## 📞 Support et Contact

- **Documentation**: https://docs.yallacatch.tn
- **API Reference**: https://api.yallacatch.tn/docs
- **Support**: support@yallacatch.tn
- **GitHub**: https://github.com/yallacatch/backend

---

## 🔄 Changelog

### Version 2.0.0 (18 octobre 2025)
- ✅ SDKs React et Unity complets
- ✅ WebSocket temps réel
- ✅ APIs d'intégration optimisées
- ✅ Documentation complète
- ✅ Monitoring et métriques
- ✅ Sécurité enterprise

### Version 1.0.0 (Initial)
- ✅ APIs de base
- ✅ Authentification JWT
- ✅ Modèles de données

---

**Ce guide d'intégration garantit une intégration parfaite du backend YallaCatch! avec vos applications React et Unity. Pour toute question ou assistance, n'hésitez pas à contacter notre équipe de support.**
