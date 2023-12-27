import {
    ChecksumOptions,
    CopyFileOptions,
    CreateDirectoryOptions,
    FileContents,
    MimeTypeOptions,
    MiscellaneousOptions,
    MoveFileOptions,
    StatEntry,
    StorageAdapter,
    TemporaryUrlOptions,
    WriteOptions,
} from '@flystorage/file-storage';
import {Readable} from 'stream';

export type AnyAdapterMethodName = keyof StorageAdapter;

export interface ChaosStrategy {
    maybeGoNuts(method: AnyAdapterMethodName): void;
}

export class AlwaysThrowError implements ChaosStrategy {
    constructor(private readonly newError: () => Error) {
    }

    maybeGoNuts(method: keyof StorageAdapter): void {
        throw (this.newError)();
    }
}

export class NeverThrowError implements ChaosStrategy {
    maybeGoNuts(method: keyof StorageAdapter): void {
        // do not do anything
    }
}

export class TriggeredErrors implements ChaosStrategy {
    private triggers: {
        [I in AnyAdapterMethodName | '*']?: {
            after: number,
            times: number,
            newError: () => unknown,
        }
    } = {};

    on(method: AnyAdapterMethodName | '*', newError: () => unknown, options: {after?: number, times?: number} = {}) {
        this.triggers[method] = {
            after: options.after ?? 0,
            times: options.times ?? Number.MAX_SAFE_INTEGER,
            newError,
        };
    }

    clearTriggers(): void {
        this.triggers = {};
    }

    maybeGoNuts(method: keyof StorageAdapter): void {
        const trigger = this.triggers[method] ?? this.triggers['*'];

        if (trigger === undefined) {
            return;
        }

        if (trigger.after > 0) {
            trigger.after--;
        } else if (trigger.times > 0) {
            trigger.times--;

            throw (trigger.newError)();
        }
    }
}

export class ChaosStorageAdapterDecorator implements StorageAdapter {
    constructor(
        private readonly storage: StorageAdapter,
        private readonly chaos: ChaosStrategy,
    ) {
    }

    write(path: string, contents: Readable, options: WriteOptions): Promise<void> {
        this.chaos.maybeGoNuts('write');

        return this.storage.write(path, contents, options);
    }

    read(path: string): Promise<FileContents> {
        this.chaos.maybeGoNuts('read');

        return this.storage.read(path);
    }

    deleteFile(path: string): Promise<void> {
        this.chaos.maybeGoNuts('deleteFile');

        return this.storage.deleteFile(path);
    }

    createDirectory(path: string, options: CreateDirectoryOptions): Promise<void> {
        this.chaos.maybeGoNuts('createDirectory');

        return this.storage.createDirectory(path, options);
    }

    copyFile(from: string, to: string, options: CopyFileOptions): Promise<void> {
        this.chaos.maybeGoNuts('copyFile');

        return this.storage.copyFile(from, to, options);
    }

    moveFile(from: string, to: string, options: MoveFileOptions): Promise<void> {
        this.chaos.maybeGoNuts('moveFile');

        return this.storage.moveFile(from, to, options);
    }

    stat(path: string): Promise<StatEntry> {
        this.chaos.maybeGoNuts('stat');

        return this.storage.stat(path);
    }

    list(path: string, options: { deep: boolean; }): AsyncGenerator<StatEntry, any, unknown> {
        this.chaos.maybeGoNuts('list');

        return this.storage.list(path, options);
    }

    changeVisibility(path: string, visibility: string): Promise<void> {
        this.chaos.maybeGoNuts('changeVisibility');

        return this.storage.changeVisibility(path, visibility);
    }

    visibility(path: string): Promise<string> {
        this.chaos.maybeGoNuts('visibility');

        return this.storage.visibility(path);
    }

    deleteDirectory(path: string): Promise<void> {
        this.chaos.maybeGoNuts('deleteDirectory');

        return this.storage.deleteDirectory(path);
    }

    fileExists(path: string): Promise<boolean> {
        this.chaos.maybeGoNuts('fileExists');

        return this.storage.fileExists(path);
    }

    directoryExists(path: string): Promise<boolean> {
        this.chaos.maybeGoNuts('directoryExists');

        return this.storage.directoryExists(path);
    }

    publicUrl(path: string, options: MiscellaneousOptions): Promise<string> {
        this.chaos.maybeGoNuts('publicUrl');

        return this.storage.publicUrl(path, options);
    }

    temporaryUrl(path: string, options: TemporaryUrlOptions): Promise<string> {
        this.chaos.maybeGoNuts('publicUrl');

        return this.storage.publicUrl(path, options);
    }

    checksum(path: string, options: ChecksumOptions): Promise<string> {
        this.chaos.maybeGoNuts('checksum');

        return this.storage.checksum(path, options);
    }

    mimeType(path: string, options: MimeTypeOptions): Promise<string> {
        this.chaos.maybeGoNuts('mimeType');

        return this.storage.mimeType(path, options);
    }

    lastModified(path: string): Promise<number> {
        this.chaos.maybeGoNuts('lastModified');

        return this.storage.lastModified(path);
    }

    fileSize(path: string): Promise<number> {
        this.chaos.maybeGoNuts('fileSize');

        return this.storage.fileSize(path);
    }

}