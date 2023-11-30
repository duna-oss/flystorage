import {BinaryToTextEncoding, createHash} from 'crypto';
import {Readable} from 'node:stream';

export async function checksumFromStream(stream: Readable, options: {algo?: string, encoding?: BinaryToTextEncoding}): Promise<string> {
    return new Promise(async (resolve, reject) => {
        const hash = createHash(options.algo ?? 'md5');
        stream.on('error', reject);
        stream.pipe(hash, {end: false});
        stream.on('end', () => {
            hash.end();
            resolve(hash.digest(options.encoding ?? 'hex'));
        });
    });
}