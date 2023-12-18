import { Storage } from '@google-cloud/storage';
import {GoogleCloudStorageFileStorage} from './google-cloud-storage.js';
import { FileStorage, Visibility, readableToString } from '@flystorage/file-storage';
import {randomBytes} from 'crypto';
import {resolve} from 'node:path';
import * as https from 'https';
import {LegacyVisibilityHandling} from './visibility-handling.js';

const testSegment = randomBytes(10).toString('hex');
let adapter: GoogleCloudStorageFileStorage;
let storage: FileStorage;

describe('GoogleCloudStorageFileStorage', () => {
    const googleStorage = new Storage({keyFilename: resolve(process.cwd(), 'google-cloud-service-account.json')});
    const bucket = googleStorage.bucket('no-acl-bucket-for-ci', {
        userProject: 'flysystem-testing',
    });
    const legacyBucket = googleStorage.bucket('flysystem', {
        userProject: 'flysystem-testing',
    });

    afterAll(async () => {
        adapter = new GoogleCloudStorageFileStorage(bucket, {
            prefix: `flystorage`,
        });
        storage = new FileStorage(adapter);
        await storage.deleteDirectory(testSegment);
    });

    describe('base API', () => {
        beforeEach(() => {
            const secondSegment = randomBytes(10).toString('hex');

            adapter = new GoogleCloudStorageFileStorage(bucket, {
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
    });

    describe('visibility for legacy buckets', () => {
        beforeEach(() => {
            const secondSegment = randomBytes(10).toString('hex');

            adapter = new GoogleCloudStorageFileStorage(legacyBucket, {
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