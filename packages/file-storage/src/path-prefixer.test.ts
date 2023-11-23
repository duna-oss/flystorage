import {PathPrefixer} from './path-prefixer.js';

describe('PathPrefixer', () => {
    describe.each([
        ['with', '/prefix/'],
        ['without', '/prefix'],
    ])('prefixing %s a trailing slash prefix', (_name, prefix: string) => {
        const prefixer = new PathPrefixer(prefix);

        test('prefixing a file path with a leading slash', () => {
            expect(prefixer.prefixFilePath('/file.txt')).toEqual('/prefix/file.txt');
        });

        test('prefixing a file path without a leading slash', () => {
            expect(prefixer.prefixFilePath('file.txt')).toEqual('/prefix/file.txt');
        });

        test('prefixing a directory path with a leading slash', () => {
            expect(prefixer.prefixDirectoryPath('/dirname')).toEqual('/prefix/dirname/');
        });

        test('prefixing a directory path with a trailing slash', () => {
            expect(prefixer.prefixDirectoryPath('dirname/')).toEqual('/prefix/dirname/');
        });
    });

    describe.each([
        ['with', '/prefix/'],
        ['without', '/prefix'],
    ])('stripping %s a trailing slash prefix', (_name, prefix: string) => {
        const prefixer = new PathPrefixer(prefix);

        test('stripping a file path', () => {
            expect(prefixer.stripFilePath('/prefix/file.txt')).toEqual('file.txt');
        });

        test('stripping a directory path without a trailing slash', () => {
            expect(prefixer.stripDirectoryPath('/prefix/dirname')).toEqual('dirname');
        });

        test('prefixing a directory path with a trailing slash', () => {
            expect(prefixer.stripDirectoryPath('/prefix/dirname/')).toEqual('dirname');
        });
    });

    describe('prefixing with an empty prefix', () => {
        const prefixer = new PathPrefixer();

        test('prefixing with a file path with leading slash', () => {
            expect(prefixer.prefixFilePath('/file.txt')).toEqual('/file.txt');
        });

        test('prefixing with a directory path with leading slash', () => {
            expect(prefixer.prefixDirectoryPath('/directory')).toEqual('/directory/');
        });
    })
});