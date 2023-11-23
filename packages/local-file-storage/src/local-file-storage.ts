import {
    CreateDirectoryOptions,
    FileContents,
    PathPrefixer,
    StatEntry,
    StorageAdapter,
    WriteOptions
} from '@flystorage/file-storage';
import {createReadStream, createWriteStream, Dirent, Stats} from 'node:fs';
import {chmod, mkdir, opendir, stat, unlink} from 'node:fs/promises';
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

    async *list(path: string, deep: boolean): AsyncGenerator<StatEntry, any, unknown> {
        let entries = await opendir(this.prefixer.prefixDirectoryPath(path), {
            recursive: deep,
        });

        for await (const item of entries) {
            yield this.mapStatToFileInfo(
                item,
                item.isFile()
                    ? this.prefixer.stripFilePath(item.path)
                    : this.prefixer.stripDirectoryPath(item.path)
            );
        }
    }

    async read(path: string): Promise<FileContents> {
        return createReadStream(this.prefixer.prefixFilePath(path));
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

    async createDirectory(path: string, options: CreateDirectoryOptions): Promise<void> {
        await mkdir(this.prefixer.prefixDirectoryPath(path), {
            recursive: true,
            mode: options.directoryVisibility
                ? this.visibility.visibilityToDirectoryPermissions(options.directoryVisibility)
                : undefined,
        });
    }

    async stat(path: string): Promise<StatEntry> {
        return this.mapStatToFileInfo(
            await stat(this.prefixer.prefixFilePath(path)),
            path,
        );
    }

    private mapStatToFileInfo(info: Stats | Dirent, path: string): StatEntry {
        if (!info.isFile() && !info.isDirectory()) {
            throw new Error('Unsupported file entry encountered...');
        }

        const isDirent = info instanceof Dirent;

        return info.isFile() ? {
            path,
            type: 'file',
            isFile: true,
            isDirectory: false,
            visibility: isDirent ? undefined : this.visibility.filePermissionsToVisibility(info.mode & 0o777),
            lastModifiedMs: isDirent ? undefined : info.mtimeMs,
            size: isDirent ? undefined : info.size,
        } : {
            path,
            type: 'directory',
            isFile: false,
            isDirectory: true,
            visibility: isDirent ? undefined :this.visibility.directoryPermissionsToVisibility(info.mode & 0o777),
            lastModifiedMs: isDirent ? undefined : info.mtimeMs,
        };
    }

    async setVisibility(path: string, visibility: string): Promise<void> {
        await chmod(
            this.prefixer.prefixFilePath(path),
            this.visibility.visibilityToFilePermissions(visibility),
        );
    }
}