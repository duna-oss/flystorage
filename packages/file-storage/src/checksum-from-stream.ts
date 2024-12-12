import {BinaryToTextEncoding, createHash} from 'crypto';
import {Readable} from 'node:stream';
import {TextEncoder} from 'util';

const encoder = new TextEncoder();

export async function checksumFromStream(
    stream: Readable,
    options: { algo?: string; encoding?: BinaryToTextEncoding }
): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash(options.algo ?? 'md5');
        stream.on('error', err => reject(err));
        stream.on('data', (chunk: Uint8Array | string | number) => {
            const type = typeof chunk;
            if (type === 'string') {
                chunk = encoder.encode(chunk as string);
            } else if (type === 'number') {
                chunk = new Uint8Array([chunk as number]);
            }
            hash.update(chunk as Uint8Array);
        });
        stream.on('end', () => resolve(hash.digest(options.encoding ?? 'hex')));
    });
}