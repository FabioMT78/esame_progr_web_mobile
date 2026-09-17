USE gestionale_affitti;

-- Bozza persistente del wizard di registrazione contratto.
-- Una sola bozza attiva per proprietario autenticato.
CREATE TABLE IF NOT EXISTS bozze_contratto (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proprietario_id BIGINT UNSIGNED NOT NULL,
  immobile_id BIGINT UNSIGNED NULL,
  inquilino_id BIGINT UNSIGNED NULL,
  step_completato TINYINT UNSIGNED NOT NULL DEFAULT 0,
  dati JSON NOT NULL,
  pagina_provenienza VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT uq_bozze_contratto_proprietario
    UNIQUE (proprietario_id),

  CONSTRAINT chk_bozze_contratto_step
    CHECK (step_completato BETWEEN 0 AND 3),

  CONSTRAINT fk_bozze_contratto_proprietario
    FOREIGN KEY (proprietario_id) REFERENCES proprietari(id),

  CONSTRAINT fk_bozze_contratto_immobile
    FOREIGN KEY (immobile_id) REFERENCES immobili(id),

  CONSTRAINT fk_bozze_contratto_inquilino
    FOREIGN KEY (inquilino_id) REFERENCES inquilini(id)
);
