'''
# Guide de Déploiement de YallaCatch!

Ce guide fournit des instructions détaillées pour déployer le backend de YallaCatch! en production.

---

## Table des matières

- [Prérequis du serveur](#prérequis-du-serveur)
- [Configuration de l'environnement](#configuration-de-l-environnement)
- [Processus de déploiement](#processus-de-déploiement)
- [Déploiement initial](#déploiement-initial)
- [Mises à jour](#mises-à-jour)
- [Rollback](#rollback)
- [Gestion des secrets](#gestion-des-secrets)

---

## Prérequis du serveur

- Un serveur Linux (Ubuntu 22.04 recommandé).
- Docker et Docker Compose installés.
- Git installé.
- Un nom de domaine configuré pour pointer vers l'adresse IP de votre serveur.
- Ports 80 et 443 ouverts pour le trafic HTTP/HTTPS.

## Configuration de l'environnement

1.  **Cloner le dépôt** sur le serveur de production:
    ```bash
    git clone https://github.com/yallacatch/backend.git
    cd backend
    ```

2.  **Créer le fichier d'environnement de production**:
    - Copiez `.env.production.example` vers `.env.production`.
    - Remplissez toutes les variables d'environnement avec les valeurs de production.

3.  **Générer les clés JWT**:
    - Il est recommandé de générer les clés sur votre machine locale et de copier les valeurs base64 dans le fichier `.env.production`.
    ```bash
    npm install -g tsx
    tsx scripts/generate-keys.ts
    ```

## Processus de déploiement

Le script `scripts/deploy.sh` automatise la plupart des tâches de déploiement.

### Déploiement initial

1.  **Rendre le script exécutable**:
    ```bash
    chmod +x scripts/deploy.sh
    ```

2.  **Lancer le script de déploiement**:
    ```bash
    ./scripts/deploy.sh production
    ```

    Ce script effectuera les actions suivantes:
    - Vérifier les prérequis.
    - Charger la configuration de l'environnement.
    - Construire les images Docker.
    - Lancer tous les services via Docker Compose.
    - Exécuter les migrations de base de données.
    - Effectuer des health checks pour s'assurer que tout fonctionne.

### Mises à jour

Pour déployer une nouvelle version du code:

1.  **Récupérer les derniers changements**:
    ```bash
    git pull origin main
    ```

2.  **Lancer le script de déploiement**:
    ```bash
    ./scripts/deploy.sh production
    ```

    Le script créera un backup (si en production), construira la nouvelle image, exécutera les migrations et déploiera les nouveaux conteneurs avec un temps d'arrêt minimal.

### Rollback

Si un déploiement échoue, vous pouvez revenir à une version précédente.

1.  **Lister les versions disponibles**:
    ```bash
    docker images yallacatch-backend
    ```

2.  **Lancer le script de rollback** avec le tag de la version souhaitée:
    ```bash
    ./scripts/deploy.sh production --rollback <tag_version>
    ```
    Exemple:
    ```bash
    ./scripts/deploy.sh production --rollback 20231225_103000
    ```

## Gestion des secrets

Ne commitez jamais de fichiers `.env` contenant des secrets dans le dépôt Git. Utilisez un gestionnaire de secrets comme HashiCorp Vault, AWS Secrets Manager, ou des variables d'environnement injectées par votre système CI/CD pour gérer les secrets en production.
'''
