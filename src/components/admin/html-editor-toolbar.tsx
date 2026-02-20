'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Bold,
  Italic,
  Link as LinkIcon,
  Image as ImageIcon,
  PlayCircle,
  RectangleHorizontal,
  Minus,
  MoveVertical,
  Table,
  Columns2,
  AlertCircle,
  ChevronDown as AccordionIcon,
  Share2,
  MapPin,
  Code,
  List,
  Eye,
  EyeOff,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { IconPicker } from '@/components/admin/icon-picker';
import { HtmlImageManager } from '@/components/admin/html-image-manager';
import { LinkDialog } from '@/components/admin/toolbar-items/link-dialog';
import { VideoEmbedDialog } from '@/components/admin/toolbar-items/video-embed-dialog';
import { ButtonDialog } from '@/components/admin/toolbar-items/button-dialog';
import { DividerDialog } from '@/components/admin/toolbar-items/divider-dialog';
import { TableDialog } from '@/components/admin/toolbar-items/table-dialog';
import { ColumnsDialog } from '@/components/admin/toolbar-items/columns-dialog';
import { CalloutDialog } from '@/components/admin/toolbar-items/callout-dialog';
import { AccordionDialog } from '@/components/admin/toolbar-items/accordion-dialog';
import { SocialLinksDialog } from '@/components/admin/toolbar-items/social-links-dialog';
import { MapEmbedDialog } from '@/components/admin/toolbar-items/map-embed-dialog';
import { EmbedDialog } from '@/components/admin/toolbar-items/embed-dialog';
import { ListDialog } from '@/components/admin/toolbar-items/list-dialog';

// ---------------------------------------------------------------------------
// HtmlEditorToolbar — shared toolbar for footer HTML + CMS page editors
// ---------------------------------------------------------------------------

export interface HtmlEditorToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
  onTogglePreview: () => void;
  isPreviewMode: boolean;
  context?: 'footer' | 'cms';
}

// Heading options
const HEADINGS = [
  {
    label: 'H2',
    tag: 'h2',
    classes: 'text-2xl font-bold text-site-text mb-3',
  },
  {
    label: 'H3',
    tag: 'h3',
    classes: 'text-xl font-semibold text-site-text mb-2',
  },
  {
    label: 'H4',
    tag: 'h4',
    classes: 'text-lg font-medium text-site-text mb-2',
  },
] as const;

// Spacer sizes
const SPACERS = [
  { label: 'Small', px: 16 },
  { label: 'Medium', px: 32 },
  { label: 'Large', px: 48 },
  { label: 'XL', px: 64 },
] as const;

export function HtmlEditorToolbar({
  textareaRef,
  value,
  onChange,
  onTogglePreview,
  isPreviewMode,
  context = 'cms',
}: HtmlEditorToolbarProps) {
  // Dialog visibility states
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [showSpacerMenu, setShowSpacerMenu] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showImageManager, setShowImageManager] = useState(false);
  const [showVideoDialog, setShowVideoDialog] = useState(false);
  const [showButtonDialog, setShowButtonDialog] = useState(false);
  const [showDividerDialog, setShowDividerDialog] = useState(false);
  const [showTableDialog, setShowTableDialog] = useState(false);
  const [showColumnsDialog, setShowColumnsDialog] = useState(false);
  const [showCalloutDialog, setShowCalloutDialog] = useState(false);
  const [showAccordionDialog, setShowAccordionDialog] = useState(false);
  const [showSocialDialog, setShowSocialDialog] = useState(false);
  const [showMapDialog, setShowMapDialog] = useState(false);
  const [showEmbedDialog, setShowEmbedDialog] = useState(false);
  const [showListDialog, setShowListDialog] = useState(false);

  // -------------------------------------------------------------------------
  // Insert helpers
  // -------------------------------------------------------------------------

  const insertAtCursor = useCallback(
    (html: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        onChange(value + html);
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = value.substring(0, start);
      const after = value.substring(end);
      const newValue = before + html + after;
      onChange(newValue);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd =
          start + html.length;
      });
    },
    [textareaRef, value, onChange]
  );

  const wrapSelection = useCallback(
    (before: string, after: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = value.substring(start, end);
      const insertion = selected || 'text';
      const replacement = before + insertion + after;
      const newValue =
        value.substring(0, start) + replacement + value.substring(end);
      onChange(newValue);

      requestAnimationFrame(() => {
        textarea.focus();
        if (selected) {
          textarea.selectionStart = start + before.length;
          textarea.selectionEnd =
            start + before.length + selected.length;
        } else {
          textarea.selectionStart = start + before.length;
          textarea.selectionEnd = start + before.length + 4; // select "text"
        }
      });
    },
    [textareaRef, value, onChange]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1.5">
        {/* GROUP 1: Text Formatting */}
        <ToolbarBtn icon={Bold} title="Bold" onClick={() => wrapSelection('<strong>', '</strong>')} />
        <ToolbarBtn icon={Italic} title="Italic" onClick={() => wrapSelection('<em>', '</em>')} />

        {/* Heading dropdown */}
        <div className="relative">
          <button
            type="button"
            title="Heading"
            onClick={() => setShowHeadingMenu(!showHeadingMenu)}
            className="flex items-center gap-0.5 p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700"
          >
            <span className="text-xs font-bold">H</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          {showHeadingMenu && (
            <div className="absolute z-20 top-full left-0 mt-1 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1">
              {HEADINGS.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => {
                    wrapSelection(
                      `\n<${h.tag} class="${h.classes}">`,
                      `</${h.tag}>\n`
                    );
                    setShowHeadingMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  {h.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <ToolbarBtn icon={LinkIcon} title="Link" onClick={() => setShowLinkDialog(true)} />

        <Separator />

        {/* GROUP 2: Media */}
        <ToolbarBtn icon={ImageIcon} title="Image" onClick={() => setShowImageManager(true)} />
        {context === 'cms' && (
          <ToolbarBtn icon={PlayCircle} title="Video Embed" onClick={() => setShowVideoDialog(true)} />
        )}
        <IconPicker
          onInsert={insertAtCursor}
          triggerClassName="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700"
        />

        <Separator />

        {/* GROUP 3: Layout */}
        <ToolbarBtn icon={RectangleHorizontal} title="Button" onClick={() => setShowButtonDialog(true)} />
        <ToolbarBtn icon={Minus} title="Divider" onClick={() => setShowDividerDialog(true)} />

        {/* Spacer dropdown */}
        <div className="relative">
          <button
            type="button"
            title="Spacer"
            onClick={() => setShowSpacerMenu(!showSpacerMenu)}
            className="flex items-center gap-0.5 p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700"
          >
            <MoveVertical className="h-4 w-4" />
          </button>
          {showSpacerMenu && (
            <div className="absolute z-20 top-full left-0 mt-1 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1">
              {SPACERS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    insertAtCursor(
                      `\n<div style="height:${s.px}px;" aria-hidden="true"></div>\n`
                    );
                    setShowSpacerMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  {s.label} ({s.px}px)
                </button>
              ))}
            </div>
          )}
        </div>

        <ToolbarBtn icon={Table} title="Table" onClick={() => setShowTableDialog(true)} />
        {context === 'cms' && (
          <ToolbarBtn icon={Columns2} title="Columns" onClick={() => setShowColumnsDialog(true)} />
        )}

        <Separator />

        {/* GROUP 4: Blocks */}
        {context === 'cms' && (
          <ToolbarBtn icon={AlertCircle} title="Callout" onClick={() => setShowCalloutDialog(true)} />
        )}
        {context === 'cms' && (
          <ToolbarBtn icon={AccordionIcon} title="Accordion / FAQ" onClick={() => setShowAccordionDialog(true)} />
        )}
        <ToolbarBtn icon={Share2} title="Social Links" onClick={() => setShowSocialDialog(true)} />
        <ToolbarBtn icon={MapPin} title="Map" onClick={() => setShowMapDialog(true)} />
        <ToolbarBtn icon={Code} title="Embed" onClick={() => setShowEmbedDialog(true)} />
        <ToolbarBtn icon={List} title="List" onClick={() => setShowListDialog(true)} />

        <div className="flex-1" />

        {/* Preview toggle */}
        <button
          type="button"
          onClick={onTogglePreview}
          className="p-1.5 rounded text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          title={isPreviewMode ? 'Edit' : 'Preview'}
        >
          {isPreviewMode ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* ---- Dialogs ---- */}

      <LinkDialog
        open={showLinkDialog}
        onInsert={(html) => {
          insertAtCursor(html);
          setShowLinkDialog(false);
        }}
        onClose={() => setShowLinkDialog(false)}
      />

      <HtmlImageManager
        open={showImageManager}
        onOpenChange={setShowImageManager}
        onInsert={insertAtCursor}
        folder={context === 'footer' ? 'footer' : 'cms'}
      />

      <VideoEmbedDialog
        open={showVideoDialog}
        onInsert={(html) => {
          insertAtCursor(html);
          setShowVideoDialog(false);
        }}
        onClose={() => setShowVideoDialog(false)}
      />

      <ButtonDialog
        open={showButtonDialog}
        onInsert={(html) => {
          insertAtCursor(html);
          setShowButtonDialog(false);
        }}
        onClose={() => setShowButtonDialog(false)}
      />

      <DividerDialog
        open={showDividerDialog}
        onInsert={(html) => {
          insertAtCursor(html);
          setShowDividerDialog(false);
        }}
        onClose={() => setShowDividerDialog(false)}
      />

      <TableDialog
        open={showTableDialog}
        onInsert={(html) => {
          insertAtCursor(html);
          setShowTableDialog(false);
        }}
        onClose={() => setShowTableDialog(false)}
      />

      <ColumnsDialog
        open={showColumnsDialog}
        onInsert={(html) => {
          insertAtCursor(html);
          setShowColumnsDialog(false);
        }}
        onClose={() => setShowColumnsDialog(false)}
      />

      <CalloutDialog
        open={showCalloutDialog}
        onInsert={(html) => {
          insertAtCursor(html);
          setShowCalloutDialog(false);
        }}
        onClose={() => setShowCalloutDialog(false)}
      />

      <AccordionDialog
        open={showAccordionDialog}
        onInsert={(html) => {
          insertAtCursor(html);
          setShowAccordionDialog(false);
        }}
        onClose={() => setShowAccordionDialog(false)}
      />

      <SocialLinksDialog
        open={showSocialDialog}
        onInsert={(html) => {
          insertAtCursor(html);
          setShowSocialDialog(false);
        }}
        onClose={() => setShowSocialDialog(false)}
      />

      <MapEmbedDialog
        open={showMapDialog}
        onInsert={(html) => {
          insertAtCursor(html);
          setShowMapDialog(false);
        }}
        onClose={() => setShowMapDialog(false)}
      />

      <EmbedDialog
        open={showEmbedDialog}
        onInsert={(html) => {
          insertAtCursor(html);
          setShowEmbedDialog(false);
        }}
        onClose={() => setShowEmbedDialog(false)}
      />

      <ListDialog
        open={showListDialog}
        onInsert={(html) => {
          insertAtCursor(html);
          setShowListDialog(false);
        }}
        onClose={() => setShowListDialog(false)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Toolbar helpers
// ---------------------------------------------------------------------------

function ToolbarBtn({
  icon: Icon,
  title,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function Separator() {
  return <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />;
}
