import {Config} from 'jest';

const config: Config = {
    automock: false,
    testPathIgnorePatterns: ['/node_modules/', '/bin/'],
    resolver: 'ts-jest-resolver',
    setupFilesAfterEnv: ['dotenv/config'],
    extensionsToTreatAsEsm: ['.ts'],
    transformIgnorePatterns: ['/node_modules/'],
    transform: {
        '\\.ts$': '@swc/jest',
    },
};

export default config;
