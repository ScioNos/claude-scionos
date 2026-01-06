import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import child_process from 'child_process';
import { isClaudeCodeInstalled, detectOS, checkGitBashOnWindows } from '../src/detectors/claude-only.js';

// Mock modules
vi.mock('fs');
vi.mock('os');
vi.mock('child_process');

describe('System Detectors', () => {
  const originalPlatform = process.platform;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = originalEnv;
  });

  describe('detectOS', () => {
    it('should detect Windows', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.arch).mockReturnValue('x64');
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.WINDIR = 'C:\\Windows'; // Simulate CMD

      const result = detectOS();
      expect(result.type).toBe('Windows');
      expect(result.shell).toBe('Command Prompt (CMD)');
    });

    it('should detect macOS', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.arch).mockReturnValue('arm64');
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env.SHELL = '/bin/zsh';

      const result = detectOS();
      expect(result.type).toBe('macOS');
      expect(result.shell).toBe('Zsh');
    });
  });

  describe('checkGitBashOnWindows', () => {
    it('should return available if Git Bash exists in standard path on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.mocked(fs.existsSync).mockImplementation((p) => p === 'C:\\Program Files\\Git\\bin\\bash.exe');

      const result = checkGitBashOnWindows();
      expect(result.available).toBe(true);
      expect(result.path).toBe('C:\\Program Files\\Git\\bin\\bash.exe');
    });

    it('should return not available if no Git Bash found on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = checkGitBashOnWindows();
      expect(result.available).toBe(false);
    });

    it('should not require Git Bash on non-Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      
      const result = checkGitBashOnWindows();
      expect(result.available).toBe(true);
      expect(result.message).toContain('Not required');
    });
  });

  describe('isClaudeCodeInstalled', () => {
    it('should detect Claude in PATH', () => {
        // Mock homedir to avoid finding config file
        vi.mocked(os.homedir).mockReturnValue('/home/user');
        vi.mocked(fs.existsSync).mockReturnValue(false);

        // Mock execSync to return a path
        vi.mocked(child_process.execSync).mockImplementation((cmd) => {
            if (cmd.includes('which claude') || cmd.includes('where claude')) {
                return '/usr/local/bin/claude';
            }
            if (cmd.includes('--version')) {
                return '0.0.1';
            }
            return '';
        });

        const result = isClaudeCodeInstalled();
        expect(result.installed).toBe(true);
        expect(result.cliAvailable).toBe(true);
        expect(result.cliPath).toBe('/usr/local/bin/claude');
    });

    it('should detect Claude from config file', () => {
        vi.mocked(os.homedir).mockReturnValue('/home/user');
        // Simulate .claude directory and settings.json existence
        vi.mocked(fs.existsSync).mockImplementation((p) => {
            if (p.endsWith('.claude')) return true;
            if (p.endsWith('settings.json')) return true;
            return false;
        });
        
        // Mock reading config
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
            env: { ANTHROPIC_BASE_URL: 'https://api.anthropic.com' }
        }));

        const result = isClaudeCodeInstalled();
        expect(result.installed).toBe(true);
        expect(result.details).toContain('Configuration file found');
    });

    it('should return false if neither CLI nor config found', () => {
        vi.mocked(os.homedir).mockReturnValue('/home/user');
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(child_process.execSync).mockImplementation(() => {
            throw new Error('not found');
        });

        const result = isClaudeCodeInstalled();
        expect(result.installed).toBe(false);
    });
  });
});
