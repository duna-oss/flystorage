import {Readable} from "stream";
import * as SftpClient from 'ssh2-sftp-client';
import {
    StorageAdapter,
    ChecksumOptions,
    CreateDirectoryOptions,
    FileContents, MimeTypeOptions,
    PublicUrlOptions,
    StatEntry, TemporaryUrlOptions,
    WriteOptions,
    PathPrefixer,
    CopyFileOptions,
    MoveFileOptions,
} from "@flystorage/file-storage";

export type SftpStorageOptions = {
    prefix?: string,
}

export interface SftpConnectionProvider {
    connection(): Promise<SftpClient>;
}

export class SftpStorageAdapter implements StorageAdapter {
    private readonly prefixer: PathPrefixer;

    constructor(
        private readonly connectionProvider: SftpConnectionProvider,
        private readonly options: SftpStorageOptions = {},
    ) {
        this.prefixer = new PathPrefixer(options.prefix || '');
    }

    async write(path: string, contents: Readable, options: WriteOptions): Promise<void> {
        throw new Error('Not implemented');
    }

    async read(path: string): Promise<FileContents> {
        throw new Error('Not implemented');
    }
    async deleteFile(path: string): Promise<void> {
        throw new Error('Not implemented');
    }
    async createDirectory(path: string, options: CreateDirectoryOptions): Promise<void> {
        throw new Error('Not implemented');
    }
    async stat(path: string): Promise<StatEntry> {
        throw new Error('Not implemented');
    }
    list(path: string, options: {deep: boolean}): AsyncGenerator<StatEntry> {
        throw new Error('Not implemented');
    }
    async changeVisibility(path: string, visibility: string): Promise<void> {
        throw new Error('Not implemented');
    }
    async visibility(path: string): Promise<string> {
        throw new Error('Not implemented');
    }
    async deleteDirectory(path: string): Promise<void> {
        throw new Error('Not implemented');
    }
    async fileExists(path: string): Promise<boolean> {
        throw new Error('Not implemented');
    }
    async directoryExists(path: string): Promise<boolean> {
        throw new Error('Not implemented');
    }
    async publicUrl(path: string, options: PublicUrlOptions): Promise<string> {
        throw new Error('Not implemented');
    }
    async temporaryUrl(path: string, options: TemporaryUrlOptions): Promise<string> {
        throw new Error('Not implemented');
    }
    async checksum(path: string, options: ChecksumOptions): Promise<string> {
        throw new Error('Not implemented');
    }
    async mimeType(path: string, options: MimeTypeOptions): Promise<string> {
        throw new Error('Not implemented');
    }
    async lastModified(path: string): Promise<number> {
        throw new Error('Not implemented');
    }
    async fileSize(path: string): Promise<number> {
        throw new Error('Not implemented');
    }
    async copyFile(from: string, to: string, options: CopyFileOptions): Promise<void> {
        throw new Error('Not implemented');
    }
    async moveFile(from: string, to: string, options: MoveFileOptions): Promise<void> {
        throw new Error('Not implemented');
    }
}