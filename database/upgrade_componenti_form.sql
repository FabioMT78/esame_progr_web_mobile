USE gestionale_affitti;

-- 1. Uniforma i nomi dell'indirizzo degli immobili a quelli usati dagli altri form.
-- Eseguire una sola volta sul database esistente.
ALTER TABLE immobili
  CHANGE COLUMN via indirizzo VARCHAR(150) NOT NULL,
  CHANGE COLUMN numero_civico civico VARCHAR(20) NULL;

-- 2. Nella pagina "Nuovo inquilino" solo i dati anagrafici sono obbligatori.
-- Indirizzo e documento restano persistibili, ma possono essere NULL.
ALTER TABLE inquilini
  MODIFY COLUMN indirizzo VARCHAR(150) NULL,
  MODIFY COLUMN civico VARCHAR(20) NULL,
  MODIFY COLUMN cap CHAR(5) NULL,
  MODIFY COLUMN provincia CHAR(2) NULL,
  MODIFY COLUMN comune VARCHAR(100) NULL,
  MODIFY COLUMN tipo_documento VARCHAR(20) NULL,
  MODIFY COLUMN numero_documento VARCHAR(50) NULL,
  MODIFY COLUMN organo_rilascio_documento VARCHAR(150) NULL,
  MODIFY COLUMN data_rilascio_documento DATE NULL,
  MODIFY COLUMN data_scadenza_documento DATE NULL;
