import {FileStorage, UploadRequest, UploadRequestOptions} from './file-storage.js';
import {InMemoryStorageAdapter} from '@flystorage/in-memory';

describe('FileStorage', () => {
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