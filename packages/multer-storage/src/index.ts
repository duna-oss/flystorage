import {StorageEngine} from 'multer';
import type {Request} from 'express';
import {FileStorage} from '@flystorage/file-storage';

export type DestinationResolver = (action: 'handle' | 'remove', req: Request, file: Express.Multer.File) => Promise<string>;

export class FlystorageMulterStorageEngine implements StorageEngine {
    constructor(
        private readonly storage: FileStorage,
        private readonly destinationResolver: DestinationResolver,
    ) {
    }

    _handleFile(req: Request, file: Express.Multer.File, callback: (error?: any, info?: Partial<Express.Multer.File>) => void): void {
        (async () => {
            const destination = await (this.destinationResolver)('handle', req, file);
            await this.storage.write(destination, file.stream, {
                size: file.size,
                mimeType: file.mimetype,
            });

            return destination;
        })()
            .then(destination => callback(null, {destination}))
            .catch(error => callback(error));
    }

    _removeFile(req: Request, file: Express.Multer.File, callback: (error: (Error | null)) => void): void {
        (async () => {
            const destination = await (this.destinationResolver)('remove', req, file);
            await this.storage.deleteFile(destination);
        })()
            .then(() => callback(null))
            .catch(error => callback(error));
    }
}