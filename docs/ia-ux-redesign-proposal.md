# IA / UX Redesign Proposal

## Purpose

This proposal turns the current product from a multi-view workspace shell into a collaboration operating system with a clear daily entry point, stronger domain model, and simpler navigation.

The redesign is grounded in the current repository, especially:

- Five top-level views currently drive the shell: [src/components/workspace/config.ts:18](../src/components/workspace/config.ts#L18)
- The primary data model is still task / note / event / member centric: [src/lib/types.ts:57](../src/lib/types.ts#L57), [src/lib/types.ts:175](../src/lib/types.ts#L175)
- Search and notification entry points are shallow overlays in the header: [src/components/workspace/workspace-app.tsx:982](../src/components/workspace/workspace-app.tsx#L982), [src/components/workspace/workspace-app.tsx:991](../src/components/workspace/workspace-app.tsx#L991)
- The main shell conditionally swaps entire surfaces by `view`: [src/components/workspace/workspace-app.tsx:1039](../src/components/workspace/workspace-app.tsx#L1039)
- Decision-note structures exist, but the visible whiteboard surface only renders the freeform canvas: [src/components/workspace/surfaces.tsx:258](../src/components/workspace/surfaces.tsx#L258), [src/components/workspace/views.tsx:774](../src/components/workspace/views.tsx#L774)

## Current Diagnosis

The product already has real collaboration infrastructure, but the user experience is still shaped like a demo shell:

- Navigation is organized around views, not around workflows.
- The home surface does not reliably answer "what do I need to do next?"
- Search behaves like a task filter, even though the UI suggests broader scope: [src/components/workspace/workspace-app.tsx:986](../src/components/workspace/workspace-app.tsx#L986), [src/components/workspace/task-utils.ts:20](../src/components/workspace/task-utils.ts#L20)
- Notifications behave like a dropdown inbox rather than a real triage system: [src/lib/types.ts:246](../src/lib/types.ts#L246), [src/components/workspace/workspace-app.tsx:1005](../src/components/workspace/workspace-app.tsx#L1005)
- Presence is useful but too coarse for serious collaboration awareness: [src/lib/types.ts:196](../src/lib/types.ts#L196), [src/components/workspace/workspace-app.tsx:975](../src/components/workspace/workspace-app.tsx#L975)
- The product contains both structured decision notes and a whiteboard canvas, but they are not unified into one collaboration story: [src/lib/types.ts:85](../src/lib/types.ts#L85), [src/lib/types.ts:104](../src/lib/types.ts#L104)

## North Star

NewKanban should feel like:

- A daily execution hub for each teammate
- A planning system for leads and managers
- A decision capture surface for async collaboration
- A lightweight operating system where work, decisions, schedules, and discussion stay linked

The product should no longer ask users to choose between "Overview / Kanban / Gantt / Calendar / Whiteboard" as if those are separate destinations. Instead, users should navigate by intent:

- What do I need to do?
- What is my team shipping?
- What decisions are open?
- What requires my attention?

## 1. Target Information Architecture

### Primary Navigation

Replace the current five-view primary nav with this top-level IA:

1. `Home`
2. `My Work`
3. `Projects`
4. `Plan`
5. `Decisions`
6. `Inbox`
7. `Team`
8. `Admin`

### Surface Intent

#### Home

Purpose:

- Daily operating hub
- Personalized summary
- High-trust answer to "what matters now?"

Contains:

- My priority queue
- Due today / overdue / waiting on review
- Today calendar block
- Active blockers
- Recent mentions and requests

This replaces the current broad overview metrics and generic action cards with a more personal, operational landing surface. The current `OverviewView` is too workspace-generic: [src/components/workspace/views.tsx:172](../src/components/workspace/views.tsx#L172)

#### My Work

Purpose:

- Personal execution area
- Linear-style focused issue list

Contains:

- Assigned to me
- Created by me
- Mentioning me
- Watching
- Recently viewed

Views:

- List by default
- Board optional

This view should own the fastest task triage path. It should not be a modal-first surface.

#### Projects

Purpose:

- Team-facing execution and status
- The main place for shared delivery management

Hierarchy:

- Project list
- Project detail
- Within a project: `Board`, `List`, `Timeline`, `Calendar`, `Files`

This turns board / gantt / calendar into project-context subviews instead of first-class top-level destinations. The current shell makes all planning surfaces global: [src/components/workspace/workspace-app.tsx:1043](../src/components/workspace/workspace-app.tsx#L1043)

#### Plan

Purpose:

- Cross-project planning and scheduling
- Manager / lead coordination area

Contains:

- Cycle or sprint board
- Timeline by project
- Team workload
- Shared calendar
- Milestones

This is where Gantt and calendar belong as planning tools rather than universal app destinations.

#### Decisions

Purpose:

- Async decision-making and documentation
- The bridge between whiteboarding and execution

Contains:

- Decision list
- Active decision threads
- Decision board by status
- Canvas mode
- Convert decision to work item

The existing `WhiteboardNote` and `NoteDialog` structures should be promoted into this surface, then the Excalidraw canvas becomes one mode inside the decision workflow instead of a separate top-level app area: [src/components/workspace/surfaces.tsx:258](../src/components/workspace/surfaces.tsx#L258), [src/components/workspace/whiteboard-canvas.tsx:43](../src/components/workspace/whiteboard-canvas.tsx#L43)

#### Inbox

Purpose:

- A real attention queue
- Replace the current passive notification dropdown

Contains:

- Approvals
- Mentions
- Join requests
- Decision requests
- Review requests
- System notices

This should replace the current header popover as the main notification destination: [src/components/workspace/workspace-app.tsx:991](../src/components/workspace/workspace-app.tsx#L991)

#### Team

Purpose:

- People, capacity, presence, activity

Contains:

- Members
- Team status
- Presence map
- Workload by person
- Activity feed with durable links

#### Admin

Purpose:

- Security and workspace management

Contains:

- Workspace switching
- Roles
- Invites
- Audit logs
- MFA / account state
- Enterprise notices

This keeps auth and workspace admin surfaces visible but separates them from daily execution.

## 2. Object Model Changes

### Current Model

The current shared model is centered on:

- `Workspace`
- `TaskItem`
- `WhiteboardNote`
- `WhiteboardScene`
- `AgendaEvent`
- `NotificationItem`

Evidence: [src/lib/types.ts:57](../src/lib/types.ts#L57), [src/lib/types.ts:85](../src/lib/types.ts#L85), [src/lib/types.ts:104](../src/lib/types.ts#L104), [src/lib/types.ts:114](../src/lib/types.ts#L114), [src/lib/types.ts:175](../src/lib/types.ts#L175), [src/lib/types.ts:246](../src/lib/types.ts#L246)

### Target Model

Introduce new first-class entities:

1. `Project`
2. `Cycle`
3. `WorkItem`
4. `Decision`
5. `InboxItem`
6. `SavedViewPreset`
7. `PresenceSession`

### Proposed Changes

#### `TaskItem` -> `WorkItem`

Keep most current task fields, but promote it into a richer execution object.

Add:

- `projectId`
- `cycleId`
- `reporterUserId`
- `watcherUserIds`
- `reviewerUserIds`
- `state`
- `estimate`
- `rank`
- `parentId`
- `childIds`

Reason:

- The current model lacks project, cycle, and ownership context, which blocks portfolio and personal views: [src/lib/types.ts:57](../src/lib/types.ts#L57)

#### `WhiteboardNote` + `WhiteboardScene` -> `Decision`

Split the concept:

- `Decision`: structured async record
- `CanvasScene`: optional visual artifact attached to a decision or project

`Decision` should include:

- `id`
- `title`
- `summary`
- `status` (`draft`, `discussing`, `approved`, `blocked`, `converted`)
- `ownerUserId`
- `dueAt`
- `linkedWorkItemIds`
- `linkedProjectId`
- `threadCount`
- `voteSummary`
- `canvasSceneId`

Reason:

- The current `WhiteboardNote` is trying to be note, decision, and action seed at once: [src/lib/types.ts:85](../src/lib/types.ts#L85)

#### `NotificationItem` -> `InboxItem`

Replace the current generic notification object with a real attention object:

- `kind` (`mention`, `approval`, `review-request`, `join-request`, `decision-request`, `system`)
- `entityType`
- `entityId`
- `workspaceId`
- `projectId`
- `actorUserId`
- `readAt`
- `completedAt`
- `priority`

Reason:

- The current notification type system is too narrow for triage: [src/lib/types.ts:6](../src/lib/types.ts#L6)

#### `ActivityItem`

Add:

- `entityId`
- `entityUrl`
- `workspaceId`
- `projectId`

Reason:

- The current activity feed only stores `entityTitle`, which is too weak for reliable navigation: [src/lib/types.ts:133](../src/lib/types.ts#L133)

#### `PresenceMember` -> `PresenceSession`

Shift presence to session-scoped context:

- Keep `deviceId`
- Add `sessionId`
- Add `entityType`
- Add `entityId`
- Add `editingState`
- Add `lastAction`

Reason:

- Presence should answer "who is in this object and doing what?", not just "who is online in this workspace": [src/lib/types.ts:196](../src/lib/types.ts#L196)

## 3. Navigation Model

### Desktop Navigation

#### Left Rail

Persistent left rail with:

- Home
- My Work
- Projects
- Plan
- Decisions
- Inbox
- Team
- Admin

Rules:

- Stable labels
- One primary active section
- Workspace switcher pinned above the rail
- Create button pinned near top

#### Top Bar

Use the top bar for context, not for hidden utilities.

Contains:

- Current workspace / project / cycle context
- Global command palette trigger
- Search field, always visible
- Presence summary
- Quick create
- Profile

The current header uses popovers for search and notifications, which hides critical product entry points: [src/components/workspace/workspace-app.tsx:966](../src/components/workspace/workspace-app.tsx#L966)

### Mobile Navigation

The current left rail is desktop-only, so mobile needs a new model: [src/components/workspace/workspace-app.tsx:929](../src/components/workspace/workspace-app.tsx#L929)

Proposed bottom navigation:

- Home
- My Work
- Projects
- Inbox
- More

`More` opens:

- Plan
- Decisions
- Team
- Admin

### Search Model

Search becomes a global command/search surface, not a task filter.

Search modes:

- Work items
- Projects
- Decisions
- Members
- Events
- Commands

Key interactions:

- `Cmd/Ctrl + K` opens command palette
- Keyboard-first recent items
- Search results grouped by entity type
- Direct open on selection

### Quick Create Model

The create action should no longer assume only task creation.

Quick create menu:

- Work item
- Project
- Decision
- Event
- Invite teammate

### Secondary Navigation

Use secondary tabs inside sections.

Examples:

- Project: `Board`, `List`, `Timeline`, `Calendar`, `Files`
- Decisions: `List`, `Board`, `Canvas`, `Archive`
- Team: `Members`, `Capacity`, `Activity`
- Admin: `Members`, `Invites`, `Audit`, `Security`

This reduces top-level clutter while preserving current surface investment.

## 4. Major Surface Redesigns

### Home

#### Replace

- Generic KPI cards
- Generic workspace-wide "Today / Due soon / At risk / Needs attention"

#### With

- `My queue`
- `Needs my review`
- `Blocked waiting on others`
- `Today calendar`
- `Recent mentions`
- `Project health snapshot`

#### Why

The current overview is mathematically weak for personal execution. `todayTasks` is not actually "today": [src/components/workspace/workspace-app.tsx:396](../src/components/workspace/workspace-app.tsx#L396)

### My Work

#### Default layout

- Left: filtered list
- Right: persistent preview pane

#### Filters

- Assigned to me
- Mentioning me
- Watching
- Overdue
- This week
- Review queue

#### Interaction changes

- Single-click opens preview
- Enter opens full detail
- Inline triage from list
- Minimal card chrome

This should replace some of the heavy interaction density now inside `TaskCard`: [src/components/workspace/views.tsx:316](../src/components/workspace/views.tsx#L316)

### Project Detail

#### Core shell

- Header: name, status, lead, cycle, health
- Body tabs: board / list / timeline / calendar
- Right rail: activity, decisions, blockers

#### Key principle

Planning surfaces are contextual to a project, not global destinations.

### Decisions

#### Two modes

- Structured mode
- Canvas mode

#### Structured mode includes

- Decision summary
- Options
- Risks
- Owner
- Due date
- Votes
- Linked work items

#### Canvas mode includes

- Excalidraw scene attached to the decision
- Presence overlays
- Selection awareness

This preserves the current canvas investment while making it serve a real workflow.

### Inbox

#### Replace dropdown behavior

The current notification popover should become only a count + shortcut into the inbox section.

#### Inbox list rows

- Actor
- Reason
- Entity
- Due / urgency
- Action buttons inline

#### Action types

- Approve
- Review
- Open
- Resolve
- Snooze

## 5. Phased Rollout

### Phase 0: Truth and Entry Fixes

Goal:

- Improve trust without large architecture change

Changes:

- Make `Home` personal and truthful
- Fix search label vs behavior mismatch
- Turn notifications into a real page before changing the data model
- Add mobile nav

Likely file impact:

- [src/components/workspace/config.ts](../src/components/workspace/config.ts)
- [src/components/workspace/workspace-app.tsx](../src/components/workspace/workspace-app.tsx)
- [src/components/workspace/views.tsx](../src/components/workspace/views.tsx)
- [src/components/workspace/task-utils.ts](../src/components/workspace/task-utils.ts)

Expected outcome:

- Immediate UX quality lift
- Lower confusion
- Better day-one usability

### Phase 1: Navigation Shell Refactor

Goal:

- Move from view-first shell to workflow-first shell

Changes:

- Replace `VIEWS` model with section model
- Introduce persistent global search / command palette
- Move planning views under project and plan sections
- Move whiteboard under decisions

Likely file impact:

- [src/components/workspace/config.ts](../src/components/workspace/config.ts)
- [src/lib/types.ts](../src/lib/types.ts)
- [src/components/workspace/workspace-app.tsx](../src/components/workspace/workspace-app.tsx)

Expected outcome:

- Clearer product mental model
- Better navigation scalability

### Phase 2: Domain Model Expansion

Goal:

- Support real collaboration workflows, not just view switching

Changes:

- Add `Project`
- Add `Cycle`
- Add `WorkItem`
- Add `Decision`
- Add `InboxItem`
- Add durable `entityId` to activity

Likely file impact:

- [src/lib/types.ts](../src/lib/types.ts)
- [server.mjs](../server.mjs)
- [src/lib/workspace-server.ts](../src/lib/workspace-server.ts)

Expected outcome:

- Better roadmap for personalization, project rollups, and triage

### Phase 3: Surface Integration

Goal:

- Make the main sections feel coherent

Changes:

- Build project detail shell
- Build inbox section
- Build decision list + decision detail
- Attach canvas to decisions instead of treating it as a standalone destination

Likely file impact:

- [src/components/workspace/views.tsx](../src/components/workspace/views.tsx)
- [src/components/workspace/surfaces.tsx](../src/components/workspace/surfaces.tsx)
- New section-specific components under `src/components/workspace/`

Expected outcome:

- The product starts feeling like a system rather than a collection of tools

### Phase 4: Collaboration Depth

Goal:

- Catch up on the quality gap vs top-tier collaboration products

Changes:

- Session-scoped presence
- Object-level activity and awareness
- Better inbox semantics
- Better failure handling and recovery
- Richer review / mention flows

Likely file impact:

- [src/components/workspace/hooks/use-workspace-realtime.ts](../src/components/workspace/hooks/use-workspace-realtime.ts)
- [src/components/workspace/workspace-app.tsx](../src/components/workspace/workspace-app.tsx)
- [server.mjs](../server.mjs)

Expected outcome:

- Stronger collaboration confidence
- Better fit for active multi-user teams

## Recommended Sequence

If the team wants the highest return with the lowest disruption, execute in this order:

1. Phase 0
2. Phase 1
3. Phase 3 shell work for `Home`, `Projects`, and `Inbox`
4. Phase 2 domain model expansion
5. Phase 4 collaboration depth

This sequence deliberately delays the heaviest data-model refactor until the product structure is clear.

## Success Criteria

The redesign should be considered successful when:

- A new user can understand the product from the nav alone
- `Home` answers what to do now without ambiguity
- `Projects` becomes the main team execution surface
- `Plan` becomes the cross-project management surface
- `Decisions` becomes the single source of truth for async discussion
- `Inbox` becomes the attention queue
- Search opens any relevant object in one step
- Mobile users can access every core section without relying on the desktop sidebar

## Summary Recommendation

Do not keep treating board, gantt, calendar, and whiteboard as the product's primary information architecture.

The right redesign is:

- workflow-first navigation
- project / cycle / decision / inbox domain modeling
- project-context planning surfaces
- a personal home surface
- a unified decision + canvas story

That preserves the current strengths while fixing the product's biggest weakness: it still behaves like a set of views instead of a collaboration system.
