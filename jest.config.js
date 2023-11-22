import presets from "ts-jest/presets/index.js";

export default {
    ...presets.jsWithTsESM,
    testPathIgnorePatterns: ['/node_modules/', '/bin/'],
    resolver: "ts-jest-resolver",
    moduleNameMapper: {
        '^@flystorage/(.*)$': '<rootDir>/packages/$1/src/',
    },
    extensionsToTreatAsEsm: ['.ts'],
    transform: {
        '\\.[jt]sx?$': [
            'ts-jest',
            {
                diagnostics: {
                    ignoreCodes: [1343]
                },
                // astTransformers: {
                //     before: [
                //         {
                //             path: 'node_modules/ts-jest-mock-import-meta',  // or, alternatively, 'ts-jest-mock-import-meta' directly, without node_modules.
                //             options: { metaObjectReplacement: { url: 'https://www.url.com' } }
                //         }
                //     ]
                // },
                tsconfig: 'tsconfig.json',
                useESM: true,
            },
        ],
    },
};
