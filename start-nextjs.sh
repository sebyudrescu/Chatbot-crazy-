#!/bin/bash
# Script di avvio automatico per Next.js Chatbot RAG

echo "======================================="
echo "🚀 Chatbot RAG MVP - Next.js Startup"
echo "======================================="
echo ""

# Check if Node.js is installed
echo "🔍 Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found!"
    echo "📥 Install from: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✅ Node.js $NODE_VERSION"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found!"
    exit 1
fi

NPM_VERSION=$(npm --version)
echo "✅ npm $NPM_VERSION"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found!"
    echo "📄 Creating .env from .env.example..."
    cp .env.example .env
    echo ""
    echo "⚠️  IMPORTANTE: Apri il file .env e inserisci la tua OPENAI_API_KEY!"
    echo ""
    read -p "Hai configurato il file .env? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Configura il file .env prima di continuare."
        exit 1
    fi
fi

# Check if Prisma Client is generated
echo "🔧 Setting up database..."
if [ ! -d "node_modules/.prisma" ]; then
    echo "📦 Generating Prisma Client..."
    npx prisma generate
fi

# Push database schema
echo "📊 Pushing database schema..."
npx prisma db push --skip-generate
echo "✅ Database ready"
echo ""

# Start the application
echo "======================================="
echo "🚀 Starting Next.js server..."
echo "======================================="
echo ""
echo "📍 Application will be available at:"
echo "   - Homepage:  http://localhost:3000"
echo "   - Dashboard: http://localhost:3000/dashboard"
echo "   - Health:    http://localhost:3000/api/health"
echo ""
echo "⏹️  Press CTRL+C to stop the server"
echo ""

npm run dev
