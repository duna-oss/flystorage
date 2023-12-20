import { FileStorage } from "@flystorage/file-storage";
import {InMemoryFileStorage} from '@flystorage/in-memory';
import {ChaosAdapterDecorator, TriggeredErrors} from './index.js';

describe('chaos adapter decorator', () => {
    describe('triggered strategy', () => {
        const triggeredErrors = new TriggeredErrors();
        const inMemoryFileStorage = new InMemoryFileStorage();

        afterEach(() => {
            triggeredErrors.clearTriggers();
            inMemoryFileStorage.deleteEverything();
        });

        const storage = new FileStorage(
            new ChaosAdapterDecorator(
                inMemoryFileStorage,
                triggeredErrors,
            ),
        );

        test('trigger immediately on write', async () => {
            triggeredErrors.on('write', () => new Error('Oh no...'));

            await expect(storage.write('path.txt', 'context')).rejects.toThrow();
        });

        test('trigger immediately after 3 writes', async () => {
            triggeredErrors.on('write', () => new Error('Oh no...'), {after: 3});

            await expect(storage.write('path.txt', 'context')).resolves.not.toThrow();
            await expect(storage.write('path.txt', 'context')).resolves.not.toThrow();
            await expect(storage.write('path.txt', 'context')).resolves.not.toThrow();
            await expect(storage.write('path.txt', 'context')).rejects.toThrow();
        });

        test('trigger for 2 stat calls after 1 successful call', async () => {
            await storage.write('path.txt', 'contents');
            triggeredErrors.on('stat', () => new Error('Oh no...'), {times: 2, after: 1});

            await expect(storage.stat('path.txt')).resolves.not.toThrow();
            await expect(storage.stat('path.txt')).rejects.toThrow();
            await expect(storage.stat('path.txt')).rejects.toThrow();
            await expect(storage.stat('path.txt')).resolves.not.toThrow();
        });

        test('triggering on any method call with: *', async () => {
            await storage.write('path.txt', 'contents');
            triggeredErrors.on('*', () => new Error('Oh no...'), {times: 2, after: 1});

            await expect(storage.stat('path.txt')).resolves.not.toThrow();
            await expect(storage.fileSize('path.txt')).rejects.toThrow();
            await expect(storage.mimeType('path.txt')).rejects.toThrow();
            await expect(storage.deleteFile('path.txt')).resolves.not.toThrow();
        })
    })
});