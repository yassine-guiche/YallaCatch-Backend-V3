#!/bin/bash

# YallaCatch Backend Deployment Script
# Usage: ./scripts/deploy.sh [environment] [options]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENVIRONMENT="${1:-production}"
BACKUP_DIR="/opt/yallacatch/backups"
LOG_FILE="/var/log/yallacatch/deploy.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$level" in
        "INFO")  echo -e "${GREEN}[INFO]${NC} $message" ;;
        "WARN")  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        "ERROR") echo -e "${RED}[ERROR]${NC} $message" ;;
        "DEBUG") echo -e "${BLUE}[DEBUG]${NC} $message" ;;
    esac
    
    # Also log to file if directory exists
    if [[ -d "$(dirname "$LOG_FILE")" ]]; then
        echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
    fi
}

# Error handler
error_exit() {
    log "ERROR" "$1"
    exit 1
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        error_exit "This script should not be run as root for security reasons"
    fi
}

# Check prerequisites
check_prerequisites() {
    log "INFO" "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        error_exit "Docker is not installed"
    fi
    
    if ! docker info &> /dev/null; then
        error_exit "Docker daemon is not running"
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        error_exit "Docker Compose is not installed"
    fi
    
    # Check if required environment files exist
    if [[ ! -f "$PROJECT_DIR/.env.$ENVIRONMENT" ]]; then
        error_exit "Environment file .env.$ENVIRONMENT not found"
    fi
    
    log "INFO" "Prerequisites check passed"
}

# Load environment variables
load_environment() {
    log "INFO" "Loading environment configuration for: $ENVIRONMENT"
    
    # Source environment file
    set -a
    source "$PROJECT_DIR/.env.$ENVIRONMENT"
    set +a
    
    # Validate required variables
    local required_vars=(
        "MONGODB_URI"
        "REDIS_URL"
        "JWT_PRIVATE_KEY_BASE64"
        "JWT_PUBLIC_KEY_BASE64"
    )
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            error_exit "Required environment variable $var is not set"
        fi
    done
    
    log "INFO" "Environment configuration loaded successfully"
}

# Create backup
create_backup() {
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log "INFO" "Creating backup before deployment..."
        
        local backup_timestamp=$(date '+%Y%m%d_%H%M%S')
        local backup_path="$BACKUP_DIR/$backup_timestamp"
        
        # Create backup directory
        sudo mkdir -p "$backup_path"
        
        # Backup MongoDB
        log "INFO" "Backing up MongoDB..."
        docker exec yallacatch-mongodb mongodump --out "/backup/$backup_timestamp" --authenticationDatabase admin -u "$MONGO_ROOT_USERNAME" -p "$MONGO_ROOT_PASSWORD"
        
        # Backup Redis
        log "INFO" "Backing up Redis..."
        docker exec yallacatch-redis redis-cli --rdb "/backup/redis_$backup_timestamp.rdb"
        
        # Backup application data
        log "INFO" "Backing up application data..."
        sudo cp -r "$PROJECT_DIR/uploads" "$backup_path/" 2>/dev/null || true
        sudo cp -r "$PROJECT_DIR/logs" "$backup_path/" 2>/dev/null || true
        
        log "INFO" "Backup completed: $backup_path"
        
        # Keep only last 7 backups
        find "$BACKUP_DIR" -type d -name "20*" -mtime +7 -exec sudo rm -rf {} + 2>/dev/null || true
    fi
}

# Build application
build_application() {
    log "INFO" "Building application..."
    
    cd "$PROJECT_DIR"
    
    # Build Docker image
    docker build -t yallacatch-backend:latest .
    
    # Tag with timestamp for rollback capability
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    docker tag yallacatch-backend:latest "yallacatch-backend:$timestamp"
    
    log "INFO" "Application built successfully"
}

# Run database migrations
run_migrations() {
    log "INFO" "Running database migrations..."
    
    # Check if MongoDB is accessible
    if ! docker exec yallacatch-mongodb mongosh --eval "db.runCommand('ping')" &> /dev/null; then
        error_exit "MongoDB is not accessible for migrations"
    fi
    
    # Run migrations
    docker run --rm \
        --network yallacatch-network \
        -e MONGODB_URI="$MONGODB_URI" \
        -e NODE_ENV="$ENVIRONMENT" \
        yallacatch-backend:latest \
        npm run migrate
    
    log "INFO" "Database migrations completed"
}

# Deploy services
deploy_services() {
    log "INFO" "Deploying services..."
    
    cd "$PROJECT_DIR"
    
    # Copy environment file
    cp ".env.$ENVIRONMENT" .env
    
    # Deploy with Docker Compose
    if [[ "$ENVIRONMENT" == "production" ]]; then
        docker-compose -f docker-compose.production.yml up -d
    else
        docker-compose up -d
    fi
    
    log "INFO" "Services deployed successfully"
}

# Health check
health_check() {
    log "INFO" "Performing health checks..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        log "DEBUG" "Health check attempt $attempt/$max_attempts"
        
        # Check API health
        if curl -f -s "http://localhost:3000/health" > /dev/null; then
            log "INFO" "API health check passed"
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            error_exit "Health check failed after $max_attempts attempts"
        fi
        
        sleep 10
        ((attempt++))
    done
    
    # Additional service checks
    log "INFO" "Checking individual services..."
    
    # Check MongoDB
    if ! docker exec yallacatch-mongodb mongosh --eval "db.runCommand('ping')" &> /dev/null; then
        error_exit "MongoDB health check failed"
    fi
    
    # Check Redis
    if ! docker exec yallacatch-redis redis-cli ping | grep -q "PONG"; then
        error_exit "Redis health check failed"
    fi
    
    log "INFO" "All health checks passed"
}

# Setup monitoring
setup_monitoring() {
    log "INFO" "Setting up monitoring..."
    
    # Ensure monitoring directories exist
    mkdir -p "$PROJECT_DIR/monitoring/grafana/data"
    mkdir -p "$PROJECT_DIR/monitoring/prometheus/data"
    mkdir -p "$PROJECT_DIR/monitoring/loki/data"
    
    # Set proper permissions
    sudo chown -R 472:472 "$PROJECT_DIR/monitoring/grafana/data" 2>/dev/null || true
    sudo chown -R 65534:65534 "$PROJECT_DIR/monitoring/prometheus/data" 2>/dev/null || true
    sudo chown -R 10001:10001 "$PROJECT_DIR/monitoring/loki/data" 2>/dev/null || true
    
    log "INFO" "Monitoring setup completed"
}

# Cleanup old resources
cleanup() {
    log "INFO" "Cleaning up old resources..."
    
    # Remove unused Docker images
    docker image prune -f
    
    # Remove old application images (keep last 3)
    docker images yallacatch-backend --format "table {{.Tag}}" | grep -E '^[0-9]{8}_[0-9]{6}$' | sort -r | tail -n +4 | xargs -r docker rmi
    
    log "INFO" "Cleanup completed"
}

# Rollback function
rollback() {
    local target_version="${1:-}"
    
    if [[ -z "$target_version" ]]; then
        log "ERROR" "Please specify a version to rollback to"
        log "INFO" "Available versions:"
        docker images yallacatch-backend --format "table {{.Tag}}\t{{.CreatedAt}}" | grep -E '^[0-9]{8}_[0-9]{6}'
        exit 1
    fi
    
    log "INFO" "Rolling back to version: $target_version"
    
    # Tag the target version as latest
    docker tag "yallacatch-backend:$target_version" yallacatch-backend:latest
    
    # Restart services
    docker-compose restart yallacatch-api
    
    # Health check
    health_check
    
    log "INFO" "Rollback completed successfully"
}

# Show usage
usage() {
    cat << EOF
Usage: $0 [environment] [options]

Environments:
    production    Deploy to production environment
    staging       Deploy to staging environment
    development   Deploy to development environment

Options:
    --no-backup      Skip backup creation (not recommended for production)
    --no-migration   Skip database migrations
    --rollback TAG   Rollback to specific version
    --help           Show this help message

Examples:
    $0 production
    $0 staging --no-backup
    $0 production --rollback 20231201_143022
EOF
}

# Main deployment function
main() {
    local no_backup=false
    local no_migration=false
    local rollback_version=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --no-backup)
                no_backup=true
                shift
                ;;
            --no-migration)
                no_migration=true
                shift
                ;;
            --rollback)
                rollback_version="$2"
                shift 2
                ;;
            --help)
                usage
                exit 0
                ;;
            *)
                # Unknown option
                if [[ "$1" =~ ^-- ]]; then
                    error_exit "Unknown option: $1"
                fi
                shift
                ;;
        esac
    done
    
    # Handle rollback
    if [[ -n "$rollback_version" ]]; then
        rollback "$rollback_version"
        exit 0
    fi
    
    log "INFO" "Starting deployment to $ENVIRONMENT environment"
    
    # Pre-deployment checks
    check_root
    check_prerequisites
    load_environment
    
    # Create backup if not disabled and in production
    if [[ "$no_backup" != true ]]; then
        create_backup
    fi
    
    # Build and deploy
    build_application
    
    # Run migrations if not disabled
    if [[ "$no_migration" != true ]]; then
        run_migrations
    fi
    
    deploy_services
    setup_monitoring
    health_check
    cleanup
    
    log "INFO" "Deployment completed successfully!"
    log "INFO" "Application is available at: http://localhost:3000"
    log "INFO" "Grafana dashboard: http://localhost:3001"
    log "INFO" "Prometheus: http://localhost:9090"
}

# Run main function with all arguments
main "$@"
