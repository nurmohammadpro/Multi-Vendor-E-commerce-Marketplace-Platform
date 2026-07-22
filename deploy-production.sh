#!/bin/bash

# Production Deployment Script for Multi-Vendor Platform
# This script handles database migrations and application deployment

set -e  # Exit on any error

echo "🚀 Starting Production Deployment..."
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    print_error "DATABASE_URL environment variable is not set"
    echo "Please set it with: export DATABASE_URL='postgresql://user:password@host:port/dbname'"
    exit 1
fi

print_status "DATABASE_URL is configured"

# Change to the project root directory
cd "$(dirname "$0")"
PROJECT_ROOT=$(pwd)
print_status "Working directory: $PROJECT_ROOT"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_warning "node_modules not found, installing dependencies..."
    npm install
fi

# Backup current database (optional but recommended)
echo ""
echo "📦 Creating database backup..."
timestamp=$(date +%Y%m%d_%H%M%S)
backup_file="backup_${timestamp}.sql"

if PGPASSWORD="${DB_PASSWORD:-}" pg_dump "$DATABASE_URL" > "$backup_file" 2>/dev/null; then
    print_status "Database backup created: $backup_file"
else
    print_warning "Could not create database backup (continuing anyway)"
fi

# Run database migrations
echo ""
echo "🗄️  Running database migrations..."
if node packages/database/src/migrate.mjs; then
    print_status "Database migrations completed successfully"
else
    print_error "Database migrations failed!"
    echo "Please check the error messages above and fix any issues."
    exit 1
fi

# Check migration status
echo ""
echo "📊 Migration Status:"
node packages/database/src/migrate.mjs --status

# Build the application (if needed)
echo ""
echo "🔨 Building application..."
if [ -f "package.json" ] && grep -q "\"build\"" package.json; then
    npm run build
    print_status "Application built successfully"
else
    print_warning "No build script found, skipping build step"
fi

# Restart the application
echo ""
echo "🔄 Restarting application..."

# Try PM2 first
if command -v pm2 &> /dev/null; then
    echo "Using PM2 to restart..."
    pm2 restart multivendor-platform 2>/dev/null || pm2 start npm --name "multivendor-platform" -- start
    print_status "Application restarted with PM2"
# Try systemd
elif systemctl is-active --quiet multivendor-platform 2>/dev/null; then
    echo "Using systemd to restart..."
    systemctl restart multivendor-platform
    print_status "Application restarted with systemd"
# Try direct node restart
else
    print_warning "Could not detect PM2 or systemd, you may need to restart manually"
fi

echo ""
echo "================================"
print_status "🎉 Production Deployment Completed Successfully!"
echo ""
echo "📝 Next Steps:"
echo "  1. Verify the application is running: pm2 status"
echo "  2. Check application logs: pm2 logs multivendor-platform"
echo "  3. Test the inventory page in your production environment"
echo ""
echo "🔗 Quick Checks:"
echo "  - Database migrations: node packages/database/src/migrate.mjs --status"
echo "  - Application health: curl http://localhost:3000/api/health"
echo ""