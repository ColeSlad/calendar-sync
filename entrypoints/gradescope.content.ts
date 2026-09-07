export default defineContentScript({
  matches: ['https://www.gradescope.com/*'],
  runAt: 'document_idle',
  main() {
    console.info('Calendar Sync is ready on Gradescope.');
  },
});

