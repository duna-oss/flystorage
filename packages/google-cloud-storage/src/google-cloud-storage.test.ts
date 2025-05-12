import { Storage } from '@google-cloud/storage';
import {GoogleCloudStorageAdapter} from './google-cloud-storage.js';
import {
    FileStorage,
    UploadRequestHeaders,
    readableToString,
    UnableToReadFile, Visibility,
} from '@flystorage/file-storage';
import {randomBytes} from 'crypto';
import {resolve} from 'node:path';
import * as https from 'https';
import {LegacyVisibilityHandling} from './visibility-handling.js';

const testSegment = randomBytes(10).toString('hex');
let adapter: GoogleCloudStorageAdapter;
let storage: FileStorage;
let cleanupStorage: FileStorage;

describe('GoogleCloudStorageAdapter', () => {
    const googleStorage = new Storage({keyFilename: resolve(process.cwd(), 'google-cloud-service-account.json')});
    const bucket = googleStorage.bucket('no-acl-bucket-for-ci', {
        userProject: 'flysystem-testing',
    });
    const legacyBucket = googleStorage.bucket('flysystem', {
        userProject: 'flysystem-testing',
    });

    beforeAll(async () => {
        const cleanupAdapter = new GoogleCloudStorageAdapter(bucket, {
            prefix: `flystorage`,
        });
        cleanupStorage = new FileStorage(cleanupAdapter);
        await cleanupStorage.deleteDirectory('non-existing-directory');
    })

    afterAll(async () => {
        await cleanupStorage.deleteDirectory(testSegment);
    });

    describe('base API', () => {
        beforeEach(() => {
            const secondSegment = randomBytes(10).toString('hex');

            adapter = new GoogleCloudStorageAdapter(bucket, {
                prefix: `flystorage/${testSegment}/${secondSegment}`,
            });
            storage = new FileStorage(adapter);
        });

        test('reading a file that was written', async () => {
            await storage.write('path.txt', 'content in azure');
            const content = await storage.readToString('path.txt');

            expect(content).toEqual('content in azure');
            expect(await storage.fileExists('path.txt')).toEqual(true);
        });

        test('deleting a directory', async () => {
            await storage.createDirectory('directory/a');
            await storage.write('directory/b.txt', 'contents');

            await storage.deleteDirectory('directory');

            expect(await storage.fileExists('directory/b.txt')).toEqual(false);
        });

        test('statting a file', async () => {
            await storage.write('directory/b.txt', 'contents');

            const stat = await storage.statFile('directory/b.txt');

            expect(stat.path).toEqual('directory/b.txt');
            expect(typeof stat.lastModifiedMs).toEqual('number');
        });

        test('trying to read a file that does not exist', async () => {
            let was404 = false;

            try {
                await storage.readToString('404.txt');
            } catch (err) {
                if (err instanceof UnableToReadFile) {
                    was404 = err.wasFileNotFound;
                } else {
                    throw err;
                }
            }

            expect(was404).toEqual(true);
        });

        test('checking if a directory exists by prefix', async () => {
            await storage.write('directory/file.txt', 'contents');

            expect(await storage.directoryExists('directory')).toEqual(true);
        });

        test('getting a crc32c checksum', async () => {
            await storage.write('directory/file.txt', 'contents');

            expect(await storage.checksum('directory/file.txt', {
                algo: 'crc32c',
            })).toEqual('E2fhmA==');
        });

        test('getting an md5 checksum', async () => {
            await storage.write('directory/file.txt', 'contents');

            expect(await storage.checksum('directory/file.txt', {
                algo: 'md5',
            })).toEqual('mL99jBV4Two9YyBEQeHiqg==');
        });

        test('getting an sha1 checksum', async () => {
            await storage.write('directory/file.txt', 'contents');

            expect(await storage.checksum('directory/file.txt', {
                algo: 'sha1',
            })).toEqual('4a756ca07e9487f482465a99e8286abc86ba4dc7');
        });

        test('checking if a created directory', async () => {
            await storage.createDirectory('directory/here');

            expect(await storage.directoryExists('directory/here')).toEqual(true);
            expect(await storage.directoryExists('directory')).toEqual(true);
        });

        test('non deep and deep listing should have consistent and similar results', async () => {
            await storage.write('file_1.txt', 'contents');
            await storage.write('file_2.txt', 'contents');
            await storage.createDirectory('directory_1');
            await storage.createDirectory('directory_2');

            const non_deep_listing = await storage.list('/', {deep: false}).toArray();
            const deep_listing = await storage.list('/', {deep: true}).toArray();

            expect(non_deep_listing).toHaveLength(4);
            expect(deep_listing).toHaveLength(4);
            expect(non_deep_listing).toEqual(deep_listing);
        });
    });

    describe('visibility for legacy buckets', () => {
        beforeEach(() => {
            const secondSegment = randomBytes(10).toString('hex');

            adapter = new GoogleCloudStorageAdapter(legacyBucket, {
                prefix: `flystorage/${testSegment}/${secondSegment}`,
            }, new LegacyVisibilityHandling());
            storage = new FileStorage(adapter);
        });

        test('getting the visibility of a public file', async () => {
            await storage.write('path.txt', 'contents', {
                visibility: Visibility.PUBLIC,
            });

            expect(await storage.visibility('path.txt')).toEqual('public');
        });

        test('getting the visibility of a private file', async () => {
            await storage.write('path.txt', 'contents', {
                visibility: Visibility.PRIVATE,
            });

            expect(await storage.visibility('path.txt')).toEqual('private');
        });

        test('changing the visibility of a private file', async () => {
            await storage.write('path.txt', 'contents', {
                visibility: Visibility.PRIVATE,
            });

            await storage.changeVisibility('path.txt', Visibility.PUBLIC)

            expect(await storage.visibility('path.txt')).toEqual('public');
        });

        test('using a public URL', async () => {
            await storage.write('path.txt', 'public contents', {
                visibility: Visibility.PUBLIC,
            });

            const url = await storage.publicUrl('path.txt');
            const contents = await naivelyDownloadFile(url);

            expect(contents).toEqual('public contents');
        });

        test('with a custom Cache-Control Header', async () => {
            await storage.write('cache.txt', 'contents', {visibility: Visibility.PUBLIC, cacheControl: "max-age=9999, public"});
            const url = await storage.publicUrl('cache.txt');
            const res = await fetch(url);
            expect (res.headers.get('Cache-Control')).toEqual('max-age=9999, public');
        })

        test('using a temporary URL', async () => {
            await storage.write('path.txt', 'private contents', {
                visibility: Visibility.PRIVATE,
            });

            const url = await storage.temporaryUrl('path.txt', {
                expiresAt: Date.now() + 15 * 1000,
            });
            const contents = await naivelyDownloadFile(url);

            expect(contents).toEqual('private contents');
        });

        test('uploading using a prepared request', async () => {
            const request = await storage.prepareUpload('prepared/request-file.txt', {
                expiresAt: Date.now() + 60 * 1000,
                headers: {
                    'Content-Type': 'text/plain',
                }
            });

            await naivelyMakeRequestFile(
                request.url,
                request.headers,
                request.method,
                'this is the contents',
            );

            const contents = await storage.readToString('prepared/request-file.txt');

            expect(contents).toEqual('this is the contents');
        });
    });
});

function naivelyDownloadFile(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        https.get(url, async res => {
            if (res.statusCode !== 200) {
                reject(new Error(`Not able to download the file from ${url}, response status [${res.statusCode}]`));
            } else {
                resolve(await readableToString(res));
            }
        });
    });
}

function naivelyMakeRequestFile(url: string, headers: UploadRequestHeaders, method: string, data: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: method,
            headers: {
                ...headers,
                'Content-Length': new Blob([data]).size,
            }
        }, async res => {
            let responseBody = '';
            res.on('data', (chunk) => {
                responseBody += chunk;
            });
            res.on('end', () => {
                const statusCode = res.statusCode ?? 500;

                if (statusCode <= 200 && statusCode >= 299) {
                    reject(new Error(`Not able to download the file from ${url}, response status [${res.statusCode}]`));
                } else {
                    resolve();
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });
        req.write(data);
        req.end();
    });
}