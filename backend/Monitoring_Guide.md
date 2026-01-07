'''
# Guide de Monitoring de YallaCatch!

Ce guide explique comment utiliser la stack de monitoring mise en place pour le backend de YallaCatch!.

---

## Table des matières

- [Vue d'ensemble de la stack](#vue-d-ensemble-de-la-stack)
- [Accès aux dashboards](#accès-aux-dashboards)
- [Dashboards clés](#dashboards-clés)
- [Alertes](#alertes)
- [Logs](#logs)

---

## Vue d'ensemble de la stack

- **Prometheus**: Collecte et stocke les métriques de l'application et de l'infrastructure.
- **Grafana**: Visualise les métriques collectées par Prometheus via des dashboards interactifs.
- **Loki**: Agrège les logs de tous les services.
- **Promtail**: Agent qui envoie les logs à Loki.
- **Alertmanager**: Gère les alertes envoyées par Prometheus.

## Accès aux dashboards

- **Grafana**: `http://<votre_domaine_ou_ip>:3001`
  - **Login**: `admin`
  - **Mot de passe**: La valeur de `GRAFANA_ADMIN_PASSWORD` dans votre fichier `.env.production`.

- **Prometheus**: `http://<votre_domaine_ou_ip>:9090`

- **Alertmanager**: `http://<votre_domaine_ou_ip>:9093`

## Dashboards clés

Des dashboards pré-configurés sont disponibles dans Grafana sous le dossier "YallaCatch".

- **API Overview**: Vue d'ensemble de la santé de l'API (latence, taux d'erreur, débit).
- **Business Metrics**: Métriques métier clés (utilisateurs actifs, réclamations, revenus).
- **System Resources**: Utilisation du CPU, de la mémoire et du disque pour chaque conteneur.
- **MongoDB**: Métriques détaillées de la base de données MongoDB.
- **Redis**: Métriques détaillées du cache Redis.

## Alertes

Les règles d'alerte sont définies dans `monitoring/alerts/yallacatch-alerts.yml`. Les alertes sont envoyées à la destination configurée dans `ALERT_WEBHOOK_URL` (par exemple, un canal Slack).

Quelques alertes critiques configurées:

- `APIDown`: L'API est inaccessible.
- `HighErrorRate`: Le taux d'erreur de l'API est élevé.
- `MongoDBDown`: La base de données est inaccessible.
- `DiskSpaceLow`: L'espace disque est faible.

## Logs

Les logs de tous les conteneurs sont agrégés dans Loki et peuvent être explorés via Grafana.

1.  Dans Grafana, allez dans la section "Explore".
2.  Sélectionnez la source de données "Loki".
3.  Utilisez le langage de requête LogQL pour filtrer les logs. Par exemple, pour voir les logs de l'API:
    ```logql
    {job="yallacatch-api"}
    ```
    Pour filtrer par niveau d'erreur:
    ```logql
    {job="yallacatch-api"} |= "error"
    ```
'''
