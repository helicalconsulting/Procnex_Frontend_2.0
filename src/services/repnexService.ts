/**
 * RepNex AI Service — Deprecated in favor of Procnex AI Reports Generator Engine
 */

export interface ChatMessage {
  id: string;
  sender: 'user' | 'repnex';
  text: string;
  timestamp: string;
  status?: 'sending' | 'sent' | 'error';
}

export const repnexService = {
  async sendMessage(userMessage: string): Promise<string> {
    return `[Procnex AI Engine]: RepNex AI has been replaced by the native Procnex AI Reports & Chat Engine. Please use the main Procnex AI Assistant for all analytics and reports. Query: "${userMessage}"`;
  },
};
