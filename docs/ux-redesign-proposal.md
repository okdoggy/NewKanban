# UX Redesign Proposal

## Goal

Shift NewKanban from a feature-broad workspace shell into a daily operating surface for product, design, and engineering teams.

The redesign should improve four things first:

- trust in what the UI says
- speed of daily triage and execution
- visibility of who is doing what
- clarity of navigation across desktop and mobile

## Product Positioning

NewKanban should not try to feel like Jira, Slack, Notion, and Miro at the same time.

The better direction for the current codebase is:

- primary spine: task execution and review
- secondary spine: planning surfaces that support execution
- supporting layers: workspace admin, notifications, audit, automation

That means:

- `Overview` becomes a true execution hub
- `Kanban` becomes the main work surface
- `Gantt`, `Calendar`, and `Whiteboard` become supporting planning tools
- `Workspace Hub` moves out of the main task loop and becomes a separate shell state

## Current Constraints

This proposal is grounded in the current implementation:

- main shell state is concentrated in [workspace-app.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/workspace-app.tsx)
- current top-level views are defined in [config.ts](/Users/doggy/2026/NewKanban/src/components/workspace/config.ts)
- most actions open dialogs from [surfaces.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/surfaces.tsx)
- search currently filters tasks only in [task-utils.ts](/Users/doggy/2026/NewKanban/src/components/workspace/task-utils.ts)
- whiteboard is a shared Excalidraw scene in [whiteboard-canvas.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/whiteboard-canvas.tsx)
- realtime presence is workspace-scoped and user-deduped in [use-workspace-realtime.ts](/Users/doggy/2026/NewKanban/src/components/workspace/hooks/use-workspace-realtime.ts) and [workspace-app.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/workspace-app.tsx)

## Target Information Architecture

### Primary navigation

Replace the current equal-weight view list with this order:

1. Home
2. My Work
3. Board
4. Timeline
5. Calendar
6. Canvas
7. Inbox

Map these to current implementation with minimal disruption:

- `Home` reuses and redesigns `overview`
- `My Work` is a focused task slice inside the existing task model
- `Board` reuses `kanban`
- `Timeline` reuses `gantt`
- `Calendar` reuses `calendar`
- `Canvas` reuses `whiteboard`
- `Inbox` starts as a redesigned notifications/activity surface

`Workspace Hub`, member management, audit, MFA, and invite flows should move under a separate workspace/settings entry instead of competing with daily work views.

### Object hierarchy

Keep the existing data model for now, but present it to users in a clearer hierarchy:

- Workspace
- Focus surface
- Work items
- Discussion and attachments
- Planning overlays

In UI terms:

- tasks are the primary object
- events, notes, and whiteboard scenes are support objects
- members, notifications, and audit are admin/coordination objects

## Navigation Model

### Desktop

Use a two-zone shell:

- left rail: stable navigation, workspace switcher, primary create
- main area: one dominant work surface
- right context rail: agenda
- centor pop up : task details, agenda, collaborators, or inbox context

Specific changes:

- keep the current left rail, but reduce it to action-oriented items
- move search to a permanent top-center field on desktop instead of a hidden popover
- move notifications out of a small dropdown into a dedicated `Inbox` panel or view
- make primary CTA persistent: `New task`
- add a visible `Quick actions` button next to search

### Mobile

Current mobile is not supported.

## Key Screen Redesigns

### 1. Home

Purpose:

- morning check-in
- personal triage
- surface blockers and deadlines

Replace the current metric-heavy overview with four stacked sections:

- `My priority queue`
- `Needs review`
- `Blocked or overdue`
- `Today schedule`

Rules:

- `My priority queue` must only show assigned or explicitly relevant work
- `Needs review` must only show review-state tasks
- `Blocked or overdue` must not mix with healthy work
- `Today schedule` should stay date-accurate and event-first

UI recommendations:

- reduce KPI cards from four equal-weight blocks to one compact summary row
- make task rows denser and more scannable than current cards
- show assignee, due date, status, and last update without opening a modal
- add `Open board`, `Open timeline`, `Create task` shortcuts at top

### 2. My Work

This is the missing screen in the current product.

Purpose:

- give every user one place to process their tasks without scanning the whole workspace

Structure:

- tabs: `Assigned`, `Created by me`, `Watching`, `Done recently`
- sort chips: `Today`, `This week`, `Overdue`, `Review`
- compact list rows with keyboard-friendly selection behavior

Implementation fit:

- can be derived from existing `workspace.tasks`
- no backend model change is required for phase 1

### 3. Board

The current board is usable but too interaction-heavy per card.

Changes:

- make the default card simpler
- move due date editing and progress slider out of the card body
- keep only title, assignee, due date, status signals, and one or two badges
- open a right-side detail panel on click instead of making each card itself a dense edit form
- keep drag-and-drop and quick-add
- move secondary inline edits into hover or row actions

Desired board hierarchy:

- lane header with count, WIP, add action
- compact cards
- selection opens persistent detail context

### 4. Timeline

Timeline should answer planning questions, not act like another task browser.

Changes:

- keep drag/resize behavior
- add a clear filter bar above the chart: owner, status, priority, date span
- add a summary strip above the chart: active work, blocked work, review load
- add dependency warnings in the side list before the visual bars
- make zoom control and granularity more explicit and persistent

### 5. Calendar

Calendar should behave like a coordination surface tied to work.

Changes:

- separate event types visually into workspace events, task-linked milestones, and external read-only feed items
- keep selected day agenda below, but add empty-state actions tied to tasks
- when a task has a due date but no linked event, show a lightweight suggested milestone row
- move event creation toward task-linked defaults rather than blank event creation

### 6. Canvas

Canvas should stop pretending to be two products at once.

Direction:

- phase 1: position it as `Planning Canvas`
- clarify that it is for workshops, flows, journey maps, and decision capture
- add a left-side utility panel for templates and recent boards
- expose structured note entry from the existing `NoteDialog` model
- allow `Convert to task` directly from selected notes or a side list

Important:

- do not promise Miro-level live co-edit feedback yet
- instead, show last editor, last updated time, and active viewers in canvas header

### 7. Inbox

Build a dedicated inbox surface from the current notifications plus activity model.

Sections:

- `Approvals`
- `Mentions`
- `Workspace requests`
- `Recent changes`

Phase 1 behavior:

- use current notifications and activity feed together
- make rows actionable with clear open/approve/reject affordances
- mark read state visibly

Phase 2 behavior:

- add mention-triggered notifications from task comments
- add task status change subscriptions


### Search

The current placeholder over-promises.

Phase 1:

- relabel it as `Search tasks`
- keep current implementation honest

Phase 2:

- upgrade to real federated search across tasks, notes, members, and events
- results grouped by type
- keyboard open with `/` or `Cmd/Ctrl+K`

### Quick create

Add one consistent quick-create model:

- default button in shell header
- options: task, event, note
- remembers last used action

### Error handling

Current mutation failures mostly log to console.

New rule:

- every write action gets visible feedback
- optimistic updates need inline rollback messaging on failure
- failures should preserve user context

## Detailed Recommendations By Existing File

### [workspace-app.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/workspace-app.tsx)

- split shell navigation, toolbar, content routing, and overlay management into separate subcomponents
- remove popover-only search
- reduce `workspaceHubOpen` as a primary branch in the daily shell
- convert notification dropdown into full inbox surface

### [views.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/views.tsx)

- redesign `OverviewView` into a work queue hub
- simplify `TaskCard`
- keep `KanbanView`, `GanttView`, `CalendarView` behavior, but reframe hierarchy
- expand `WhiteboardView` with structured support UI around the canvas

### [surfaces.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/surfaces.tsx)

- keep dialog primitives for atomic actions
- migrate long-form task interaction away from modal-first UX
- revive `NoteDialog` through an actual entry point in canvas flow

### [task-utils.ts](/Users/doggy/2026/NewKanban/src/components/workspace/task-utils.ts)

- keep current filter logic for phase 1
- do not label it as global search until expanded

### [whiteboard-canvas.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/whiteboard-canvas.tsx)

- add canvas header metadata
- add surrounding utility rails before attempting deeper multiplayer behavior

## Rollout Plan

### Phase 1: Shell clarity

- add Home/My Work/Inbox IA
- fix mobile navigation
- simplify search labeling
- convert notification dropdown into inbox surface

### Phase 2: Task execution quality

- simplify board cards
- move task detail to side panel or mobile sheet
- improve status-specific queues on Home
- add visible mutation feedback

### Phase 3: Planning integration

- align timeline and calendar around task-linked planning
- expose note-to-task flow in canvas
- surface saved views and automation from obvious entry points

### Phase 4: Collaboration depth

- per-device presence
- mention-based inbox items
- richer active-view and active-edit signals
- stronger realtime verification coverage

## Success Criteria

- a new user can understand where to start within 10 seconds
- daily individual work can be processed without opening 5 different views
- inbox and review items are visible without hidden dropdowns
- mobile users can switch core views without relying on desktop nav
- overview numbers and queues feel trustworthy
- canvas is clearly positioned as a planning tool, not an ambiguous extra surface

## Recommended First Build Slice

If this proposal is implemented incrementally, the highest-value first slice is:

1. redesign `Overview` into `Home`
2. add `My Work`
3. promote notifications into `Inbox`
4. simplify board cards
5. replace task detail modal with a persistent side panel on desktop

That sequence gives the product a real daily workflow without requiring a backend rewrite first.
