import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';

export default [
  {
    input: {
      index: 'src/client/index.ts',
      generate: 'src/client/generate.ts',
      integrate: 'src/client/integrate.ts',
    },
    output: {
      dir: 'public/assets',
      format: 'esm',
      entryFileNames: '[name].bundle.js',
      chunkFileNames: 'chunks/[name]-[hash].js',
      sourcemap: true,
    },
    plugins: [
      // Replace Node-specific env checks with browser-friendly constants
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify('production'),
      }),
      resolve({ browser: true, preferBuiltins: false, mainFields: ['module', 'main', 'browser'] }),
      commonjs(),
      json(),
      typescript({ tsconfig: './tsconfig.client.json' }),
    ],
  },
];
