/**
 * Unit tests for Master Scheduler.
 * Validates instantiation and getStatus() shape without starting cron.
 */

jest.mock('../../src/jobs/earningsRefresh', () => ({
  refreshEarnings: jest.fn().mockResolvedValue(undefined)
}));

describe('Master Scheduler', () => {
  let MasterScheduler;
  let scheduler;

  beforeAll(() => {
    MasterScheduler = require('../../src/jobs/masterScheduler');
    scheduler = new MasterScheduler();
  });

  it('instantiates without throwing', () => {
    expect(scheduler).toBeDefined();
    expect(scheduler.projectRoot).toBeDefined();
    expect(scheduler.runningJobs).toBeInstanceOf(Set);
    expect(scheduler.jobHistory).toBeInstanceOf(Array);
  });

  it('getStatus() returns expected shape', () => {
    const status = scheduler.getStatus();
    expect(status).toBeDefined();
    expect(typeof status.isRunning).toBe('boolean');
    expect(Array.isArray(status.runningJobs)).toBe(true);
    expect(Array.isArray(status.recentHistory)).toBe(true);
    expect(Array.isArray(status.scheduledJobs)).toBe(true);
  });

  it('getStatus() includes scheduled job definitions', () => {
    const status = scheduler.getStatus();
    expect(status.scheduledJobs.length).toBeGreaterThan(0);
    const first = status.scheduledJobs[0];
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('schedule');
  });

  it('scheduled jobs include Price Update and Sentiment Refresh', () => {
    const status = scheduler.getStatus();
    const names = status.scheduledJobs.map(j => j.name);
    expect(names).toContain('Price Update');
    expect(names).toContain('Sentiment Refresh');
  });
});
