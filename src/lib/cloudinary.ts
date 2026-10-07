const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const CLOUDINARY_FOLDER = 'purchase-orders';

export const MAX_PO_IMAGE_BYTES = 10 * 1024 * 1024;

export function isCloudinaryConfigured(): boolean {
    return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}

export async function uploadPoImage(file: File): Promise<string> {
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
        throw new Error('Cloudinary is not configured (missing VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET)');
    }
    if (!file.type.startsWith('image/')) {
        throw new Error('PO image must be a PNG, JPEG, GIF or WebP file');
    }
    if (file.size > MAX_PO_IMAGE_BYTES) {
        throw new Error('PO image is larger than 10 MB');
    }

    const body = new FormData();
    body.append('file', file);
    body.append('upload_preset', UPLOAD_PRESET);
    body.append('folder', CLOUDINARY_FOLDER);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body,
    });

    let payload: { secure_url?: string; error?: { message?: string } } | null = null;
    try {
        payload = await res.json();
    } catch {
        payload = null;
    }

    if (!res.ok || !payload?.secure_url) {
        throw new Error(payload?.error?.message || `Cloudinary upload failed (HTTP ${res.status})`);
    }

    return payload.secure_url;
}
