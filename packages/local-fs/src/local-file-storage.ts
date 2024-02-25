import {
    checksumFromStream,
    ChecksumOptions,
    CreateDirectoryOptions,
    PathPrefixer,
    PublicUrlOptions,
    StatEntry,
    StorageAdapter,
    TemporaryUrlOptions,
    WriteOptions,
    CopyFileOptions,
    MoveFileOptions,
    VisibilityOptions,
    MimeTypeOptions
} from '@flystorage/file-storage';
import {createReadStream, createWriteStream, Dirent, Stats} from 'node:fs';
import {chmod, mkdir, opendir, rm, stat, rename, copyFile} from 'node:fs/promises';
import {posix} from 'node:path';
import {Readable} from 'stream';
import {pipeline} from 'stream/promises';
import {PortableUnixVisibilityConversion, UnixVisibilityConversion} from './unix-visibility.js';

export type LocalStorageAdapterOptions = {
    rootDirectoryVisibility?: string,
    publicUrlOptions?: LocalPublicUrlOptions,
    temporaryUrlOptions?: Omit<LocalTemporaryUrlOptions, 'expiresAt'>,
};

export type LocalPublicUrlOptions = PublicUrlOptions & {
    baseUrl?: string,
}

export type LocalPublicUrlGenerator = {
    publicUrl(path: string, options: LocalPublicUrlOptions): Promise<string>;
}

export class BaseUrlLocalPublicUrlGenerator implements LocalPublicUrlGenerator {
    async publicUrl(path: string, options: LocalPublicUrlOptions): Promise<string> {
        if (options.baseUrl === undefined) {
            throw new Error('No base URL defined for public URL generation');
        }

        const base = options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`;

        return `${base}${path}`;
    }
}

export type LocalTemporaryUrlOptions = TemporaryUrlOptions & {
    baseUrl?: string,
}

export type LocalTemporaryUrlGenerator = {
    temporaryUrl(path: string, options: LocalTemporaryUrlOptions): Promise<string>;
}

export class FailingLocalTemporaryUrlGenerator implements LocalTemporaryUrlGenerator {
    async temporaryUrl(): Promise<string> {
        throw new Error('No temporary URL generator provided');
    }
}

export class LocalStorageAdapter implements StorageAdapter {
    private prefixer: PathPrefixer;

    constructor(
        readonly rootDir: string,
        private readonly options: LocalStorageAdapterOptions = {},
        private readonly visibilityConversion: UnixVisibilityConversion = new PortableUnixVisibilityConversion(),
        private readonly publicUrlGenerator: LocalPublicUrlGenerator = new BaseUrlLocalPublicUrlGenerator(),
        private readonly temporaryUrlGenerator: LocalTemporaryUrlGenerator = new FailingLocalTemporaryUrlGenerator(),
    ) {
        this.rootDir = posix.join(this.rootDir, '/');
        this.prefixer = new PathPrefixer(this.rootDir, posix.sep, posix.join);
    }

    async copyFile(from: string, to: string, options: CopyFileOptions): Promise<void> {
        await this.ensureRootDirectoryExists();
        await this.ensureParentDirectoryExists(to, options);
        await copyFile(
            this.prefixer.prefixFilePath(from),
            this.prefixer.prefixFilePath(to),
        );
    }
    async moveFile(from: string, to: string, options: MoveFileOptions): Promise<void> {
        await this.ensureRootDirectoryExists();
        await this.ensureParentDirectoryExists(to, options);
        await rename(
            this.prefixer.prefixFilePath(from),
            this.prefixer.prefixFilePath(to),
        );
    }

    temporaryUrl(path: string, options: TemporaryUrlOptions): Promise<string> {
        return this.temporaryUrlGenerator.temporaryUrl(path, {...this.options.temporaryUrlOptions, ...options});
    }

    publicUrl(path: string, options: PublicUrlOptions): Promise<string> {
        return this.publicUrlGenerator.publicUrl(path, {...this.options.publicUrlOptions, ...options});
    }

    async mimeType(path: string, options: MimeTypeOptions): Promise<string> {
        const location = this.prefixer.prefixFilePath(path);
        const {fileTypeFromFile} = await import('file-type');
        const result = await fileTypeFromFile(location);

        if (result === undefined) {
            throw new Error('Unable to resolve mime-type');
        }

        return result.mime;
    }

    async fileSize(path: string): Promise<number> {
        const stat = await this.stat(path);

        if (!stat.isFile) {
            throw new Error(`Path ${path} is not a file.`);
        }

        if (stat.size === undefined) {
            throw new Error('Stat unexpectedly did not return file size.');
        }

        return stat.size;
    }

    async lastModified(path: string): Promise<number> {
        const stat = await this.stat(path);

        if (!stat.isFile) {
            throw new Error(`Path ${path} is not a file.`);
        }

        if (stat.lastModifiedMs === undefined) {
            throw new Error('Stat unexpectedly did not return last modified.');
        }

        return stat.lastModifiedMs;
    }

    async* list(path: string, {deep}: { deep: boolean }): AsyncGenerator<StatEntry, any, unknown> {
        let entries = await opendir(this.prefixer.prefixDirectoryPath(path), {
            recursive: deep,
        });

        for await (const item of entries) {
            const itemPath = deep ? item.path : posix.join(item.path, item.name);

            yield this.mapStatToEntry(
                item,
                item.isFile()
                    ? this.prefixer.stripFilePath(itemPath)
                    : this.prefixer.stripDirectoryPath(itemPath)
            );
        }
    }

    async read(path: string): Promise<Readable> {
        return createReadStream(this.prefixer.prefixFilePath(path));
    }

    async write(path: string, contents: Readable, options: WriteOptions): Promise<void> {
        await this.ensureRootDirectoryExists();
        await this.ensureParentDirectoryExists(path, options);

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

    async stat(path: string, type: 'file' | 'directory' = 'file'): Promise<StatEntry> {
        return this.mapStatToEntry(
            await stat(type === 'file'
                ? this.prefixer.prefixFilePath(path)
                : this.prefixer.prefixDirectoryPath(path)),
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

    private mapStatToEntry(info: Stats | Dirent, path: string): StatEntry {
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
            visibility: isDirent ? undefined : this.visibilityConversion.directoryPermissionsToVisibility(info.mode & 0o777),
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

    async directoryExists(path: string): Promise<boolean> {
        try {
            const stat = await this.stat(path, 'directory');

            return stat.isDirectory;
        } catch (e) {
            if (typeof e === 'object' && ['ENOTDIR', 'ENOENT'].includes((e as any).code)) {
                return false;
            }

            throw e;
        }
    }

    private rootDirectoryCreation: Promise<void> | undefined = undefined;

    private async ensureRootDirectoryExists(): Promise<void> {
        if (this.rootDirectoryCreation === undefined) {
            this.rootDirectoryCreation = this.createDirectory('', {
                directoryVisibility: this.options.rootDirectoryVisibility ?? this.visibilityConversion.defaultDirectoryVisibility,
            });
        }

        return await this.rootDirectoryCreation;
    }

    private async ensureParentDirectoryExists(path: string, options: VisibilityOptions) {
        const directoryName = posix.dirname(path);

        if (directoryName !== '.' && directoryName !== '/') {
            await this.createDirectory(directoryName, {
                directoryVisibility: options.directoryVisibility,
            });
        }
    }

    async checksum(path: string, options: ChecksumOptions): Promise<string> {
        return checksumFromStream(await this.read(path), options);
    }
}

/**
 * BC export
 *
 * @deprecated
 */
export class LocalFileStorage extends LocalStorageAdapter {}