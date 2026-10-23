'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(config.dataDir, { recursive: true });
const db = new DatabaseSync(path.join(config.dataDir, 'ticketgo.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS ajustes (k TEXT PRIMARY KEY, v TEXT);

CREATE TABLE IF NOT EXISTS productoras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  descripcion TEXT DEFAULT '',
  logo TEXT,
  whatsapp TEXT DEFAULT '',
  instagram TEXT DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'test',        -- test | activa | suspendida
  comision_pct REAL,                            -- vacío = la general
  comision_fija REAL,
  creado TEXT
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  nombre TEXT DEFAULT '',
  clave TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'productora',       -- admin | productora
  productora_id INTEGER REFERENCES productoras(id) ON DELETE CASCADE,
  creado TEXT,
  ultimo_ingreso TEXT
);

CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  productora_id INTEGER NOT NULL REFERENCES productoras(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  lugar TEXT DEFAULT '',
  fecha TEXT,
  imagen TEXT,
  precio REAL DEFAULT 0,
  cupo INTEGER,
  estado TEXT NOT NULL DEFAULT 'borrador',      -- borrador | publicado | oculto
  venta_activa INTEGER DEFAULT 1,
  cf_uid TEXT, rtmps_url TEXT, rtmps_key TEXT, srt_url TEXT, srt_id TEXT, srt_pass TEXT,
  grabar INTEGER DEFAULT 1,
  repeticion_horas INTEGER DEFAULT 48,
  creado TEXT
);
CREATE INDEX IF NOT EXISTS eventos_prod ON eventos(productora_id);

CREATE TABLE IF NOT EXISTS ordenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  productora_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  nombre TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  cantidad INTEGER NOT NULL DEFAULT 1,
  monto REAL NOT NULL DEFAULT 0,
  comision REAL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendiente',     -- pendiente | procesando | aprobado | rechazado | devuelto | prueba
  token TEXT UNIQUE,
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  email_enviado INTEGER DEFAULT 0,
  creado TEXT,
  modificado TEXT
);
CREATE INDEX IF NOT EXISTS ordenes_evento ON ordenes(evento_id);
CREATE INDEX IF NOT EXISTS ordenes_email ON ordenes(email);

CREATE TABLE IF NOT EXISTS accesos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  orden_id INTEGER REFERENCES ordenes(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL UNIQUE,
  creado TEXT,
  primera_vista TEXT,
  ultima_vista TEXT,
  sesion TEXT,
  sesion_latido INTEGER,
  aperturas INTEGER DEFAULT 0,
  revocado INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS accesos_evento ON accesos(evento_id);
`);

const ajuste = (k, v) => {
  if (v === undefined) {
    const r = db.prepare('SELECT v FROM ajustes WHERE k = ?').get(k);
    return r ? r.v : null;
  }
  db.prepare('INSERT INTO ajustes (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v);
  return v;
};

/** Ejecuta varias operaciones juntas (todo o nada). */
function transaccion(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { db, ajuste, transaccion };
