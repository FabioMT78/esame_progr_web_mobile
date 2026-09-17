USE gestionale_affitti;

-- Adegua una tabella pagamenti creata con lo schema precedente.
-- Il codice corrente usa anno_competenza e mese_competenza per individuare
-- in modo univoco la rata mensile di ciascun contratto.

ALTER TABLE pagamenti
  ADD COLUMN anno_competenza SMALLINT UNSIGNED NULL AFTER contratto_id,
  ADD COLUMN mese_competenza TINYINT UNSIGNED NULL AFTER anno_competenza;

-- Compatibilità con eventuali pagamenti legacy.
-- Non esisteva una competenza esplicita nello schema precedente: come migrazione
-- conservativa viene inizializzata con anno e mese della data di pagamento.
UPDATE pagamenti
SET
  anno_competenza = YEAR(data_pagamento),
  mese_competenza = MONTH(data_pagamento)
WHERE anno_competenza IS NULL
   OR mese_competenza IS NULL;

ALTER TABLE pagamenti
  MODIFY anno_competenza SMALLINT UNSIGNED NOT NULL,
  MODIFY mese_competenza TINYINT UNSIGNED NOT NULL,
  ADD CONSTRAINT uq_pagamenti_competenza
    UNIQUE (contratto_id, anno_competenza, mese_competenza),
  ADD CONSTRAINT chk_pagamenti_mese
    CHECK (mese_competenza BETWEEN 1 AND 12);

-- Verifica finale.
SELECT
  id,
  contratto_id,
  anno_competenza,
  mese_competenza,
  importo,
  data_pagamento
FROM pagamenti
ORDER BY contratto_id, anno_competenza, mese_competenza, id;
