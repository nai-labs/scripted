import { NextResponse } from 'next/server';
import Replicate from 'replicate';
import { logPrompt } from '@/lib/logger';

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(request: Request) {
    if (!process.env.REPLICATE_API_TOKEN) {
        return NextResponse.json({ error: 'Replicate API token not configured' }, { status: 500 });
    }

    try {
        const { prompt, model, referenceImage, visualDescription, includeMainCharacter, runId } = await request.json();

        const modelId = model ?? 'google/nano-banana';
        const input: any = {
            prompt,
            // Flux Schnell specific parameters
            aspect_ratio: '16:9',
            output_format: 'webp',
            output_quality: 80,
        };
        // Adjust for Nano Banana
        if (modelId === 'google/nano-banana') {
            // Nano Banana specific parameters
            delete input.aspect_ratio;
            delete input.output_format;
            delete input.output_quality;

            if (referenceImage) {
                input.image_input = [referenceImage];
            }
        } else if (modelId === 'google/nano-banana-pro') {
            // Nano Banana Pro specific parameters
            delete input.aspect_ratio; // Pro might support it, but let's stick to defaults for now to be safe
            delete input.output_format;
            delete input.output_quality;

            if (referenceImage) {
                input.image_urls = [referenceImage];
            }
        } else if (modelId === 'black-forest-labs/flux-2-dev') {
            // Flux 2 specific parameters for image editing
            // Schema requires 'input_images' as an array, and does not support 'prompt_strength'
            if (referenceImage) {
                input.input_images = [referenceImage];
            }
        }

        // Shared logic for Nano Banana models (Prompt Cleaning)
        if (modelId.includes('nano-banana') && referenceImage) {
            let action = "";

            // Extract art style if possible (usually at the start "A cartoon illustration...")
            const styleMatch = prompt.match(/^A (.*?) illustration/i);
            const style = styleMatch ? styleMatch[1] : "cartoon";

            // STRATEGY 1: If we are NOT including the main character, the prompt is just the scene.
            // We don't need to subtract the character description because it shouldn't be there.
            if (includeMainCharacter === false) {
                // Remove the standard prefix "A [style] illustration of..."
                let cleanPrompt = prompt.replace(/^A .*? illustration of /i, '');
                // Also remove "a child" or similar if it accidentally slipped in
                cleanPrompt = cleanPrompt.replace(/^a child /i, '');

                action = cleanPrompt.trim();
            }
            // STRATEGY 2: If we ARE including the main character, we need to subtract their description
            else {
                if (visualDescription) {
                    // 1. Remove the standard prefix
                    let cleanPrompt = prompt.replace(/^A .*? illustration of a child with /i, '');

                    // 2. Remove the visual description
                    cleanPrompt = cleanPrompt.replace(visualDescription, '');

                    // 3. Clean up leading punctuation/words
                    cleanPrompt = cleanPrompt.replace(/^[,.\s]+/, ''); // remove leading punctuation/space
                    cleanPrompt = cleanPrompt.replace(/^(who is|that is)\s+/i, ''); // remove "who is"

                    if (cleanPrompt.trim().length > 0) {
                        action = cleanPrompt.trim();
                    }
                }

                // Fallback: If action is still empty, try to extract from prompt without visual description
                if (!action) {
                    const actionMatch = prompt.match(/(?:playing|sitting|standing|walking|running|looking|holding|talking|listening|waiting|feeling|being) .*/i);
                    if (actionMatch) {
                        action = actionMatch[0];
                    } else {
                        // Last resort: just take everything after "illustration of a child..."
                        let fallback = prompt.replace(/^A .*? illustration of a child (with .*?)? /i, '');
                        if (fallback.length < prompt.length) action = fallback.trim();
                    }
                }
            }

            // Final safety check
            if (!action || action.length < 3) action = "in the scene";

            // Construct the prompt based on whether we want the character or just the style
            if (includeMainCharacter === false) {
                // STYLE ONLY: Strong instruction to use style but CHANGE content
                input.prompt = `${action}. The image must be in the exact same ${style} art style as the provided reference image, but it must feature DIFFERENT characters. Do not include the main character from the reference. Focus on the scene description.`;
                input.negative_prompt = "main character, reference character, clone, duplicate, same person, identical face";
                // Increase prompt influence to override image content
                input.prompt_strength = 0.85;
            } else {
                // STYLE + CHARACTER: "A [style] picture in the same style as this, with the same character [action]"
                input.prompt = `A ${style} picture in the same style as this, with the same character ${action}`;
                // Default prompt strength is usually balanced
            }
        }

        if (runId) {
            await logPrompt(runId, 'IMAGE_GENERATION', `Model: ${modelId}\nReference Image Used: ${!!referenceImage}\nInclude Main Character: ${includeMainCharacter}\n\nPrompt:\n${input.prompt}`);
        }

        const output = await replicate.run(modelId, { input });

        console.log('Replicate output type:', typeof output);

        let imageUrl = '';

        // Handle stream output (Replicate v1.x returns ReadableStream for files)
        const outputItem = Array.isArray(output) ? output[0] : output;

        if (outputItem instanceof ReadableStream) {
            const reader = outputItem.getReader();
            const chunks = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
            }
            // Concatenate chunks
            const combined = new Uint8Array(chunks.reduce((acc, val) => acc + val.length, 0));
            let offset = 0;
            for (const chunk of chunks) {
                combined.set(chunk, offset);
                offset += chunk.length;
            }

            // Convert to base64
            const buffer = Buffer.from(combined);
            const base64 = buffer.toString('base64');
            imageUrl = `data:image/webp;base64,${base64}`;
        } else {
            // Assume it's a string URL
            imageUrl = outputItem;
        }

        return NextResponse.json({ imageUrl });
    } catch (error) {
        console.error('Error generating image:', error);
        // @ts-ignore
        if (error.message) {
            // @ts-ignore
            console.error('Replicate error message:', error.message);
        }
        return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 });
    }
}
