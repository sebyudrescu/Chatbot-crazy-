# Migration Script per Sistema Cognitivo
# Automatizza il processo di migrazione completo

Write-Host "🧠 MIGRAZIONE AL SISTEMA COGNITIVO" -ForegroundColor Cyan
Write-Host "====================================`n" -ForegroundColor Cyan

# Step 1: Verifica prerequisiti
Write-Host "📋 Step 1: Verifica Prerequisiti..." -ForegroundColor Yellow

if (-not (Test-Path "prisma/dev.db")) {
    Write-Host "❌ Database non trovato!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Database trovato" -ForegroundColor Green

# Step 2: Backup database
Write-Host "`n📦 Step 2: Backup Database..." -ForegroundColor Yellow

$backupName = "dev.db.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
Copy-Item "prisma/dev.db" "prisma/$backupName"

if (Test-Path "prisma/$backupName") {
    Write-Host "✅ Backup creato: $backupName" -ForegroundColor Green
} else {
    Write-Host "❌ Backup fallito!" -ForegroundColor Red
    exit 1
}

# Step 3: Genera Prisma Client
Write-Host "`n🔧 Step 3: Generazione Prisma Client..." -ForegroundColor Yellow

npm run prisma generate 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Prisma Client generato" -ForegroundColor Green
} else {
    Write-Host "❌ Errore generazione Prisma Client!" -ForegroundColor Red
    exit 1
}

# Step 4: Push schema al database
Write-Host "`n📊 Step 4: Applicazione Schema al Database..." -ForegroundColor Yellow

npm run db:push 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Schema applicato con successo" -ForegroundColor Green
} else {
    Write-Host "❌ Errore applicazione schema!" -ForegroundColor Red
    Write-Host "   Ripristino backup..." -ForegroundColor Yellow
    Remove-Item "prisma/dev.db"
    Copy-Item "prisma/$backupName" "prisma/dev.db"
    Write-Host "✅ Database ripristinato" -ForegroundColor Green
    exit 1
}

# Step 5: Verifica nuovo schema
Write-Host "`n🔍 Step 5: Verifica Nuovo Schema..." -ForegroundColor Yellow

# Verifica che il database esista ancora
if (Test-Path "prisma/dev.db") {
    Write-Host "✅ Database presente dopo migrazione" -ForegroundColor Green
} else {
    Write-Host "❌ Database non trovato dopo migrazione!" -ForegroundColor Red
    exit 1
}

# Step 6: Informazioni finali
Write-Host "`n✅ MIGRAZIONE COMPLETATA CON SUCCESSO!" -ForegroundColor Green
Write-Host "`n📋 Prossimi Step:" -ForegroundColor Cyan
Write-Host "   1. Avvia il server: npm run dev" -ForegroundColor White
Write-Host "   2. Testa il sistema: node scripts/test-cognitive-system.js <botId>" -ForegroundColor White
Write-Host "   3. Verifica DB: npm run db:studio" -ForegroundColor White
Write-Host "`n   Per switchare alla nuova API:" -ForegroundColor Cyan
Write-Host "   - Move-Item app/api/chat/route.ts app/api/chat/route-old.ts" -ForegroundColor White
Write-Host "   - Move-Item app/api/chat/route-new.ts app/api/chat/route.ts" -ForegroundColor White
Write-Host "`n💾 Backup salvato in: prisma/$backupName" -ForegroundColor Cyan
Write-Host "`n🔄 Per rollback:" -ForegroundColor Yellow
Write-Host "   Remove-Item prisma/dev.db" -ForegroundColor White
Write-Host "   Copy-Item prisma/$backupName prisma/dev.db" -ForegroundColor White

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🎉 Sistema Cognitivo Pronto!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan
