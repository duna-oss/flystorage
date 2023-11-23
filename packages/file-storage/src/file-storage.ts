import {Readable} from 'stream';
import {PathNormalizer, PathNormalizerV1} from './path-normalizer.js';

export type CommonStatInfo = Readonly<{
    path: string,
    lastModifiedMs?: number,
    visibility?: string,
}>;

export type FileInfo = Readonly<{
    type: 'file',
    size?: number,
    isFile: true,
    isDirectory: false,
    mimeType?: string,
} & CommonStatInfo>;

export type DirectoryInfo = Readonly<{
    type: 'directory',
    isFile: false,
    isDirectory: true,
} & CommonStatInfo>;

export function isFile(stat: StatEntry): stat is FileInfo {
    return stat.isFile;
}

export function isDirectory(stat: StatEntry): stat is DirectoryInfo {
    return stat.isDirectory;
}

export type StatEntry = FileInfo | DirectoryInfo;

export interface StorageAdapter {
    write(path: string, contents: Readable, options: WriteOptions): Promise<void>;
    read(path: string): Promise<FileContents>;
    deleteFile(path: string): Promise<void>;
    createDirectory(path: string, options: CreateDirectoryOptions): Promise<void>;
    stat(path: string): Promise<StatEntry>;
    list(path: string, deep: boolean): AsyncGenerator<StatEntry>;
    changeVisibility(path: string, visibility: string): Promise<void>;
    visibility(path: string): Promise<string>;
    // fileExists(path: string): Promise<boolean>;
    // directoryExists(path: string): Promise<boolean>;
}

export interface DirectoryListing extends AsyncIterable<StatEntry> {
    toArray(): Promise<StatEntry[]>;
}

export type FileContents = Iterable<any> | AsyncIterable<any> | NodeJS.ReadableStream | Readable;

export type VisibilityOptions = {
    visibility?: string,
    directoryVisibility?: string,
}
export type WriteOptions = VisibilityOptions & {
    mimeType?: string,
    size?: number,
};
export type CreateDirectoryOptions = Pick<VisibilityOptions, 'directoryVisibility'> & {};

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
        const body = toReadable(contents);
        await this.adapter.write(
            this.pathNormalizer.normalizePath(path),
            body,
            Object.assign({}, this.options.writes || {}, options),
        );
        await closeReadable(body);
    }

    public async read(path: string): Promise<Readable> {
        return Readable.from(await this.adapter.read(this.pathNormalizer.normalizePath(path)));
    }

    public async readToString(path: string): Promise<string> {
        const decoder = new TextDecoder();

        return decoder.decode(await readableToUint8Array(await this.read(path)));
    }

    public async readToUint8Array(path: string): Promise<Uint8Array> {
        return readableToUint8Array(await this.read(path));
    }

    public async deleteFile(path: string): Promise<void> {
        await this.adapter.deleteFile(this.pathNormalizer.normalizePath(path));
    }

    public async createDirectory(path: string, options: CreateDirectoryOptions = {}): Promise<void> {
        await this.adapter.createDirectory(path, options);
    }

    public stat(path: string): Promise<StatEntry> {
        return this.adapter.stat(this.pathNormalizer.normalizePath(path));
    }

    public setVisibility(path: string, visibility: string): Promise<void> {
        return this.adapter.changeVisibility(path, visibility);
    }

    public visibility(path: string): Promise<string> {
        return this.adapter.visibility(this.pathNormalizer.normalizePath(path));
    }

    public list(path: string, deep: boolean = false): DirectoryListing {
        const listing = this.adapter.list(this.pathNormalizer.normalizePath(path), deep);

        return {
            async toArray(): Promise<StatEntry[]> {
                const items = [];
                for await (const item of listing) {
                    items.push(item);
                }

                return items;
            },
            async *[Symbol.asyncIterator]() {
                for await (const item of listing) {
                    yield item;
                }
            }
        }
    }

    public async statFile(path: string): Promise<FileInfo> {
        const stat = await this.adapter.stat(this.pathNormalizer.normalizePath(path));

        if (isFile(stat)) {
            return stat;
        }

        throw new Error('Stat entry is not a file');
    }
}

async function closeReadable(body: Readable) {
    if (body.closed) {
        return;
    }

    await new Promise<void>((resolve, reject) => {
        body.on('close', (err: any) => {
            err ? reject(err) : resolve();
        });
        body.destroy();
    });
}

function readableToUint8Array(stream: Readable): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        const parts: Uint8Array[] = [];
        stream.on('data', (chunk: Uint8Array) => {
            parts.push(chunk);
        });
        stream.on('error', reject);
        stream.on('end', () => resolve(concatUint8Arrays(parts)));
    });
}

function concatUint8Arrays(input: Uint8Array[]): Uint8Array {
    const length = input.reduce((l, a) => l + a.byteLength, 0);
    const output = new Uint8Array(length);
    let position = 0;
    input.forEach(i => {
        output.set(i, position);
        position += i.byteLength;
    });

    return output;
}