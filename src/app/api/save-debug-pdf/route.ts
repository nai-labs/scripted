import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const runId = formData.get('runId') as string;

        if (!file || !runId) {
            return NextResponse.json({ error: 'Missing file or runId' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const logDir = path.join(process.cwd(), 'debug_logs', runId);

        // Ensure directory exists (it should from the prompts log, but just in case)
        if (!fs.existsSync(logDir)) {
            await fs.promises.mkdir(logDir, { recursive: true });
        }

        const filePath = path.join(logDir, 'story.pdf');
        await fs.promises.writeFile(filePath, buffer);

        return NextResponse.json({ success: true, path: filePath });
    } catch (error) {
        console.error('Error saving debug PDF:', error);
        return NextResponse.json({ error: 'Failed to save PDF' }, { status: 500 });
    }
}
