# Script per mostrare log del server in tempo reale

Write-Host "🔍 VISUALIZZATORE LOG SERVER" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

Write-Host "📋 Questo terminale mostrerà i log quando:" -ForegroundColor Yellow
Write-Host "   - Fai un crawl dalla dashboard" -ForegroundColor White
Write-Host "   - Il server processa richieste" -ForegroundColor White
Write-Host "   - Il worker elabora job" -ForegroundColor White
Write-Host "`n⏳ In attesa di eventi...`n" -ForegroundColor Yellow

# Trova il processo Node.js
$nodeProcess = Get-Process | Where-Object {$_.ProcessName -eq "node"} | Select-Object -First 1

if ($nodeProcess) {
    Write-Host "✅ Server trovato (PID: $($nodeProcess.Id))" -ForegroundColor Green
    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "LOG IN TEMPO REALE:" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan
    
    # Monitora log (in realtà non possiamo leggere stdout di processo esistente)
    # Quindi mostriamo istruzioni
    Write-Host "⚠️  Per vedere i log:" -ForegroundColor Yellow
    Write-Host "   1. Il server è già in esecuzione" -ForegroundColor White
    Write-Host "   2. Apri il terminale PowerShell originale dove hai fatto 'npm run dev'" -ForegroundColor White
    Write-Host "   3. I log appariranno lì quando fai azioni nella dashboard" -ForegroundColor White
    
} else {
    Write-Host "❌ Server non in esecuzione!" -ForegroundColor Red
    Write-Host "`n💡 Avvialo con: npm run dev" -ForegroundColor Yellow
}

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan
Write-Host "📋 ISTRUZIONI ALTERNATIVE:" -ForegroundColor Cyan
Write-Host "`n1. Premi Alt+Tab per vedere tutte le finestre" -ForegroundColor White
Write-Host "2. Cerca 'Windows PowerShell' o 'Terminal'" -ForegroundColor White
Write-Host "3. Dovrebbe esserci una finestra con 'npm run dev'" -ForegroundColor White
Write-Host "`nOPPURE:" -ForegroundColor Yellow
Write-Host "`n1. Chiudi tutto" -ForegroundColor White
Write-Host "2. Riavvia con: npm run dev" -ForegroundColor White
Write-Host "3. Non chiudere quel terminale" -ForegroundColor White
Write-Host "4. Fai crawl dalla dashboard" -ForegroundColor White
Write-Host "5. Guarda i log apparire in quel terminale" -ForegroundColor White

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

Read-Host "Premi Enter per chiudere"
