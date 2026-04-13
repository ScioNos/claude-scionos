import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

vi.mock('node:os', () => ({
  default: {
    homedir: vi.fn(),
  },
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

describe('secure Windows token storage', () => {
  const originalPlatform = process.platform;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = {...originalEnv};
    Object.defineProperty(process, 'platform', {value: 'win32'});
    vi.mocked(os.homedir).mockReturnValue('C:\\Users\\tester');
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {value: originalPlatform});
    process.env = originalEnv;
  });

  it('treats an empty Windows token file as missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({size: 0});

    const {getStoredToken} = await import('../src/routerlab.js');

    expect(getStoredToken()).toBeNull();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('fails fast when Windows secure storage writes an empty file', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.statSync).mockReturnValue({size: 0});
    vi.mocked(spawnSync).mockReturnValue({status: 0, stdout: '', stderr: ''});

    const {storeToken} = await import('../src/routerlab.js');

    expect(() => storeToken('dummy-token')).toThrow('Secure token file was created but no encrypted content was written');
  });

  it('reads the Windows token file in Node before decrypting it in PowerShell', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({size: 18});
    vi.mocked(fs.readFileSync).mockReturnValue('encrypted-token');
    vi.mocked(spawnSync).mockReturnValue({status: 0, stdout: 'plain-token', stderr: ''});

    const {getStoredToken} = await import('../src/routerlab.js');

    expect(getStoredToken()).toBe('plain-token');
    expect(fs.readFileSync).toHaveBeenCalledWith(
      'C:\\Users\\tester\\.claude-scionos\\routerlab-token.secure.txt',
      'utf8',
    );
    expect(spawnSync).toHaveBeenCalledWith(
      expect.stringContaining('powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', expect.stringContaining("[System.Convert]::FromBase64String('ZW5jcnlwdGVkLXRva2Vu')")],
      expect.objectContaining({
        encoding: 'utf8',
        env: expect.objectContaining({
          PSModulePath: 'C:\\Program Files\\WindowsPowerShell\\Modules;C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\Modules',
        }),
      }),
    );
  });

  it('encodes the Windows token in base64 when storing it', async () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.statSync).mockReturnValue({size: 12});
    vi.mocked(spawnSync).mockReturnValue({status: 0, stdout: 'encrypted-token', stderr: ''});

    const {storeToken} = await import('../src/routerlab.js');

    storeToken('dummy-token');

    expect(spawnSync).toHaveBeenCalledWith(
      expect.stringContaining('powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', expect.stringContaining("[System.Convert]::FromBase64String('ZHVtbXktdG9rZW4=')")],
      expect.objectContaining({
        encoding: 'utf8',
        env: expect.objectContaining({
          PSModulePath: 'C:\\Program Files\\WindowsPowerShell\\Modules;C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\Modules',
        }),
      }),
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'C:\\Users\\tester\\.claude-scionos\\routerlab-token.secure.txt',
      'encrypted-token',
      'utf8',
    );
  });
});
