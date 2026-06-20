export const appConfig = {
  apiPort: Number(process.env.PORT || 3001),
  printAgentUrl: process.env.NEXT_PUBLIC_PRINT_AGENT_URL || 'http://127.0.0.1:17658',
};
