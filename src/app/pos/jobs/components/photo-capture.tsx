'use client';

import { useState, useRef, useCallback } from 'react';
import { Camera, RotateCcw, Save, Pencil, Eye, EyeOff, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { PhotoAnnotation, AnnotationOverlay } from './photo-annotation';
import { posFetch } from '../../lib/pos-fetch';
import { getZoneLabel } from '@/lib/utils/job-zones';
import type { Annotation } from '@/lib/utils/job-zones';
import type { JobPhoto, JobPhotoPhase } from '@/lib/supabase/types';

interface PhotoCaptureProps {
  jobId: string;
  zone: string;
  phase: JobPhotoPhase;
  onSaved: (photo: JobPhoto) => void;
  onCancel: () => void;
}

export function PhotoCapture({ jobId, zone, phase, onSaved, onCancel }: PhotoCaptureProps) {
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [notes, setNotes] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openCamera = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    // Reset input so the same file can be re-selected
    e.target.value = '';
  }

  function handleRetake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedFile(null);
    setPreviewUrl(null);
    setAnnotations([]);
    // Re-open camera
    setTimeout(() => openCamera(), 100);
  }

  async function handleSave() {
    if (!capturedFile) return;
    setSaving(true);

    try {
      const formData = new FormData();
      formData.append('image', capturedFile);
      formData.append('zone', zone);
      formData.append('phase', phase);
      if (notes.trim()) formData.append('notes', notes.trim());
      formData.append('is_internal', String(isInternal));
      if (annotations.length > 0) {
        formData.append('annotation_data', JSON.stringify(annotations));
      }

      const res = await posFetch(`/api/pos/jobs/${jobId}/photos`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const { data } = await res.json();
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        onSaved(data);
      } else {
        console.error('Failed to save photo:', await res.text());
      }
    } catch (err) {
      console.error('Photo save error:', err);
    } finally {
      setSaving(false);
    }
  }

  // Annotation editor view
  if (showAnnotation && previewUrl) {
    return (
      <PhotoAnnotation
        imageUrl={previewUrl}
        initialAnnotations={annotations}
        onSave={(newAnnotations) => {
          setAnnotations(newAnnotations);
          setShowAnnotation(false);
        }}
        onCancel={() => setShowAnnotation(false)}
      />
    );
  }

  // No photo captured yet — show capture trigger
  if (!capturedFile || !previewUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-gray-50 p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="text-center">
          <Camera className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <h3 className="text-sm font-medium text-gray-700">
            Capture {getZoneLabel(zone)}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Take a photo of the {getZoneLabel(zone).toLowerCase()} area
          </p>
          <button
            onClick={openCamera}
            className="mt-4 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            Open Camera
          </button>
          <button
            onClick={onCancel}
            className="mt-2 block w-full text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Preview screen
  return (
    <div className="flex h-full flex-col bg-gray-900">
      {/* Preview header */}
      <div className="flex items-center justify-between bg-gray-800 px-4 py-2">
        <span className="text-sm font-medium text-white">{getZoneLabel(zone)}</span>
        {annotations.length > 0 && (
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">
            {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Photo preview */}
      <div className="relative flex-1 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Captured photo preview"
          className="h-full w-full object-contain"
        />
        {annotations.length > 0 && (
          <AnnotationOverlay annotations={annotations} />
        )}
      </div>

      {/* Options */}
      <div className="space-y-2 bg-gray-800 px-4 py-3">
        {/* Notes */}
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes (optional)..."
            className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Internal only toggle */}
        <button
          onClick={() => setIsInternal(!isInternal)}
          className="flex w-full items-center gap-2 rounded px-1 py-1 text-sm text-gray-300 hover:bg-gray-700"
        >
          {isInternal ? (
            <EyeOff className="h-4 w-4 text-amber-400" />
          ) : (
            <Eye className="h-4 w-4 text-gray-400" />
          )}
          <span className={cn(isInternal && 'text-amber-400')}>
            {isInternal ? 'Internal Only — hidden from customer' : 'Visible to customer'}
          </span>
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 bg-gray-800 px-4 pb-4">
        <button
          onClick={handleRetake}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-600 px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700"
        >
          <RotateCcw className="h-4 w-4" />
          Retake
        </button>
        <button
          onClick={() => setShowAnnotation(true)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-600 px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700"
        >
          <Pencil className="h-4 w-4" />
          Annotate
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Photo'}
        </button>
      </div>
    </div>
  );
}
