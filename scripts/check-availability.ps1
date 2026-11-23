# Démo zero-downtime (Windows) : interroge l'application en continu pendant un déploiement.
# Usage : .\scripts\check-availability.ps1 -Url http://192.168.1.31   (Ctrl+C pour arrêter)
param([string]$Url = "http://localhost:8080")

$ok = 0; $ko = 0
try {
    while ($true) {
        $time = Get-Date -Format "HH:mm:ss.fff"
        try {
            $r = Invoke-RestMethod -Uri "$Url/api/version" -TimeoutSec 2
            $ok++
            Write-Host "$time  OK   $($r.version) ($($r.hostname))" -ForegroundColor Green
        } catch {
            $ko++
            Write-Host "$time  ERREUR $($_.Exception.Message)" -ForegroundColor Red
        }
        Start-Sleep -Milliseconds 200
    }
} finally {
    Write-Host "`nRésultat : $ok OK / $ko erreurs"
}
