import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  earlyAccess: true,
  seed: 'ts-node --esm prisma/seed.ts',
})
