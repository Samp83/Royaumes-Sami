import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Même alias que dans tsconfig.json : « @/ » désigne le répertoire src/.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    // Les tests s'exécutent dans Node.js, sans navigateur simulé.
    environment: 'node',
    // Seuls les fichiers de test placés dans src/ sont exécutés.
    include: ['src/**/*.test.ts'],
    // Le démarrage d'une base PGlite peut prendre plusieurs secondes, davantage encore
    // lorsque plusieurs fichiers de test démarrent la leur en parallèle.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
