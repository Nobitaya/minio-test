(function exposeMediaPreview(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.MediaPreview = api;
  }
})(typeof window === 'undefined' ? undefined : window, () => {
  const nativeImages = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'ico']);
  const videos = new Set(['mp4', 'm4v', 'webm', 'ogv', 'ogg', 'mov']);

  function extensionOf(name) {
    const source = String(name || '');
    const extension = source.slice(source.lastIndexOf('.') + 1).toLowerCase();

    return extension === source.toLowerCase() ? '' : extension;
  }

  function previewStrategy(name) {
    const extension = extensionOf(name);

    if (nativeImages.has(extension)) return 'native-image';
    if (extension === 'heic' || extension === 'heif') return 'heic';
    if (extension === 'tif' || extension === 'tiff') return 'tiff';
    if (videos.has(extension)) return 'video';
    return 'unsupported';
  }

  return { extensionOf, previewStrategy };
});
