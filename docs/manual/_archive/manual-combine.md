# Combine User Manual — All Chapters into One Document

Read CLAUDE.md and docs/dev/FILE_TREE.md first. Do a `git pull`.

---

## Goal

Combine all 12 manual chapters into a single comprehensive markdown document at `docs/manual/COMPLETE_MANUAL.md`.

## Instructions

1. Read all 12 chapter files in order:
```bash
cat docs/manual/01-getting-started.md
cat docs/manual/02-dashboard.md
cat docs/manual/03-job-management.md
cat docs/manual/04-pos.md
cat docs/manual/05-customers.md
cat docs/manual/06-services-pricing.md
cat docs/manual/07-cms-website.md
cat docs/manual/08-online-store.md
cat docs/manual/09-marketing.md
cat docs/manual/10-accounting.md
cat docs/manual/11-settings.md
cat docs/manual/12-developer-guide.md
```

2. Create `docs/manual/COMPLETE_MANUAL.md` that:
   - Starts with a title: `# Smart Details Auto Spa — Complete User Manual`
   - Adds a generated date line
   - Adds audience note (Owners/Admins, Staff/Managers, Developers)
   - Includes a **full Table of Contents** with links to every H2 and H3 heading in the document using markdown anchor links
   - Then includes ALL content from chapters 01-12 in order, separated by horizontal rules (`---`)
   - Preserves every heading, paragraph, table, blockquote, list, and code block exactly as written — do NOT summarize, trim, or rewrite anything
   - Adjust heading levels so the document hierarchy works as one file:
     - Each chapter's `# Title` becomes `## Title` (H2)
     - Each chapter's `## Section` becomes `### Section` (H3)
     - Each chapter's `### Subsection` becomes `#### Subsection` (H4)
   - Remove any "Last updated" lines from individual chapters (the combined doc has its own date)

3. Do NOT modify the individual chapter files — they stay as-is.

## Verify

- [ ] Every section from every chapter is present — do a line count comparison:
```bash
# Total lines across all chapters
wc -l docs/manual/0*.md docs/manual/1*.md

# Combined manual lines (should be similar or slightly more due to TOC)
wc -l docs/manual/COMPLETE_MANUAL.md
```
- [ ] Table of contents has working anchor links for every H2 and H3
- [ ] No content was dropped, summarized, or rewritten
- [ ] Heading hierarchy is clean (no H1 except the document title)

---

Update CHANGELOG.md. Then:
```
git add -A && git commit -m "docs: combined complete user manual (all 12 chapters)" && git push
```
After commit print: `⚠️ Session complete.`
