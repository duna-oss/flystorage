import {
    CreateDirectoryOptions,
    FileContents,
    PathPrefixer,
    StatEntry,
    StorageAdapter,
    WriteOptions
} from '@flystorage/file-storage';
import {createReadStream, createWriteStream, Dirent, Stats} from 'node:fs';
import {chmod, mkdir, opendir, stat, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {Readable} from 'stream';
import {pipeline} from 'stream/promises';
import {PortableUnixVisibilityConversion, UnixVisibilityConversion} from './unix-visibility.js';

export class LocalFileStorage implements StorageAdapter {
    private prefixer: PathPrefixer;

    constructor(
        readonly rootDir: string,
        private readonly visibilityConversion: UnixVisibilityConversion = new PortableUnixVisibilityConversion(),
    ) {
        this.prefixer = new PathPrefixer(this.rootDir);
    }

    async *list(path: string, {deep}: {deep: boolean}): AsyncGenerator<StatEntry, any, unknown> {
        let entries = await opendir(this.prefixer.prefixDirectoryPath(path), {
            recursive: deep,
        });

        for await (const item of entries) {
            const itemPath = join(item.path, item.name);
            yield this.mapStatToFileInfo(
                item,
                item.isFile()
                    ? this.prefixer.stripFilePath(itemPath)
                    : this.prefixer.stripDirectoryPath(itemPath)
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
                    ? this.visibilityConversion.visibilityToFilePermissions(options.visibility)
                    : undefined,
            },
        );

        await pipeline(contents, writeStream);
    }

    async deleteFile(path: string): Promise<void> {
        await rm(this.prefixer.prefixFilePath(path), {
            force: true,
        });
    }

    async createDirectory(path: string, options: CreateDirectoryOptions): Promise<void> {
        await mkdir(this.prefixer.prefixDirectoryPath(path), {
            recursive: true,
            mode: options.directoryVisibility
                ? this.visibilityConversion.visibilityToDirectoryPermissions(options.directoryVisibility)
                : undefined,
        });
    }

    async stat(path: string): Promise<StatEntry> {
        return this.mapStatToFileInfo(
            await stat(this.prefixer.prefixFilePath(path)),
            path,
        );
    }

    async fileExists(path: string): Promise<boolean> {
        try {
            const stat = await this.stat(path);

            return stat.isFile;
        } catch (e) {
            if (typeof e === 'object' && (e as any).code === 'ENOENT') {
                return false;
            }

            throw e;
        }
    }

    async deleteDirectory(path: string): Promise<void> {
        await rm(this.prefixer.prefixDirectoryPath(path), {
            recursive: true,
            force: true,
        });
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
            visibility: isDirent ? undefined : this.visibilityConversion.filePermissionsToVisibility(info.mode & 0o777),
            lastModifiedMs: isDirent ? undefined : info.mtimeMs,
            size: isDirent ? undefined : info.size,
        } : {
            path,
            type: 'directory',
            isFile: false,
            isDirectory: true,
            visibility: isDirent ? undefined :this.visibilityConversion.directoryPermissionsToVisibility(info.mode & 0o777),
            lastModifiedMs: isDirent ? undefined : info.mtimeMs,
        };
    }

    async changeVisibility(path: string, visibility: string): Promise<void> {
        await chmod(
            this.prefixer.prefixFilePath(path),
            this.visibilityConversion.visibilityToFilePermissions(visibility),
        );
    }

    async visibility(path: string): Promise<string> {
        const stat = await this.stat(path);

        if (!stat.visibility) {
            throw new Error('Unable to determine visibility');
        }

        return stat.visibility;
    }
}