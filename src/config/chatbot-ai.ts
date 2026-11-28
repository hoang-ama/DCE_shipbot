// Model routing configuration; no additional environment variables.
export const chatbotAI = {
  enabled:true,
  fastPath:{enabled:true,maxChars:50,maxWords:8},
  gemini:{model:'gemini-3.8-flash',timeoutMs:20_000,historyMessages:7},
  logRoutes:true,
};
