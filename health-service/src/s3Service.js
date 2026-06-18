const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const awsRegion = process.env.AWS_REGION || 'us-east-1';
const bucketName = process.env.S3_BUCKET_NAME || 'elderpinq-reports-bucket';
const kmsKeyArn = process.env.KMS_KEY_ARN;

const isAwsConfigured = process.env.MOCK_AWS !== 'true' && (
  process.env.AWS_ACCESS_KEY_ID ||
  process.env.AWS_ROLE_ARN ||
  process.env.AWS_WEB_IDENTITY_TOKEN_FILE
);

let s3Client = null;
if (isAwsConfigured) {
  try {
    s3Client = new S3Client({ region: awsRegion });
    console.log('✅ S3 Client successfully initialized.');
  } catch (err) {
    console.log('⚠️ S3 Client could not initialize. Running in local mock storage mode.', err.message);
  }
} else {
  console.log('ℹ️ AWS configuration not found or MOCK_AWS is true. S3 operates in mock mode.');
}

// Ensure mock directory exists
const mockStorageDir = path.join(__dirname, '../mock-s3-storage');
if (!s3Client) {
  if (!fs.existsSync(mockStorageDir)) {
    fs.mkdirSync(mockStorageDir, { recursive: true });
  }
}

async function uploadToS3(fileBuffer, key, mimeType) {
  if (s3Client) {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: kmsKeyArn || undefined
    });
    await s3Client.send(command);
    console.log(`✅ Uploaded to S3: ${key}`);
  } else {
    // Mock storage
    const filePath = path.join(mockStorageDir, key.replace(/\//g, '_'));
    fs.writeFileSync(filePath, fileBuffer);
    console.log(`[MOCK S3] File saved locally to: ${filePath}`);
  }
}

async function getPresignedUrl(key) {
  if (s3Client) {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    });
    // 15 minutes = 900 seconds
    return await getSignedUrl(s3Client, command, { expiresIn: 900 });
  } else {
    // Mock Presigned URL points to local download endpoint
    return `http://localhost:3000/documents/mock-download?key=${encodeURIComponent(key)}`;
  }
}

async function deleteFromS3(key) {
  if (s3Client) {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key
    });
    await s3Client.send(command);
    console.log(`✅ Deleted from S3: ${key}`);
  } else {
    // Delete mock file
    const filePath = path.join(mockStorageDir, key.replace(/\//g, '_'));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[MOCK S3] Deleted local file: ${filePath}`);
    }
  }
}

module.exports = {
  uploadToS3,
  getPresignedUrl,
  deleteFromS3,
  mockStorageDir
};
