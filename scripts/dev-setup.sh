#!/bin/bash

# Corelive Development Database Setup Script
# This script helps you quickly set up the PostgreSQL database for local development

set -e

echo "🚀 Setting up Corelive development database..."

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
    echo "❌ Docker Compose is not available. Please install Docker Compose and try again."
    exit 1
fi

# Determine docker compose command
if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

echo "📦 Starting PostgreSQL v17 container..."
$DOCKER_COMPOSE up -d postgres

echo "⏳ Waiting for PostgreSQL to be ready..."
timeout 60 bash -c 'while ! $DOCKER_COMPOSE exec postgres pg_isready -U postgres -d corelive >/dev/null 2>&1; do sleep 1; done'

if [ $? -eq 0 ]; then
    echo "✅ PostgreSQL is ready!"
else
    echo "❌ PostgreSQL failed to start within 60 seconds."
    echo "📋 Container logs:"
    $DOCKER_COMPOSE logs postgres
    exit 1
fi

echo "🔄 Pushing Prisma schema to database..."
if command -v pnpm >/dev/null 2>&1; then
    pnpm prisma db push
elif command -v npm >/dev/null 2>&1; then
    npm run prisma db push || npx prisma db push
else
    echo "❌ Neither pnpm nor npm found. Please install Node.js package manager."
    exit 1
fi

echo "📊 Generating Prisma client..."
if command -v pnpm >/dev/null 2>&1; then
    pnpm prisma generate
elif command -v npm >/dev/null 2>&1; then
    npm run prisma generate || npx prisma generate
fi

echo ""
echo "🎉 Database setup complete!"
echo ""
echo "📋 Available commands:"
echo "  Start database:      $DOCKER_COMPOSE up -d postgres"
echo "  Stop database:       $DOCKER_COMPOSE down"
echo "  View logs:           $DOCKER_COMPOSE logs postgres"
echo "  Access database:     $DOCKER_COMPOSE exec postgres psql -U postgres -d corelive"
echo ""
echo "🌐 Optional pgAdmin (database GUI):"
echo "  Start pgAdmin:       $DOCKER_COMPOSE --profile pgadmin up -d"
echo "  Access pgAdmin:      http://localhost:5050"
echo "  Login:               admin@corelive.dev / admin"
echo ""
echo "📖 Database connection details:"
echo "  Host:     localhost"
echo "  Port:     5432"
echo "  Database: corelive"
echo "  Username: postgres"
echo "  Password: password" 