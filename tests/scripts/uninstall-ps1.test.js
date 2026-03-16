/**
 * Tests for uninstall.ps1 wrapper delegation
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { resolveExecutablePath, resolvePowerShellCommand } = require('./powershell-test-utils');

const INSTALL_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'install-apply.js');
const SCRIPT = path.join(__dirname, '..', '..', 'uninstall.ps1');
const PACKAGE_JSON = path.join(__dirname, '..', '..', 'package.json');

/**
 * Creates an isolated temporary directory for a PowerShell wrapper test.
 */
function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Removes a temporary directory tree created by a test.
 */
function cleanup(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

/**
 * Runs the PowerShell uninstaller wrapper and captures its exit status.
 */
function run(powerShellCommand, args = [], options = {}) {
  const env = {
    ...process.env,
    HOME: options.homeDir || process.env.HOME,
    USERPROFILE: options.homeDir || process.env.USERPROFILE,
    ...options.env,
  };

  const scriptPath = options.scriptPath || SCRIPT;

  try {
    const stdout = execFileSync(powerShellCommand, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args], {
      cwd: options.cwd,
      env,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });

    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: error.status || 1,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
    };
  }
}

/**
 * Runs a synchronous assertion-based test and prints the result.
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
 * Executes the uninstall.ps1 wrapper regression suite.
 */
function runTests() {
  console.log('\n=== Testing uninstall.ps1 ===\n');

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const powerShellCommand = resolvePowerShellCommand();

  if (test('publishes the uninstall wrapper entrypoints in the package file list', () => {
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
    assert.ok(packageJson.files.includes('uninstall.sh'));
    assert.ok(packageJson.files.includes('uninstall.ps1'));
  })) passed++; else failed++;

  if (!powerShellCommand) {
    console.log('  - skipped delegation test; PowerShell is not available in PATH');
    skipped++;
  } else if (test('delegates to the Node uninstaller and preserves dry-run output', () => {
    const homeDir = createTempDir('uninstall-ps1-home-');
    const projectDir = createTempDir('uninstall-ps1-project-');

    try {
      execFileSync('node', [INSTALL_SCRIPT, '--target', 'cursor', 'typescript'], {
        cwd: projectDir,
        env: {
          ...process.env,
          HOME: homeDir,
          USERPROFILE: homeDir,
        },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000,
      });

      const statePath = path.join(projectDir, '.cursor', 'ecc-install-state.json');
      assert.ok(fs.existsSync(statePath));

      const result = run(powerShellCommand, ['--target', 'cursor', '--dry-run', '--json'], {
        cwd: projectDir,
        homeDir,
      });

      assert.strictEqual(result.code, 0, result.stderr);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.dryRun, true);
      assert.strictEqual(parsed.summary.plannedRemovalCount, 1);
      assert.ok(fs.existsSync(statePath));
    } finally {
      cleanup(homeDir);
      cleanup(projectDir);
    }
  })) passed++; else failed++;

  if (!powerShellCommand) {
    console.log('  - skipped missing-node preflight test; PowerShell is not available in PATH');
    skipped++;
  } else if (test('surfaces a friendly error when Node.js is not available in PATH', () => {
    const powerShellPath = resolveExecutablePath(powerShellCommand);
    const emptyPathDir = createTempDir('uninstall-ps1-path-');
    const homeDir = createTempDir('uninstall-ps1-home-');
    const projectDir = createTempDir('uninstall-ps1-project-');

    try {
      const result = run(powerShellPath, ['--dry-run'], {
        cwd: projectDir,
        homeDir,
        env: {
          PATH: emptyPathDir,
        },
      });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('Node.js was not found in PATH. Please install Node.js and try again.'));
    } finally {
      cleanup(emptyPathDir);
      cleanup(homeDir);
      cleanup(projectDir);
    }
  })) passed++; else failed++;

  if (!powerShellCommand) {
    console.log('  - skipped missing-script preflight test; PowerShell is not available in PATH');
    skipped++;
  } else if (test('surfaces a friendly error when the uninstaller runtime script is missing', () => {
    const wrapperDir = createTempDir('uninstall-ps1-wrapper-');
    const homeDir = createTempDir('uninstall-ps1-home-');
    const projectDir = createTempDir('uninstall-ps1-project-');
    const wrapperScript = path.join(wrapperDir, 'uninstall.ps1');

    try {
      fs.copyFileSync(SCRIPT, wrapperScript);

      const result = run(powerShellCommand, ['--dry-run'], {
        cwd: projectDir,
        homeDir,
        scriptPath: wrapperScript,
      });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes(`Uninstaller script not found: ${path.join(wrapperDir, 'scripts', 'uninstall.js')}`));
    } finally {
      cleanup(wrapperDir);
      cleanup(homeDir);
      cleanup(projectDir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}, Skipped: ${skipped}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
