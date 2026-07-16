# PowerShell Script per Avviare Next.js Chatbot RAG

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "Chatbot RAG MVP - Next.js Startup" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "Node.js $nodeVersion installed" -ForegroundColor Green
} catch {
    Write-Host "Node.js not found!" -ForegroundColor Red
    Write-Host "Install from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check if npm is installed
try {
    $npmVersion = npm --version
    Write-Host "npm $npmVersion installed" -ForegroundColor Green
} catch {
    Write-Host "npm not found!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Check if node_modules exists
if (-Not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
    Write-Host "Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "Dependencies already installed" -ForegroundColor Green
}
Write-Host ""

# Check if .env exists
if (-Not (Test-Path ".env")) {
    Write-Host "WARNING: .env file not found!" -ForegroundColor Red
    Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host ""
    Write-Host "IMPORTANTE: Apri il file .env e inserisci la tua OPENAI_API_KEY!" -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Hai configurato il file .env? (y/n)"
    if ($continue -ne "y") {
        Write-Host "Configura il file .env prima di continuare." -ForegroundColor Red
        exit 1
    }
}

# Setup database
Write-Host "Setting up database..." -ForegroundColor Yellow
if (-Not (Test-Path "node_modules/.prisma")) {
    Write-Host "Generating Prisma Client..." -ForegroundColor Yellow
    npx prisma generate
}

Write-Host "Pushing database schema..." -ForegroundColor Yellow
npx prisma db push --skip-generate
Write-Host "Database ready" -ForegroundColor Green
Write-Host ""

# Start the application
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "Starting Next.js server..." -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Application will be available at:" -ForegroundColor Green
Write-Host "   - Homepage:  http://localhost:3000" -ForegroundColor White
Write-Host "   - Dashboard: http://localhost:3000/dashboard" -ForegroundColor White
Write-Host "   - Health:    http://localhost:3000/api/health" -ForegroundColor White
Write-Host ""
Write-Host "Press CTRL+C to stop the server" -ForegroundColor Yellow
Write-Host ""

npm run dev
