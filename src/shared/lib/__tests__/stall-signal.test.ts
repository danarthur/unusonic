import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeStallSignalFromRaw } from '../stall-signal';

const NOW = new Date('2026-04-16T12:00:00Z');

const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe('computeStallSignalFromRaw', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('stage 0 (inquiry)', () => {
    it('reports Inquiry name and 7-day default threshold', () => {
      const signal = computeStallSignalFromRaw({
        status: 'inquiry',
        createdAt: daysAgo(3),
        proposalCreatedAt: null,
        proposalUpdatedAt: null,
        proposedDate: null,
        currentStage: 0,
      });
      expect(signal).toMatchObject({
        stageName: 'Inquiry',
        threshold: 7,
        daysInStage: 3,
        stalled: false,
        urgent: false,
      });
    });

    it('marks stalled at or past threshold', () => {
      const signal = computeStallSignalFromRaw({
        status: 'inquiry',
        createdAt: daysAgo(8),
        proposalCreatedAt: null,
        proposalUpdatedAt: null,
        proposedDate: null,
        currentStage: 0,
      });
      expect(signal?.stalled).toBe(true);
      expect(signal?.daysInStage).toBe(8);
    });

    it('halves threshold when proposed_date is within 60 days', () => {
      const signal = computeStallSignalFromRaw({
        status: 'inquiry',
        createdAt: daysAgo(5),
        proposalCreatedAt: null,
        proposalUpdatedAt: null,
        proposedDate: '2026-06-01',
        currentStage: 0,
      });
      expect(signal?.urgent).toBe(true);
      expect(signal?.threshold).toBe(4);
    });
  });

  describe('stage 1 (proposal)', () => {
    it('reports Proposal name and 14-day default threshold, measured from proposal.created_at', () => {
      const signal = computeStallSignalFromRaw({
        status: 'proposal',
        createdAt: daysAgo(30),
        proposalCreatedAt: daysAgo(5),
        proposalUpdatedAt: null,
        proposedDate: null,
        currentStage: 1,
      });
      expect(signal).toMatchObject({
        stageName: 'Proposal',
        threshold: 14,
        daysInStage: 5,
        stalled: false,
      });
    });

    it('returns null when proposalCreatedAt is missing', () => {
      const signal = computeStallSignalFromRaw({
        status: 'proposal',
        createdAt: daysAgo(10),
        proposalCreatedAt: null,
        proposalUpdatedAt: null,
        proposedDate: null,
        currentStage: 1,
      });
      expect(signal).toBeNull();
    });

    it('urgent halves to 7 days', () => {
      const signal = computeStallSignalFromRaw({
        status: 'proposal',
        createdAt: daysAgo(30),
        proposalCreatedAt: daysAgo(7),
        proposalUpdatedAt: null,
        proposedDate: '2026-05-15',
        currentStage: 1,
      });
      expect(signal?.urgent).toBe(true);
      expect(signal?.threshold).toBe(7);
      expect(signal?.stalled).toBe(true);
    });
  });

  describe('stage 2 (contract_sent)', () => {
    it('reports Contract sent name and 5-day default threshold, measured from proposal.updated_at', () => {
      const signal = computeStallSignalFromRaw({
        status: 'contract_sent',
        createdAt: daysAgo(60),
        proposalCreatedAt: daysAgo(30),
        proposalUpdatedAt: daysAgo(2),
        proposedDate: null,
        currentStage: 2,
      });
      expect(signal).toMatchObject({
        stageName: 'Contract sent',
        threshold: 5,
        daysInStage: 2,
        stalled: false,
      });
    });

    it('returns null when proposalUpdatedAt is missing', () => {
      const signal = computeStallSignalFromRaw({
        status: 'contract_sent',
        createdAt: daysAgo(30),
        proposalCreatedAt: daysAgo(20),
        proposalUpdatedAt: null,
        proposedDate: null,
        currentStage: 2,
      });
      expect(signal).toBeNull();
    });

    it('urgent floors at 1 (preserves pre-refactor contract_sent behavior)', () => {
      const signal = computeStallSignalFromRaw({
        status: 'contract_sent',
        createdAt: daysAgo(60),
        proposalCreatedAt: daysAgo(30),
        proposalUpdatedAt: daysAgo(5),
        proposedDate: '2026-05-01',
        currentStage: 2,
        thresholdOverrides: { contract_sent: 1 },
      });
      expect(signal?.urgent).toBe(true);
      expect(signal?.threshold).toBe(1);
    });
  });

  describe('out of range', () => {
    it('returns null for stage 3', () => {
      const signal = computeStallSignalFromRaw({
        status: 'contract_signed',
        createdAt: daysAgo(5),
        proposalCreatedAt: daysAgo(3),
        proposalUpdatedAt: daysAgo(1),
        proposedDate: null,
        currentStage: 3,
      });
      expect(signal).toBeNull();
    });

    it('returns null for negative days in stage (future createdAt)', () => {
      const signal = computeStallSignalFromRaw({
        status: 'inquiry',
        createdAt: new Date(NOW.getTime() + 86400000).toISOString(),
        proposalCreatedAt: null,
        proposalUpdatedAt: null,
        proposedDate: null,
        currentStage: 0,
      });
      expect(signal).toBeNull();
    });
  });

  describe('stageRottingDaysOverride (Phase 2c workspace-owned threshold)', () => {
    it('uses stage override when provided and no playbook override is set', () => {
      const signal = computeStallSignalFromRaw({
        status: 'inquiry',
        createdAt: daysAgo(5),
        proposalCreatedAt: null,
        proposalUpdatedAt: null,
        proposedDate: null,
        currentStage: 0,
        stageRottingDaysOverride: 3,
      });
      expect(signal?.threshold).toBe(3);
      expect(signal?.stalled).toBe(true);
    });

    it('playbook override beats stage override', () => {
      const signal = computeStallSignalFromRaw({
        status: 'inquiry',
        createdAt: daysAgo(10),
        proposalCreatedAt: null,
        proposalUpdatedAt: null,
        proposedDate: null,
        currentStage: 0,
        thresholdOverrides: { inquiry: 20 },
        stageRottingDaysOverride: 3,
      });
      expect(signal?.threshold).toBe(20);
      expect(signal?.stalled).toBe(false);
    });

    it('falls back to hardcoded default when override is null', () => {
      const signal = computeStallSignalFromRaw({
        status: 'inquiry',
        createdAt: daysAgo(3),
        proposalCreatedAt: null,
        proposalUpdatedAt: null,
        proposedDate: null,
        currentStage: 0,
        stageRottingDaysOverride: null,
      });
      expect(signal?.threshold).toBe(7);
    });
  });

  describe('thresholdOverrides', () => {
    it('applies inquiry override', () => {
      const signal = computeStallSignalFromRaw({
        status: 'inquiry',
        createdAt: daysAgo(3),
        proposalCreatedAt: null,
        proposalUpdatedAt: null,
        proposedDate: null,
        currentStage: 0,
        thresholdOverrides: { inquiry: 2 },
      });
      expect(signal?.threshold).toBe(2);
      expect(signal?.stalled).toBe(true);
    });

    it('applies proposal override', () => {
      const signal = computeStallSignalFromRaw({
        status: 'proposal',
        createdAt: daysAgo(30),
        proposalCreatedAt: daysAgo(10),
        proposalUpdatedAt: null,
        proposedDate: null,
        currentStage: 1,
        thresholdOverrides: { proposal: 7 },
      });
      expect(signal?.threshold).toBe(7);
      expect(signal?.stalled).toBe(true);
    });
  });
});
