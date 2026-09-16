CREATE DATABASE IF NOT EXISTS gestionale_affitti
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE gestionale_affitti;

CREATE TABLE proprietari (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nome VARCHAR(100) NOT NULL,
  cognome VARCHAR(100) NOT NULL,
  codice_fiscale CHAR(16) NOT NULL UNIQUE,
  data_nascita DATE NOT NULL,
  indirizzo_residenza VARCHAR(255) NOT NULL,
  comune_residenza VARCHAR(100) NOT NULL,
  immagine_url VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL
);

CREATE TABLE immobili (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proprietario_id BIGINT UNSIGNED NOT NULL,
  titolo VARCHAR(150) NOT NULL,
  via VARCHAR(150) NOT NULL,
  numero_civico VARCHAR(20) NOT NULL,
  cap VARCHAR(10) NOT NULL,
  comune VARCHAR(100) NOT NULL,
  provincia VARCHAR(100) NOT NULL,
  dati_catastali TEXT NULL,
  immagine_url VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT fk_immobili_proprietario
    FOREIGN KEY (proprietario_id) REFERENCES proprietari(id)
);

CREATE TABLE inquilini (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proprietario_id BIGINT UNSIGNED NOT NULL,
  nome VARCHAR(100) NOT NULL,
  cognome VARCHAR(100) NOT NULL,
  codice_fiscale CHAR(16) NOT NULL,
  data_nascita DATE NOT NULL,
  indirizzo_residenza VARCHAR(255) NOT NULL,
  comune_residenza VARCHAR(100) NOT NULL,
  immagine_url VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT uq_inquilini_proprietario_cf
    UNIQUE (proprietario_id, codice_fiscale),
  CONSTRAINT fk_inquilini_proprietario
    FOREIGN KEY (proprietario_id) REFERENCES proprietari(id)
);

CREATE TABLE tipologie_contrattuali (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  denominazione VARCHAR(150) NOT NULL UNIQUE,
  durata SMALLINT UNSIGNED NOT NULL,
  rinnovo SMALLINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_tipologie_durata CHECK (durata > 0),
  CONSTRAINT chk_tipologie_rinnovo CHECK (rinnovo > 0)
);

CREATE TABLE articoli_contratto (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipologia_id BIGINT UNSIGNED NOT NULL,
  num_articolo SMALLINT UNSIGNED NOT NULL,
  num_parte SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  titolo VARCHAR(255) NOT NULL,
  sottotitolo VARCHAR(255) NULL,
  descrizione TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_articoli_tipologia_parte UNIQUE (tipologia_id, num_articolo, num_parte),
  CONSTRAINT fk_articoli_tipologia
    FOREIGN KEY (tipologia_id) REFERENCES tipologie_contrattuali(id)
);

CREATE TABLE contratti (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proprietario_id BIGINT UNSIGNED NOT NULL,
  immobile_id BIGINT UNSIGNED NOT NULL,
  inquilino_id BIGINT UNSIGNED NOT NULL,
  tipologia_id BIGINT UNSIGNED NOT NULL,
  data_inizio DATE NOT NULL,
  data_fine DATE NOT NULL,
  canone_annuale DECIMAL(10, 2) NOT NULL,
  giorno_pagamento TINYINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT chk_contratti_date
    CHECK (data_fine >= data_inizio),
  CONSTRAINT chk_contratti_canone
    CHECK (canone_annuale > 0),
  CONSTRAINT chk_contratti_giorno_pagamento
    CHECK (giorno_pagamento BETWEEN 1 AND 28),
  CONSTRAINT fk_contratti_proprietario
    FOREIGN KEY (proprietario_id) REFERENCES proprietari(id),
  CONSTRAINT fk_contratti_immobile
    FOREIGN KEY (immobile_id) REFERENCES immobili(id),
  CONSTRAINT fk_contratti_inquilino
    FOREIGN KEY (inquilino_id) REFERENCES inquilini(id),
  CONSTRAINT fk_contratti_tipologia
    FOREIGN KEY (tipologia_id) REFERENCES tipologie_contrattuali(id)
);

CREATE TABLE pagamenti (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proprietario_id BIGINT UNSIGNED NOT NULL,
  contratto_id BIGINT UNSIGNED NOT NULL,
  anno_competenza SMALLINT UNSIGNED NOT NULL,
  mese_competenza TINYINT UNSIGNED NOT NULL,
  importo DECIMAL(10, 2) NOT NULL,
  data_pagamento DATE NOT NULL,
  metodo VARCHAR(50) NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT uq_pagamenti_competenza
    UNIQUE (contratto_id, anno_competenza, mese_competenza),
  CONSTRAINT chk_pagamenti_mese
    CHECK (mese_competenza BETWEEN 1 AND 12),
  CONSTRAINT chk_pagamenti_importo
    CHECK (importo > 0),
  CONSTRAINT fk_pagamenti_proprietario
    FOREIGN KEY (proprietario_id) REFERENCES proprietari(id),
  CONSTRAINT fk_pagamenti_contratto
    FOREIGN KEY (contratto_id) REFERENCES contratti(id)
);

CREATE TABLE movimenti (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proprietario_id BIGINT UNSIGNED NOT NULL,
  pagamento_id BIGINT UNSIGNED NULL,
  data_movimento DATE NOT NULL,
  importo DECIMAL(10, 2) NOT NULL,
  descrizione VARCHAR(500) NULL,
  riferimento_esterno VARCHAR(255) NULL,
  hash_riga CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_movimenti_proprietario_hash
    UNIQUE (proprietario_id, hash_riga),
  CONSTRAINT fk_movimenti_proprietario
    FOREIGN KEY (proprietario_id) REFERENCES proprietari(id),
  CONSTRAINT fk_movimenti_pagamento
    FOREIGN KEY (pagamento_id) REFERENCES pagamenti(id)
);
