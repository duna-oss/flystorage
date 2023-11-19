import {createWriteStream} from 'node:fs';
import {unlink} from 'node:fs/promises';
import {PathPrefixer, StorageAdapter, WriteOptions} from '@flystorage/file-storage';
import {Readable} from 'stream';
import {pipeline} from 'stream/promises';
import {PortableUnixVisibilityConversion, UnixVisibilityConversion} from './unix-visibility.js';

export class LocalFileStorage implements StorageAdapter {
    private prefixer: PathPrefixer;

    constructor(
        readonly rootDir: string,
        private readonly visibility: UnixVisibilityConversion = new PortableUnixVisibilityConversion(),
    ) {
        this.prefixer = new PathPrefixer(this.rootDir);
    }

    async write(path: string, contents: Readable, options: WriteOptions): Promise<void> {
        const writeStream = createWriteStream(
            this.prefixer.prefixFilePath(path),
            {
                flags: 'w+',
                mode: options.visibility
                    ? this.visibility.visibilityToFilePermissions(options.visibility)
                    : undefined,
            },
        );

        await pipeline(contents, writeStream);
    }

    async deleteFile(path: string): Promise<void> {
        try {
            await unlink(this.prefixer.prefixFilePath(path));
        } catch (err) {
            if ((err as any).code !== 'ENOENT') {
                throw err;
            }
        }
    }
}