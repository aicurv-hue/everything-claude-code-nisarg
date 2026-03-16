'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const DEFAULT_INSTALL_CONFIG = 'ecc-install.json';
const CONFIG_SCHEMA_PATH = path.join(__dirname, '..', '..', '..', 'schemas', 'ecc-install-config.schema.json');

let cachedValidator = null;

/**
 * Reads and parses a JSON file, rewriting parse failures with contextual labels.
 */
function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error.message}`);
  }
}

/**
 * Lazily compiles and caches the install config schema validator.
 */
function getValidator() {
  if (cachedValidator) {
    return cachedValidator;
  }

  const schema = readJson(CONFIG_SCHEMA_PATH, 'ecc-install-config.schema.json');
  const ajv = new Ajv({ allErrors: true });
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

/**
 * Returns a de-duplicated list of trimmed string values.
 */
function dedupeStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value).trim()).filter(Boolean))];
}

/**
 * Formats Ajv validation errors into a single human-readable message.
 */
function formatValidationErrors(errors = []) {
  return errors.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ');
}

/**
 * Resolves an install config path relative to the provided working directory.
 */
function resolveInstallConfigPath(configPath, options = {}) {
  if (!configPath) {
    throw new Error('An install config path is required');
  }

  const cwd = options.cwd || process.cwd();
  return path.isAbsolute(configPath)
    ? configPath
    : path.resolve(cwd, configPath);
}

/**
 * Loads, validates, and normalizes an ECC install configuration file.
 */
function loadInstallConfig(configPath, options = {}) {
  const resolvedPath = resolveInstallConfigPath(configPath, options);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Install config not found: ${resolvedPath}`);
  }

  const raw = readJson(resolvedPath, path.basename(resolvedPath));
  const validator = getValidator();

  if (!validator(raw)) {
    throw new Error(
      `Invalid install config ${resolvedPath}: ${formatValidationErrors(validator.errors)}`
    );
  }

  return {
    path: resolvedPath,
    version: raw.version,
    target: raw.target || null,
    profileId: raw.profile || null,
    moduleIds: dedupeStrings(raw.modules),
    includeComponentIds: dedupeStrings(raw.include),
    excludeComponentIds: dedupeStrings(raw.exclude),
    options: raw.options && typeof raw.options === 'object' ? { ...raw.options } : {},
  };
}

module.exports = {
  DEFAULT_INSTALL_CONFIG,
  loadInstallConfig,
  resolveInstallConfigPath,
};
