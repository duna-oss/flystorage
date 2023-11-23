import {CreateDirectoryOptions, StorageAdapter, WriteOptions} from '@flystorage/file-storage';
import {Readable} from 'stream';

export class FtpFileStorage implements StorageAdapter {
    deleteFile(path: string): Promise<void> {
        return Promise.resolve(undefined);
    }

    write(path: string, contents: Readable, options: WriteOptions): Promise<void> {
        return Promise.resolve(undefined);
    }

    createDirectory(path: string, options: CreateDirectoryOptions): Promise<void> {
        return Promise.resolve(undefined);
    }
}