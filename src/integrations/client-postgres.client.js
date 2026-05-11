import { Pool } from "pg";

const DEFAULT_SCHEMA = "public";
const poolCache = new Map();

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function sanitizeSchemaName(value) {
  const schema = normalizeString(value) || DEFAULT_SCHEMA;
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error("Schema do Postgres invalido.");
  }

  return schema;
}

function buildPoolKey(config) {
  return JSON.stringify({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    schema: config.schema,
  });
}

class ClientPostgresClient {
  normalizeConfig(config = {}) {
    const host = normalizeString(config.host);
    const database = normalizeString(config.database);
    const user = normalizeString(config.user);
    const password = normalizeString(config.password);
    const port = Number.parseInt(config.port, 10) || 5432;
    const schema = sanitizeSchemaName(config.schema);

    if (!host || !database || !user || !password) {
      throw new Error("Configuracao do Postgres incompleta. Informe host, database, user e password.");
    }

    return {
      host,
      port,
      database,
      user,
      password,
      schema,
    };
  }

  getPool(config = {}) {
    const normalized = this.normalizeConfig(config);
    const key = buildPoolKey(normalized);

    if (!poolCache.has(key)) {
      poolCache.set(key, new Pool({
        host: normalized.host,
        port: normalized.port,
        database: normalized.database,
        user: normalized.user,
        password: normalized.password,
      }));
    }

    return {
      pool: poolCache.get(key),
      config: normalized,
    };
  }

  async fetchEmbalagens({ top, skip } = {}, credentials = {}) {
    const { pool, config } = this.getPool(credentials);
    const schema = config.schema;
    const limit = Number.parseInt(top, 10) || 100;
    const offset = Number.parseInt(skip, 10) || 0;

    const rowsQuery = `
      select distinct on (codigobarras)
        codigobarras as ean,
        descricao as nome
      from ${schema}.embalagem
      where codigobarras is not null
        and btrim(codigobarras) <> ''
        and descricao is not null
        and btrim(descricao) <> ''
      order by codigobarras, descricao, id
      limit $1
      offset $2
    `;

    const countQuery = `
      select count(distinct codigobarras) as total
      from ${schema}.embalagem
      where codigobarras is not null
        and btrim(codigobarras) <> ''
        and descricao is not null
        and btrim(descricao) <> ''
    `;

    const [rowsResult, countResult] = await Promise.all([
      pool.query(rowsQuery, [limit, offset]),
      pool.query(countQuery),
    ]);

    return {
      items: rowsResult.rows,
      total: Number.parseInt(countResult.rows?.[0]?.total, 10) || 0,
      endpoint: `${schema}.embalagem`,
    };
  }
}

export { ClientPostgresClient };
