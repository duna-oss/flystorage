import {CorruptedPathDetected, PathNormalizerV1, PathTraversalDetected} from './path-normalizer.js';

describe('PathNormalizerV1', () => {
    const normalizer = new PathNormalizerV1();
    test.each([
        ['.', ''],
        ['/path/to/dir/.', 'path/to/dir'],
        ['/dirname/', 'dirname'],
        ['dirname/..', ''],
        ['dirname/../', ''],
        ['dirname./', 'dirname.'],
        ['dirname/./', 'dirname'],
        ['dirname/.', 'dirname'],
        ['./dir/../././', ''],
        ['/something/deep/../../dirname', 'dirname'],
        ['00004869/files/other/10-75..stl', '00004869/files/other/10-75..stl'],
        ['/dirname//subdir///subsubdir', 'dirname/subdir/subsubdir'],
        ['example/path/..txt', 'example/path/..txt'],
        ['/example/../path.txt', 'path.txt'],
    ])('normalizing "%s" to "%s"', (path, expected) => {
        expect(normalizer.normalizePath(path)).toEqual(expected);
    });

    test.each([
        ['something/../../../hehe'],
        ['/something/../../..'],
        ['..'],
    ])('detecting path traversal on "%s"', (path) => {
        expect(() => normalizer.normalizePath(path)).toThrow(PathTraversalDetected.forPath(path));
    });

    test.each([
        ['some\0/path.txt'],
        ['s\x09i.php'],
    ])('detecting funky whitespace on "%s"', (path) => {
        expect(() => normalizer.normalizePath(path)).toThrow(CorruptedPathDetected.unexpectedWhitespace(path));
    });
})