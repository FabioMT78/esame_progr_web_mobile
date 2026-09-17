USE gestionale_affitti;

-- Aggiunge l'IBAN senza perdere gli account proprietario già esistenti.
-- Gli account esistenti ricevono temporaneamente stringa vuota:
-- valorizzarli con l'IBAN reale prima di generare/registrare nuovi contratti.
ALTER TABLE proprietari
  ADD COLUMN iban VARCHAR(34) NOT NULL DEFAULT '' AFTER comune_residenza;

-- Le nuove scritture devono fornire esplicitamente l'IBAN.
ALTER TABLE proprietari
  ALTER COLUMN iban DROP DEFAULT;

-- Verifica gli account legacy ancora da completare.
SELECT id, email
FROM proprietari
WHERE iban = '';
