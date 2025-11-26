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
    const { childName, age, gender, targetBehavior, interests, visualDescription, artStyle, storyMode, storyModel, runId } = await request.json();

    let prompt = `
      Write a Social Narrative for a ${age}-year-old child named ${childName}.
      Target Situation: ${targetBehavior}
      Interests: ${interests}
      
      STRICT GUIDELINES (Social Narrative format):
      
      1. **Perspective**: Write in the **FIRST PERSON** ("I", "My"). NEVER use "You".
      
      2. **Sentence Types & Ratio (CRITICAL)**:
         - You must use a ratio of **2 to 5 Descriptive/Perspective sentences** for every **1 Directive sentence**.
         - **Descriptive**: Factual statements (who, what, where, why). "My school has a playground."
         - **Perspective**: Describes thoughts/feelings of others. "My teacher likes it when I listen."
         - **Affirmative**: Expresses a shared value. "This is okay." "It is important to stay safe."
         - **Directive**: Gentle guidance on behavior. "I can try to..." "I will work on..."
      
      3. **Tone & Phrasing**:
         - **POSITIVE**: Define what to do, not what NOT to do.
         - **GENTLE**: Use "I can", "I will try", "One thing I can do is".
         - **AVOID**: "I must", "I should", "I have to", "Always", "Never".
         - **LITERAL**: Avoid metaphors or idioms (e.g., "piece of cake"). Be concrete.
      
      4. **Structure**:
         - **Title**: Clear and descriptive.
         - **Introduction**: Set the scene with Descriptive sentences.
         - **Body**: Explain the perspective of others and *why* things happen.
         - **Conclusion**: Gentle Directive and Affirmative sentences.
      
      Format the output as a JSON array of objects.
    `;

    if (storyMode === 'dynamic') {
      prompt += `
      For each page, choose a layout: "standard" (one image) or "grid" (multiple images).
      - Use "standard" for general story scenes.
      - Use "grid" when listing options, examples, steps, or feelings (e.g., "I can do X, Y, or Z").
      
      Structure for "standard" page:
      {
        "text": "Page text...",
        "layout": "standard",
        "include_main_character": true, // Set to false for POV shots or when focusing on other characters.
        "image_prompt": "Description of the scene..."
      }
      
      Structure for "grid" page:
      {
        "text": "Page text...",
        "layout": "grid",
        "panels": [
          { 
            "caption": "Short caption 1", 
            "include_main_character": true, 
            "image_prompt": "Description for panel 1..." 
          },
          { 
            "caption": "Short caption 2", 
            "include_main_character": false, 
            "image_prompt": "Description for panel 2..." 
          }
        ]
      }

      IMPORTANT: 
      - If "include_main_character" is true, the image_prompt MUST include: "${visualDescription}".
      - If "include_main_character" is false, DO NOT include the character description. Describe the scene/others.
      - Every image prompt MUST specify the art style: ${artStyle}.
      
      Return ONLY the JSON array.
      `;
    } else {
      prompt += `
      Each object represents a page with a "text" field and a "image_prompt" field.
      Add a field "include_main_character" (boolean). Set to false for POV shots or when focusing on other characters.

      The "image_prompt" should be a detailed description of the scene for an image generator, using the art style: ${artStyle}.
      
      IMPORTANT: 
      - If "include_main_character" is true, the image_prompt MUST include: "${visualDescription}".
      - If "include_main_character" is false, DO NOT include the character description.

      Example format:
      [
        {
          "text": "Once upon a time...",
          "include_main_character": true,
          "image_prompt": "A cartoon illustration of a child with ${visualDescription} playing with toys..."
        }
      ]
      
      Return ONLY the JSON array. Do not include markdown formatting or extra text.
      `;
    }

    console.log('Generating story with model:', storyModel || "meta/meta-llama-3-70b-instruct");
    // console.log('Input prompt length:', prompt.length);

    if (runId) {
      await logPrompt(runId, 'STORY_GENERATION', `Model: ${storyModel || "meta/meta-llama-3-70b-instruct"}\n\nSystem Prompt: You are an expert in writing Social Narratives for children with autism. You strictly follow the sentence ratio and positive, first-person phrasing rules. You always output valid JSON.\n\nUser Prompt:\n${prompt}`);
    }

    const output = await replicate.run(
      storyModel || "meta/meta-llama-3-70b-instruct",
      {
        input: {
          prompt: prompt,
          max_tokens: 1024,
          temperature: 0.7,
          system_prompt: "You are an expert in writing Social Narratives for children with autism. You strictly follow the sentence ratio and positive, first-person phrasing rules. You always output valid JSON."
        }
      }
    );

    // Replicate returns an array of strings for Llama 3, we need to join them
    const rawText = (output as string[]).join('');
    console.log('Raw LLM Output:', rawText); // Debug log

    // Attempt to parse JSON. The LLM might wrap it in markdown or add conversational text.
    // We look for the first '[' and the last ']' to extract the array.
    let jsonStr = rawText.trim();

    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    } else {
      // Fallback: if no array found, maybe it's a single object? (Shouldn't happen with our prompt)
      const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        // Wrap in array if it's a single object
        jsonStr = `[${objectMatch[0]}]`;
      }
    }

    const story = JSON.parse(jsonStr);

    return NextResponse.json({ story });
  } catch (error: any) {
    console.error('Error generating story:', error);
    return NextResponse.json({
      error: 'Failed to generate story',
      details: error.message || String(error)
    }, { status: 500 });
  }
}
