-- Schema Final para o Banco de Dados de Curadoria (SQLite)

-- Tabela para gerenciar os canais de elite da curadoria
CREATE TABLE "curated_channels" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT,
    "total_galleries_known" INTEGER DEFAULT 0,
    "last_scraped_at" DATETIME
);

-- Tabela de Modelos
CREATE TABLE "models" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL UNIQUE,
    "slug" TEXT UNIQUE,
    "bio" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Galerias
CREATE TABLE "galleries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "originalId" TEXT,
    "channel_slug" TEXT,
    "title" TEXT NOT NULL,
    "curated_caption" TEXT,
    "status" TEXT NOT NULL DEFAULT 'indexed', -- indexed, scraped, approved, rejected
    "originalRating" INTEGER,
    "originalViews" INTEGER,
    "scraped_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("channel_slug") REFERENCES "curated_channels" ("slug")
);
CREATE UNIQUE INDEX "galleries_channel_slug_originalId_key" ON "galleries"("channel_slug", "originalId");


-- Tabela de Imagens
CREATE TABLE "images" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "galleryId" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL UNIQUE,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("galleryId") REFERENCES "galleries" ("id") ON DELETE CASCADE
);

-- Tabela de Tags
CREATE TABLE "tags" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL UNIQUE
);

-- Tabela de Categorias
CREATE TABLE "categories" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL UNIQUE
);

-- Tabela de Comentários
CREATE TABLE "comments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "galleryId" INTEGER NOT NULL,
    "author" TEXT,
    "text" TEXT NOT NULL,
    "posted_at" DATETIME,
    "scraped_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("galleryId") REFERENCES "galleries" ("id") ON DELETE CASCADE
);

-- --- TABELAS DE JUNÇÃO (Muitos-para-Muitos) ---

-- Junção: Galerias <-> Modelos
CREATE TABLE "gallery_models" (
    "galleryId" INTEGER NOT NULL,
    "modelId" INTEGER NOT NULL,
    PRIMARY KEY ("galleryId", "modelId"),
    FOREIGN KEY ("galleryId") REFERENCES "galleries" ("id") ON DELETE CASCADE,
    FOREIGN KEY ("modelId") REFERENCES "models" ("id") ON DELETE CASCADE
);

-- Junção: Galerias <-> Tags
CREATE TABLE "gallery_tags" (
    "galleryId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    PRIMARY KEY ("galleryId", "tagId"),
    FOREIGN KEY ("galleryId") REFERENCES "galleries" ("id") ON DELETE CASCADE,
    FOREIGN KEY ("tagId") REFERENCES "tags" ("id") ON DELETE CASCADE
);

-- Junção: Galerias <-> Categorias
CREATE TABLE "gallery_categories" (
    "galleryId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    PRIMARY KEY ("galleryId", "categoryId"),
    FOREIGN KEY ("galleryId") REFERENCES "galleries" ("id") ON DELETE CASCADE,
    FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE CASCADE
);

-- Tabelas do sistema de publicação (mantidas para compatibilidade e uso futuro)
CREATE TABLE "editions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL UNIQUE,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "edition_galleries" (
    "editionId" INTEGER NOT NULL,
    "galleryId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("editionId", "galleryId"),
    FOREIGN KEY ("editionId") REFERENCES "editions" ("id") ON DELETE CASCADE,
    FOREIGN KEY ("galleryId") REFERENCES "galleries" ("id") ON DELETE CASCADE
);