/**
 * Tests for scripts PowerShell resolution helpers
 */

const assert = require('assert');

const {
  getPowerShellCandidates,
  resolveExecutablePath,
  resolvePowerShellCommand,
} = require('./powershell-test-utils');

/**
 * Runs a synchronous test case and prints a small TAP-like result line.
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
 * Executes the PowerShell utility regression suite.
 */
function runTests() {
  console.log('\n=== Testing powershell-test-utils.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('prefers pwsh before Windows PowerShell on Windows', () => {
    assert.deepStrictEqual(getPowerShellCandidates('win32'), ['pwsh', 'pwsh.exe', 'powershell.exe']);
  })) passed++; else failed++;

  if (test('only probes pwsh on non-Windows platforms', () => {
    assert.deepStrictEqual(getPowerShellCandidates('linux'), ['pwsh']);
  })) passed++; else failed++;

  if (test('returns the first available PowerShell candidate', () => {
    const seen = [];
    const fakeSpawn = candidate => {
      seen.push(candidate);
      return {
        error: candidate === 'pwsh' ? new Error('not found') : null,
        status: candidate === 'pwsh.exe' ? 0 : 1,
      };
    };

    const resolved = resolvePowerShellCommand('win32', fakeSpawn);

    assert.strictEqual(resolved, 'pwsh.exe');
    assert.deepStrictEqual(seen, ['pwsh', 'pwsh.exe']);
  })) passed++; else failed++;

  if (test('returns null when no candidate succeeds', () => {
    const fakeSpawn = () => ({ error: new Error('not found'), status: 1 });
    assert.strictEqual(resolvePowerShellCommand('win32', fakeSpawn), null);
  })) passed++; else failed++;

  if (test('returns the first resolved executable path from locator output', () => {
    const fakeExecFile = () => 'C:\\Program Files\\PowerShell\\7\\pwsh.exe\r\nC:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\r\n';
    assert.strictEqual(
      resolveExecutablePath('pwsh', 'win32', fakeExecFile),
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
    );
  })) passed++; else failed++;

  if (test('throws a descriptive error when the locator cannot resolve a path', () => {
    const fakeExecFile = () => {
      const error = new Error('command not found');
      error.stderr = 'INFO: Could not find files for the given pattern.';
      throw error;
    };

    assert.throws(
      () => resolveExecutablePath('pwsh', 'win32', fakeExecFile),
      /Failed to resolve executable path for "pwsh" using where\.exe: INFO: Could not find files for the given pattern\./
    );
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
