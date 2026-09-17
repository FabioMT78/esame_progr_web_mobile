USE gestionale_affitti;

-- Aggiornamento non distruttivo per database creati prima della scomposizione
-- dei dati dell'inquilino. Eseguire una sola volta se questi campi non esistono ancora.
-- I vecchi campi indirizzo_residenza e comune_residenza vengono lasciati
-- temporaneamente per non perdere eventuali dati di test.

ALTER TABLE inquilini
  ADD COLUMN indirizzo VARCHAR(150) NULL AFTER data_nascita,
  ADD COLUMN civico VARCHAR(20) NULL AFTER indirizzo,
  ADD COLUMN cap CHAR(5) NULL AFTER civico,
  ADD COLUMN provincia CHAR(2) NULL AFTER cap,
  ADD COLUMN comune VARCHAR(100) NULL AFTER provincia,
  ADD COLUMN tipo_documento VARCHAR(20) NULL AFTER immagine_url,
  ADD COLUMN numero_documento VARCHAR(50) NULL AFTER tipo_documento,
  ADD COLUMN organo_rilascio_documento VARCHAR(150) NULL AFTER numero_documento,
  ADD COLUMN data_rilascio_documento DATE NULL AFTER organo_rilascio_documento,
  ADD COLUMN data_scadenza_documento DATE NULL AFTER data_rilascio_documento;

UPDATE inquilini
SET indirizzo = indirizzo_residenza
WHERE indirizzo IS NULL AND indirizzo_residenza IS NOT NULL;

UPDATE inquilini
SET comune = comune_residenza
WHERE comune IS NULL AND comune_residenza IS NOT NULL;

-- Da questo refactoring in poi rimangono NOT NULL solo:
-- nome, cognome, codice_fiscale e data_nascita.
-- Indirizzo e documento di riconoscimento sono intenzionalmente facoltativi
-- per la creazione dell'inquilino e vengono richiesti solo nei flussi che ne hanno bisogno.
