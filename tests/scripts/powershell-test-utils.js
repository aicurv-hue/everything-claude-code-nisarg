const { execFileSync, spawnSync } = require('child_process');

/**
 * Returns the preferred PowerShell executable candidates for a platform.
 */
function getPowerShellCandidates(platform = process.platform) {
  return platform === 'win32'
    ? ['pwsh', 'pwsh.exe', 'powershell.exe']
    : ['pwsh'];
}

/**
 * Resolves the first PowerShell candidate that can execute successfully.
 */
function resolvePowerShellCommand(platform = process.platform, spawn = spawnSync) {
  const candidates = getPowerShellCandidates(platform);

  for (const candidate of candidates) {
    const result = spawn(
      candidate,
      ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'],
      {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      }
    );

    if (!result.error && result.status === 0) {
      return candidate;
    }
  }

  return null;
}

/**
 * Resolves an executable's absolute path using the platform locator command.
 */
function resolveExecutablePath(command, platform = process.platform, execFile = execFileSync) {
  const locator = platform === 'win32' ? 'where.exe' : 'which';

  try {
    const output = execFile(locator, [command], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    const executablePath = output
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean);

    if (!executablePath) {
      throw new Error(`No executable path was returned for "${command}".`);
    }

    return executablePath;
  } catch (error) {
    const details = [error.stderr, error.stdout, error.message]
      .map(value => typeof value === 'string' ? value.trim() : '')
      .find(Boolean);

    throw new Error(
      `Failed to resolve executable path for "${command}" using ${locator}: ${details || 'unknown error'}`,
      { cause: error }
    );
  }
}

module.exports = {
  getPowerShellCandidates,
  resolveExecutablePath,
  resolvePowerShellCommand,
};
