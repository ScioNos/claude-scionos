// Claude Code Detection Module for claude-scionos
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Detects if Claude Code is installed and returns detailed status
 * @returns {{installed: boolean, path: string|null, configPath: string|null, cliAvailable: boolean, details: string}}
 */
function isClaudeCodeInstalled() {
  // Check for Claude Code directory in user home
  const claudeDir = path.join(os.homedir(), '.claude');
  const details = [];

  if (fs.existsSync(claudeDir)) {
    details.push(`✓ Found Claude directory: ${claudeDir}`);

    // Check for settings.json to confirm it's actually Claude Code
    const settingsPath = path.join(claudeDir, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      details.push(`✓ Configuration file found: ${settingsPath}`);

      // Try to read the config to see if it's configured
      try {
        const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const hasBaseUrl = config.env?.ANTHROPIC_BASE_URL;
        const hasApiKey = config.env?.ANTHROPIC_API_KEY;

        if (hasBaseUrl && hasApiKey) {
          details.push(`✓ Claude Code is configured with custom API`);
        } else if (hasBaseUrl || hasApiKey) {
          details.push(`⚠ Claude Code is partially configured`);
        } else {
          details.push(`ℹ Claude Code installed but not configured`);
        }
      } catch (error) {
        details.push(`⚠ Could not read configuration file: ${error.message}`);
      }

      return {
        installed: true,
        path: claudeDir,
        configPath: settingsPath,
        cliAvailable: false, // Will check next
        details: details.join('\n  ')
      };
    } else {
      details.push(`⚠ Directory exists but no settings.json found`);
    }
  }

  // Also check for the claude CLI command in PATH
  try {
    const command = process.platform === 'win32' ? 'where claude' : 'which claude';
    const output = execSync(command, { encoding: 'utf8' });
    // On Windows 'where' can return multiple paths, take the first one
    const claudePath = output.split(/\r?\n/)[0].trim();

    if (claudePath) {
      details.push(`✓ Claude CLI found in PATH: ${claudePath}`);

      // Try to get version to confirm it's working
      try {
        const version = execSync('claude --version', { encoding: 'utf8' }).trim();
        details.push(`✓ Version: ${version}`);
      } catch (error) {
        details.push(`⚠ CLI found but version check failed: ${error.message}`);
      }

      return {
        installed: true,
        path: claudeDir && fs.existsSync(claudeDir) ? claudeDir : null,
        configPath: claudeDir && fs.existsSync(path.join(claudeDir, 'settings.json'))
          ? path.join(claudeDir, 'settings.json')
          : null,
        cliAvailable: true,
        cliPath: claudePath,
        details: details.join('\n  ')
      };
    }
  } catch (error) {
    details.push(`✗ Claude CLI not found in PATH: ${error.message}`);
  }

  return {
    installed: false,
    path: null,
    configPath: null,
    cliAvailable: false,
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