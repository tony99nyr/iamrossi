const isProduction = process.env.NODE_ENV === 'production';

export const debugLog = (...args: unknown[]) => {
  if (isProduction) {
    return;
  }

  console.log(...args);
};

