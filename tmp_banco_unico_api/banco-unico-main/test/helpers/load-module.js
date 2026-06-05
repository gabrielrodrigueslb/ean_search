const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..", "..");

function clearProjectModules() {
  for (const cacheKey of Object.keys(require.cache)) {
    if (!cacheKey.startsWith(projectRoot)) {
      continue;
    }

    if (cacheKey.includes(`${path.sep}node_modules${path.sep}`)) {
      continue;
    }

    delete require.cache[cacheKey];
  }
}

function applyEnvironment(env) {
  const previousValues = new Map();

  for (const [key, value] of Object.entries(env || {})) {
    previousValues.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = String(value);
  }

  return () => {
    for (const [key, previousValue] of previousValues.entries()) {
      if (previousValue === undefined) {
        delete process.env[key];
        continue;
      }

      process.env[key] = previousValue;
    }
  };
}

function loadModule(testContext, relativeModulePath, options = {}) {
  const { env = {}, mocks = {} } = options;
  const resolvedTarget = path.resolve(projectRoot, relativeModulePath);
  const restoreEnvironment = applyEnvironment(env);
  const restoreMockEntries = [];

  clearProjectModules();

  for (const [request, exports] of Object.entries(mocks)) {
    const resolvedDependency = require.resolve(request, {
      paths: [path.dirname(resolvedTarget)],
    });
    const previousCacheEntry = require.cache[resolvedDependency];

    require.cache[resolvedDependency] = {
      id: resolvedDependency,
      filename: resolvedDependency,
      loaded: true,
      exports,
    };

    restoreMockEntries.push(() => {
      if (previousCacheEntry) {
        require.cache[resolvedDependency] = previousCacheEntry;
        return;
      }

      delete require.cache[resolvedDependency];
    });
  }

  testContext.after(() => {
    clearProjectModules();

    for (const restoreMockEntry of restoreMockEntries.reverse()) {
      restoreMockEntry();
    }

    restoreEnvironment();
  });

  return require(resolvedTarget);
}

module.exports = {
  loadModule,
  projectRoot,
};
