'use client';

import { useState, useRef } from 'react';
import StoryForm from '@/components/StoryForm';
import StoryDisplay from '@/components/StoryDisplay';
import { Sparkles, Moon, Sun } from 'lucide-react';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';

function StoryApp() {
    const { theme, setTheme } = useTheme();
    const [story, setStory] = useState<any[] | null>(null);
    const [visualDescription, setVisualDescription] = useState<string>('');
    const [selectedImageModel, setSelectedImageModel] = useState<string>('google/nano-banana');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState('');
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const [anchorImage, setAnchorImage] = useState<string | undefined>(undefined);
    const [runId, setRunId] = useState<string | null>(null);

    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
        setLoadingStatus('');
        setStory(null);
        setAnchorImage(undefined);
        setRunId(null);
    };

    const generateStory = async (formData: any) => {
        setIsLoading(true);
        setError(null);
        setStory(null);
        setAnchorImage(undefined);
        setVisualDescription(formData.visualDescription);
        setLoadingStatus('Writing your story...');

        // Generate a unique Run ID for debug logging
        // Format: YYYY-MM-DD_HH-mm-ss
        const now = new Date();
        const newRunId = now.toISOString().replace(/[:.]/g, '-').split('T').join('_').split('Z')[0];
        setRunId(newRunId);

        // Create new AbortController for this run
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            // Extract image model from form data
            const { imageModel, ...storyPayload } = formData;
            // Store for display purposes (though we'll use the local variable in this function)
            setSelectedImageModel(imageModel);

            // 1. Generate Story Text
            const storyRes = await fetch('/api/generate-story', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...storyPayload, runId: newRunId }),
                signal, // Pass signal to fetch
            });

            if (!storyRes.ok) {
                const errorText = await storyRes.text();
                console.error('Story generation failed:', storyRes.status, errorText);
                throw new Error(`Failed to generate story text: ${storyRes.status} ${errorText}`);
            }

            const { story: storyPages } = await storyRes.json();

            if (signal.aborted) return; // Check if cancelled after await

            // 2. Generate Images for each page (Parallel)
            setLoadingStatus('Illustrating the scenes...');

            // Define referenceImage in outer scope so it's accessible to helper
            let referenceImage: string | undefined = undefined;

            // Helper function to generate one image (moved outside loop)
            const generateOneImage = async (imagePrompt: string, pageIndex: number, panelIndex?: number, panel?: any) => {
                if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

                const label = panelIndex !== undefined ? `page ${pageIndex + 1} (panel ${panelIndex + 1})` : `page ${pageIndex + 1}`;

                let retries = 3;
                while (retries > 0) {
                    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
                    try {
                        const shouldIncludeCharacter = panel?.include_main_character !== false;

                        const imageRes = await fetch('/api/generate-image', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                prompt: imagePrompt,
                                model: imageModel,
                                referenceImage: referenceImage, // Uses the closure variable which we update below
                                visualDescription,
                                includeMainCharacter: shouldIncludeCharacter,
                                runId: newRunId
                            }),
                            signal,
                        });

                        if (imageRes.status === 429) {
                            console.warn(`Rate limit hit for ${label}. Waiting to retry...`);
                            await new Promise((resolve, reject) => {
                                const timeout = setTimeout(resolve, 5000 + (Math.random() * 2000));
                                signal.addEventListener('abort', () => {
                                    clearTimeout(timeout);
                                    reject(new DOMException('Aborted', 'AbortError'));
                                });
                            });
                            throw new Error('Rate limited');
                        }

                        if (!imageRes.ok) throw new Error(`Failed to generate image for ${label}`);

                        const { imageUrl } = await imageRes.json();
                        return imageUrl;
                    } catch (err: any) {
                        if (err.name === 'AbortError') throw err;
                        console.warn(`Attempt ${4 - retries} failed for ${label}:`, err);
                        retries--;
                        if (retries > 0) {
                            await new Promise((resolve, reject) => {
                                const timeout = setTimeout(resolve, 5000);
                                signal.addEventListener('abort', () => {
                                    clearTimeout(timeout);
                                    reject(new DOMException('Aborted', 'AbortError'));
                                });
                            });
                        } else {
                            console.error(`Final failure for ${label}:`, err);
                            return 'https://placehold.co/1024x576/e2e8f0/64748b?text=Image+Generation+Failed';
                        }
                    }
                }
            };

            // 1. Generate the FIRST image (Anchor Image) if we need consistency
            // If we are using Nano Banana, we want to establish the character look first.
            let localAnchorImage: string | undefined = undefined;
            const pagesWithImages: any[] = JSON.parse(JSON.stringify(storyPages)); // Deep clone

            // Find the first image slot
            let firstSlot: { pageIndex: number, panelIndex?: number, prompt: string, panel?: any } | null = null;

            if (storyPages[0].layout === 'grid' && storyPages[0].panels?.length > 0) {
                firstSlot = { pageIndex: 0, panelIndex: 0, prompt: storyPages[0].panels[0].image_prompt, panel: storyPages[0].panels[0] };
            } else {
                firstSlot = { pageIndex: 0, prompt: storyPages[0].image_prompt, panel: storyPages[0] };
            }

            // Generate Anchor Image
            if (firstSlot) {
                setLoadingStatus('Creating the main character...');
                localAnchorImage = await generateOneImage(firstSlot.prompt, firstSlot.pageIndex, firstSlot.panelIndex, firstSlot.panel);

                // Save it to the structure
                if (firstSlot.panelIndex !== undefined) {
                    pagesWithImages[0].panels[0].imageUrl = localAnchorImage;
                } else {
                    pagesWithImages[0].imageUrl = localAnchorImage;
                }

                // Set reference for subsequent calls if using Nano Banana
                if (imageModel.includes('nano-banana')) {
                    referenceImage = localAnchorImage;
                    setAnchorImage(localAnchorImage); // Save to state for StoryDisplay
                }
            }

            // Now generate the rest in parallel
            const parallelPromises: Promise<void>[] = [];

            for (let i = 0; i < storyPages.length; i++) {
                const page = storyPages[i];

                if (page.layout === 'grid' && page.panels) {
                    for (let p = 0; p < page.panels.length; p++) {
                        // Skip the first slot we already did
                        if (i === 0 && p === 0 && firstSlot?.panelIndex === 0) continue;

                        const panel = page.panels[p];
                        parallelPromises.push((async () => {
                            const url = await generateOneImage(panel.image_prompt, i, p, panel);
                            pagesWithImages[i].panels[p].imageUrl = url;
                        })());
                    }
                } else {
                    // Skip first slot if we already did it
                    if (i === 0 && firstSlot?.panelIndex === undefined) continue;

                    parallelPromises.push((async () => {
                        const url = await generateOneImage(page.image_prompt, i, undefined, page);
                        pagesWithImages[i].imageUrl = url;
                    })());
                }
            }

            setLoadingStatus(`Illustrating remaining scenes (${parallelPromises.length} images)...`);
            await Promise.all(parallelPromises);

            if (!signal.aborted) {
                setStory(pagesWithImages);
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log('Generation cancelled by user');
                // Do nothing, state is already reset by handleCancel
            } else {
                console.error(error);
                alert('Something went wrong while creating the story. Please try again.');
            }
        } finally {
            if (!abortControllerRef.current) {
                // It was cancelled and ref cleared
            } else {
                setIsLoading(false);
                setLoadingStatus('');
                abortControllerRef.current = null;
            }
        }
    };

    return (
        <main className={`h-screen w-screen overflow-hidden flex transition-colors duration-500 ${theme === 'socially'
            ? 'bg-zinc-950 text-zinc-100'
            : 'bg-zinc-50 text-zinc-900'
            }`}>

            {/* Left Panel: Form & Header (Scrollable) */}
            <div className={`w-full md:w-[400px] lg:w-[450px] flex-shrink-0 h-full overflow-y-auto no-scrollbar border-r backdrop-blur-xl ${theme === 'socially' ? 'border-white/5 bg-zinc-950/80' : 'border-zinc-200 bg-white/80'}`}>
                <div className="p-6 md:p-8 space-y-8">
                    {/* Header */}
                    <header className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <img src="/icon.png" alt="Socially Logo" className="w-10 h-10 rounded-xl shadow-sm" />
                            <h1 className={`text-2xl font-bold tracking-tight ${theme === 'socially' ? 'text-white' : 'text-zinc-900'}`}>
                                Socially
                            </h1>
                        </div>

                        {/* Theme Switcher */}
                        <button
                            onClick={() => setTheme(theme === 'default' ? 'socially' : 'default')}
                            className={`p-2 rounded-full transition-all ${theme === 'socially'
                                ? 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
                                : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200'
                                }`}
                            title={theme === 'socially' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                        >
                            {theme === 'socially' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                    </header>

                    {/* Form Area */}
                    <div>
                        <StoryForm onSubmit={generateStory} isLoading={isLoading} onCancel={handleCancel} />
                    </div>
                </div>
            </div>

            {/* Right Panel: Content / Story (Fixed) */}
            <div className={`flex-grow h-full relative flex flex-col ${theme === 'socially' ? 'bg-zinc-900/50' : 'bg-zinc-50/50'}`}>
                {/* Loading Overlay */}
                {isLoading && !story && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm">
                        <div className={`p-8 rounded-2xl shadow-2xl text-center max-w-md mx-4 ${theme === 'socially' ? 'bg-zinc-900 border border-zinc-800' : 'bg-white border border-zinc-200'}`}>
                            <div className="mb-4 flex justify-center">
                                <Sparkles className={`w-12 h-12 animate-pulse ${theme === 'socially' ? 'text-white' : 'text-indigo-600'}`} />
                            </div>
                            <h3 className={`text-xl font-bold mb-2 ${theme === 'socially' ? 'text-white' : 'text-zinc-900'}`}>Creating Magic</h3>
                            <p className={`${theme === 'socially' ? 'text-zinc-400' : 'text-zinc-600'}`}>{loadingStatus}</p>
                        </div>
                    </div>
                )}

                {/* Main Content Area */}
                <div className="flex-grow flex items-center justify-center p-4 md:p-8 lg:p-12 overflow-hidden">
                    {!story ? (
                        // Hero / Placeholder State
                        <div className="text-center max-w-lg opacity-50 select-none">
                            <div className={`w-32 h-32 mx-auto mb-6 rounded-3xl flex items-center justify-center ${theme === 'socially' ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
                                <Sparkles className={`w-16 h-16 ${theme === 'socially' ? 'text-zinc-700' : 'text-zinc-400'}`} />
                            </div>
                            <h2 className={`text-3xl font-bold tracking-tight mb-3 ${theme === 'socially' ? 'text-white' : 'text-zinc-900'}`}>
                                Ready to Create
                            </h2>
                            <p className={`text-lg font-medium ${theme === 'socially' ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                Fill out the details on the left to generate a personalized social narrative.
                            </p>
                        </div>
                    ) : (
                        // Story Display
                        <div className="w-full h-full flex items-center justify-center">
                            <StoryDisplay
                                story={story}
                                onReset={() => { setStory(null); setAnchorImage(undefined); setRunId(null); }}
                                referenceImage={anchorImage}
                                imageModel={selectedImageModel}
                                visualDescription={visualDescription}
                                runId={runId}
                            />
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}

export default function Home() {
    return (
        <ThemeProvider>
            <StoryApp />
        </ThemeProvider>
    );
}
