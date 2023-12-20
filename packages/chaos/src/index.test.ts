import { FileStorage } from "@flystorage/file-storage";
import {InMemoryFileStorage} from '@flystorage/in-memory';
import {AlwaysThrowError, ChaosAdapterDecorator, NeverThrowError, TriggeredErrors} from './index.js';

describe('chaos adapter decorator', () => {
    describe('triggered strategy', () => {
        const strategy = new TriggeredErrors();
        const inMemoryFileStorage = new InMemoryFileStorage();

        afterEach(() => {
            strategy.clearTriggers();
            inMemoryFileStorage.deleteEverything();
        });

        const storage = new FileStorage(
            new ChaosAdapterDecorator(
                inMemoryFileStorage,
                strategy,
            ),
        );

        test('trigger immediately on write', async () => {
            strategy.on('write', () => new Error('Oh no...'));

            await expect(storage.write('path.txt', 'context')).rejects.toThrow();
        });

        test('trigger immediately after 3 writes', async () => {
            strategy.on('write', () => new Error('Oh no...'), {after: 3});

            await expect(storage.write('path.txt', 'context')).resolves.not.toThrow();
            await expect(storage.write('path.txt', 'context')).resolves.not.toThrow();
            await expect(storage.write('path.txt', 'context')).resolves.not.toThrow();
            await expect(storage.write('path.txt', 'context')).rejects.toThrow();
        });

        test('trigger for 2 stat calls after 1 successful call', async () => {
            await storage.write('path.txt', 'contents');
            strategy.on('stat', () => new Error('Oh no...'), {times: 2, after: 1});

            await expect(storage.stat('path.txt')).resolves.not.toThrow();
            await expect(storage.stat('path.txt')).rejects.toThrow();
            await expect(storage.stat('path.txt')).rejects.toThrow();
            await expect(storage.stat('path.txt')).resolves.not.toThrow();
        });

        test('triggering on any method call with: *', async () => {
            await storage.write('path.txt', 'contents');
            strategy.on('*', () => new Error('Oh no...'), {times: 2, after: 1});

            await expect(storage.stat('path.txt')).resolves.not.toThrow();
            await expect(storage.fileSize('path.txt')).rejects.toThrow();
            await expect(storage.mimeType('path.txt')).rejects.toThrow();
            await expect(storage.deleteFile('path.txt')).resolves.not.toThrow();
        });
    });

    describe('always throwing an error', () => {
        const strategy = new AlwaysThrowError(() => new Error('Oh no...'));
        const inMemoryFileStorage = new InMemoryFileStorage();

        afterEach(() => inMemoryFileStorage.deleteEverything());

        const storage = new FileStorage(
            new ChaosAdapterDecorator(
                inMemoryFileStorage,
                strategy,
            ),
        );

        test('on any call', async () => {
            await expect(storage.write('path.txt', 'contents')).rejects.toThrow();
        });
    });

    describe('never throwing an error', () => {
        const strategy = new NeverThrowError();
        const inMemoryFileStorage = new InMemoryFileStorage();

        afterEach(() => inMemoryFileStorage.deleteEverything());

        const storage = new FileStorage(
            new ChaosAdapterDecorator(
                inMemoryFileStorage,
                strategy,
            ),
        );

        test('on any call', async () => {
            await expect(storage.write('path.txt', 'contents')).resolves.not.toThrow();
            expect(await storage.readToString('path.txt')).toEqual('contents');
        });
    });
});