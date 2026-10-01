/**
 * To Do — Google Apps Script backend
 *
 * This file is the entire server. It reads and writes a tab called "Tasks"
 * in whichever spreadsheet it is attached to.
 *
 * It is attached because you created it from inside the Sheet:
 *   Extensions > Apps Script
 * That is why there is no spreadsheet ID or URL anywhere in this file, and
 * why nothing in your public GitHub repo points at your data.
 *
 * Two entry points, both called automatically by Google:
 *   doGet(e)  — a browser asking for tasks
 *   doPost(e) — the page changing something
 *
 * Both always reply with JSON:
 *   { "ok": true,  "tasks": [ ... ] }
 *   { "ok": false, "error": "what went wrong" }
 */

var SHEET_NAME = 'Tasks';
var HEADERS = ['id', 'task', 'completed', 'archived', 'created', 'updated'];
var MAX_TASK_LENGTH = 500;

// Column numbers, so the code below reads clearly.
var COL_ID = 1;
var COL_TASK = 2;
var COL_COMPLETED = 3;
var COL_ARCHIVED = 4;
var COL_CREATED = 5;
var COL_UPDATED = 6;


/* ---------------------------------------------------------------- *
 * Entry points
 * ---------------------------------------------------------------- */

/**
 * Handles GET.
 *
 *   /exec                 the live list
 *   /exec?view=archive    archived tasks, most recently finished first
 *
 * Archived tasks are fetched only when you open the archive screen. If they
 * came back with every request, a year of finished tasks would ride along
 * with every checkbox you tick.
 */
function doGet(e) {
  try {
    var wantArchive = !!(e && e.parameter && e.parameter.view === 'archive');
    return json({ ok: true, tasks: readTasks(wantArchive) });
  } catch (err) {
    return json({ ok: false, error: message(err) });
  }
}

/**
 * Handles POST. The page sends ordinary form fields, so Apps Script hands
 * them over already parsed in e.parameter — no JSON decoding needed.
 *
 *   action=add      id, task
 *   action=update   id, and task and/or completed
 *   action=delete   id
 *   action=reorder  order      (task ids, comma separated, in the new order)
 *   action=archive  ids, archived     (comma separated ids; archived=true|false)
 *
 * Any request may also carry view=archive, meaning "reply with the archive
 * rather than the live list".
 */
function doPost(e) {
  // Two devices saving at the same moment could otherwise read the same
  // sheet state and overwrite each other. The lock makes the second wait.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json({ ok: false, error: 'Server was busy. Try that again.' });
  }

  try {
    var p = (e && e.parameter) || {};
    var action = String(p.action || '');

    if (action === 'add') {
      addTask(p);
    } else if (action === 'update') {
      updateTask(p);
    } else if (action === 'delete') {
      deleteTask(p);
    } else if (action === 'reorder') {
      reorderTasks(p);
    } else if (action === 'archive') {
      setArchived(p);
    } else {
      return json({ ok: false, error: 'Unknown action: ' + action });
    }

    return json({ ok: true, tasks: readTasks(p.view === 'archive') });
  } catch (err) {
    return json({ ok: false, error: message(err) });
  } finally {
    lock.releaseLock();
  }
}


/* ---------------------------------------------------------------- *
 * Actions
 * ---------------------------------------------------------------- */

/** New tasks go to the top of the list. */
function addTask(p) {
  var text = clean(p.task);
  var id = String(p.id || '').trim();
  if (!id) throw new Error('Missing task id.');

  var sh = sheet();

  // The page generates the id before sending. If a row with this id already
  // exists, this is a double-tap or a retry of a request that succeeded, so
  // there is nothing left to do.
  if (findRow(sh, id)) return;

  var now = new Date().toISOString();

  // Row 1 is the header, so the newest task becomes row 2.
  sh.insertRowBefore(2);
  sh.getRange(2, 1, 1, HEADERS.length)
    .setValues([[id, text, String(p.completed) === 'true', false,
                 String(p.created || '') || now, now]]);
}

function updateTask(p) {
  var id = String(p.id || '').trim();
  if (!id) throw new Error('Missing task id.');

  var sh = sheet();
  var row = findRow(sh, id);
  if (!row) throw new Error('That task no longer exists. It may have been deleted on another device.');

  if (p.task !== undefined) {
    sh.getRange(row, COL_TASK).setValue(clean(p.task));
  }
  if (p.completed !== undefined) {
    // Form fields always arrive as strings, so "true" has to become true.
    sh.getRange(row, COL_COMPLETED).setValue(String(p.completed) === 'true');
  }
  sh.getRange(row, COL_UPDATED).setValue(new Date().toISOString());
}

function deleteTask(p) {
  var id = String(p.id || '').trim();
  if (!id) throw new Error('Missing task id.');

  var sh = sheet();
  var row = findRow(sh, id);
  if (!row) return; // already gone — treat as success
  sh.deleteRow(row);
}

/** Archive or restore a batch of tasks in a single write. */
function setArchived(p) {
  var ids = String(p.ids || '').split(',').filter(nonEmpty);
  if (!ids.length) return;

  var archived = String(p.archived) === 'true';
  var wanted = {};
  for (var i = 0; i < ids.length; i++) wanted[ids[i]] = true;

  var sh = sheet();
  var last = sh.getLastRow();
  if (last < 2) return;

  var range = sh.getRange(2, 1, last - 1, HEADERS.length);
  var rows = range.getValues();
  var now = new Date().toISOString();
  var touched = false;

  for (var r = 0; r < rows.length; r++) {
    if (!wanted[String(rows[r][COL_ID - 1])]) continue;
    rows[r][COL_ARCHIVED - 1] = archived;
    rows[r][COL_UPDATED - 1] = now;
    touched = true;
  }
  if (touched) range.setValues(rows);
}

/**
 * Rewrites the live tasks into the order the page sends.
 *
 * The page batches every arrow tap locally and sends the finished order
 * once, when you leave reorder mode. Archived rows stay exactly where they
 * are: only the row positions currently held by live tasks are rewritten.
 */
function reorderTasks(p) {
  var order = String(p.order || '').split(',').filter(nonEmpty);
  if (!order.length) return;

  var sh = sheet();
  var last = sh.getLastRow();
  if (last < 2) return;

  var range = sh.getRange(2, 1, last - 1, HEADERS.length);
  var rows = range.getValues();

  var slots = [];   // indexes of the rows currently holding live tasks
  var byId = {};
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL_ID - 1]).trim() === '') continue;
    if (isTrue(rows[i][COL_ARCHIVED - 1])) continue;
    slots.push(i);
    byId[String(rows[i][COL_ID - 1])] = rows[i];
  }

  var sequence = [];
  var used = {};
  for (var j = 0; j < order.length; j++) {
    if (byId[order[j]] && !used[order[j]]) {
      sequence.push(byId[order[j]]);
      used[order[j]] = true;
    }
  }
  // Anything added on another device since the page loaded is kept rather
  // than dropped; it goes to the end.
  for (var k = 0; k < slots.length; k++) {
    var id = String(rows[slots[k]][COL_ID - 1]);
    if (!used[id]) { sequence.push(rows[slots[k]]); used[id] = true; }
  }

  if (sequence.length !== slots.length) return; // something is off; change nothing
  for (var m = 0; m < slots.length; m++) rows[slots[m]] = sequence[m];
  range.setValues(rows);
}


/* ---------------------------------------------------------------- *
 * Sheet helpers
 * ---------------------------------------------------------------- */

/**
 * Returns the Tasks tab, creating it and its header row on first use.
 * This is why there is no manual sheet setup: run it once and the
 * spreadsheet configures itself.
 */
function sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);

  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function readTasks(wantArchive) {
  var sh = sheet();
  var last = sh.getLastRow();
  if (last < 2) return [];

  var rows = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var out = [];

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[COL_ID - 1]).trim() === '') continue; // skip blank rows
    if (isTrue(r[COL_ARCHIVED - 1]) !== !!wantArchive) continue;

    out.push({
      id: String(r[COL_ID - 1]),
      task: String(r[COL_TASK - 1]),
      completed: isTrue(r[COL_COMPLETED - 1]),
      created: asText(r[COL_CREATED - 1]),
      updated: asText(r[COL_UPDATED - 1])
    });
  }

  // The live list keeps sheet order, which is the order you arranged.
  // The archive shows what you finished most recently, first.
  if (wantArchive) {
    out.sort(function (a, b) { return a.updated < b.updated ? 1 : -1; });
  }
  return out;
}

/** Row number of the task with this id, or 0 if there isn't one. */
function findRow(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return 0;

  var ids = sh.getRange(2, COL_ID, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2; // +2: header row, 1-indexed
  }
  return 0;
}


/* ---------------------------------------------------------------- *
 * Small utilities
 * ---------------------------------------------------------------- */

function clean(value) {
  var text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) throw new Error('A task needs some text.');
  if (text.length > MAX_TASK_LENGTH) {
    throw new Error('That task is too long. Limit is ' + MAX_TASK_LENGTH + ' characters.');
  }
  return text;
}

function nonEmpty(s) {
  return !!s;
}

function isTrue(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

/** Sheets sometimes turns a date string back into a Date. Normalise it. */
function asText(value) {
  if (value instanceof Date) return value.toISOString();
  return value === undefined || value === null ? '' : String(value);
}

function message(err) {
  return String((err && err.message) || err);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
