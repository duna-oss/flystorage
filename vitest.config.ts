import { defineConfig } from 'vitest/config';

export default defineConfig({
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