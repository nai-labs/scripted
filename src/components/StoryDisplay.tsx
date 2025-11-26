'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, BookOpen, Pencil, X, Loader2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface StoryPage {
    text: string;
    imageUrl?: string;
    image_prompt: string;
    layout?: 'standard' | 'grid';
    panels?: {
        caption?: string;
        imageUrl: string;
        image_prompt: string;
        include_main_character?: boolean;
    }[];
    include_main_character?: boolean;
}

interface StoryDisplayProps {
    story: StoryPage[];
    onReset: () => void;
    referenceImage?: string; // Passed from page.tsx for consistency
    imageModel?: string; // Passed to know which model to use
    visualDescription?: string; // Passed for prompt construction
    runId?: string | null;
}

export default function StoryDisplay({ story, onReset, referenceImage, imageModel, visualDescription, runId }: StoryDisplayProps) {
    const { theme } = useTheme();
    const isSocially = theme === 'socially';

    const [currentPage, setCurrentPage] = useState(0);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [editingImage, setEditingImage] = useState<{ pageIndex: number, panelIndex?: number, currentPrompt: string } | null>(null);
    const [newPrompt, setNewPrompt] = useState('');
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [localStory, setLocalStory] = useState(story);

    const nextPage = () => {
        if (currentPage < localStory.length - 1) {
            setCurrentPage(currentPage + 1);
        }
    };

    const prevPage = () => {
        if (currentPage > 0) {
            setCurrentPage(currentPage - 1);
        }
    };

    const handleEditClick = (pageIndex: number, panelIndex?: number, currentPrompt?: string) => {
        setEditingImage({ pageIndex, panelIndex, currentPrompt: currentPrompt || '' });
        setNewPrompt('');
    };

    const handleRegenerate = async () => {
        if (!editingImage) return;
        setIsRegenerating(true);

        try {
            // Find the target panel/page to get existing flags
            // Find the target panel/page to get existing flags and current image
            const page = localStory[editingImage.pageIndex];
            let includeMainCharacter = true;
            let currentImageUrl = referenceImage; // Default fallback

            if (editingImage.panelIndex !== undefined && page.panels) {
                includeMainCharacter = page.panels[editingImage.panelIndex].include_main_character !== false;
                currentImageUrl = page.panels[editingImage.panelIndex].imageUrl;
            } else {
                includeMainCharacter = page.include_main_character !== false;
                currentImageUrl = page.imageUrl;
            }

            const res = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: newPrompt,
                    model: imageModel || 'black-forest-labs/flux-schnell',
                    referenceImage: currentImageUrl, // Use the CURRENT image being edited as reference
                    visualDescription: visualDescription || '',
                    includeMainCharacter: includeMainCharacter,
                    runId: runId
                }),
            });

            if (!res.ok) throw new Error('Failed to regenerate image');

            const { imageUrl } = await res.json();

            // Update local story state
            const updatedStory = [...localStory];
            if (editingImage.panelIndex !== undefined && updatedStory[editingImage.pageIndex].panels) {
                updatedStory[editingImage.pageIndex].panels![editingImage.panelIndex].imageUrl = imageUrl;
                updatedStory[editingImage.pageIndex].panels![editingImage.panelIndex].image_prompt = newPrompt;
            } else {
                updatedStory[editingImage.pageIndex].imageUrl = imageUrl;
                updatedStory[editingImage.pageIndex].image_prompt = newPrompt;
            }
            setLocalStory(updatedStory);
            setEditingImage(null);
        } catch (error) {
            console.error('Regeneration failed:', error);
            alert('Failed to regenerate image. Please try again.');
        } finally {
            setIsRegenerating(false);
        }
    };

    const generatePDF = async () => {
        // Small warm-up delay to ensure layout is settled
        await new Promise(resolve => setTimeout(resolve, 100));

        // Dynamic import to avoid SSR issues
        const { toJpeg } = await import('html-to-image');
        const { jsPDF } = await import('jspdf');

        // Define PDF dimensions (A4 Landscape approx in pixels at 96 DPI)
        // A4 Landscape: 297mm x 210mm
        const pdfWidth = 1123; // px
        const pdfHeight = 794; // px

        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: [pdfWidth, pdfHeight]
        });

        const pages = document.querySelectorAll('[id^="print-page-"]');

        for (let i = 0; i < pages.length; i++) {
            const pageElement = pages[i] as HTMLElement;

            // Small delay between pages to prevent CPU/Memory spikes affecting capture
            if (i > 0) await new Promise(r => setTimeout(r, 250));

            // html-to-image works well with elements that are rendered.
            // We use toJpeg for smaller file size, quality 0.95
            const imgData = await toJpeg(pageElement, {
                quality: 0.95,
                backgroundColor: '#ffffff',
                width: pdfWidth,
                height: pdfHeight,
                style: {
                    // Ensure no transform affects the capture
                    transform: 'none',
                }
            });

            if (i > 0) {
                pdf.addPage([pdfWidth, pdfHeight], 'landscape');
            }

            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        }

        return pdf;
    };

    const handleDownloadPDF = async () => {
        setIsGeneratingPDF(true);
        try {
            const pdf = await generatePDF();
            pdf.save('social-story.pdf');
        } catch (error) {
            console.error('PDF Generation failed:', error);
            alert('Failed to generate PDF. Please try again.');
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    // Auto-upload PDF for debug logging
    useEffect(() => {
        if (!runId) return;

        const uploadDebugPDF = async () => {
            try {
                // Wait a bit for the DOM to be fully ready/rendered
                await new Promise(resolve => setTimeout(resolve, 2000));

                const pdf = await generatePDF();
                const blob = pdf.output('blob');

                const formData = new FormData();
                formData.append('file', blob, 'story.pdf');
                formData.append('runId', runId);

                await fetch('/api/save-debug-pdf', {
                    method: 'POST',
                    body: formData
                });
                console.log('Debug PDF uploaded successfully');
            } catch (error) {
                console.error('Failed to upload debug PDF:', error);
            }
        };

        uploadDebugPDF();
    }, [runId]);

    // Theme Styles
    const cardClass = isSocially
        ? "bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden border border-zinc-800 w-full aspect-video flex flex-row"
        : "bg-white rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 w-full aspect-video flex flex-row";

    const textSectionClass = isSocially
        ? "w-1/2 p-8 lg:p-12 flex flex-col justify-between bg-zinc-900 h-full"
        : "w-1/2 p-8 lg:p-12 flex flex-col justify-between bg-zinc-50 h-full";

    const textColor = isSocially ? "text-zinc-100" : "text-zinc-900";
    const subTextColor = isSocially ? "text-zinc-500" : "text-zinc-500";

    const navButtonClass = isSocially
        ? "p-3 rounded-full hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-zinc-400 hover:text-white"
        : "p-3 rounded-full hover:bg-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-zinc-500 hover:text-zinc-900";

    const dotActive = isSocially ? "bg-white w-6" : "bg-zinc-900 w-6";
    const dotInactive = isSocially ? "bg-zinc-700" : "bg-zinc-300";

    const modalBg = isSocially ? "bg-zinc-900" : "bg-white";
    const modalText = isSocially ? "text-white" : "text-zinc-900";
    const modalInputBg = isSocially ? "bg-zinc-800 border-zinc-700 text-white" : "bg-zinc-50 border-zinc-200 text-zinc-900";

    const secondaryButtonClass = isSocially
        ? "px-6 py-3 text-white font-medium hover:text-zinc-300 transition-colors"
        : "px-6 py-3 text-zinc-600 font-medium hover:text-zinc-900 transition-colors";

    const primaryButtonClass = isSocially
        ? "px-6 py-3 bg-white hover:bg-zinc-200 text-black font-bold rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
        : "px-6 py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2";


    return (
        <div className="w-full max-w-7xl mx-auto relative flex flex-col items-center justify-center h-full p-4">
            {/* Edit Modal */}
            <AnimatePresence>
                {editingImage && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className={`${modalBg} rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden`}
                        >
                            <div className={`p-6 border-b ${isSocially ? 'border-zinc-800' : 'border-gray-100'} flex justify-between items-center`}>
                                <h3 className={`text-lg font-bold ${modalText} flex items-center gap-2`}>
                                    <Pencil className={`w-5 h-5 ${isSocially ? 'text-white' : 'text-indigo-600'}`} />
                                    Edit Image
                                </h3>
                                <button onClick={() => setEditingImage(null)} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <p className={`text-sm ${isSocially ? 'text-zinc-400' : 'text-gray-600'}`}>
                                    Describe what you want to see in this panel. The character style will be preserved.
                                </p>
                                <textarea
                                    value={newPrompt}
                                    onChange={(e) => setNewPrompt(e.target.value)}
                                    className={`w-full p-4 rounded-xl border focus:ring-2 ${isSocially ? 'focus:ring-white' : 'focus:ring-indigo-500'} outline-none min-h-[120px] ${modalInputBg}`}
                                    placeholder='e.g. "edit this image so that...."'
                                />
                            </div>
                            <div className={`p-6 ${isSocially ? 'bg-zinc-800/50' : 'bg-gray-50'} flex justify-end gap-3`}>
                                <button
                                    onClick={() => setEditingImage(null)}
                                    className={`px-4 py-2 font-medium rounded-lg transition-colors ${isSocially ? 'text-zinc-400 hover:bg-zinc-800' : 'text-gray-600 hover:bg-gray-200'}`}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRegenerate}
                                    disabled={isRegenerating}
                                    className={`px-6 py-2 font-bold rounded-lg shadow-md flex items-center gap-2 disabled:opacity-70 ${isSocially ? 'bg-white text-black hover:bg-zinc-200' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                                >
                                    {isRegenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                                    Regenerate
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Hidden Print Container - Rendered off-screen but fully styled for capture */}
            {/* Using pure inline CSS to ensure compatibility with html-to-image */}
            <div style={{ position: 'fixed', top: 0, left: 0, zIndex: -1, opacity: 0, pointerEvents: 'none' }}>
                {localStory.map((page, index) => (
                    <div
                        key={`print-${index}`}
                        id={`print-page-${index}`}
                        style={{
                            width: '1123px',
                            height: '794px',
                            display: 'flex',
                            flexDirection: 'row',
                            overflow: 'hidden',
                            border: '1px solid #e5e7eb',
                            backgroundColor: '#ffffff',
                            fontFamily: 'serif'
                        }}
                    >
                        {/* Left: Image Area */}
                        <div
                            style={{
                                width: '50%',
                                height: '100%',
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                backgroundColor: '#f9fafb'
                            }}
                        >
                            {page.layout === 'grid' && page.panels ? (
                                <div style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '8px',
                                    padding: '16px',
                                    boxSizing: 'border-box'
                                }}>
                                    {page.panels.map((panel, pIdx) => (
                                        <div key={pIdx} style={{ display: 'flex', flexDirection: 'column', gap: '4px', height: '100%' }}>
                                            <div style={{
                                                flexGrow: 1,
                                                position: 'relative',
                                                borderRadius: '8px',
                                                overflow: 'hidden',
                                                backgroundColor: '#ffffff',
                                                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                                            }}>
                                                <img
                                                    src={panel.imageUrl}
                                                    alt={panel.caption}
                                                    loading="eager"
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                                                />
                                            </div>
                                            {panel.caption && (
                                                <p style={{ fontSize: '14px', textAlign: 'center', fontWeight: 500, padding: '4px 0', color: '#4b5563', margin: 0 }}>
                                                    {panel.caption}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <img
                                    src={page.imageUrl}
                                    alt={`Page ${index + 1}`}
                                    loading="eager"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            )}
                        </div>

                        {/* Right: Text Area */}
                        <div
                            style={{
                                width: '50%',
                                height: '100%',
                                padding: '64px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'center',
                                textAlign: 'center',
                                backgroundColor: '#ffffff',
                                boxSizing: 'border-box'
                            }}
                        >
                            <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
                                <p style={{ fontSize: '36px', lineHeight: 1.6, color: '#1f2937', margin: 0 }}>
                                    {page.text}
                                </p>
                            </div>
                            <div style={{ marginTop: '32px', paddingTop: '32px', borderTop: '1px solid #f3f4f6', width: '100%', textAlign: 'center' }}>
                                <span style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, color: '#9ca3af' }}>
                                    Page {index + 1}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className={cardClass}>
                {/* Image Section */}
                <div className={`w-1/2 ${isSocially ? 'bg-zinc-800' : 'bg-gray-100'} relative overflow-hidden flex items-center justify-center group h-full`}>
                    <AnimatePresence mode="wait">
                        {localStory[currentPage].layout === 'grid' && localStory[currentPage].panels ? (
                            <motion.div
                                key={`grid-${currentPage}`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="w-full h-full p-4 grid grid-cols-2 gap-4 overflow-y-auto"
                            >
                                {localStory[currentPage].panels?.map((panel, idx) => (
                                    <div key={idx} className="flex flex-col gap-2 relative group/panel">
                                        <div className="aspect-square rounded-lg overflow-hidden shadow-md bg-white relative">
                                            <img
                                                src={panel.imageUrl}
                                                alt={panel.caption || `Panel ${idx + 1}`}
                                                className="w-full h-full object-cover"
                                            />
                                            {/* Edit Button for Panel */}
                                            <button
                                                onClick={() => handleEditClick(currentPage, idx, panel.image_prompt)}
                                                className="absolute top-2 right-2 p-2 bg-white/90 hover:bg-white text-indigo-600 rounded-full shadow-lg opacity-0 group-hover/panel:opacity-100 transition-all transform hover:scale-110 z-10"
                                                title="Edit this image"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                        </div>
                                        {panel.caption && (
                                            <p className="text-xs text-center font-medium text-gray-600 bg-white/80 py-1 px-2 rounded-md">
                                                {panel.caption}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </motion.div>
                        ) : (
                            <div className="relative w-full h-full">
                                <motion.img
                                    key={`img-${currentPage}`}
                                    src={localStory[currentPage].imageUrl}
                                    alt={`Story page ${currentPage + 1}`}
                                    initial={{ opacity: 0, scale: 1.05 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.5 }}
                                    className="w-full h-full object-cover absolute inset-0"
                                />
                                {/* Edit Button for Full Page */}
                                <button
                                    onClick={() => handleEditClick(currentPage, undefined, localStory[currentPage].image_prompt)}
                                    className="absolute top-4 right-4 p-3 bg-white/90 hover:bg-white text-indigo-600 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all transform hover:scale-110 z-10"
                                    title="Edit this image"
                                >
                                    <Pencil className="w-5 h-5" />
                                </button>
                            </div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Text Section */}
                <div className={textSectionClass}>
                    <div className={`flex justify-between items-center mb-8 text-sm uppercase tracking-widest font-semibold ${subTextColor}`}>
                        <span>Page {currentPage + 1} of {localStory.length}</span>
                        <BookOpen className="w-5 h-5" />
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentPage}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex-grow flex items-center"
                        >
                            <p className={`text-xl md:text-2xl leading-relaxed font-medium font-serif ${textColor}`}>
                                {localStory[currentPage].text}
                            </p>
                        </motion.div>
                    </AnimatePresence>

                    <div className={`flex items-center justify-between mt-8 pt-8 border-t ${isSocially ? 'border-zinc-800' : 'border-gray-100'}`}>
                        <button
                            onClick={prevPage}
                            disabled={currentPage === 0}
                            className={navButtonClass}
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </button>

                        <div className="flex gap-2">
                            {localStory.map((_, idx) => (
                                <div
                                    key={idx}
                                    className={`w-2 h-2 rounded-full transition-all duration-300 ${idx === currentPage ? dotActive : dotInactive}`}
                                />
                            ))}
                        </div>

                        <button
                            onClick={nextPage}
                            disabled={currentPage === localStory.length - 1}
                            className={navButtonClass}
                        >
                            <ChevronRight className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="mt-8 flex justify-center gap-4">
                <button
                    onClick={handleDownloadPDF}
                    disabled={isGeneratingPDF}
                    className={primaryButtonClass}
                >
                    {isGeneratingPDF ? 'Generating PDF...' : 'Download PDF'}
                </button>
                <button
                    onClick={onReset}
                    className={secondaryButtonClass}
                >
                    Create Another Story
                </button>
            </div>
        </div>
    );
}
