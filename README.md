
> Questo è un progetto sviluppato per l'esame di ***"Programmazione Web e Mobile con Lab"***\
> <small>*(16-22 settembre 2026)*</small>\
> \
> **Obiettivo:**\
> Mettere in pratica le conoscenze su ***HTML5, CSS3, Javascript vanilla, Node.js, Express.js, Web Workers, MySQL***
> avendo particolare cura alla comunicazione digitale e alla user experience (***UX***)
>
> **Sviluppo**\
> Pur mantenendo uno stile di sviluppo ***AGILE***, i principi ***SOLID*** sono stati ridotti all'essenziale ed applicati solo dove realmente
> apportano concreto valore.\
> L'utilizzo di framework è stato ridotto al minimo lasciando spazio al puro javascript.\
> Per l'imitare duplicazioni e ridondanza nel codice i form ed i relativi controlli sono stati resi modulari in modo da poter
> essere inseriti in modo dinamico nella struttura statica HTML\
> \
> Il progetto utilizza un'***architettura client-server a livelli***.\
> \
> **Frontend:**\
> realizzato con HTML, CSS e JavaScript vanilla. I JavaScript *delle singole pagine orchestrano componenti* riutilizzabili, come i moduli dei form, mentre api.js centralizza le chiamate fetch autenticate. Per le elaborazioni più pesanti, come parsing dei CSV e immagini, utilizzo ***Web Worker*** per non bloccare il main thread.
> 
> **Backend:**\
> app.js configura Express e le ***route***, i ***middleware*** gestiscono aspetti trasversali come JWT e ***sicurezza*** (è stato creato un middleware apposito per gestire 10 casi di ***attacchi XSS e SQL injection***), le route traducono le richieste HTTP in chiamate applicative, i ***service*** contengono la logica di ***dominio*** e i ***repository*** isolano l'accesso ***MySQL*** mediante query parametrizzate.\
> Il proprietario autenticato viene propagato dal ***JWT*** fino alle query, garantendo la separazione dei dati.\
> Gli ambienti frontend, backend e database sono stati Dockerizzati per portabilità, compatibilità e mantenimento dell'host.
>


---


# Gestionale Affitti

Applicazione web per la gestione di immobili, inquilini, contratti e pagamenti,
realizzata per il progetto d'esame di Programmazione Web e Mobile con Laboratorio.

Stack principale: HTML5, CSS3, JavaScript vanilla, Web Worker, Node.js, Express.js,
MySQL con `mysql2` e autenticazione JWT.

## Prerequisiti

Per l'avvio consigliato con Docker sono necessari:

- Git;
- Docker Desktop con Docker Compose.

Il progetto usa le immagini Docker:

- `node:24.21.0-alpine3.24`;
- `mysql:8.4`.

## Installazione e primo avvio

Clonare il repository ed entrare nella cartella del progetto:

```bash
git clone https://github.com/FabioMT78/esame_progr_web_mobile.git
cd esame_progr_web_mobile
```

Creare la configurazione locale:

```bash
cp docker/.env.example docker/.env
```

Per un ambiente non di sviluppo sostituire almeno il valore di `JWT_SECRET`
presente in `docker/.env`.

Scaricare le immagini Docker:

```bash
docker compose   --env-file docker/.env   -f docker/compose.yaml   pull
```

Avviare applicazione e database:

```bash
docker compose   --env-file docker/.env   -f docker/compose.yaml   up
```

Al primo avvio Docker:

- installa le dipendenze npm nel volume dedicato;
- avvia MySQL;
- inizializza il database con `database/schema.sql`;
- avvia il server Node.js sulla porta `3000`.

Dopo che i servizi sono avviati, caricare i template contrattuali:

```bash
docker compose   --env-file docker/.env   -f docker/compose.yaml   exec app npm run db:seed:templates
```

Il seed può essere rieseguito: valida i template JSON e aggiorna le tipologie
contrattuali e i relativi articoli in un'unica transazione.

Aprire quindi:

- applicazione: `http://localhost:3000`;
- health check: `http://localhost:3000/api/health`.

L'health check deve restituire:

```json
{
  "status": "ok",
  "database": "connected"
}
```

## Utilizzo essenziale

Il flusso principale dell'applicazione è:

1. registrare un proprietario ed effettuare il login;
2. creare un immobile;
3. creare un inquilino e associarlo a un immobile;
4. registrare il contratto di locazione;
5. dalla dashboard registrare i pagamenti oppure importare i movimenti da CSV.

La dashboard permette inoltre di modificare gli immobili, gestire gli inquilini,
visualizzare i contratti e controllare lo stato dei pagamenti.

### Importazione pagamenti da CSV

L'importazione è disponibile dal dialog **Registrazione pagamento**, dopo aver
selezionato l'inquilino.

Il CSV deve avere esattamente questa intestazione:

```text
data_movimento,importo,descrizione,riferimento_esterno
```

`descrizione` e `riferimento_esterno` possono essere vuoti. Sono accettati al
massimo 200 movimenti per file e il file non può superare 2 MB.

Il parsing, la normalizzazione e la prima validazione vengono eseguiti nel browser
tramite Web Worker; il server verifica poi duplicati e possibili associazioni con
le competenze non pagate prima della conferma.

Nel repository è presente il file di esempio:

```text
storage/pagamenti_test_5.csv
```

### Immagini degli immobili

Le immagini JPG, PNG e WebP possono essere caricate dalla pagina dell'immobile,
con dimensione massima di 5 MB.

Un Web Worker viene utilizzato lato client per l'elaborazione delle immagini e
per il caricamento progressivo della preview e dell'immagine completa nella
dashboard.

## Arresto

Per arrestare i container senza eliminare i dati:

```bash
docker compose   --env-file docker/.env   -f docker/compose.yaml   down
```

## Database e aggiornamenti durante lo sviluppo

`database/schema.sql` viene eseguito automaticamente da MySQL **solo quando il
volume del database viene creato per la prima volta**.

Quindi una modifica a `database/schema.sql` non aggiorna un database già
inizializzato.

### Ricreare completamente il database

Usare questa procedura solo quando i dati locali possono essere eliminati:

```bash
docker compose   --env-file docker/.env   -f docker/compose.yaml   down -v
```

Poi riavviare:

```bash
docker compose   --env-file docker/.env   -f docker/compose.yaml   up
```

e rieseguire il seed:

```bash
docker compose   --env-file docker/.env   -f docker/compose.yaml   exec app npm run db:seed:templates
```

`down -v` elimina il volume MySQL e quindi tutti i dati presenti.

### Aggiornare un database mantenendo i dati

Se i dati devono essere conservati, non eseguire `schema.sql` sopra il database
esistente e non usare `down -v`.

Prima effettuare un backup, quindi aprire il client MySQL del container:

```bash
docker compose   --env-file docker/.env   -f docker/compose.yaml   exec db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'
```

Applicare solo le istruzioni `ALTER TABLE`, `UPDATE` o gli eventuali script di
migrazione necessari alla modifica in corso. Terminato l'aggiornamento, se sono
cambiati i template contrattuali, rieseguire anche:

```bash
docker compose   --env-file docker/.env   -f docker/compose.yaml   exec app npm run db:seed:templates
```

## Struttura principale

```text
public/                 frontend HTML, CSS e JavaScript
public/js/workers/      Web Worker client
src/                    backend Node.js / Express
src/db/                 connessione MySQL
database/schema.sql     schema per nuove installazioni
database/seed/          template contrattuali JSON
database/migrate/       script di supporto al seed/migrazione
storage/                file generati o di esempio
docker/                 configurazione Docker Compose
```

Le immagini caricate dagli utenti vengono salvate sotto `storage/immobili/`,
directory esclusa dal versionamento Git.

## Troubleshooting

Verificare che Docker Desktop sia avviato:

```bash
docker version
docker info
```

Per controllare i container:

```bash
docker compose   --env-file docker/.env   -f docker/compose.yaml   ps
```

Per consultare i log dell'applicazione:

```bash
docker compose   --env-file docker/.env   -f docker/compose.yaml   logs -f app
```

Per consultare i log di MySQL:

```bash
docker compose   --env-file docker/.env   -f docker/compose.yaml   logs -f db
```
