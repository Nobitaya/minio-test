(function exposeUploadQueue(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.UploadQueue = api;
  }
})(typeof window === 'undefined' ? undefined : window, () => {
  async function uploadSequentially(files, uploadOne, onItemStart = () => {}) {
    const successes = [];
    const failures = [];
    const items = Array.from(files);

    for (const [index, file] of items.entries()) {
      onItemStart({ file, index, total: items.length });

      try {
        successes.push({ file, value: await uploadOne(file, index, items.length) });
      } catch (error) {
        failures.push({ file, error });
      }
    }

    return { successes, failures };
  }

  return { uploadSequentially };
});
