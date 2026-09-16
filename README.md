# Gestionale Affitti

Baseline tecnica del progetto d'esame di Programmazione Web e Mobile con Laboratorio.

## Struttura iniziale

- `public/`: frontend HTML/CSS/JavaScript
- `src/`: backend Node.js/Express
- `src/db/`: configurazione MySQL
- `database/`: schema SQL
- `docker/`: ambiente Docker Compose

## Prerequisiti

Per eseguire il progetto con Docker sono necessari:

- Git
- Docker Desktop con Docker Compose

## Installazione e setup del progetto

Nei comandi seguenti le espressioni racchiuse tra parentesi quadre, come
`[NOME_CARTELLA_PROGETTO]`, sono segnaposto da sostituire con un valore reale.

### 1. Clonare il repository

Dalla cartella nella quale si vuole creare il progetto, eseguire:

```bash
git clone https://github.com/FabioMT78/esame_progr_web_mobile.git ./[NOME_CARTELLA_PROGETTO]
```

Entrare quindi nella cartella del progetto:

```bash
cd [NOME_CARTELLA_PROGETTO]
```

### 2. Configurare le variabili d'ambiente

Creare il file locale di configurazione copiando il template:

```bash
cp docker/.env.example docker/.env
```

Personalizzare i valori presenti in `docker/.env` quando necessario.

`docker/.env` contiene la configurazione locale e non deve essere versionato;
`docker/.env.example` rimane nel repository come template riproducibile.

### 3. Scaricare le immagini Docker

```bash
docker compose \
  --env-file docker/.env \
  -f docker/compose.yaml \
  pull
```

Le immagini di riferimento sono:

```text
node:24.21.0-alpine3.24
mysql:8.4
```

## Avvio con Docker Compose

Dalla root del progetto:

```bash
docker compose \
  --env-file docker/.env \
  -f docker/compose.yaml \
  up
```

Al primo avvio:

- vengono installate le dipendenze npm nel volume Docker dedicato;
- viene avviato MySQL;
- viene creato lo schema definito in `database/schema.sql`;
- viene avviata l'applicazione Node.js.

Aprire nel browser:

- applicazione: `http://localhost:3000`
- health check API: `http://localhost:3000/api/health`

L'health check deve restituire:

```json
{
  "status": "ok",
  "database": "connected"
}
```

## Arresto

Per arrestare i container:

```bash
docker compose \
  --env-file docker/.env \
  -f docker/compose.yaml \
  down
```

Per eliminare anche i volumi Docker, compresi i dati MySQL, e ricreare
completamente il database al successivo avvio:

```bash
docker compose \
  --env-file docker/.env \
  -f docker/compose.yaml \
  down -v
```

## Nota sul database

Lo schema `database/schema.sql` viene montato nella directory
`/docker-entrypoint-initdb.d/` del container MySQL.

Gli script presenti in quella directory vengono eseguiti automaticamente
soltanto quando il volume dati MySQL viene inizializzato per la prima volta.

Di conseguenza, modificare `database/schema.sql` non aggiorna automaticamente
un database già inizializzato. Durante lo sviluppo, quando è necessario
ricreare completamente lo schema, eseguire:

```bash
docker compose \
  --env-file docker/.env \
  -f docker/compose.yaml \
  down -v
```

e successivamente riavviare il progetto con il comando di avvio indicato sopra.

## Troubleshooting Docker

Se Docker restituisce errori relativi alla comunicazione con il daemon o alla
versione dell'API, verificare prima che Docker Desktop sia avviato correttamente:

```bash
docker version
docker info
```

Se il problema riguarda il download di un'immagine, provare direttamente:

```bash
docker pull mysql:8.4
```

Questi controlli permettono di distinguere un problema dell'ambiente Docker
da un problema della configurazione del progetto.
