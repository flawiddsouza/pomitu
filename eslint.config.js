import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylisticJs from '@stylistic/eslint-plugin-js'

export default [
    {
        plugins: {
            '@stylistic/js': stylisticJs
        }
    },
    {
        files: [
            '**/*.{js,mjs,cjs,ts}'
        ]
    },
    {
        languageOptions: {
            globals: globals.node
        }
    },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            '@stylistic/js/indent': ['error', 4],
            '@stylistic/js/quotes': ['error', 'single'],
            '@stylistic/js/keyword-spacing': ['error', { before: true, after: true }],
            '@stylistic/js/block-spacing': ['error', 'always'],
            '@stylistic/js/brace-style': ['error', '1tbs', { allowSingleLine: false }],
            '@stylistic/js/function-call-spacing': ['error', 'never'],
            '@stylistic/js/space-before-blocks': ['error', 'always'],
        }
    }
]
