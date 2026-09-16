USE gestionale_affitti;

-- Aggiornamento non distruttivo per database già esistenti.
-- I vecchi campi indirizzo_residenza e comune_residenza vengono lasciati
-- temporaneamente per non perdere eventuali dati di test.
-- Il nuovo codice applicativo usa esclusivamente i campi strutturati sotto.

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

-- Recupera ciò che è possibile dai vecchi campi.
UPDATE inquilini
SET indirizzo = indirizzo_residenza
WHERE indirizzo IS NULL AND indirizzo_residenza IS NOT NULL;

UPDATE inquilini
SET comune = comune_residenza
WHERE comune IS NULL AND comune_residenza IS NOT NULL;

-- Gli eventuali inquilini già presenti dovranno essere aperti in modifica
-- e completati con civico, CAP, provincia e dati del documento.
-- Le nuove creazioni e modifiche sono validate obbligatoriamente dal backend.
--
-- Quando tutti i record esistenti saranno stati completati si potranno rendere
-- le nuove colonne NOT NULL e rimuovere i vecchi campi, ad esempio:
--
-- ALTER TABLE inquilini
--   MODIFY indirizzo VARCHAR(150) NOT NULL,
--   MODIFY civico VARCHAR(20) NOT NULL,
--   MODIFY cap CHAR(5) NOT NULL,
--   MODIFY provincia CHAR(2) NOT NULL,
--   MODIFY comune VARCHAR(100) NOT NULL,
--   MODIFY tipo_documento VARCHAR(20) NOT NULL,
--   MODIFY numero_documento VARCHAR(50) NOT NULL,
--   MODIFY organo_rilascio_documento VARCHAR(150) NOT NULL,
--   MODIFY data_rilascio_documento DATE NOT NULL,
--   MODIFY data_scadenza_documento DATE NOT NULL;
--
-- ALTER TABLE inquilini
--   DROP COLUMN indirizzo_residenza,
--   DROP COLUMN comune_residenza;
