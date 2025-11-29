import {type join, posix} from 'node:path';

export class PathPrefixer {
    private readonly prefix: string = '';
    constructor(
        prefix: string = '',
        private readonly separator: string = '/',
        private readonly joinFunc: typeof join = posix.join,
    ) {
        if (prefix.length > 0) {
            this.prefix = this.joinFunc(prefix, this.separator);
        }
    }

    prefixFilePath(path: string): string {
        return this.prefix.length > 0 ? this.joinFunc(this.prefix, path): path;
    }

    prefixDirectoryPath(path: string): string {
        let fullPath = this.prefix.length > 0
            ? this.joinFunc(this.prefix, path)
            : path;

        if (fullPath.length > 0 && !fullPath.endsWith(this.separator)) {
            fullPath = `${fullPath}${this.separator}`;
        }

        return fullPath;
    }

    stripFilePath(path: string): string {
        return path.substring(this.prefix.length);
    }

    stripDirectoryPath(path: string): string {
        return this.stripFilePath(path).replace(/\/+$/g, '');
    }
}