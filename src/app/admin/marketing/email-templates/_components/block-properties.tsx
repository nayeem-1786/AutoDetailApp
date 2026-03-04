'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { VariableInserter } from './variable-inserter';
import { PhotoGalleryPicker } from './photo-gallery-picker';
import type {
  EmailBlock,
  EmailBlockType,
  TextBlockData,
  HeadingBlockData,
  ButtonBlockData,
  ImageBlockData,
  PhotoGalleryBlockData,
  CouponBlockData,
  DividerBlockData,
  SpacerBlockData,
  SocialLinksBlockData,
  PhotoPair,
} from '@/lib/email/types';
import type { VariableDefinition } from '@/lib/email/variables';

interface BlockPropertiesProps {
  block: EmailBlock;
  variables: VariableDefinition[];
  onChange: (block: EmailBlock) => void;
}

export function BlockProperties({ block, variables, onChange }: BlockPropertiesProps) {
  function update<T extends EmailBlockType>(data: Partial<EmailBlock<T>['data']>) {
    onChange({ ...block, data: { ...block.data, ...data } } as EmailBlock);
  }

  return (
    <div className="space-y-4 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        {block.type.replace(/_/g, ' ')} Properties
      </p>

      {block.type === 'text' && (
        <TextProperties data={block.data as TextBlockData} variables={variables} onChange={(d) => update(d)} />
      )}
      {block.type === 'heading' && (
        <HeadingProperties data={block.data as HeadingBlockData} onChange={(d) => update(d)} />
      )}
      {block.type === 'button' && (
        <ButtonProperties data={block.data as ButtonBlockData} variables={variables} onChange={(d) => update(d)} />
      )}
      {block.type === 'image' && (
        <ImageProperties data={block.data as ImageBlockData} onChange={(d) => update(d)} />
      )}
      {block.type === 'photo_gallery' && (
        <PhotoGalleryProperties data={block.data as PhotoGalleryBlockData} onChange={(d) => update(d)} />
      )}
      {block.type === 'coupon' && (
        <CouponProperties data={block.data as CouponBlockData} variables={variables} onChange={(d) => update(d)} />
      )}
      {block.type === 'divider' && (
        <DividerProperties data={block.data as DividerBlockData} onChange={(d) => update(d)} />
      )}
      {block.type === 'spacer' && (
        <SpacerProperties data={block.data as SpacerBlockData} onChange={(d) => update(d)} />
      )}
      {block.type === 'social_links' && (
        <SocialLinksProperties data={block.data as SocialLinksBlockData} onChange={(d) => update(d)} />
      )}
      {block.type === 'two_column' && (
        <div className="text-xs text-gray-500">
          Edit the left and right columns by selecting blocks within them. Two-column blocks contain nested blocks.
        </div>
      )}
    </div>
  );
}

// ─── Per-type property editors ───────────────────────────────

function TextProperties({
  data,
  variables,
  onChange,
}: {
  data: TextBlockData;
  variables: VariableDefinition[];
  onChange: (d: Partial<TextBlockData>) => void;
}) {
  const [cursorPos, setCursorPos] = useState<number | null>(null);

  function insertVariable(variable: string) {
    const pos = cursorPos ?? data.content.length;
    const newContent = data.content.slice(0, pos) + variable + data.content.slice(pos);
    onChange({ content: newContent });
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-600">Content</label>
        <VariableInserter variables={variables} onInsert={insertVariable} label="Variable" />
      </div>
      <textarea
        value={data.content}
        onChange={(e) => onChange({ content: e.target.value })}
        onBlur={(e) => setCursorPos(e.target.selectionStart)}
        rows={5}
        className="w-full rounded border border-gray-200 px-3 py-2 text-sm text-base sm:text-sm"
        placeholder="Enter text content... Use **bold** and *italic* and [links](url)"
      />
      <p className="text-xs text-gray-400">Supports **bold**, *italic*, and [links](url).</p>
      <AlignSelect value={data.align || 'left'} onChange={(align) => onChange({ align })} />
    </>
  );
}

function HeadingProperties({
  data,
  onChange,
}: {
  data: HeadingBlockData;
  onChange: (d: Partial<HeadingBlockData>) => void;
}) {
  return (
    <>
      <FormField label="Heading Text" htmlFor="heading-text">
        <Input
          id="heading-text"
          value={data.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Enter heading text"
        />
      </FormField>
      <FormField label="Level" htmlFor="heading-level">
        <Select
          id="heading-level"
          value={String(data.level)}
          onChange={(e) => onChange({ level: parseInt(e.target.value) as 1 | 2 | 3 })}
        >
          <option value="1">H1 — Large</option>
          <option value="2">H2 — Medium</option>
          <option value="3">H3 — Small</option>
        </Select>
      </FormField>
      <AlignSelect value={data.align || 'left'} onChange={(align) => onChange({ align })} />
    </>
  );
}

function ButtonProperties({
  data,
  variables,
  onChange,
}: {
  data: ButtonBlockData;
  variables: VariableDefinition[];
  onChange: (d: Partial<ButtonBlockData>) => void;
}) {
  return (
    <>
      <FormField label="Button Text" htmlFor="btn-text">
        <Input
          id="btn-text"
          value={data.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Click me"
        />
      </FormField>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-600">URL</label>
        <VariableInserter variables={variables} onInsert={(v) => onChange({ url: data.url + v })} label="Variable" />
      </div>
      <Input
        value={data.url}
        onChange={(e) => onChange({ url: e.target.value })}
        placeholder="https://... or {booking_url}"
      />
      <FormField label="Color" htmlFor="btn-color">
        <Select
          id="btn-color"
          value={data.color}
          onChange={(e) => onChange({ color: e.target.value })}
        >
          <option value="primary">Primary (Brand)</option>
          <option value="accent">Accent (Brand)</option>
        </Select>
      </FormField>
      <AlignSelect value={data.align || 'center'} onChange={(align) => onChange({ align })} />
    </>
  );
}

function ImageProperties({
  data,
  onChange,
}: {
  data: ImageBlockData;
  onChange: (d: Partial<ImageBlockData>) => void;
}) {
  return (
    <>
      <FormField label="Image URL" htmlFor="img-src">
        <Input
          id="img-src"
          type="url"
          value={data.src}
          onChange={(e) => onChange({ src: e.target.value })}
          placeholder="https://..."
        />
      </FormField>
      <FormField label="Alt Text" htmlFor="img-alt">
        <Input
          id="img-alt"
          value={data.alt}
          onChange={(e) => onChange({ alt: e.target.value })}
          placeholder="Describe the image"
        />
      </FormField>
      <FormField label="Width (px)" htmlFor="img-width">
        <Input
          id="img-width"
          type="number"
          min={100}
          max={560}
          step={10}
          value={data.width || 560}
          onChange={(e) => onChange({ width: parseInt(e.target.value) || 560 })}
        />
      </FormField>
      <FormField label="Click-through Link (optional)" htmlFor="img-link">
        <Input
          id="img-link"
          type="url"
          value={data.link || ''}
          onChange={(e) => onChange({ link: e.target.value || undefined })}
          placeholder="https://..."
        />
      </FormField>
    </>
  );
}

function PhotoGalleryProperties({
  data,
  onChange,
}: {
  data: PhotoGalleryBlockData;
  onChange: (d: Partial<PhotoGalleryBlockData>) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      <FormField label="Mode" htmlFor="gallery-mode">
        <Select
          id="gallery-mode"
          value={data.mode}
          onChange={(e) => onChange({ mode: e.target.value as 'manual' | 'dynamic' })}
        >
          <option value="manual">Manual — Pick specific photos</option>
          <option value="dynamic">Dynamic — Auto-select at send time</option>
        </Select>
      </FormField>

      {data.mode === 'manual' && (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowPicker(!showPicker)}>
            {showPicker ? 'Hide Photo Browser' : `Browse Photos (${data.pairs?.length || 0} selected)`}
          </Button>
          {showPicker && (
            <div className="rounded-lg border border-gray-200 p-3">
              <PhotoGalleryPicker
                selectedPairs={data.pairs || []}
                onSelect={(pairs: PhotoPair[]) => onChange({ pairs })}
                maxPairs={4}
              />
            </div>
          )}
        </>
      )}

      {data.mode === 'dynamic' && (
        <>
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-600">Match customer&apos;s service</label>
            <Switch
              checked={data.service_match ?? true}
              onCheckedChange={(v) => onChange({ service_match: v })}
            />
          </div>
          <FormField label="Max Pairs" htmlFor="gallery-limit">
            <Input
              id="gallery-limit"
              type="number"
              min={1}
              max={4}
              value={data.limit || 2}
              onChange={(e) => onChange({ limit: parseInt(e.target.value) || 2 })}
            />
          </FormField>
        </>
      )}

      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-600">Show &quot;View Gallery&quot; link</label>
        <Switch
          checked={data.gallery_link ?? true}
          onCheckedChange={(v) => onChange({ gallery_link: v })}
        />
      </div>
    </>
  );
}

function CouponProperties({
  data,
  variables,
  onChange,
}: {
  data: CouponBlockData;
  variables: VariableDefinition[];
  onChange: (d: Partial<CouponBlockData>) => void;
}) {
  return (
    <>
      <FormField label="Heading" htmlFor="coupon-heading">
        <Input
          id="coupon-heading"
          value={data.heading}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Your Exclusive Offer"
        />
      </FormField>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-600">Code Variable</label>
        <VariableInserter
          variables={variables.filter((v) => v.key === 'coupon_code')}
          onInsert={(v) => onChange({ code_variable: v })}
          label="Insert"
        />
      </div>
      <Input
        value={data.code_variable}
        onChange={(e) => onChange({ code_variable: e.target.value })}
        placeholder="{coupon_code}"
        className="font-mono"
      />
      <FormField label="Description" htmlFor="coupon-desc">
        <Input
          id="coupon-desc"
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="15% off your next detail"
        />
      </FormField>
      <FormField label="Style" htmlFor="coupon-style">
        <Select
          id="coupon-style"
          value={data.style}
          onChange={(e) => onChange({ style: e.target.value as 'card' | 'banner' | 'inline' })}
        >
          <option value="card">Card (bordered box)</option>
          <option value="banner">Banner (full-width colored)</option>
          <option value="inline">Inline (text only)</option>
        </Select>
      </FormField>
    </>
  );
}

function DividerProperties({
  data,
  onChange,
}: {
  data: DividerBlockData;
  onChange: (d: Partial<DividerBlockData>) => void;
}) {
  return (
    <>
      <FormField label="Style" htmlFor="divider-style">
        <Select
          id="divider-style"
          value={data.style}
          onChange={(e) => onChange({ style: e.target.value as 'solid' | 'dashed' | 'dotted' })}
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </Select>
      </FormField>
      <FormField label="Color" htmlFor="divider-color">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={data.color || '#cccccc'}
            onChange={(e) => onChange({ color: e.target.value })}
            className="h-8 w-8 cursor-pointer rounded border border-gray-200"
          />
          <Input
            id="divider-color"
            value={data.color || '#cccccc'}
            onChange={(e) => onChange({ color: e.target.value })}
            className="flex-1 font-mono text-sm"
          />
        </div>
      </FormField>
    </>
  );
}

function SpacerProperties({
  data,
  onChange,
}: {
  data: SpacerBlockData;
  onChange: (d: Partial<SpacerBlockData>) => void;
}) {
  return (
    <FormField label="Height (px)" htmlFor="spacer-height">
      <Input
        id="spacer-height"
        type="number"
        min={5}
        max={100}
        step={5}
        value={data.height}
        onChange={(e) => onChange({ height: parseInt(e.target.value) || 20 })}
      />
      <div className="mt-2 rounded bg-gray-100" style={{ height: data.height }} />
    </FormField>
  );
}

function SocialLinksProperties({
  data,
  onChange,
}: {
  data: SocialLinksBlockData;
  onChange: (d: Partial<SocialLinksBlockData>) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-600">Use Brand Kit social links</label>
        <Switch
          checked={data.use_brand_kit}
          onCheckedChange={(v) => onChange({ use_brand_kit: v })}
        />
      </div>
      {data.use_brand_kit ? (
        <p className="text-xs text-gray-400">
          Links will be pulled from your Brand Kit settings. Edit them in the Brand Settings tab.
        </p>
      ) : (
        <p className="text-xs text-gray-400">
          Custom social links are not yet supported. Use Brand Kit links.
        </p>
      )}
    </>
  );
}

// ─── Shared helpers ──────────────────────────────────────────

function AlignSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: 'left' | 'center' | 'right') => void;
}) {
  return (
    <FormField label="Alignment" htmlFor="align">
      <Select id="align" value={value} onChange={(e) => onChange(e.target.value as 'left' | 'center' | 'right')}>
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </Select>
    </FormField>
  );
}
