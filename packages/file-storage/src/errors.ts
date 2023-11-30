export type ErrorContext = { [index: string]: any };

export type OperationError = Error & {
    readonly code: string,
    readonly context: ErrorContext,
}

export function errorToMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export abstract class FlystorageError extends Error implements OperationError {
    readonly code: string = 'unknown_error';

    constructor(
        message: string,
        public readonly context: ErrorContext = {},
        cause: unknown = undefined,
    ) {
        const options = cause === undefined ? undefined : {cause};
        // @ts-ignore TS2554
        super(message, options);
    }
}

/**
 * Thrown when the checksum algo is not supported or not pre-computed. This error
 * is thrown with the intention of falling back to computing it based on a file read.
 */
export class ChecksumIsNotAvailable extends FlystorageError {
    public readonly code = 'flystorage.checksum_not_supported';

    constructor(
        message: string,
        public readonly algo: string,
        context: ErrorContext = {},
        cause: unknown = undefined,
    ) {
        super(message, context, cause);
    }

    static checksumNotSupported = (algo: string, {context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    } = {}) => new ChecksumIsNotAvailable(
        `Checksum algo "${algo}" is not supported`,
        algo,
        {...context, algo},
        cause,
    );
}

export class UnableToGetChecksum extends FlystorageError {
    public readonly code = 'flystorage.unable_to_get_checksum';

    static because = (reason: string, {context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    }) => new UnableToGetChecksum(
        `Unable to write the file. Reason: ${reason}`,
        context,
        cause,
    );
}

export class UnableToWriteFile extends FlystorageError {
    public readonly code = 'flystorage.unable_to_write_file';

    static because = (reason: string, {context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    }) => new UnableToWriteFile(
        `Unable to write the file. Reason: ${reason}`,
        context,
        cause,
    );
}

export class UnableToReadFile extends FlystorageError {
    public readonly code = 'flystorage.unable_to_read_file';

    static because = (reason: string, {context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    }) => new UnableToReadFile(
        `Unable to read the file. Reason: ${reason}`,
        context,
        cause,
    );
}

export class UnableToSetVisibility extends FlystorageError {
    public readonly code = 'flystorage.unable_to_set_visibility';

    static because = (reason: string, {context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    }) => new UnableToSetVisibility(
        `Unable to set visibility. Reason: ${reason}`,
        context,
        cause,
    );
}

export class UnableToGetVisibility extends FlystorageError {
    public readonly code = 'flystorage.unable_to_get_visibility';

    static because = (reason: string, {context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    }) => new UnableToGetVisibility(
        `Unable to get visibility. Reason: ${reason}`,
        context,
        cause,
    );
}

export class UnableToGetPublicUrl extends FlystorageError {
    public readonly code = 'flystorage.unable_to_get_public_url';

    static because = (reason: string, {context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    }) => new UnableToGetPublicUrl(
        `Unable to get public URL. Reason: ${reason}`,
        context,
        cause,
    );
}

export class UnableToGetTemporaryUrl extends FlystorageError {
    public readonly code = 'flystorage.unable_to_get_temporary_url';

    static because = (reason: string, {context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    }) => new UnableToGetTemporaryUrl(
        `Unable to get temporary URL. Reason: ${reason}`,
        context,
        cause,
    );
}

export class UnableToGetStat extends FlystorageError {
    public readonly code = 'flystorage.unable_to_get_stat';

    static because = (reason: string, {context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    }) => new UnableToGetStat(
        `Unable to get stat. Reason: ${reason}`,
        context,
        cause,
    );

    static noFileStatResolved = ({context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    }) => new UnableToGetStat(
        `Stat was not a file.`,
        context,
        cause,
    );
}

export class UnableToCreateDirectory extends FlystorageError {
    public readonly code = 'flystorage.unable_to_create_directory';

    static because = (reason: string, {context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    }) => new UnableToCreateDirectory(
        `Unable to create directory. Reason: ${reason}`,
        context,
        cause,
    );
}

export class UnableToDeleteDirectory extends FlystorageError {
    public readonly code = 'flystorage.unable_to_delete_directory';

    static because = (reason: string, {context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    }) => new UnableToDeleteDirectory(
        `Unable to delete directory. Reason: ${reason}`,
        context,
        cause,
    );
}

export class UnableToDeleteFile extends FlystorageError {
    public readonly code = 'flystorage.unable_to_delete_file';

    static because = (reason: string, {context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    }) => new UnableToDeleteFile(
        `Unable to delete file. Reason: ${reason}`,
        context,
        cause,
    );
}

export class UnableToCheckFileExistence extends FlystorageError {
    public readonly code = 'flystorage.unable_to_check_file_existence';

    static because = (reason: string, {context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    }) => new UnableToCheckFileExistence(
        `Unable to check file existence. Reason: ${reason}`,
        context,
        cause,
    );
}

export class UnableToCheckDirectoryExistence extends FlystorageError {
    public readonly code = 'flystorage.unable_to_check_directory_existence';

    static because = (reason: string, {context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    }) => new UnableToCheckDirectoryExistence(
        `Unable to check directory existence. Reason: ${reason}`,
        context,
        cause,
    );
}

export class UnableToListDirectory extends FlystorageError {
    public readonly code = 'flystorage.unable_to_list_directory_contents';

    static because = (reason: string, {context = {}, cause = undefined}: {
        context?: ErrorContext,
        cause?: unknown
    }) => new UnableToListDirectory(
        `Unable to list directory contents. Reason: ${reason}`,
        context,
        cause,
    );
}