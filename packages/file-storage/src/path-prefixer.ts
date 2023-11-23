import {join} from 'node:path';

export class PathPrefixer {
    private readonly prefix: string = '';
    constructor(prefix: string = '') {
        if (prefix.length > 0) {
            this.prefix = join(prefix, '/');
        }
    }

    prefixFilePath(path: string): string {
        return this.prefix.length > 0 ? join(this.prefix, path): path;
    }

    prefixDirectoryPath(path: string): string {
        return this.prefix.length > 0 ?join(this.prefix, path, '/') : join(path, '/');
    }

    stripFilePath(path: string): string {
        return path.substring(this.prefix.length);
    }

    stripDirectoryPath(path: string): string {
        return this.stripFilePath(path).replace(/\/+$/g, '');
    }
}