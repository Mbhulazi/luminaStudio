const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/helpers/setup.js'],
    include: ['tests/**/*.test.js'],
    // sharp's native libvips threadpool is unstable when vitest forks parallel
    // workers on Windows. Run everything in a single process via the forks
    // pool with singleFork — tests run sequentially in one child process.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    maxWorkers: 1,
    minWorkers: 1,
  },
});
