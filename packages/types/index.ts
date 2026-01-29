// Shared type definitions for Gallyfans ecosystem

// Enum for Job Status
export enum JobStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    FAILED = 'failed'
}

// Interface for Publication Job
export interface PublicationJob {
    id: string;
    status: JobStatus;
    createdAt: Date;
    updatedAt: Date;
}

// Interface for Coordinated Job
export interface CoordinatedJob {
    jobId: string;
    workerId: string;
    status: JobStatus;
}

// Interface for Gateway Publish Payload
export interface GatewayPublishPayload {
    jobId: string;
    payload: any;
}

// Interface for API Response
export interface ApiResponse<T> {
    data: T;
    error?: string;
}

// Environment types for each worker
export type WorkerEnv = {
    DATABASE_URL: string;
    QUEUE_URL: string;
    API_KEY?: string;
    NODE_ENV: 'development' | 'production';
};