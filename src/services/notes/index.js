// src/services/notes/index.js
// Notes service module - combines all notes-related services

const { NotesService, getNotesService } = require('./notesService');
const { ThesisService, getThesisService } = require('./thesisService');
const { SnapshotService, getSnapshotService } = require('./snapshotService');

/**
 * Factory function to create all notes-related services
 * @param {Database} db - The database connection
 * @returns {Object} - Object containing all notes services
 */
function createNotesServices(db) {
  const notesService = getNotesService(db);
  const thesisService = getThesisService(db, notesService);
  const snapshotService = getSnapshotService(db);

  return {
    notes: notesService,
    thesis: thesisService,
    snapshot: snapshotService
  };
}

module.exports = {
  NotesService,
  ThesisService,
  SnapshotService,
  getNotesService,
  getThesisService,
  getSnapshotService,
  createNotesServices
};
