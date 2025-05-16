import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import mime from 'mime-types';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

class FilesService {
  static readonly STORAGE_PROVIDER = process.env.STORAGE_PROVIDER;
  static readonly UPLOAD_FOLDER_PREFIX = 'uploads';
  static readonly SIGNED_URL_TTL = 1000 * 60 * 30;
  static readonly CACHE_SINGED_URL_TTL = 1000 * 60 * 25;

  public static async singleUpload(buffer: Buffer, fileName: string, folder?: string, isPublic = true) {
    try {
      const base64Str = buffer.toString('base64');
      const dataUri = `data:${mime.lookup(fileName)};base64,${base64Str}`;
      const uploadOptions: any = {
        folder: `${FilesService.UPLOAD_FOLDER_PREFIX}/${folder}`,
        public_id: `${path.parse(fileName).name}`,
        overwrite: true,
        resource_type: 'auto',
        public: isPublic ? 'public' : 'authenticated',
      };
      await cloudinary.uploader.upload(dataUri, uploadOptions);
      return path.join(folder || '', `${path.parse(fileName).name}${path.extname(fileName)}`);
    } catch (error) {
      throw error;
    }
  }

  public static async headObject(key: string) {
    const objectHeader: any = {
      ContentType: undefined,
      ContentLength: undefined,
      AcceptRanges: 'bytes',
    };
    switch (this.STORAGE_PROVIDER) {
      default: {
        const uploadFolder = path.join(path.resolve('./'), 'public', 'uploads');
        const filePath = path.join(uploadFolder, key);
        const stats = fs.statSync(filePath);
        objectHeader.ContentType = mime.lookup(filePath);
        objectHeader.ContentLength = stats.size;
      }
    }
    return objectHeader;
  }

  public static async getObject(key: string, onData: Function, onDone: Function) {
    switch (this.STORAGE_PROVIDER) {
      default: {
        const uploadFolder = path.join(path.resolve('./'), 'public', 'uploads');
        const filePath = path.join(uploadFolder, key);
        const readStream = fs.createReadStream(filePath);
        readStream.on('data', (chunk) => {
          onData(chunk);
        });
        readStream.on('close', () => {
          onDone();
        });
      }
    }
  }

  public static async getSignedUrl(key: string, isPublic = true): Promise<string> {
    try {
      const ext = path.extname(key);
      const relativePath = key.replace(ext, '');
      const publicId = path.join(FilesService.UPLOAD_FOLDER_PREFIX, relativePath).replace(/\\/g, '/');
      const format = ext.slice(1);
      const url = cloudinary.url(publicId, {
        resource_type: 'image',
        type: isPublic ? 'upload' : 'authenticated',
        secure: true,
        format,
        ...(isPublic ?
          {} :
          {
            sign_url: true,
            expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
          }),
      });

      return url;
    } catch (error) {
      throw error;
    }
  }

  public static async getBufferFromStream(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: any) => chunks.push(Buffer.from(chunk)));
      stream.on('error', (err: any) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  public static async deleteFile(filePath: string): Promise<boolean> {
    try {
      if (!filePath) return false;

      const ext = path.extname(filePath);
      const relativePath = filePath.replace(ext, '');
      const publicId = path.join(FilesService.UPLOAD_FOLDER_PREFIX, relativePath).replace(/\\/g, '/');

      const result = await cloudinary.uploader.destroy(publicId);
      return result.result === 'ok';
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }
}

export default FilesService;