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

## Template contrattuali JSON

I template di canone libero e canone concordato sono in
`database/seed/templates/`. Contengono denominazione, durata, rinnovo e articoli;
i placeholder nelle descrizioni vengono conservati senza essere renderizzati.

Prima di caricare i template e usare i contratti, applicare lo schema aggiornato
`database/schema.sql`, che aggiunge tipologie e articoli, il collegamento dalla
tabella contratti alla tipologia e il limite del giorno di pagamento a 28.

Con Node.js e le variabili di connessione MySQL già configurati:

```bash
npm run db:seed:templates
```

Con i servizi Docker avviati:

```bash
docker compose --env-file docker/.env -f docker/compose.yaml exec app npm run db:seed:templates
```

Il comando valida tutti i JSON e li carica in un'unica transazione. Può essere
rieseguito: aggiorna le tipologie per denominazione e sostituisce i rispettivi
articoli; in caso di errore annulla tutte le modifiche.

Se il volume MySQL Docker esiste già, `schema.sql` **non viene riapplicato
automaticamente**. Prima del seed occorre aggiornare manualmente lo schema,
associando anche gli eventuali contratti esistenti a una tipologia coerente e
verificandone date e giorno di pagamento, oppure ricreare un database di sviluppo
sacrificabile come descritto nella nota sul database. La ricreazione elimina i
dati del volume: non è necessaria se si effettua un aggiornamento conservativo.


## Pagamenti per competenza mensile

La dashboard registra la prima competenza non pagata della coppia immobile/inquilino,
considerando tutti i suoi contratti non archiviati e fermandosi al mese corrente.
Anche i contratti scaduti possono avere arretrati; i rinnovi non sono automatici.
Gli inquilini archiviati restano selezionabili per pagare i loro contratti storici.

Il canone mensile deriva da `canone_annuale / 12`. Il prorata usa l'intersezione
inclusiva fra mese e periodo contrattuale, anche per contratti interamente nello
stesso mese, con arrotondamento finale a due decimali. Date e confronto con oggi
usano il calendario UTC del server, come nel progetto di riferimento.

- `GET /api/pagamenti/anteprima?immobileId=…&inquilinoId=…`: restituisce competenza,
  importo, scadenza e indicatori relativi alla scadenza; HTTP 404 se non pagabile.
- `POST /api/pagamenti`: accetta solo come dati del pagamento `contrattoId`
  (stringa), `annoCompetenza` e `meseCompetenza` (interi). Importo e data vengono
  ricalcolati; inviarli nel body produce HTTP 400. Una competenza non più corrente,
  duplicata o che salta arretrati produce HTTP 409.

La conferma usa una transazione e blocca l'immobile prima di rileggere contratti e
pagamenti. Il vincolo UNIQUE protegge anche da duplicati concorrenti. Non esiste
un endpoint per cancellare pagamenti; eventuali record già archiviati mantengono
riservata la competenza, coerentemente con il vincolo UNIQUE richiesto.

### Aggiornamento manuale di un database esistente

`database/schema.sql` inizializza solo database nuovi. Il cambio di branch e il
riavvio dei container **non aggiornano le tabelle esistenti**. Non eseguire
`schema.sql` sul database già popolato e non cancellare il volume per applicare
questo incremento.

Prima dell'aggiornamento effettuare un backup e sospendere le scritture. Verificare
con `SHOW COLUMNS FROM pagamenti` se le colonne sono già presenti. Se mancano:

```sql
ALTER TABLE pagamenti
  ADD COLUMN anno_competenza SMALLINT UNSIGNED NULL AFTER contratto_id,
  ADD COLUMN mese_competenza TINYINT UNSIGNED NULL AFTER anno_competenza;
```

Se la tabella contiene pagamenti, attribuire manualmente anno e mese corretti a
**ogni** riga, compresi gli archiviati, verificando il periodo del contratto.
Non dedurre automaticamente la competenza da `data_pagamento`: un pagamento
può riferirsi a un arretrato. Controllare i dati prima di rendere obbligatori i campi:

```sql
SELECT id, contratto_id, anno_competenza, mese_competenza
FROM pagamenti
WHERE anno_competenza IS NULL OR anno_competenza NOT BETWEEN 1000 AND 9999
   OR mese_competenza IS NULL OR mese_competenza NOT BETWEEN 1 AND 12;

SELECT contratto_id, anno_competenza, mese_competenza, COUNT(*) AS duplicati
FROM pagamenti
GROUP BY contratto_id, anno_competenza, mese_competenza
HAVING COUNT(*) > 1;
```

Risolvere eventuali anomalie in base ai dati effettivi, senza cancellazioni
indiscriminate. Solo quando entrambe le query non restituiscono righe:

```sql
ALTER TABLE pagamenti
  MODIFY COLUMN anno_competenza SMALLINT UNSIGNED NOT NULL,
  MODIFY COLUMN mese_competenza TINYINT UNSIGNED NOT NULL,
  ADD CONSTRAINT chk_pagamenti_mese CHECK (mese_competenza BETWEEN 1 AND 12),
  ADD CONSTRAINT uq_pagamenti_competenza
    UNIQUE (contratto_id, anno_competenza, mese_competenza);
```

Se la tabella è vuota, il passaggio di attribuzione delle competenze non serve.
In alternativa è possibile ricreare consapevolmente un database di sviluppo
sacrificabile dopo aver salvato ciò che occorre: la ricreazione del volume elimina
tutti i dati e non viene eseguita automaticamente.
