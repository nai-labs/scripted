'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';

interface StoryFormProps {
  onSubmit: (data: any) => void;
  isLoading: boolean;
  onCancel?: () => void;
}

export default function StoryForm({ onSubmit, isLoading, onCancel }: StoryFormProps) {
  const { theme } = useTheme();
  const [formData, setFormData] = useState({
    childName: '',
    age: '',
    gender: '',
    targetBehavior: '',
    interests: '',
    visualDescription: '',
    artStyle: 'cartoon',
    storyModel: 'meta/meta-llama-3-70b-instruct',
    storyMode: 'standard',
    imageModel: 'google/nano-banana',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  // Theme-based styles
  const isSocially = theme === 'socially';

  const containerClass = isSocially
    ? "w-full bg-transparent"
    : "w-full bg-transparent";

  const labelClass = isSocially
    ? "text-xs font-medium text-zinc-500 uppercase tracking-wider ml-1"
    : "text-xs font-medium text-zinc-500 uppercase tracking-wider ml-1";

  const inputClass = isSocially
    ? "w-full px-5 py-4 rounded-2xl bg-zinc-800/50 border border-white/5 text-white focus:bg-zinc-800 focus:border-white/20 focus:ring-0 outline-none transition-all placeholder-zinc-600"
    : "w-full px-5 py-4 rounded-2xl bg-zinc-50 border border-zinc-200 text-zinc-900 focus:bg-white focus:border-zinc-300 focus:ring-0 outline-none transition-all placeholder-zinc-400";

  const buttonClass = isSocially
    ? "w-full py-4 bg-white hover:bg-zinc-100 text-black font-bold rounded-2xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    : "w-full py-4 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2";

  const linkColor = isSocially ? "text-white hover:text-zinc-300" : "text-zinc-600 hover:text-zinc-900";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={containerClass}
    >
      <div className="flex items-center gap-3 mb-6">
        <h2 className={`text-xl font-bold ${isSocially ? 'text-white' : 'text-zinc-900'}`}>Create a Story</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={labelClass}>Child's Name</label>
            <input
              type="text"
              required
              className={inputClass}
              placeholder="e.g. Tommy"
              value={formData.childName}
              onChange={(e) => setFormData({ ...formData, childName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Age</label>
            <input
              type="number"
              required
              className={inputClass}
              placeholder="e.g. 5"
              value={formData.age}
              onChange={(e) => setFormData({ ...formData, age: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className={labelClass}>Target Situation / Routine</label>
            <button
              type="button"
              onClick={() => {
                const example = formData.storyMode === 'dynamic'
                  ? 'multiple panels on every page, target situation is difficulty staying calm when parents leave the house (panels include: to the grocery store to work, to spend time together, to visit friends; while they\'re away, I can play with my babysitter, with my sister, with my grandparents ; when I have these feelings I can take deep breaths, use my words to say how I feel, take a break, keep a calm voice and body; if I miss them, I can tell myself "mom and dad will be back later", "I will see them soon, they always come back", "I can do other things while I wait for them".'
                  : 'Difficulty sharing toys with friends';
                setFormData({ ...formData, targetBehavior: example });
              }}
              className={`text-xs font-medium flex items-center gap-1 transition-colors ${linkColor}`}
            >
              <Sparkles className="w-3 h-3" />
              Use Example
            </button>
          </div>
          <textarea
            required
            className={`${inputClass} min-h-[100px]`}
            placeholder={
              formData.storyMode === 'dynamic'
                ? 'e.g. multiple panels on every page...'
                : 'e.g. Difficulty sharing toys with friends'
            }
            value={formData.targetBehavior}
            onChange={(e) => setFormData({ ...formData, targetBehavior: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <label className={labelClass}>Interests (for engagement)</label>
          <input
            type="text"
            required
            className={inputClass}
            placeholder="e.g. Dinosaurs, Space, Trains"
            value={formData.interests}
            onChange={(e) => setFormData({ ...formData, interests: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <label className={labelClass}>Visual Description (for character consistency)</label>
          <input
            type="text"
            required
            className={inputClass}
            placeholder="e.g. Blonde curly hair, wears red glasses and a blue hoodie"
            value={formData.visualDescription}
            onChange={(e) => setFormData({ ...formData, visualDescription: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <label className={labelClass}>Art Style</label>
          <select
            className={inputClass}
            value={formData.artStyle}
            onChange={(e) => setFormData({ ...formData, artStyle: e.target.value })}
          >
            <option value="cartoon">Cartoon</option>
            <option value="comic">Comic Book</option>
            <option value="watercolor">Watercolor</option>
            <option value="storybook">Classic Storybook</option>
            <option value="3d-render">3D Render</option>
          </select>

          {/* Story Text Model Selection */}
          <label className={`${labelClass} mt-4 block`}>Story Text Model (AI Writer)</label>
          <select
            className={inputClass}
            value={formData.storyModel}
            onChange={(e) => setFormData({ ...formData, storyModel: e.target.value })}
          >
            <option value="meta/meta-llama-3-70b-instruct">Llama 3 70B (Default)</option>
            <option value="qwen/qwen3-235b-a22b-instruct-2507">Qwen 3 235B (Experimental)</option>
          </select>

          {/* Story Mode Selection */}
          <label className={`${labelClass} mt-4 block`}>Story Mode</label>
          <select
            className={inputClass}
            value={formData.storyMode}
            onChange={(e) => setFormData({ ...formData, storyMode: e.target.value })}
          >
            <option value="standard">Standard (One image per page)</option>
            <option value="dynamic">Dynamic (Multi-panel layouts)</option>
          </select>

          {/* Image Model Selection */}
          <label className={`${labelClass} mt-4 block`}>Image Generation Model</label>
          <select
            className={inputClass}
            value={formData.imageModel}
            onChange={(e) => setFormData({ ...formData, imageModel: e.target.value })}
          >
            <option value="google/nano-banana">Google Nano Banana (Default)</option>
            <option value="google/nano-banana-pro">Google Nano Banana Pro (High Quality)</option>
            <option value="black-forest-labs/flux-2-dev">Flux 2 (Dev)</option>
          </select>
        </div>

        <div className="flex gap-3">
          {isLoading && onCancel ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onCancel) onCancel();
              }}
              className="w-full py-4 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
            >
              <Loader2 className="w-5 h-5 animate-spin" />
              Cancel Generation
            </button>
          ) : (
            <button
              type="submit"
              disabled={isLoading}
              className={buttonClass}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating Magic...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Story
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </motion.div>
  );
}
