import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';

/** Sends an image to Cloudinary and returns its https url. Configured through the CLOUDINARY_URL variable. */
@Injectable()
export class UploadsService {
  async upload(buffer: Buffer): Promise<string> {
    if (!process.env.CLOUDINARY_URL) throw new ServiceUnavailableException('Image uploads are not configured');

    // Imported on demand: the SDK reads CLOUDINARY_URL when it loads, and most requests never upload.
    const { v2: cloudinary } = await import('cloudinary');
    return new Promise<string>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: 'ecshop/products', resource_type: 'image' }, (error, result) => {
          if (error || !result) reject(new BadGatewayException('The image host rejected the upload'));
          else resolve(result.secure_url);
        })
        .end(buffer);
    });
  }
}
