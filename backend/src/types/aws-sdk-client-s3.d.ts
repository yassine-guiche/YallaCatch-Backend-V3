declare module '@aws-sdk/client-s3' {
  export class S3 {
    constructor(...args: any[]);
    headBucket(...args: any[]): Promise<any>;
    listBuckets(...args: any[]): Promise<any>;
  }

  export class S3Client {
    constructor(...args: any[]);
    send(command: any): Promise<any>;
  }

  export class HeadBucketCommand {
    constructor(...args: any[]);
  }
}
