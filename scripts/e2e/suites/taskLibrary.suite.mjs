// ─────────────────────────────────────────────────────────────────────────────
// Suite: Master Task Library & Project Task Template — full lifecycle E2E
//
// Exercises the deployed /api Cloud Functions + Firestore rules end to end and
// asserts every system rule from the spec. Everything it creates is a throwaway
// test project (+ one e2e-only master task), all torn down afterward. It never
// edits a real master task.
// ─────────────────────────────────────────────────────────────────────────────

export async function run(h) {
  const { api, createDoc, trackDocPath, trackProjectScope, test, assert, assertEq, db, fs, RUN_ID, log } = h;
  const { collection, getDocs, getDoc, doc, query, where } = fs;

  let projectId = null;
  let copiedTasks = [];
  let e2eMasterId = null;
  let e2eMasterCode = `E2E-${RUN_ID.toUpperCase()}`;

  await test('master library is seeded (idempotent)', async () => {
    const r = await api('/taskLibrary/master/seed', 'POST');
    assert(r.ok, `seed failed: ${r.status} ${JSON.stringify(r.data)}`);
    // Confirm at least the baseline exists now.
    const snap = await getDocs(query(collection(db, 'masterTasks'), where('archivedAt', '==', null)));
    assert(snap.size > 0, 'no active master tasks after seed');
  });

  await test('create throwaway test project', async () => {
    const ref = await createDoc('projects', {
      name: `__E2E Test Home ${RUN_ID}`,
      status: 'active',
      clientName: 'E2E Tester',
    });
    projectId = ref.id;
    trackProjectScope(projectId);
    log(`    test project: ${projectId}`);
  });

  await test('generate project tasks from master (all optional)', async () => {
    const r = await api(`/taskLibrary/projects/${projectId}/generate`, 'POST', { includeAllOptional: true });
    assert(r.ok, `generate failed: ${r.status} ${JSON.stringify(r.data)}`);
    assert(r.data.created > 0, 'generate created 0 tasks');
    log(`    generated ${r.data.created} tasks`);
  });

  await test('project tasks preserve masterTaskId + masterVersionUsed', async () => {
    const snap = await getDocs(query(collection(db, 'projectTasks'), where('projectId', '==', projectId)));
    copiedTasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    assert(copiedTasks.length > 0, 'no project tasks found');
    const fromMaster = copiedTasks.filter((t) => t.masterTaskId);
    assert(fromMaster.length > 0, 'no tasks carry masterTaskId');
    for (const t of fromMaster) {
      assert(t.masterTaskId, `task ${t.taskCode} missing masterTaskId`);
      assert(typeof t.masterVersionUsed === 'number', `task ${t.taskCode} missing masterVersionUsed`);
    }
  });

  await test('skipping a task WITHOUT a reason is rejected', async () => {
    const t = copiedTasks.find((x) => x.status !== 'Skipped');
    const r = await api(`/taskLibrary/projects/${projectId}/tasks/${t.id}`, 'PATCH', { status: 'Skipped' });
    assertEq(r.status, 400, 'expected 400 skipping without reason');
  });

  await test('skipping a task WITH a reason succeeds', async () => {
    const t = copiedTasks.find((x) => x.status !== 'Skipped');
    const r = await api(`/taskLibrary/projects/${projectId}/tasks/${t.id}`, 'PATCH', {
      status: 'Skipped',
      changeReason: 'E2E: not applicable to this test home',
    });
    assert(r.ok, `skip-with-reason failed: ${r.status} ${JSON.stringify(r.data)}`);
  });

  await test('quality-gate task cannot complete with unmet acceptance criteria', async () => {
    const t = copiedTasks.find((x) => x.qualityGate && (x.acceptanceCriteria || []).length > 0 && x.status !== 'Skipped');
    assert(t, 'no quality-gate task with criteria found to test');
    const r = await api(`/taskLibrary/projects/${projectId}/tasks/${t.id}`, 'PATCH', { status: 'Complete' });
    assertEq(r.status, 400, 'expected 400 completing quality-gate with unmet criteria');
  });

  await test('quality-gate task completes once criteria are confirmed', async () => {
    const t = copiedTasks.find((x) => x.qualityGate && (x.acceptanceCriteria || []).length > 0 && x.status !== 'Skipped');
    const done = (t.acceptanceCriteria || []).map((c) => ({ ...c, done: true }));
    const r = await api(`/taskLibrary/projects/${projectId}/tasks/${t.id}`, 'PATCH', {
      status: 'Complete',
      acceptanceCriteria: done,
    });
    assert(r.ok, `complete-with-criteria failed: ${r.status} ${JSON.stringify(r.data)}`);
  });

  await test('custom project task can be added', async () => {
    const r = await api(`/taskLibrary/projects/${projectId}/tasks`, 'POST', {
      title: `E2E custom task ${RUN_ID}`,
      phase: 'Preconstruction',
      assignedRole: 'gc',
    });
    assertEq(r.status, 201, `custom task create: ${r.status} ${JSON.stringify(r.data)}`);
    assert(r.data.isCustomTask === true, 'custom task not flagged isCustomTask');
  });

  // ── Independence: editing the master never changes existing project copies ───
  await test('create an e2e-only master task + regenerate to copy it', async () => {
    const r = await api('/taskLibrary/master', 'POST', {
      taskCode: e2eMasterCode,
      title: 'E2E Independence Check',
      description: 'ORIGINAL description',
      phase: 'Preconstruction',
      isRequired: true,
    });
    assertEq(r.status, 201, `master create: ${r.status} ${JSON.stringify(r.data)}`);
    e2eMasterId = r.data.id;
    trackDocPath('masterTasks', e2eMasterId); // ensure teardown deletes it
    const gen = await api(`/taskLibrary/projects/${projectId}/generate`, 'POST', { includeAllOptional: true });
    assert(gen.ok, `regenerate failed: ${gen.status}`);
    assert(gen.data.created >= 1, 'regenerate did not add the new master task');
  });

  await test('editing master bumps version but does NOT alter project copy', async () => {
    // Find the project copy of our e2e master task.
    const snap = await getDocs(query(collection(db, 'projectTasks'), where('projectId', '==', projectId)));
    const copy = snap.docs.map((d) => ({ id: d.id, ...d.data() })).find((t) => t.taskCode === e2eMasterCode);
    assert(copy, 'project copy of e2e master task not found');
    assertEq(copy.description, 'ORIGINAL description', 'project copy has wrong starting description');

    // Edit the master.
    const edit = await api(`/taskLibrary/master/${e2eMasterId}`, 'PATCH', { description: 'CHANGED master description' });
    assert(edit.ok, `master edit failed: ${edit.status}`);

    // Master version bumped + description changed.
    const masterSnap = await getDoc(doc(db, 'masterTasks', e2eMasterId));
    assertEq(masterSnap.data().description, 'CHANGED master description', 'master description did not change');
    assert((masterSnap.data().version || 1) >= 2, 'master version did not bump on edit');

    // Project copy is UNCHANGED (independence).
    const copySnap = await getDoc(doc(db, 'projectTasks', copy.id));
    assertEq(copySnap.data().description, 'ORIGINAL description', 'project copy changed when master was edited — independence violated!');
  });

  await test('closeout analysis produces improvement suggestions', async () => {
    const r = await api(`/taskLibrary/projects/${projectId}/closeout/analyze`, 'POST');
    assert(r.ok, `closeout analyze failed: ${r.status} ${JSON.stringify(r.data)}`);
    // We added a custom task + skipped a task → expect suggestions.
    assert((r.data.suggestions ?? 0) >= 1, 'expected >=1 improvement suggestion');
    log(`    ${r.data.suggestions} suggestion(s), ${r.data.written} written`);
  });

  await test('archived master tasks are not copied into a fresh project', async () => {
    // Archive the e2e master task, make a 2nd throwaway project, generate, and
    // confirm the archived task is absent.
    const arch = await api(`/taskLibrary/master/${e2eMasterId}/archive`, 'POST');
    assert(arch.ok, `archive failed: ${arch.status}`);
    const ref = await createDoc('projects', { name: `__E2E Archived-Check ${RUN_ID}`, status: 'active' });
    trackProjectScope(ref.id);
    const gen = await api(`/taskLibrary/projects/${ref.id}/generate`, 'POST', { includeAllOptional: true });
    assert(gen.ok, `generate(2) failed: ${gen.status}`);
    const snap = await getDocs(query(collection(db, 'projectTasks'), where('projectId', '==', ref.id)));
    const hasArchived = snap.docs.some((d) => d.data().taskCode === e2eMasterCode);
    assert(!hasArchived, 'archived master task was copied into a new project!');
  });
}
