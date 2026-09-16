USE gestionale_affitti;

-- Aggiornamento non distruttivo per database già esistenti.
-- Il vecchio dati_catastali TEXT viene lasciato temporaneamente per non perdere
-- eventuali dati di test già inseriti. Il nuovo codice applicativo usa solo
-- le colonne strutturate sotto.

ALTER TABLE immobili
  ADD COLUMN codice_comunale VARCHAR(20) NULL AFTER provincia,
  ADD COLUMN foglio INT UNSIGNED NULL AFTER codice_comunale,
  ADD COLUMN particella INT UNSIGNED NULL AFTER foglio,
  ADD COLUMN subalterno INT UNSIGNED NULL AFTER particella,
  ADD COLUMN zona INT UNSIGNED NULL AFTER subalterno,
  ADD COLUMN categoria VARCHAR(20) NULL AFTER zona,
  ADD COLUMN consistenza DECIMAL(10, 2) NULL AFTER categoria,
  ADD COLUMN rendita DECIMAL(10, 2) NULL AFTER consistenza;

-- Dopo avere verificato/reinserito i dati catastali strutturati, il vecchio
-- campo può essere rimosso manualmente:
-- ALTER TABLE immobili DROP COLUMN dati_catastali;
