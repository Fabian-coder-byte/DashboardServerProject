# Raspberry Dashboard - Progetto Home Server Monitor

## Obiettivo del progetto

Voglio creare una dashboard web per il mio Raspberry Pi che funzioni come centro di controllo del mio home server.

La dashboard deve mostrare in modo chiaro e moderno:

- Programmi e servizi in esecuzione
- Container Docker attivi
- Stato CPU, RAM, disco e temperatura
- Utilizzo rete
- Stato dei servizi principali
- Link rapidi alle applicazioni installate
- Log o notifiche utili
- Stato backup e storage
- Eventuali errori o servizi non raggiungibili

L’idea è avere una dashboard centrale tipo “pannello di comando” per il Raspberry, non solo una lista di link.

Il Raspberry deve sembrare una piccola città ordinata: ogni servizio ha il suo posto, il suo stato e il suo campanello d’allarme se qualcosa non va.

---

## Contesto

Uso un Raspberry Pi come home server personale.

Sul Raspberry potrei avere servizi come:

- Jellyfin
- Immich
- Nextcloud
- AdGuard Home
- Portainer
- Uptime Kuma
- File Browser
- Syncthing
- Audiobookshelf
- Kavita
- Calibre Web
- Nginx Proxy Manager
- Dashboard personalizzata
- Servizi Docker personali
- Progetti in sviluppo

Voglio una dashboard che mi aiuti a capire subito cosa sta succedendo sul server.

---

## Nome progetto

Nome provvisorio:

```text
PiControl Dashboard
```

Altri nomi possibili:

```text
RaspiPilot
HomeCore Dashboard
ServerNest
PiStation
MiniOps Dashboard
```

---

## Funzionalità principali

### 1. Panoramica generale

La homepage deve mostrare una schermata riassuntiva con:

- Stato generale del server: OK, Warning, Error
- Uptime del Raspberry
- Utilizzo CPU
- Utilizzo RAM
- Temperatura CPU
- Spazio disco usato/libero
- Numero container Docker attivi
- Numero servizi offline
- IP locale
- IP Tailscale, se disponibile
- Ultimo riavvio
- Ultimo backup eseguito

Esempio:

```text
Server status: Online
CPU: 23%
RAM: 3.2 GB / 8 GB
Temperatura: 54°C
Disco: 2.1 TB / 8 TB
Docker: 14 container attivi
Servizi offline: 1
Uptime: 6 giorni, 4 ore
```

---

### 2. Monitor servizi

La dashboard deve mostrare una lista di servizi installati.

Ogni servizio deve avere:

- Nome
- Icona
- Descrizione breve
- URL locale
- URL Tailscale o remoto
- Porta
- Stato: online/offline
- Tipo: Docker, sistema, app esterna
- Categoria
- Pulsante “Apri”
- Ultimo controllo
- Tempo di risposta

Esempio servizi:

```text
Jellyfin
URL: http://raspberry.local:8096
Porta: 8096
Stato: Online
Categoria: Media
Tipo: Docker
```

Categorie possibili:

- Media
- Foto
- File
- Backup
- Networking
- Monitoring
- DevOps
- Database
- Utility
- Sicurezza

---

### 3. Monitor Docker

La dashboard deve leggere e mostrare informazioni sui container Docker.

Per ogni container:

- Nome container
- Immagine Docker
- Stato
- Porta esposta
- CPU usage
- RAM usage
- Data avvio
- Restart count
- Healthcheck, se presente
- Network Docker
- Volumi montati

Azioni possibili, preferibilmente protette:

- Start container
- Stop container
- Restart container
- Visualizza log
- Visualizza dettagli

Le azioni pericolose devono chiedere conferma.

Esempio:

```text
immich_server
Image: ghcr.io/immich-app/immich-server
Status: Running
CPU: 12%
RAM: 820 MB
Ports: 2283
Restart count: 0
```

---

### 4. Monitor sistema

La dashboard deve mostrare metriche del Raspberry.

Metriche richieste:

- CPU usage
- RAM totale/usata/libera
- Swap
- Temperatura CPU
- Disco principale
- Dischi esterni montati
- Velocità lettura/scrittura disco
- Traffico rete upload/download
- Uptime
- Load average
- Processi più pesanti
- Numero processi attivi

Se possibile, mostrare grafici storici per:

- CPU
- RAM
- temperatura
- rete
- disco

---

### 5. Storage e dischi

Sezione dedicata allo storage.

Deve mostrare:

- Dischi montati
- Path di mount
- Capacità totale
- Spazio usato
- Spazio libero
- File system
- Stato mount
- Eventuali warning se un disco non è montato
- Cartelle principali

Esempio:

```text
/mnt/storage1
Tipo: ext4
Totale: 8 TB
Usato: 2.4 TB
Libero: 5.6 TB
Stato: Montato
```

Cartelle importanti:

```text
/mnt/storage1/media
/mnt/storage1/photos
/mnt/storage1/docs
/mnt/storage1/books
/mnt/storage1/backups
```

La dashboard dovrebbe evidenziare in rosso se un disco atteso non è montato.

---

### 6. Service Catalog

Voglio includere un Service Catalog interno.

Il Service Catalog è una lista ordinata di tutti i servizi installati sul Raspberry.

Ogni servizio deve avere una scheda con:

- Nome
- Descrizione
- Categoria
- Porta
- URL
- Percorso docker-compose.yml
- Percorsi volumi
- Database usato
- Backup previsto
- Note personali
- Dipendenze
- Stato esposizione: LAN, Tailscale, Internet
- Criticità: bassa, media, alta

Esempio:

```yaml
name: Jellyfin
description: Media server per film e serie TV
category: Media
port: 8096
url_local: http://raspberry.local:8096
url_tailscale: http://spaceplayer98-server:8096
compose_path: /srv/docker/jellyfin/docker-compose.yml
volumes:
  - /mnt/storage1/media:/media
  - /srv/docker/jellyfin/config:/config
backup:
  enabled: true
  paths:
    - /srv/docker/jellyfin/config
exposure: Tailscale
criticality: medium
```

---

### 7. Notifiche e alert

La dashboard deve segnalare problemi importanti.

Alert possibili:

- Container fermo
- Disco non montato
- Spazio disco sotto il 15%
- Temperatura sopra i 70°C
- RAM quasi piena
- Servizio non raggiungibile
- Backup non eseguito da troppo tempo
- Troppi restart di un container
- Errore nei log recenti

Gli alert possono essere mostrati nella dashboard come badge o pannello dedicato.

Esempio:

```text
Warning: Immich è offline
Warning: /mnt/storage1 ha solo il 12% di spazio libero
Error: Nextcloud database non raggiungibile
```

---

### 8. Log viewer

Vorrei una sezione per leggere i log.

Funzionalità:

- Selezione container
- Visualizzazione ultimi log
- Ricerca testo
- Filtro per errori/warning
- Auto-refresh opzionale
- Pulsante copia log

Comandi equivalenti:

```bash
docker logs --tail 200 nome-container
journalctl -u nome-servizio
```

---

### 9. Backup status

Sezione per mostrare lo stato dei backup.

Informazioni:

- Ultimo backup
- Prossimo backup previsto
- Esito ultimo backup
- Dimensione backup
- Percorso destinazione
- Servizi inclusi
- Warning se backup vecchio

Esempio:

```text
Backup Jellyfin config
Ultimo backup: 2026-06-24 03:00
Esito: OK
Dimensione: 450 MB
Destinazione: /mnt/storage1/backups/jellyfin
```

---

## Stack tecnico desiderato

Preferisco uno stack semplice, moderno e mantenibile.

### Backend

Opzioni possibili:

```text
Node.js + Express
oppure
.NET Minimal API
oppure
Python FastAPI
```

Preferenza consigliata:

```text
Node.js + Express
```

Motivo:

- Facile da containerizzare
- Comodo per chiamare comandi Linux
- Buona integrazione con Docker socket
- Leggero per Raspberry

### Frontend

Opzioni:

```text
Angular
React
Vue
```

Preferenza:

```text
Angular
```

Perché uso già Angular e voglio esercitarmi.

Tecnologie frontend:

- Angular
- Bootstrap oppure Tailwind
- Chart.js o ECharts per grafici
- Icone con Lucide, FontAwesome o Bootstrap Icons

### Database

Per la prima versione si può usare:

```text
SQLite
```

Perché semplice e leggero.

In futuro:

```text
PostgreSQL
```

### Deploy

Tutto deve girare con Docker Compose.

Servizi previsti:

```text
picontrol-api
picontrol-frontend
picontrol-db
```

---

## Architettura proposta

```text
Frontend Angular
        |
        v
Backend API
        |
        +--> Docker socket
        +--> Comandi sistema Linux
        +--> Database SQLite/PostgreSQL
        +--> File service-catalog.yml
        +--> Health check HTTP servizi
```

---

## Docker Compose desiderato

Il progetto deve avere un `docker-compose.yml` simile a:

```yaml
services:
  picontrol-api:
    build: ./backend
    container_name: picontrol-api
    ports:
      - "5005:5005"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./data:/app/data
      - /mnt/storage1:/mnt/storage1:ro
    environment:
      - NODE_ENV=production
      - PORT=5005
    restart: unless-stopped

  picontrol-frontend:
    build: ./frontend
    container_name: picontrol-frontend
    ports:
      - "4300:80"
    depends_on:
      - picontrol-api
    restart: unless-stopped
```

Nota sicurezza:

Il Docker socket deve essere montato con attenzione. Per la prima versione può essere read-only. Le azioni start/stop/restart possono essere aggiunte in una versione successiva.

---

## API richieste

### System

```http
GET /api/system/overview
```

Risposta esempio:

```json
{
  "hostname": "spaceplayer98-server",
  "uptime": 534223,
  "cpuUsage": 23.5,
  "ram": {
    "total": 8589934592,
    "used": 4294967296,
    "free": 4294967296
  },
  "temperature": 54.2,
  "loadAverage": [0.45, 0.6, 0.72]
}
```

---

### Docker

```http
GET /api/docker/containers
```

Risposta esempio:

```json
[
  {
    "name": "jellyfin",
    "image": "jellyfin/jellyfin",
    "status": "running",
    "cpuUsage": 3.5,
    "memoryUsage": 512000000,
    "ports": ["8096:8096"],
    "restartCount": 0
  }
]
```

---

### Services

```http
GET /api/services
```

Restituisce i servizi registrati nel Service Catalog.

```http
GET /api/services/health
```

Controlla se i servizi sono raggiungibili.

---

### Storage

```http
GET /api/storage
```

Risposta esempio:

```json
[
  {
    "mount": "/mnt/storage1",
    "filesystem": "/dev/sda1",
    "type": "ext4",
    "total": 8000000000000,
    "used": 2400000000000,
    "free": 5600000000000,
    "mounted": true
  }
]
```

---

### Logs

```http
GET /api/logs/docker/:containerName
```

Parametri:

```text
tail=200
level=error
```

---

### Alerts

```http
GET /api/alerts
```

Restituisce alert generati dal sistema.

---

## UI desiderata

La dashboard deve avere un design moderno, scuro, chiaro e leggibile.

Stile desiderato:

- Tema dark
- Card ordinate
- Badge colorati
- Icone per ogni servizio
- Grafici semplici
- Sidebar laterale
- Layout responsive
- Mobile friendly

Pagine principali:

```text
/dashboard
/services
/docker
/storage
/logs
/backups
/settings
```

---

## Layout homepage

La homepage dovrebbe contenere:

```text
[Server Online] [CPU] [RAM] [Temp] [Storage]

Grafico CPU
Grafico RAM
Grafico rete

Servizi principali:
[Jellyfin] [Immich] [Nextcloud] [AdGuard] [Portainer]

Alert recenti:
- Immich offline
- Temperatura alta
- Backup non recente

Container Docker:
- jellyfin running
- immich_server running
- nextcloud running
```

---

## Sicurezza

La dashboard non deve essere esposta direttamente a Internet senza protezione.

Accesso consigliato:

- Solo LAN
- Tailscale
- Reverse proxy protetto
- Login obbligatorio se esposta

Per la prima versione:

- Accesso solo in LAN/Tailscale
- Nessuna esposizione pubblica
- Eventuale login semplice admin/password

In futuro:

- Autenticazione JWT
- Ruoli
- 2FA
- OAuth/OpenID Connect

---

## MVP

La prima versione deve essere semplice.

### MVP richiesto

Funzionalità minime:

- Dashboard overview
- Lista container Docker
- Stato CPU/RAM/disco/temperatura
- Lista servizi da file YAML/JSON
- Health check dei servizi
- Link rapidi ai servizi
- Docker Compose per avvio progetto

Non servono subito:

- Login avanzato
- Grafici storici complessi
- Restart container
- Backup automatici
- Notifiche Telegram
- Gestione utenti

---

## Roadmap

### Versione 1

- Backend API
- Frontend dashboard
- Lettura metriche sistema
- Lettura container Docker
- Service Catalog statico
- Health check servizi
- Docker Compose

### Versione 2

- Log viewer
- Alert automatici
- Grafici storici
- Configurazione servizi da UI
- Stato backup

### Versione 3

- Azioni sui container
- Login
- Notifiche Telegram/Discord/email
- Reverse proxy integration
- Backup scheduler
- Plugin system

---

## Requisiti tecnici

Il codice deve essere:

- Pulito
- Commentato dove serve
- Diviso in moduli
- Facile da estendere
- Adatto a Raspberry Pi ARM64
- Avviabile con Docker Compose
- Con README chiaro
- Con `.env.example`
- Con esempi di configurazione

---

## Struttura repository desiderata

```text
picontrol-dashboard/
├── backend/
│   ├── src/
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── data/
│   ├── service-catalog.yml
│   └── settings.json
├── docker-compose.yml
├── README.md
└── docs/
    ├── architecture.md
    ├── api.md
    └── service-catalog.md
```

---

## Esempio service-catalog.yml

```yaml
services:
  - name: Jellyfin
    description: Media server per film, serie TV e cartoni
    category: Media
    type: docker
    icon: tv
    url_local: http://spaceplayer98-server.local:8096
    url_tailscale: http://spaceplayer98-server:8096
    port: 8096
    compose_path: /srv/docker/jellyfin/docker-compose.yml
    volumes:
      - /mnt/storage1/media:/media
      - /srv/docker/jellyfin/config:/config
    exposure: tailscale
    criticality: medium
    healthcheck:
      type: http
      url: http://localhost:8096

  - name: Immich
    description: Backup e gestione foto personali
    category: Photos
    type: docker
    icon: image
    url_local: http://spaceplayer98-server.local:2283
    url_tailscale: http://spaceplayer98-server:2283
    port: 2283
    compose_path: /srv/docker/immich/docker-compose.yml
    volumes:
      - /mnt/storage1/photos/immich-app:/usr/src/app/upload
    exposure: tailscale
    criticality: high
    healthcheck:
      type: http
      url: http://localhost:2283

  - name: Nextcloud
    description: Cloud personale per documenti, calendario e file
    category: Files
    type: docker
    icon: cloud
    url_local: http://spaceplayer98-server.local:8080
    url_tailscale: http://spaceplayer98-server:8080
    port: 8080
    compose_path: /srv/docker/nextcloud/docker-compose.yml
    volumes:
      - /mnt/storage1/docs:/var/www/html/data
    exposure: tailscale
    criticality: high
    healthcheck:
      type: http
      url: http://localhost:8080
```

---

## Prompt operativo per Claude

Crea questo progetto completo chiamato `picontrol-dashboard`.

Genera:

1. Backend Node.js con Express
2. Frontend Angular
3. Dockerfile backend
4. Dockerfile frontend
5. docker-compose.yml
6. File service-catalog.yml
7. API REST per:
   - system overview
   - docker containers
   - services
   - service health
   - storage
   - logs base

8. UI dashboard moderna dark theme
9. README con istruzioni installazione
10. Struttura cartelle pulita

Il progetto deve essere pensato per Raspberry Pi 5 con Docker.

Parti da un MVP funzionante, poi lascia commenti o TODO per le funzionalità avanzate.

Importante:

- Non generare codice troppo complicato.
- Preferisci semplicità e manutenzione.
- Evita dipendenze inutili.
- Usa configurazioni esterne dove possibile.
- La dashboard deve essere bella ma pratica.
- Tutto deve partire con:

```bash
docker compose up -d --build
```
