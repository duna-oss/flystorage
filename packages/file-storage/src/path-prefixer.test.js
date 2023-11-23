"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var path_prefixer_js_1 = require("./path-prefixer.js");
describe('PathPrefixer', function () {
    describe.each([
        ['with', '/prefix/'],
        ['without', '/prefix'],
    ])('prefixing %s a trailing slash prefix', function (_name, prefix) {
        var prefixer = new path_prefixer_js_1.PathPrefixer(prefix);
        test('prefixing a file path with a leading slash', function () {
            expect(prefixer.prefixFilePath('/file.txt')).toEqual('/prefix/file.txt');
        });
        test('prefixing a file path without a leading slash', function () {
            expect(prefixer.prefixFilePath('file.txt')).toEqual('/prefix/file.txt');
        });
        test('prefixing a directory path with a leading slash', function () {
            expect(prefixer.prefixDirectoryPath('/dirname')).toEqual('/prefix/dirname/');
        });
        test('prefixing a directory path with a trailing slash', function () {
            expect(prefixer.prefixDirectoryPath('dirname/')).toEqual('/prefix/dirname/');
        });
    });
    describe.each([
        ['with', '/prefix/'],
        ['without', '/prefix'],
    ])('stripping %s a trailing slash prefix', function (_name, prefix) {
        var prefixer = new path_prefixer_js_1.PathPrefixer(prefix);
        test('stripping a file path', function () {
            expect(prefixer.stripFilePath('/prefix/file.txt')).toEqual('file.txt');
        });
        test('stripping a directory path without a trailing slash', function () {
            expect(prefixer.stripDirectoryPath('/prefix/dirname')).toEqual('dirname');
        });
        test('prefixing a directory path with a trailing slash', function () {
            expect(prefixer.stripDirectoryPath('/prefix/dirname/')).toEqual('dirname');
        });
    });
    describe('prefixing with an empty prefix', function () {
        var prefixer = new path_prefixer_js_1.PathPrefixer();
        test('prefixing with a file path with leading slash', function () {
            expect(prefixer.prefixFilePath('/file.txt')).toEqual('/file.txt');
        });
        test('prefixing with a directory path with leading slash', function () {
            expect(prefixer.prefixDirectoryPath('/directory')).toEqual('/directory/');
        });
    });
});
