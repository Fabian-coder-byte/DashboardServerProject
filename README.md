# PiControl Dashboard

Dashboard web per Raspberry Pi home server — mostra metriche di sistema, container Docker, servizi e storage.

## Stack

- **Backend**: Node.js + Express
- **Frontend**: Angular 18 (standalone)
- **Deploy**: Docker Compose

## Avvio rapido

```bash
docker compose up -d --build
```

- Frontend: http://raspberry.local:4300
- API: http://raspberry.local:5005

## Sviluppo locale

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm start
```

Apri http://localhost:4200 — si collega all'API su localhost:5005.

## Struttura

```
picontrol-dashboard/
├── backend/
│   ├── src/
│   │   ├── app.js              # Entry point Express
│   │   └── routes/
│   │       ├── system.js       # CPU, RAM, temperatura, uptime
│   │       ├── docker.js       # Container Docker
│   │       ├── services.js     # Service catalog da YAML
│   │       ├── storage.js      # Filesystem e dischi
│   │       ├── logs.js         # Log container Docker
│   │       └── alerts.js       # Alert automatici
│   └── Dockerfile
├── frontend/
│   └── src/app/
│       ├── features/           # Pagine (dashboard, docker, ...)
│       ├── core/               # Models, services, utils
│       └── shared/             # Componenti condivisi (sidebar)
├── data/
│   ├── service-catalog.yml     # Configura i tuoi servizi qui
│   └── settings.json           # Soglie alert
└── docker-compose.yml
```

## Configurazione servizi

Modifica `data/service-catalog.yml` per aggiungere i tuoi servizi:

```yaml
services:
  - name: Jellyfin
    description: Media server
    category: Media
    type: docker
    url_local: http://raspberry.local:8096
    port: 8096
    exposure: tailscale
    criticality: medium
    healthcheck:
      type: http
      url: http://localhost:8096
```

## API

| Endpoint | Descrizione |
|---|---|
| `GET /api/system/overview` | CPU, RAM, temp, uptime |
| `GET /api/docker/containers` | Lista container |
| `GET /api/services` | Catalog servizi |
| `GET /api/services/health` | Stato health check |
| `GET /api/storage` | Filesystem e dischi |
| `GET /api/alerts` | Alert attivi |
| `GET /api/logs/docker/:name` | Log container |

## Note sicurezza

Il Docker socket è montato in sola lettura (`ro`). Per questa versione MVP non sono previste azioni sui container (start/stop). Esponi la dashboard solo in LAN o via Tailscale.
