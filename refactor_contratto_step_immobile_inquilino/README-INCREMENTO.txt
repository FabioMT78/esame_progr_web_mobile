Refactoring completo degli step Immobile e Inquilino del wizard Contratto

Base repository: main, commit fbf952c (refactoring: dati contrattuali).

Nuovi moduli:
- public/js/contratto/immobile-step.js
- public/js/contratto/inquilino-step.js
- public/js/contratto/step-utils.js

Aggiornato:
- public/js/contratto.js

Non sono necessarie modifiche HTML, CSS, backend o database.
Il file public/js/contratto/dati-contrattuali.js resta invariato.

Verifiche manuali consigliate:
1. apertura /contratto.html senza parametri;
2. selezione immobile completo;
3. completamento immobile con dati catastali mancanti;
4. creazione nuovo immobile dal wizard;
5. selezione inquilino completo;
6. completamento inquilino con anagrafica/residenza/documento mancanti;
7. creazione nuovo inquilino dal wizard;
8. apertura con immobileId/inquilinoId validi e non validi;
9. ripristino bozza;
10. avanzamento 1 -> 2 -> 3 -> 4 e ritorno tramite stepper;
11. anteprima e registrazione finale del contratto;
12. Annulla: eliminazione bozza e ritorno alla pagina di provenienza.
