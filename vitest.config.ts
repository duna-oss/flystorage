import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';

console.log('here', new URL(import.meta.url).pathname);

export default defineConfig({
    plugins: [tsconfigPaths()],
    resolve: {
        alias: [
            {
                // new URL('./src/', import.meta.url).pathname,
                find: /^@flystorage\/(.*)$/,
                replacement: path.join(new URL(import.meta.url).pathname, './packages', '$1'),
            }
        ]
        // alias: {
        //     '@flystorage/file-storage': './packages/file-storage/src/index.ts',
        //     // Add other packages as needed
        // }
    },
    test: {
        globals: true,
        clearMocks: false,
        setupFiles: ['dotenv/config'],
        workspace: [
            'packages/*',
            {extends: true, },
        ],
    },
});