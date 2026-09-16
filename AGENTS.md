# AGENTS.md

## Progetto

Gestionale Affitti — progetto d'esame di Programmazione Web e Mobile con
Laboratorio.

Questo repository deve produrre un'applicazione web completa composta da
frontend, backend Node.js e database MySQL.

## Ruolo dell'agente

Agisci come implementation agent e code reviewer.

Il tuo compito principale è implementare incrementi già definiti mantenendo
il codice semplice, leggibile, coerente e funzionante.

Non modificare autonomamente scope, architettura o stack tecnologico salvo
necessità bloccante chiaramente motivata.

## Fonte di verità

Prima di modificare codice:

1. analizza il repository;
2. leggi eventuali documenti di progetto presenti;
3. verifica le convenzioni già adottate;
4. controlla lo stato Git;
5. individua i file realmente coinvolti.

Non assumere che una struttura prevista dalla documentazione sia già
implementata: verifica il repository.

Preserva le convenzioni esistenti salvo istruzione esplicita.

## Stack consentito

Stack previsto:

- HTML5;
- CSS3;
- JavaScript vanilla;
- Node.js;
- Express.js;
- MySQL;
- mysql2;
- Fetch API;
- Web Worker;
- JWT.

Non introdurre autonomamente:

- React;
- Angular;
- Bootstrap;
- Tailwind;
- TypeScript;
- ORM;
- framework frontend;
- librerie UI;
- nuove dipendenze npm.

Prima di aggiungere qualsiasi dipendenza chiedere conferma.

## Vincoli frontend

Il progetto deve utilizzare pagine HTML reali e un unico foglio CSS condiviso.

Usa HTML semantico quando appropriato:

- header;
- nav;
- main;
- section;
- form;
- footer.

Il JavaScript frontend deve rimanere vanilla JavaScript.

Preferire moduli/funzioni con responsabilità chiare.

Manipolare il DOM in modo leggibile e localizzato.

Evitare:

- handler enormi;
- duplicazione tra pagine;
- stringhe HTML molto complesse quando possono essere scomposte;
- stato globale non necessario;
- logica server duplicata nel client.

Usare `fetch` per l'interazione con le API.

Gestire sempre in modo esplicito:

- caricamento;
- successo;
- errore;
- dati mancanti quando pertinente.

## UX/UI

Le modifiche frontend devono mantenere:

- responsive design;
- leggibilità desktop/mobile;
- gerarchia visiva chiara;
- label associate agli input;
- messaggi di errore comprensibili;
- contrasto adeguato;
- navigazione coerente;
- stati non comunicati esclusivamente tramite colore.

Non cambiare palette, stile generale o struttura visuale senza richiesta
esplicita.

## Backend

Il backend Node.js deve mantenere responsabilità chiare.

Separare quando utile:

- routing HTTP;
- validazione/input;
- logica applicativa;
- accesso al database.

Non creare layer o classi senza una responsabilità concreta.

Gli endpoint devono:

- validare gli input;
- restituire status HTTP appropriati;
- produrre risposte JSON coerenti;
- gestire gli errori senza esporre dettagli interni;
- rispettare l'utente autenticato.

## Database

Database: MySQL tramite `mysql2`.

Usare sempre query parametrizzate.

Non concatenare direttamente input utente nelle query SQL.

Preservare le relazioni esistenti e la separazione dei dati per proprietario.

Usare transazioni quando più operazioni devono riuscire o fallire insieme.

Non modificare schema o migration senza evidenziare chiaramente il motivo.

## Autenticazione

Il progetto utilizza autenticazione JWT.

Non indebolire il controllo dell'utente autenticato.

Le query su dati appartenenti al proprietario devono mantenere il vincolo
relativo all'utente autenticato.

Non inserire token, password o segreti reali nel repository.

## SOLID E DESIGN

Applicare SOLID pragmaticamente.

Priorità:

1. SRP;
2. alta coesione;
3. basso accoppiamento;
4. dipendenze esplicite;
5. codice facilmente leggibile.

Non introdurre pattern, factory, repository abstraction, dependency injection
o altri layer solo per motivi teorici.

Usarli soltanto quando risolvono un problema reale già presente.

## Regole per gli incrementi

Quando ricevi un incremento:

1. analizza prima il codice interessato;
2. identifica i file da modificare;
3. implementa la soluzione più piccola coerente con l'architettura;
4. evita modifiche non necessarie;
5. esegui i controlli disponibili;
6. controlla `git diff`;
7. riepiloga il risultato.

Non estendere autonomamente l'incremento con nuove funzionalità.

Se emerge un problema architetturale non necessario per completare il task,
segnalalo ma non rifattorizzare automaticamente.

## Verifica

Dopo ogni modifica esegui, quando applicabili:

- avvio/parsing del backend;
- lint o script npm già disponibili;
- query/schema check disponibili;
- eventuali script di verifica del repository.

Non introdurre automaticamente Jest o altri framework di test.

Se non esistono test automatici, non inventare una test suite salvo richiesta.

Segnala invece chiaramente cosa deve essere verificato manualmente nel browser.

## Prima di terminare un task

Riporta sempre:

### Modifiche effettuate
Breve descrizione funzionale.

### File modificati
Elenco dei file realmente modificati.

### Verifiche eseguite
Comandi eseguiti e relativo risultato.

### Verifiche manuali consigliate
Passaggi da provare nel browser.

### Problemi residui
Solo problemi reali emersi durante il lavoro.

Non dichiarare completato qualcosa che non hai potuto verificare.

## Git

Non eseguire `git push`.

Non riscrivere la history.

Non eseguire commit salvo richiesta esplicita.

Non eliminare modifiche dell'utente non correlate al task.

Usa `git diff` e `git status` per controllare l'intervento.

## Principio guida

Ogni modifica deve migliorare o preservare questa catena:

azione utente
→ interfaccia
→ JavaScript
→ API
→ backend
→ MySQL
→ risposta
→ feedback utente

Preferire sempre una soluzione semplice e comprensibile a una soluzione
astratta o sofisticata senza vantaggio concreto.
