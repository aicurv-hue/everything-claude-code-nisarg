/**
 * Tests for uninstall.sh wrapper delegation
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const INSTALL_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'install-apply.js');
const SCRIPT = path.join(__dirname, '..', '..', 'uninstall.sh');

/**
 * Creates an isolated temporary directory for a shell wrapper test.
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
 * Runs the shell uninstaller wrapper and captures its exit status.
 */
function run(args = [], options = {}) {
  const env = {
    ...process.env,
    HOME: options.homeDir || process.env.HOME,
    ...options.env,
  };
  const scriptPath = options.scriptPath || SCRIPT;

  try {
    const stdout = execFileSync('bash', [scriptPath, ...args], {
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
 * Executes the uninstall.sh wrapper regression suite.
 */
function runTests() {
  console.log('\n=== Testing uninstall.sh ===\n');

  let passed = 0;
  let failed = 0;

  if (process.platform === 'win32') {
    console.log('  - skipped on Windows; uninstall.ps1 covers the native wrapper path');
    console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
    process.exit(0);
  }

  if (test('delegates to the Node uninstaller and preserves dry-run output', () => {
    const homeDir = createTempDir('uninstall-sh-home-');
    const projectDir = createTempDir('uninstall-sh-project-');

    try {
      execFileSync('node', [INSTALL_SCRIPT, '--target', 'cursor', 'typescript'], {
        cwd: projectDir,
        env: {
          ...process.env,
          HOME: homeDir,
        },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000,
      });

      const statePath = path.join(projectDir, '.cursor', 'ecc-install-state.json');
      assert.ok(fs.existsSync(statePath));

      const result = run(['--target', 'cursor', '--dry-run', '--json'], {
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

  if (test('surfaces a friendly error when Node.js is not available in PATH', () => {
    const emptyPathDir = createTempDir('uninstall-sh-path-');
    const homeDir = createTempDir('uninstall-sh-home-');
    const projectDir = createTempDir('uninstall-sh-project-');

    try {
      const result = run(['--dry-run'], {
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

  if (test('surfaces a friendly error when the uninstaller runtime script is missing', () => {
    const wrapperDir = createTempDir('uninstall-sh-wrapper-');
    const homeDir = createTempDir('uninstall-sh-home-');
    const projectDir = createTempDir('uninstall-sh-project-');
    const wrapperScript = path.join(wrapperDir, 'uninstall.sh');

    try {
      fs.copyFileSync(SCRIPT, wrapperScript);

      const result = run(['--dry-run'], {
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

  if (test('fails with a clear error when symlink resolution exceeds the depth limit', () => {
    const wrapperDir = createTempDir('uninstall-sh-links-');
    const homeDir = createTempDir('uninstall-sh-home-');
    const projectDir = createTempDir('uninstall-sh-project-');
    const targetScript = path.join(wrapperDir, 'target-uninstall.sh');
    const firstLink = path.join(wrapperDir, 'link-0.sh');

    try {
      fs.copyFileSync(SCRIPT, targetScript);

      let previousPath = targetScript;
      for (let index = 32; index >= 0; index -= 1) {
        const linkPath = path.join(wrapperDir, `link-${index}.sh`);
        fs.symlinkSync(previousPath, linkPath);
        previousPath = linkPath;
      }

      const result = run(['--dry-run'], {
        cwd: projectDir,
        homeDir,
        scriptPath: firstLink,
      });

      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('Exceeded symlink resolution depth limit (32) while resolving script path:'));
    } finally {
      cleanup(wrapperDir);
      cleanup(homeDir);
      cleanup(projectDir);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
