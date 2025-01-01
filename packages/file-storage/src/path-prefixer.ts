import {join} from 'node:path';

export type PathJoiner = (...paths: string[]) => string;

export class PathPrefixer {
    private readonly prefix: string = '';
    constructor(
        prefix: string = '',
        private readonly separator: string = '/',
        private readonly joinFunc: PathJoiner = join,
    ) {
        if (prefix.length > 0) {
            this.prefix = this.joinFunc(prefix, this.separator);
        }
    }

    prefixFilePath(path: string): string {
        return this.prefix.length > 0 ? this.joinFunc(this.prefix, path): path;
    }

    prefixDirectoryPath(path: string): string {
        return this.prefix.length > 0
            ? this.joinFunc(this.prefix, path, this.separator)
            : this.joinFunc(path, this.separator);
    }

    stripFilePath(path: string): string {
        return path.substring(this.prefix.length);
    }

    stripDirectoryPath(path: string): string {
        return this.stripFilePath(path).replace(/\/+$/g, '');
    }
}