import {FileStorage, UploadRequest, UploadRequestOptions} from './file-storage.js';
import {InMemoryStorageAdapter} from '@flystorage/in-memory';
import {createHash} from 'crypto';

describe('FileStorage', () => {
    test('calculating a checksum through a fallback', async () => {
        const hash = createHash('md5');
        hash.update('contents');
        const expectedChecksum = hash.digest('hex');

        const storage = new FileStorage(new InMemoryStorageAdapter());

        await storage.write('something.txt', 'contents');

        const checksum = await storage.checksum('something.txt', {algo: 'md5'});
        expect(checksum).toEqual(expectedChecksum);
    });

    test('rejecting all relative paths', async () => {
        const storage = new FileStorage(
            new InMemoryStorageAdapter(),
            undefined,
            {
                rejectRelativePathsWithinRoot: true,
            }
        );

        await expect(storage.write('lol/../text.txt', 'contents')).rejects.toThrow();
    });

    test('writing to a relative path within the root', async () => {
        const storage = new FileStorage(new InMemoryStorageAdapter());

        await storage.write('lol/../text.txt', 'contents');

        expect(await storage.fileExists('text.txt')).toEqual(true);
    });

    test('trying to write outside of the root is never allowed', async () => {
        const storage = new FileStorage(new InMemoryStorageAdapter());

        await expect(storage.write('lol/../../text.txt', 'contents')).rejects.toThrow();
    });

    test('supplying a prepared upload strategy', async () => {
        const storage = new FileStorage(
            new InMemoryStorageAdapter(),
            undefined,
            {
                preparedUploadStrategy: {
                    async prepareUpload(path: string, options: UploadRequestOptions): Promise<UploadRequest> {
                        return {
                            method: 'POST',
                            url: `https://here.com/${path}`,
                            headers: options.headers ?? {},
                        };
                    }
                }
            }
        );

        const request = await storage.prepareUpload('here.txt', {
            expiresAt: 0,
            headers: {
                'content-type': 'application/json',
            }
        });

        expect(request).toEqual({
            method: 'POST',
            url: 'https://here.com/here.txt',
            headers: {
                'content-type': 'application/json',
            },
        });
    });
});