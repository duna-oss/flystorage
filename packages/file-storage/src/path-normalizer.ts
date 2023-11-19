export interface PathNormalizer {
    normalizePath(path: string): string
}

const funkyWhiteSpaceRegex = new RegExp('\\p{C}+', 'u');

export class PathNormalizerV1 implements PathNormalizer {
    normalizePath(path: string): string {
        if (funkyWhiteSpaceRegex.test(path)) {
            throw CorruptedPathDetected.unexpectedWhitespace(path);
        }

        const parts: string[] = [];
        const segments = path.split('/');

        for (const segment of segments) {
            if (segment === '' || segment == '.') {
                continue;
            }

            if (segment === '..') {
                if (parts.length === 0) {
                    throw PathTraversalDetected.forPath(path);
                }

                parts.pop();
            } else {
                parts.push(segment);
            }
        }

        return parts.join('/');
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