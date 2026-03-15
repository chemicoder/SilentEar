
/**
 * Utility to check if a URL likely points to a direct video file.
 */
export const isVideoFile = (url: string): boolean => {
    if (!url) return false;
    if (typeof url !== 'string') return false;

    // Handle data/blob URLs
    if (url.startsWith('blob:') || url.startsWith('data:video')) return true;

    // Check common video platforms that are direct-linkish
    if (url.includes('cloudinary.com') && url.includes('/video/upload/')) return true;


    try {
        const clean = url.split('?')[0].toLowerCase();
        const extensions = ['.mp4', '.webm', '.ogg', '.mov', '.m4v'];
        return extensions.some(ext => clean.endsWith(ext));
    } catch {
        return false;
    }
};

/**
 * Utility to check if a URL is from YouTube.
 */
export const isYouTube = (url: string): boolean => {
    if (!url) return false;
    if (typeof url !== 'string') return false;
    return url.includes('youtube.com') || url.includes('youtu.be') || url.includes('/v/');
};

/**
 * Get YouTube embed URL from a regular URL.
 */
export const getYouTubeEmbedUrl = (url: string): string => {
    if (url.includes('youtube.com/watch?v=')) return url.replace('watch?v=', 'embed/');
    if (url.includes('youtu.be/')) return url.replace('youtu.be/', 'youtube.com/embed/');
    return url;
};
