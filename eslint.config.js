import globals from 'globals';
import pluginJs from '@eslint/js';

export default [
  {
    languageOptions: { 
        globals: {
            ...globals.node,
            ...globals.builtin,
        }
    }
  },
  pluginJs.configs.recommended,
  {
    rules: {
        'no-console': 'off',
        'no-process-exit': 'off',
    }
  }
];
