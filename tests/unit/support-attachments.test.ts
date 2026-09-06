import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_ATTACHMENT_TOTAL_BYTES,
  checkAttachment,
  formatBytes,
  resolveAttachmentType,
  ticketStatusLabel,
  ticketStatusTone,
} from '../../lib/support-attachments.ts'

const MB = 1024 * 1024

// ── resolveAttachmentType ────────────────────────────────────────────────────

test('the three allowed MIME types pass through', () => {
  assert.equal(resolveAttachmentType('a.pdf', 'application/pdf'), 'application/pdf')
  assert.equal(resolveAttachmentType('a.png', 'image/png'), 'image/png')
  assert.equal(resolveAttachmentType('a.jpg', 'image/jpeg'), 'image/jpeg')
})

test('image/jpg (Android spelling) normalises to image/jpeg', () => {
  assert.equal(resolveAttachmentType('a.jpg', 'image/jpg'), 'image/jpeg')
})

test('missing or generic MIME falls back to the extension', () => {
  assert.equal(resolveAttachmentType('scan.PDF', undefined), 'application/pdf')
  assert.equal(resolveAttachmentType('shot.jpeg', 'application/octet-stream'), 'image/jpeg')
})

test('anything else is refused', () => {
  assert.equal(resolveAttachmentType('clip.mov', 'video/quicktime'), null)
  assert.equal(resolveAttachmentType('notes.docx', undefined), null)
  assert.equal(resolveAttachmentType('photo.heic', 'image/heic'), null)
})

// ── checkAttachment: the 10 MB budget ────────────────────────────────────────

test('a file that fits is accepted with its canonical type', () => {
  const result = checkAttachment({ name: 'a.pdf', size: 2 * MB, mimeType: 'application/pdf' }, 0)
  assert.equal(result.ok, true)
  assert.equal(result.ok && result.contentType, 'application/pdf')
})

test('the cap is TOTAL: 6 MB + 5 MB is refused, 6 MB + 4 MB is not', () => {
  assert.equal(checkAttachment({ name: 'b.pdf', size: 5 * MB }, 6 * MB).ok, false)
  assert.equal(checkAttachment({ name: 'b.pdf', size: 4 * MB }, 6 * MB).ok, true)
})

test('exactly 10 MB total is allowed; one byte more is not', () => {
  assert.equal(checkAttachment({ name: 'c.png', size: MAX_ATTACHMENT_TOTAL_BYTES }, 0).ok, true)
  assert.equal(checkAttachment({ name: 'c.png', size: MAX_ATTACHMENT_TOTAL_BYTES + 1 }, 0).ok, false)
})

test('the over-cap message names the file and the room left', () => {
  const result = checkAttachment({ name: 'big.pdf', size: 5 * MB }, 9 * MB)
  assert.equal(result.ok, false)
  assert.match(result.ok ? '' : result.message, /big\.pdf/)
  assert.match(result.ok ? '' : result.message, /1\.0 MB/)
})

test('a wrong-type file is refused before the size is considered', () => {
  const result = checkAttachment({ name: 'clip.mov', size: 1, mimeType: 'video/quicktime' }, 0)
  assert.equal(result.ok, false)
  assert.match(result.ok ? '' : result.message, /PDF, PNG or JPG/)
})

test('an unreadable size is refused rather than counted as zero', () => {
  assert.equal(checkAttachment({ name: 'a.pdf', size: 0 }, 0).ok, false)
  assert.equal(checkAttachment({ name: 'a.pdf', size: Number.NaN }, 0).ok, false)
})

// ── formatBytes ──────────────────────────────────────────────────────────────

test('formatBytes reads in the units the copy uses', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(2048), '2 KB')
  assert.equal(formatBytes(3.5 * MB), '3.5 MB')
})

// ── ticketStatusLabel: never a raw enum ──────────────────────────────────────

test('every stored status reads as plain language', () => {
  assert.equal(ticketStatusLabel('open'), 'Open')
  assert.equal(ticketStatusLabel('in_progress'), 'In progress')
  assert.equal(ticketStatusLabel('on_hold'), 'On hold')
  assert.equal(ticketStatusLabel('rejected'), 'Rejected')
  assert.equal(ticketStatusLabel('resolved'), 'Completed')
  assert.equal(ticketStatusLabel('closed'), 'Closed')
})

test('hyphenated legacy values and missing values still read as words', () => {
  assert.equal(ticketStatusLabel('in-progress'), 'In progress')
  assert.equal(ticketStatusLabel(undefined), 'Open')
})

test('an unknown status is humanised, never rendered raw', () => {
  assert.equal(ticketStatusLabel('awaiting_patient'), 'Awaiting patient')
})

test('tone buckets follow the label', () => {
  assert.equal(ticketStatusTone('in_progress'), 'active')
  assert.equal(ticketStatusTone('resolved'), 'done')
  assert.equal(ticketStatusTone('rejected'), 'stopped')
  assert.equal(ticketStatusTone('on_hold'), 'waiting')
})
