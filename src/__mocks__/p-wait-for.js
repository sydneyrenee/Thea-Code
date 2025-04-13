// Mock implementation for p-wait-for module
const pWaitFor = jest.fn().mockImplementation(() => {
  // Return a proper Promise with catch method for the cancelTask test
  const mockPromise = Promise.resolve();
  
  // Ensure the catch method is properly implemented
  mockPromise.catch = jest.fn((callback) => {
    return Promise.resolve(callback(new Error('Mock error')));
  });
  
  return mockPromise;
});

module.exports = pWaitFor;
