import { defineConfig } from 'drizzle-kit';
export default defineConfig({ dialect: 'sqlite', schema: './studio/db/schema.ts', out: './drizzle' });
