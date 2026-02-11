/**
 * Unit tests for update bundles (Update Orchestrator).
 * Each bundle execute(jobKey, db, context) should return { itemsTotal, itemsProcessed, itemsUpdated, itemsFailed }.
 */

const path = require('path');

describe('Update bundles', () => {
  const mockContext = {
    onProgress: (p, step) => {}
  };

  const mockDb = {};

  describe('maintenanceBundle', () => {
    it('exports execute function', () => {
      const maintenanceBundle = require('../../src/services/updates/bundles/maintenanceBundle');
      expect(maintenanceBundle.execute).toBeDefined();
      expect(typeof maintenanceBundle.execute).toBe('function');
    });

    it('throws for unknown job key', async () => {
      const maintenanceBundle = require('../../src/services/updates/bundles/maintenanceBundle');
      await expect(
        maintenanceBundle.execute('maintenance.unknown', mockDb, mockContext)
      ).rejects.toThrow('Unknown maintenance job');
    });
  });

  describe('marketBundle', () => {
    it('loads and has execute', () => {
      const marketBundle = require('../../src/services/updates/bundles/marketBundle');
      expect(marketBundle.execute).toBeDefined();
      expect(typeof marketBundle.execute).toBe('function');
    });

    it('throws for unknown job key', async () => {
      const marketBundle = require('../../src/services/updates/bundles/marketBundle');
      await expect(
        marketBundle.execute('market.unknown', mockDb, mockContext)
      ).rejects.toThrow('Unknown market job');
    });
  });

  describe('priceBundle', () => {
    it('loads and has execute', () => {
      const priceBundle = require('../../src/services/updates/bundles/priceBundle');
      expect(priceBundle.execute).toBeDefined();
      expect(typeof priceBundle.execute).toBe('function');
    });

    it('throws for unknown job key', async () => {
      const priceBundle = require('../../src/services/updates/bundles/priceBundle');
      await expect(
        priceBundle.execute('prices.unknown', mockDb, mockContext)
      ).rejects.toThrow('Unknown price job');
    });
  });

  describe('knowledgeBundle', () => {
    it('loads and has execute', () => {
      const knowledgeBundle = require('../../src/services/updates/bundles/knowledgeBundle');
      expect(knowledgeBundle.execute).toBeDefined();
      expect(typeof knowledgeBundle.execute).toBe('function');
    });

    it('throws for unknown job key', async () => {
      const knowledgeBundle = require('../../src/services/updates/bundles/knowledgeBundle');
      await expect(
        knowledgeBundle.execute('knowledge.unknown', mockDb, mockContext)
      ).rejects.toThrow('Unknown knowledge job');
    });
  });

  describe('analyticsBundle', () => {
    it('loads and has execute', () => {
      const analyticsBundle = require('../../src/services/updates/bundles/analyticsBundle');
      expect(analyticsBundle.execute).toBeDefined();
      expect(typeof analyticsBundle.execute).toBe('function');
    });

    it('throws for unknown job key', async () => {
      const analyticsBundle = require('../../src/services/updates/bundles/analyticsBundle');
      await expect(
        analyticsBundle.execute('analytics.unknown', mockDb, mockContext)
      ).rejects.toThrow('Unknown analytics job');
    });
  });

  describe('etfBundle', () => {
    it('loads and has execute', () => {
      const etfBundle = require('../../src/services/updates/bundles/etfBundle');
      expect(etfBundle.execute).toBeDefined();
      expect(typeof etfBundle.execute).toBe('function');
    });
  });

  describe('fundamentalsBundle', () => {
    it('loads and has execute', () => {
      const fundamentalsBundle = require('../../src/services/updates/bundles/fundamentalsBundle');
      expect(fundamentalsBundle.execute).toBeDefined();
      expect(typeof fundamentalsBundle.execute).toBe('function');
    });
  });

  describe('ipoBundle', () => {
    it('loads and has execute', () => {
      const ipoBundle = require('../../src/services/updates/bundles/ipoBundle');
      expect(ipoBundle.execute).toBeDefined();
      expect(typeof ipoBundle.execute).toBe('function');
    });
  });

  describe('secBundle', () => {
    it('loads and has execute', () => {
      const secBundle = require('../../src/services/updates/bundles/secBundle');
      expect(secBundle.execute).toBeDefined();
      expect(typeof secBundle.execute).toBe('function');
    });
  });

  describe('sentimentBundle', () => {
    it('loads and has execute', () => {
      const sentimentBundle = require('../../src/services/updates/bundles/sentimentBundle');
      expect(sentimentBundle.execute).toBeDefined();
      expect(typeof sentimentBundle.execute).toBe('function');
    });
  });
});
