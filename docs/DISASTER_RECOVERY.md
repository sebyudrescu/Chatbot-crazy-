# Disaster recovery LitX AI

Questa procedura protegge l'intero database PostgreSQL. Il backup JSON del singolo agente resta utile per spostare una configurazione, ma non contiene conversazioni, knowledge base, catalogo completo, credenziali o log e non sostituisce il disaster recovery.

## Strategia di produzione

1. Abilitare nella console Neon **Backup & Restore** e configurare snapshot automatici giornalieri con una retention coerente al contratto del cliente.
2. Impostare la history retention/PITR prevista dal piano Neon.
3. Conservare periodicamente un dump PostgreSQL esterno, cifrato e con accesso ristretto, per evitare che l'unica copia dipenda dallo stesso provider.
4. Eseguire almeno ogni trimestre un restore drill verso un database temporaneo isolato.
5. Prima di ogni migrazione importante creare uno snapshot Neon e verificare `/api/health` dopo il deploy.

Obiettivi iniziali consigliati per questa installazione privata:

- RPO: massimo 24 ore per la copia esterna; il PITR Neon può ridurlo entro la finestra configurata.
- RTO: 4 ore, da misurare realmente durante il primo drill.
- Retention: 30 giorni per i backup operativi, salvo requisiti privacy più restrittivi.

## Prerequisiti

- Client PostgreSQL (`pg_dump`, `pg_restore`, `psql`) compatibile con la versione server.
- Connessione Neon **non pooled** in `DR_SOURCE_DATABASE_URL` o `DIRECT_URL`. Non usare l'hostname `-pooler` per `pg_dump`.
- Database di destinazione separato, vuoto o sacrificabile, destinato esclusivamente al drill.
- Nessuna credenziale deve essere salvata nel repository o nella shell history.

## Backup portabile

```powershell
$env:DR_SOURCE_DATABASE_URL = "postgresql://...connessione-non-pooled..."
$env:DR_ARCHIVE_PATH = "D:\backup-litx\litx-2026-08-05.dump"
npm run db:backup
```

Il comando crea un archivio custom PostgreSQL e un manifest con dimensione e SHA-256. L'archivio contiene dati sensibili: cifrarlo prima di trasferirlo nello storage di backup e non lasciarlo sul computer operativo.

## Restore drill

Creare prima un database temporaneo, per esempio `litx_restore_drill`. Il comando rifiuta la stessa sorgente come destinazione e richiede la conferma esplicita del nome del database da sovrascrivere.

```powershell
$env:DR_SOURCE_DATABASE_URL = "postgresql://...sorgente-non-pooled..."
$env:DR_TARGET_DATABASE_URL = "postgresql://.../litx_restore_drill?sslmode=require"
$env:DR_CONFIRM_TARGET_DATABASE = "litx_restore_drill"
npm run db:restore-drill
```

Il drill esegue dump, validazione dell'archivio, restore con `--exit-on-error` e confronto dei conteggi delle tabelle critiche. L'archivio temporaneo viene eliminato automaticamente. Il test va eseguito durante una finestra senza scritture, altrimenti nuove righe create dopo lo snapshot possono rendere il confronto volutamente conservativo.

## Procedura in caso di incidente

1. Fermare le operazioni che continuano a modificare i dati.
2. Annotare timestamp, commit in produzione e natura dell'incidente.
3. In Neon usare la preview/time travel per identificare il punto sano.
4. Ripristinare prima su un branch di anteprima e verificare tabelle, agenti, knowledge source, catalogo e conversazioni.
5. Finalizzare il restore solo dopo la verifica; controllare endpoint attivo e stringa di connessione.
6. Eseguire migrazioni Prisma, `/api/health`, smoke test e una conversazione reale.
7. Conservare temporaneamente il branch precedente per rollback, poi eliminarlo secondo retention.
8. Registrare RPO/RTO misurati e aggiornare questa procedura.

Non automatizzare mai un restore distruttivo direttamente da una route pubblica dell'applicazione.
