import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // Default false para não quebrar deploys atuais (pooler com cert próprio).
    // Em produção com CA válido, defina DATABASE_SSL_REJECT_UNAUTHORIZED=true.
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true',
  },
});

export default pool;
