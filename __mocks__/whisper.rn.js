module.exports = {
  initWhisper: jest.fn(() =>
    Promise.resolve({
      transcribe: jest.fn(() => ({
        promise: Promise.resolve({ result: 'Mock transcription' }),
      })),
      release: jest.fn(() => Promise.resolve()),
    })
  ),
};
