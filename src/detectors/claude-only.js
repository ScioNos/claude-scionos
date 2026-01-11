// Claude Code Detection Module for claude-scionos
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Detects if Claude Code is installed and returns detailed status
 * @returns {{
 *   installed: boolean, 
 *   path: string|null, 
 *   configPath: string|null, 
 *   cliAvailable: boolean, 
 *   cliPath: string|null, 
 *   details: string,
 *   configFound: boolean
 * }}
 */
function isClaudeCodeInstalled() {
  // Check for Claude Code directory in user home
  const claudeDir = path.join(os.homedir(), '.claude');
  const details = [];

  // 1. Check for Configuration
  let configFound = false;
  if (fs.existsSync(claudeDir)) {
    const settingsPath = path.join(claudeDir, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      configFound = true;
      details.push(`✓ Configuration found at: ${settingsPath}`);
    }
  }

  // 2. Check for Executable (CLI)
  let cliPath = null;

  // 2a. Check Native Install Paths (per official docs)
  const home = os.homedir();
  const nativePaths = process.platform === 'win32' 
    ? [path.join(home, '.local', 'bin', 'claude.exe'), path.join(home, 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'claude.exe')]
    : [path.join(home, '.local', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];

  for (const p of nativePaths) {
    if (fs.existsSync(p)) {
      cliPath = p;
      details.push(`✓ Found native binary: ${p}`);
      break;
    }
  }

  // 2b. Check PATH if not found yet
  if (!cliPath) {
    try {
      const command = process.platform === 'win32' ? 'where claude' : 'which claude';
      const output = execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const foundPath = output.split(/\r?\n/)[0].trim();
      if (foundPath && fs.existsSync(foundPath)) {
        cliPath = foundPath;
        details.push(`✓ Found in PATH: ${foundPath}`);
      }
    } catch {
      // Ignore error if not found in PATH
    }
  }

  // 3. Verify Version (if executable found)
  if (cliPath) {
    try {
      // We use the full path to avoid recursion or alias issues
      const version = execSync(`"${cliPath}" --version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      details.push(`✓ Version: ${version}`);
    } catch (error) {
      details.push(`⚠ Executable found but version check failed: ${error.message}`);
    }
  } else {
    details.push(`✗ Executable 'claude' not found in PATH or standard locations.`);
  }

  return {
    installed: !!cliPath, // STRICT: Only true if the binary is found
    configFound: configFound,
    path: claudeDir,
    configPath: configFound ? path.join(claudeDir, 'settings.json') : null,
    cliAvailable: !!cliPath,
    cliPath: cliPath,
    details: details.join('\n  ')
  };
}

/**
 * Detects operating system and shell information
 * @returns {{platform: string, type: string, shell: string, arch: string}}
 */
function detectOS() {
  const platform = os.platform();
  const arch = os.arch();
  let type, shell;

  switch (platform) {
    case 'darwin':
      type = 'macOS';
      break;
    case 'win32':
      type = 'Windows';
      break;
    case 'linux':
      type = 'Linux';
      break;
    default:
      type = platform;
  }

  // Detect shell
  if (process.platform === 'win32') {
    if (process.env.PSModulePath) {
      shell = 'PowerShell';
    } else if (process.env.WINDIR) {
      shell = 'Command Prompt (CMD)';
    } else {
      shell = 'Windows Shell';
    }
  } else {
    const shellPath = process.env.SHELL || '';
    if (shellPath.includes('zsh')) {
      shell = 'Zsh';
    } else if (shellPath.includes('bash')) {
      shell = 'Bash';
    } else if (shellPath.includes('fish')) {
      shell = 'Fish';
    } else if (shellPath) {
      shell = shellPath.split('/').pop() || 'Unknown Unix Shell';
    } else {
      shell = 'Default Unix Shell';
    }
  }

  return {
    platform,
    type,
    shell,
    arch
  };
}

/**
 * Checks Git Bash availability on Windows (required for Claude Code)
 * @returns {{available: boolean, path: string|null, message: string}}
 */
function checkGitBashOnWindows() {
  if (process.platform !== 'win32') {
    return { available: true, path: null, message: 'Not required on non-Windows systems' };
  }

  const possiblePaths = [
    process.env.CLAUDE_CODE_GIT_BASH_PATH,
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ].filter(Boolean);

  for (const bashPath of possiblePaths) {
    if (fs.existsSync(bashPath)) {
      return {
        available: true,
        path: bashPath,
        message: `Git Bash found at: ${bashPath}`
      };
    }
  }

  return {
    available: false,
    path: null,
    message: 'Git Bash not found. Claude Code requires Git Bash on Windows.'
  };
}

/**
 * Provides installation instructions based on OS and current state
 * @param {Object} osInfo - OS detection result
 * @returns {string} Installation instructions
 */
function getInstallationInstructions(osInfo) {
  let instructions = [];

  if (osInfo.type === 'Windows') {
    instructions.push('\n📋 Installation Instructions for Windows:');
    instructions.push('');
    instructions.push('1. Install Git for Windows (includes Git Bash):');
    instructions.push('   https://git-scm.com/downloads/win');
    instructions.push('');
    instructions.push('2. Install Claude Code CLI:');
    instructions.push('   npm install -g @anthropic-ai/claude-code');
    instructions.push('');
    instructions.push('3. Restart your terminal and try again.');
    instructions.push('');
    instructions.push('💡 If Git Bash is installed but not detected:');
    instructions.push('   set CLAUDE_CODE_GIT_BASH_PATH=C:\\Program Files\\Git\\bin\\bash.exe');
  } else {
    instructions.push('\n📋 Installation Instructions:');
    instructions.push('');
    instructions.push(`Install Claude Code CLI with npm:`);
    instructions.push('   npm install -g @anthropic-ai/claude-code');
    instructions.push('');
    instructions.push('Then restart your terminal and try again.');
  }

  return instructions.join('\n');
}

export {
  isClaudeCodeInstalled,
  detectOS,
  checkGitBashOnWindows,
  getInstallationInstructions
};