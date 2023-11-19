import {Readable} from 'stream';
import {PathNormalizer, PathNormalizerV1} from './path-normalizer.js';

export interface StorageAdapter {
    write(path: string, contents: Readable, options: WriteOptions): Promise<void>;
    deleteFile(path: string): Promise<void>;
}

export type FileContents = Iterable<any> | AsyncIterable<any> | NodeJS.ReadableStream | Readable;

export type VisibilityOptions = {
    visibility?: string,
    directoryVisibility?: string,
}
export type WriteOptions = VisibilityOptions & {};

export type ConfigurationOptions = {
    defaults?: VisibilityOptions,
    writes?: WriteOptions,
}

function toReadable(contents: FileContents): Readable {
    if (contents instanceof Readable) {
        return contents;
    }

    return Readable.from(contents);
}


export class FileStorage {
    constructor(
        private readonly adapter: StorageAdapter,
        private readonly pathNormalizer: PathNormalizer = new PathNormalizerV1(),
        private readonly options: ConfigurationOptions = {},
    ) {
    }

    public async write(path: string, contents: FileContents, options: WriteOptions = {}): Promise<void> {
        let body = toReadable(contents);

        await this.adapter.write(
            this.pathNormalizer.normalizePath(path),
            body,
            Object.assign({}, this.options.writes || {}, options),
        );

        if (!body.closed) {
            const close = new Promise<void>((resolve, reject) => {
                body.on('close', (err: any) => {
                    err ? reject(err) : resolve();
                })
            });
            body.destroy();
            await close;
        }
    }

    public async deleteFile(path: string): Promise<void> {
        await this.adapter.deleteFile(this.pathNormalizer.normalizePath(path));
    }
}