USE gestionale_affitti;

ALTER TABLE inquilini
  ADD COLUMN immobile_id BIGINT UNSIGNED NULL AFTER proprietario_id;

-- Recupera l'associazione dai contratti esistenti.
-- Ha priorità un contratto attivo; in assenza, viene usato il contratto più recente.
UPDATE inquilini q
JOIN (
  SELECT inquilino_id, immobile_id
  FROM (
    SELECT
      c.inquilino_id,
      c.immobile_id,
      ROW_NUMBER() OVER (
        PARTITION BY c.inquilino_id
        ORDER BY
          (CURRENT_DATE BETWEEN c.data_inizio AND c.data_fine) DESC,
          c.data_inizio DESC,
          c.id DESC
      ) AS rn
    FROM contratti c
    WHERE c.deleted_at IS NULL
  ) ranked
  WHERE rn = 1
) associazione ON associazione.inquilino_id = q.id
SET q.immobile_id = associazione.immobile_id
WHERE q.immobile_id IS NULL;

-- Se un proprietario possiede un solo immobile attivo, eventuali inquilini legacy
-- senza contratto possono essere associati senza ambiguità a quell'immobile.
UPDATE inquilini q
JOIN (
  SELECT proprietario_id, MIN(id) AS immobile_id
  FROM immobili
  WHERE deleted_at IS NULL
  GROUP BY proprietario_id
  HAVING COUNT(*) = 1
) unico ON unico.proprietario_id = q.proprietario_id
SET q.immobile_id = unico.immobile_id
WHERE q.immobile_id IS NULL;

ALTER TABLE inquilini
  ADD CONSTRAINT fk_inquilini_immobile
    FOREIGN KEY (immobile_id) REFERENCES immobili(id);

-- Gli eventuali record ancora NULL appartengono a proprietari con più immobili
-- e non sono ricostruibili in modo affidabile dai dati storici.
-- L'applicazione richiede immobile_id per tutte le nuove creazioni/modifiche.
-- Dopo avere associato manualmente eventuali record legacy rimasti senza immobile,
-- è possibile rendere il vincolo fisico obbligatorio con:
--
-- ALTER TABLE inquilini
--   MODIFY immobile_id BIGINT UNSIGNED NOT NULL;

-- Controllo finale: se questa query restituisce righe, l'associazione non era
-- ricostruibile automaticamente perché il proprietario ha più immobili.
SELECT id, nome, cognome, codice_fiscale
FROM inquilini
WHERE immobile_id IS NULL AND deleted_at IS NULL
ORDER BY cognome, nome, id;
