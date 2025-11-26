import fs from 'fs';
import path from 'path';

export async function logPrompt(runId: string, type: string, content: string) {
    try {
        const logDir = path.join(process.cwd(), 'debug_logs', runId);

        // Ensure directory exists
        if (!fs.existsSync(logDir)) {
            await fs.promises.mkdir(logDir, { recursive: true });
        }

        const logFile = path.join(logDir, 'prompts.log');
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${type}]\n${content}\n\n${'-'.repeat(80)}\n\n`;

        await fs.promises.appendFile(logFile, logEntry);
    } catch (error) {
        console.error('Failed to write to debug log:', error);
    }
}
