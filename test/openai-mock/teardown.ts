import { openAIMock } from './setup.ts';

export const openaiTeardown = async (): Promise<void> => {
  if (openAIMock) {
    console.log('\nStopping OpenAI API Mock...');
    openAIMock.stopMocking();
    console.log('OpenAI API Mock stopped.');
  }
};
