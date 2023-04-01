import UIMClient, { LogLevel } from '../src/index';

const buildClient = (): UIMClient => {
  const client = new UIMClient(process.env.UIM_CLIENT_ID as string, process.env.UIM_CLIENT_SECRET as string, {
    baseUrl: process.env.UIM_BASE_URL,
    logLevel: LogLevel.WARN,
  });
  return client;
};

export { buildClient };
