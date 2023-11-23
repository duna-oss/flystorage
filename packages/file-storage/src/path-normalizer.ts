import {join} from 'node:path';

export interface PathNormalizer {
    normalizePath(path: string): string
}

const funkyWhiteSpaceRegex = new RegExp('\\p{C}+', 'u');

export class PathNormalizerV1 implements PathNormalizer {
    normalizePath(path: string): string {
        if (funkyWhiteSpaceRegex.test(path)) {
            throw CorruptedPathDetected.unexpectedWhitespace(path);
        }

        const normalized = join(...(path.split('/')));

        if (normalized.indexOf('../') !== -1 || normalized == '..') {
            throw PathTraversalDetected.forPath(path);
        }

        return normalized === '.' ? '' : normalized;
    }
}

export class CorruptedPathDetected extends Error {
    static unexpectedWhitespace = (path: string) => new CorruptedPathDetected(
        `Corrupted path detected with unexpected whitespace: ${path}`
    );
}

export class PathTraversalDetected extends Error {
    static forPath = (path: string) => new PathTraversalDetected(
        `Path traversal detected for: ${path}`
    );
}