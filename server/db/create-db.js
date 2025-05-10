import dotenv from 'dotenv';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Connect to PostgreSQL default database to create our app database
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  database: 'template1', // Connect to default postgres database
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function createDatabase() {
  const client = await pool.connect();

  try {
    const dbName = process.env.DB_NAME || 'tapbattle';
    console.log(`Checking if database ${dbName} exists...`);

    // Check if database exists
    const checkResult = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );

    if (checkResult.rows.length === 0) {
      console.log(`Database ${dbName} does not exist. Creating...`);
      // Create database if it doesn't exist
      // Use template0 to avoid encoding issues
      await client.query(
        `CREATE DATABASE ${dbName} WITH TEMPLATE template0 ENCODING 'UTF8'`
      );
      console.log(`Database ${dbName} created successfully!`);
    } else {
      console.log(`Database ${dbName} already exists.`);
    }
  } catch (error) {
    console.error('Error creating database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the function
createDatabase()
  .then(() => {
    console.log('Database creation process completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Database creation failed:', error);
    process.exit(1);
  });
