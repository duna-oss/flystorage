import {Visibility} from '@flystorage/file-storage';

export interface UnixVisibilityConversion {
    visibilityToFilePermissions(visibility: string): number;
    visibilityToDirectoryPermissions(visibility: string): number;
    filePermissionsToVisibility(permissions: number): string;
    directoryPermissionsToVisibility(permissions: number): string;
    defaultDirectoryPermissions: number;
    defaultDirectoryVisibility: string;
}

export class PortableUnixVisibilityConversion implements UnixVisibilityConversion {
    constructor(
        private readonly filePublic: number = 0o644,
        private readonly filePrivate: number = 0o600,
        private readonly directoryPublic: number = 0o755,
        private readonly directoryPrivate: number = 0o700,
        public readonly defaultDirectoryVisibility: Visibility = Visibility.PUBLIC,
    ) {
    }

    get defaultDirectoryPermissions(): number {
        return this.visibilityToDirectoryPermissions(this.defaultDirectoryVisibility);
    }

    directoryPermissionsToVisibility(permissions: number): string {
        if (permissions === this.directoryPrivate) {
            return Visibility.PRIVATE;
        }

        return Visibility.PUBLIC;
    }

    filePermissionsToVisibility(permissions: number): string {
        if (permissions === this.filePrivate) {
            return Visibility.PRIVATE;
        }

        return Visibility.PUBLIC;
    }

    visibilityToDirectoryPermissions(visibility: string): number {
        if (visibility === Visibility.PUBLIC) {
            return this.directoryPublic;
        } else if (visibility === Visibility.PRIVATE) {
            return this.directoryPrivate;
        }

        throw new Error(`Unsupported visibility was provided: ${visibility}`);
    }

    visibilityToFilePermissions(visibility: string): number {
        if (visibility === Visibility.PUBLIC) {
            return this.filePublic;
        } else if (visibility === Visibility.PRIVATE) {
            return this.filePrivate;
        }

        throw new Error(`Unsupported visibility was provided: ${visibility}`);
    }

}