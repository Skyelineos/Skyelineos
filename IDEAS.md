# Skyline OS — Ideas / Backlog

Running list of features Tyler wants to add. Date format: YYYY-MM-DD.

---

## Field walkthrough media capture

**Date added:** 2026-05-06
**Priority:** TBD
**Status:** idea

When Tyler is on a job site walking around, he wants a single button in the GC portal that lets him:

- Open the camera and capture **photos and videos** quickly
- Tag each capture so it can be **assigned to a specific subcontractor**
- Have the assigned sub see the capture in their portal/feed (with optional note attached)

### Why
- Faster than taking pictures in the iOS camera and then trying to remember which sub they were for
- Creates an auditable trail of jobsite issues per sub
- Lets Tyler dictate punch-list items in the field rather than at the desk later

### Initial design notes
- "Capture & Assign" floating action button on the project detail / mobile project view
- Camera opens → after capture, modal asks: which subcontractor + optional note + which trade/area
- Save to Firebase Storage (`projects/{projectId}/walkthrough/{captureId}`) with metadata in Firestore
- Sub sees it in `SubcontractorPortal` under a new "Items From GC" section
- Notification (in-app + optionally email/text) to the sub when assigned
- Bonus: voice-to-text for the note while on site

### Open questions
- Should this also be assignable to a project employee, not just a sub?
- Tie into punch list items? (capture → punch list item → sub assignment)
- Mobile-first UX is critical — needs to feel as fast as the iOS camera roll
