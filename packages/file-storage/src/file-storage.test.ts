import {FileStorage, UploadRequest, UploadRequestOptions} from './file-storage.js';
import {InMemoryStorageAdapter} from '@flystorage/in-memory';
import {createHash} from 'crypto';

describe('FileStorage', () => {
    test('calculating a checksum through a fallback', async () => {
        const hash = createHash('md5');
        hash.update('contents');
        const expectedChecksum = hash.digest('hex');
        hash.end();

        const storage = new FileStorage(new InMemoryStorageAdapter());

        await storage.write('something.txt', 'contents');

        const checksum = await storage.checksum('something.txt', {algo: 'md5'});
        expect(checksum).toEqual(expectedChecksum);
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