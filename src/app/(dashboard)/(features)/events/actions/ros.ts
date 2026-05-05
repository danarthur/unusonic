'use server';

/**
 * Thin wrappers that delegate to the canonical feature-layer actions.
 * Required because 'use server' files cannot use re-exports — only async function declarations.
 */

import * as ros from '@/features/run-of-show/api/ros';
import type { Cue, Section } from '@/features/run-of-show/model/run-of-show-types';

export async function fetchCues(eventId: string) {
  return ros.fetchCues(eventId);
}

export async function updateCueOrder(items: Cue[]) {
  return ros.updateCueOrder(items);
}

export async function createCue(eventId: string, cue: Partial<Cue>) {
  return ros.createCue(eventId, cue);
}

export async function updateCue(eventId: string, cueId: string, updates: Partial<Cue>) {
  return ros.updateCue(eventId, cueId, updates);
}

export async function deleteCue(eventId: string, cueId: string) {
  return ros.deleteCue(eventId, cueId);
}

export async function duplicateCue(eventId: string, cueId: string) {
  return ros.duplicateCue(eventId, cueId);
}

export async function fetchSections(eventId: string) {
  return ros.fetchSections(eventId);
}

export async function createSection(eventId: string, section: Partial<Section>) {
  return ros.createSection(eventId, section);
}

export async function updateSection(eventId: string, sectionId: string, updates: Partial<Section>) {
  return ros.updateSection(eventId, sectionId, updates);
}

export async function deleteSection(eventId: string, sectionId: string) {
  return ros.deleteSection(eventId, sectionId);
}

export async function updateSectionOrder(sections: Section[]) {
  return ros.updateSectionOrder(sections);
}

export async function fetchRosTemplates() {
  return ros.fetchRosTemplates();
}

export async function saveRosTemplate(name: string, description: string | null, cues: Cue[], sections: Section[]) {
  return ros.saveRosTemplate(name, description, cues, sections);
}

export async function deleteRosTemplate(templateId: string) {
  return ros.deleteRosTemplate(templateId);
}

export async function applyRosTemplate(eventId: string, templateId: string) {
  return ros.applyRosTemplate(eventId, templateId);
}
