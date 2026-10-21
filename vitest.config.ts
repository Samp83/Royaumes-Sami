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
    // Les tests s'exécutent toujours dans un environnement de test, y compris lorsqu'ils
    // sont lancés par la construction Vercel, où NODE_ENV vaut « production ». Ils ne
    // dépendent ainsi d'aucune variable de l'environnement de production.
    env: { NODE_ENV: 'test' },
    // Le démarrage d'une base PGlite peut prendre plusieurs secondes, davantage encore
    // lorsque plusieurs fichiers de test démarrent la leur en parallèle.
    testTimeout: 35_000,
    hookTimeout: 35_000,
  },
})
