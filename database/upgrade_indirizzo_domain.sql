USE gestionale_affitti;

-- Allinea le colonne persistenti alle regole del dominio Indirizzo.
-- Le validazioni applicative restano centralizzate nel frontend e nel backend;
-- questi vincoli proteggono soltanto l'integrità dei dati memorizzati.

UPDATE immobili
SET
  provincia = UPPER(TRIM(provincia));

ALTER TABLE proprietari
  MODIFY COLUMN indirizzo_residenza VARCHAR(150) NOT NULL;

ALTER TABLE immobili
  MODIFY COLUMN provincia CHAR(2) NOT NULL,
  ADD CONSTRAINT chk_immobili_provincia
    CHECK (CHAR_LENGTH(provincia) = 2);
