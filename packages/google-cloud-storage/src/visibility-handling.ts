import {Visibility} from '@flystorage/file-storage';
import {ApiError, File, PredefinedAcl} from '@google-cloud/storage';

export interface VisibilityHandlingForGoogleCloudStorage {
    changeVisibility(file: File, visibility: string): Promise<void>;

    determineVisibility(file: File): Promise<string>;

    visibilityToPredefinedAcl(visibility: string): PredefinedAcl | undefined,
}

export class UniformBucketLevelAccessVisibilityHandling implements VisibilityHandlingForGoogleCloudStorage {
    constructor(
        private readonly errorOnChange: boolean = false,
        private readonly errorOnDetermine: boolean = false,
        private readonly fakeVisibility: string = 'unknown',
    ) {

    }

    async changeVisibility(file: File, visibility: string): Promise<void> {
        if (this.errorOnChange) {
            throw new Error('Unable to set visibility when using uniform bucket level access control.');
        }
        // ignored, no-op
    }
    async determineVisibility(file: File): Promise<string> {
        if (this.errorOnDetermine) {
            throw new Error('Unable to determine visibility when using uniform bucket level access control.');
        }
        return 'unknown';
    }
    visibilityToPredefinedAcl(visibility: string): PredefinedAcl | undefined {
        if (this.errorOnChange) {
            throw new Error('Unable to set visibility when using uniform bucket level access control.');
        }

        return undefined;
    }

}

export class LegacyVisibilityHandlingForGoogleCloudStorage implements VisibilityHandlingForGoogleCloudStorage {
    constructor(
        private readonly entity: string = 'allUsers',
        private readonly publicAcl: PredefinedAcl = 'publicRead',
        private readonly privateAcl: PredefinedAcl = 'projectPrivate',
    ) {
    }

    async changeVisibility(file: File, visibility: string): Promise<void> {
        if (visibility === Visibility.PRIVATE) {
            await file.acl.delete({
                entity: this.entity,
            })
        } else if (visibility === Visibility.PUBLIC) {
            await file.acl.update({
                entity: this.entity,
                role: 'READER',
            })
        }
    }

    async determineVisibility(file: File): Promise<string> {
        try {
            const [, metadata] = await file.acl.get({entity: 'allUsers'});

            return metadata.role === 'READER' ? Visibility.PUBLIC : Visibility.PRIVATE;
        } catch (error) {
            if (!(error instanceof ApiError) || error.response?.statusCode !== 404) {
                throw error;
            }

            return Visibility.PRIVATE;
        }
    }

    visibilityToPredefinedAcl(visibility: string): PredefinedAcl | undefined {
       if (visibility === Visibility.PUBLIC) {
           return this.publicAcl;
       } else if (visibility === Visibility.PRIVATE) {
           return this.privateAcl;
       }

       throw new Error(`Not able to set visibility ${visibility}, no mapping known.`);
    }
}