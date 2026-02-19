#!/bin/bash

# YallaCatch! Backend Deployment Script
# Usage: ./deploy.sh [environment] [version]

set -e

ENVIRONMENT=${1:-production}
VERSION=${2:-latest}
REGISTRY=${DOCKER_REGISTRY:-"yallacatch"}
IMAGE_NAME="yallacatch-backend"
COMPOSE_FILE="docker-compose.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
    exit 1
}

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    error "Invalid environment: $ENVIRONMENT. Must be one of: development, staging, production"
fi

log "Starting deployment for environment: $ENVIRONMENT, version: $VERSION"

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    command -v docker >/dev/null 2>&1 || error "Docker is not installed"
    command -v docker-compose >/dev/null 2>&1 || error "Docker Compose is not installed"
    
    # Check if .env file exists
    if [ ! -f ".env.$ENVIRONMENT" ]; then
        error "Environment file .env.$ENVIRONMENT not found"
    fi
    
    success "Prerequisites check passed"
}

# Build Docker image
build_image() {
    log "Building Docker image..."
    
    docker build \
        --target production \
        --tag "$REGISTRY/$IMAGE_NAME:$VERSION" \
        --tag "$REGISTRY/$IMAGE_NAME:latest" \
        --build-arg NODE_ENV=$ENVIRONMENT \
        .
    
    success "Docker image built successfully"
}

# Run tests
run_tests() {
    log "Running tests..."
    
    # Create test environment
    docker-compose -f docker-compose.test.yml up -d mongodb redis
    
    # Wait for services to be ready
    sleep 10
    
    # Run tests in container
    docker run --rm \
        --network yallacatch_test \
        -e NODE_ENV=test \
        -e MONGODB_URI=mongodb://mongodb:27017/yallacatch_test \
        -e REDIS_URL=redis://redis:6379 \
        "$REGISTRY/$IMAGE_NAME:$VERSION" \
        npm test
    
    # Cleanup test environment
    docker-compose -f docker-compose.test.yml down -v
    
    success "Tests passed"
}

# Deploy to environment
deploy() {
    log "Deploying to $ENVIRONMENT..."
    
    # Copy environment file
    cp ".env.$ENVIRONMENT" .env
    
    # Export environment variables
    export COMPOSE_PROJECT_NAME="yallacatch_$ENVIRONMENT"
    export IMAGE_TAG="$VERSION"
    
    # Choose compose file based on environment
    case $ENVIRONMENT in
        development)
            COMPOSE_FILE="docker-compose.yml"
            ;;
        staging)
            COMPOSE_FILE="docker-compose.staging.yml"
            ;;
        production)
            COMPOSE_FILE="docker-compose.prod.yml"
            ;;
    esac
    
    # Pull latest images
    docker-compose -f $COMPOSE_FILE pull
    
    # Run database migrations
    log "Running database migrations..."
    docker-compose -f $COMPOSE_FILE run --rm app npm run migrate:up
    
    # Deploy with zero downtime
    if [ "$ENVIRONMENT" = "production" ]; then
        log "Performing zero-downtime deployment..."
        
        # Scale up new containers
        docker-compose -f $COMPOSE_FILE up -d --scale app=2 --no-recreate
        
        # Wait for health checks
        sleep 30
        
        # Remove old containers
        docker-compose -f $COMPOSE_FILE up -d --scale app=1 --remove-orphans
    else
        # Simple deployment for non-production
        docker-compose -f $COMPOSE_FILE up -d
    fi
    
    success "Deployment completed successfully"
}

# Health check
health_check() {
    log "Performing health check..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "http://localhost:3000/health" > /dev/null; then
            success "Health check passed"
            return 0
        fi
        
        log "Health check attempt $attempt/$max_attempts failed, retrying in 5 seconds..."
        sleep 5
        ((attempt++))
    done
    
    error "Health check failed after $max_attempts attempts"
}

# Rollback function
rollback() {
    warning "Rolling back deployment..."
    
    # Get previous version from git
    local previous_version=$(git describe --tags --abbrev=0 HEAD~1 2>/dev/null || echo "previous")
    
    log "Rolling back to version: $previous_version"
    
    # Deploy previous version
    export IMAGE_TAG="$previous_version"
    docker-compose -f $COMPOSE_FILE up -d
    
    success "Rollback completed"
}

# Cleanup old images
cleanup() {
    log "Cleaning up old Docker images..."
    
    # Remove dangling images
    docker image prune -f
    
    # Remove old versions (keep last 5)
    docker images "$REGISTRY/$IMAGE_NAME" --format "table {{.Tag}}" | \
        grep -v "TAG\|latest" | \
        sort -V | \
        head -n -5 | \
        xargs -r -I {} docker rmi "$REGISTRY/$IMAGE_NAME:{}"
    
    success "Cleanup completed"
}

# Backup database
backup_database() {
    if [ "$ENVIRONMENT" = "production" ]; then
        log "Creating database backup..."
        
        local backup_name="yallacatch_backup_$(date +%Y%m%d_%H%M%S)"
        
        docker-compose -f $COMPOSE_FILE exec -T mongo1 mongodump \
            --uri="mongodb://admin:password123@localhost:27017/yallacatch?authSource=admin" \
            --archive="/data/backups/$backup_name.archive" \
            --gzip
        
        success "Database backup created: $backup_name.archive"
    fi
}

# Main deployment flow
main() {
    # Trap errors and rollback
    trap 'error "Deployment failed! Rolling back..."; rollback' ERR
    
    check_prerequisites
    
    # Backup database in production
    if [ "$ENVIRONMENT" = "production" ]; then
        backup_database
    fi
    
    build_image
    
    # Run tests only in CI or if explicitly requested
    if [ "${RUN_TESTS:-false}" = "true" ]; then
        run_tests
    fi
    
    deploy
    health_check
    cleanup
    
    success "🎉 Deployment completed successfully!"
    log "Application is running at: http://localhost:3000"
    log "Health check: http://localhost:3000/health"
    
    if [ "$ENVIRONMENT" = "production" ]; then
        log "Monitoring dashboard: http://localhost:3001"
    fi
}

# Handle script arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    rollback)
        rollback
        ;;
    health)
        health_check
        ;;
    cleanup)
        cleanup
        ;;
    backup)
        backup_database
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|health|cleanup|backup} [environment] [version]"
        echo "  deploy   - Deploy application (default)"
        echo "  rollback - Rollback to previous version"
        echo "  health   - Check application health"
        echo "  cleanup  - Clean up old Docker images"
        echo "  backup   - Create database backup"
        exit 1
        ;;
esac
