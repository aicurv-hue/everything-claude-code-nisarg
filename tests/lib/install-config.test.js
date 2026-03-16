/**
 * Tests for scripts/lib/install/config.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadInstallConfig,
  resolveInstallConfigPath,
} = require('../../scripts/lib/install/config');

/**
 * Runs a synchronous assertion-based test and records the outcome.
 */
function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    return true;
  } catch (error) {
    console.log(`  \u2717 ${name}`);
    console.log(`    Error: ${error.message}`);
    return false;
  }
}

/**
 * Creates an isolated temporary directory for a test case.
 */
function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Removes a temporary directory tree created for a test case.
 */
function cleanup(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

/**
 * Writes a JSON fixture file, creating parent directories as needed.
 */
function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

/**
 * Executes the install config regression suite.
 */
function runTests() {
  console.log('\n=== Testing install/config.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('resolves relative config paths from the provided cwd', () => {
    const cwd = createTempDir('install-config-cwd-');

    try {
      const resolved = resolveInstallConfigPath('configs/ecc-install.json', { cwd });
      assert.strictEqual(resolved, path.resolve(cwd, 'configs', 'ecc-install.json'));
      assert.ok(path.isAbsolute(resolved));
    } finally {
      cleanup(cwd);
    }
  })) passed++; else failed++;

  if (test('returns an absolute path even when cwd is relative', () => {
    const cwd = path.join('relative', 'workspace');
    const resolved = resolveInstallConfigPath('configs/ecc-install.json', { cwd });
    assert.strictEqual(resolved, path.resolve(cwd, 'configs', 'ecc-install.json'));
    assert.ok(path.isAbsolute(resolved));
  })) passed++; else failed++;

  if (test('loads and normalizes a valid install config', () => {
    const cwd = createTempDir('install-config-');

    try {
      const configPath = path.join(cwd, 'ecc-install.json');
      writeJson(configPath, {
        version: 1,
        target: 'cursor',
        profile: 'developer',
        modules: ['platform-configs', 'platform-configs'],
        include: ['lang:typescript', 'framework:nextjs', 'lang:typescript'],
        exclude: ['capability:media'],
        options: {
          includeExamples: false,
        },
      });

      const config = loadInstallConfig('ecc-install.json', { cwd });
      assert.strictEqual(config.path, configPath);
      assert.strictEqual(config.target, 'cursor');
      assert.strictEqual(config.profileId, 'developer');
      assert.deepStrictEqual(config.moduleIds, ['platform-configs']);
      assert.deepStrictEqual(config.includeComponentIds, ['lang:typescript', 'framework:nextjs']);
      assert.deepStrictEqual(config.excludeComponentIds, ['capability:media']);
      assert.deepStrictEqual(config.options, { includeExamples: false });
    } finally {
      cleanup(cwd);
    }
  })) passed++; else failed++;

  if (test('rejects invalid config schema values', () => {
    const cwd = createTempDir('install-config-');

    try {
      writeJson(path.join(cwd, 'ecc-install.json'), {
        version: 2,
        target: 'ghost-target',
      });

      assert.throws(
        () => loadInstallConfig('ecc-install.json', { cwd }),
        /Invalid install config/
      );
    } finally {
      cleanup(cwd);
    }
  })) passed++; else failed++;

  if (test('fails when the install config does not exist', () => {
    const cwd = createTempDir('install-config-');

    try {
      assert.throws(
        () => loadInstallConfig('ecc-install.json', { cwd }),
        /Install config not found/
      );
    } finally {
      cleanup(cwd);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
